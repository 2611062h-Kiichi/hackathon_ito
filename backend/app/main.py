from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import gemini
from .classifier import PATTERN_LABELS, Pattern, classify
from .config import settings
from .prompt_builder import build_base, build_prompt

app = FastAPI(title="ITOGUCHI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ClassifyRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=500, description="わからない内容")
    answers: list[int] = Field(min_length=8, max_length=8, description="8問の回答（各0〜3）")


class ClassifyResponse(BaseModel):
    pattern: Pattern
    label: str
    scores: dict[Pattern, float]
    base: dict


class ExplainRequest(BaseModel):
    base: dict
    attempt: int = Field(ge=1, description="何回目の説明か（1始まり）")


class ExplainResponse(BaseModel):
    attempt: int
    remaining: int
    explanation: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/classify", response_model=ClassifyResponse)
def classify_endpoint(req: ClassifyRequest) -> ClassifyResponse:
    try:
        pattern, scores = classify(req.answers)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return ClassifyResponse(
        pattern=pattern,
        label=PATTERN_LABELS[pattern],
        scores=scores,
        base=build_base(req.topic, pattern),
    )


@app.post("/api/explain", response_model=ExplainResponse)
def explain_endpoint(req: ExplainRequest) -> ExplainResponse:
    limit = settings.max_explanations_per_session
    if req.attempt > limit:
        raise HTTPException(
            status_code=429,
            detail=f"AI解説は1セッション{limit}回までです。わからない点を具体的に追記して、新しく質問してください。",
        )
    # TODO: セッションIDと回数をSupabaseに保存し、サーバー側で回数を管理する
    prompt = build_prompt(req.base, req.attempt)
    return ExplainResponse(
        attempt=req.attempt,
        remaining=limit - req.attempt,
        explanation=gemini.generate(prompt),
    )
