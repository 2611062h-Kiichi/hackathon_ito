from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import gemini, mindmap, summarizer
from .classifier import PATTERN_LABELS, Pattern, classify
from .config import settings
from .prompt_builder import build_base, build_prompt, clean_details
from .repository import Repository, get_repository, now_iso

app = FastAPI(title="ITOGUCHI API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in settings.cors_origins.split(",") if o],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(mindmap.router)

# 端末ID（ブラウザで発行するランダムな文字列）
UserId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{8,64}$", description="端末ID")]
Repo = Annotated[Repository, Depends(get_repository)]


class CreateSessionRequest(BaseModel):
    user_id: UserId
    topic: str = Field(min_length=1, max_length=500, description="わからない内容")
    answers: list[int] = Field(min_length=8, max_length=8, description="8問の回答（各0〜3）")


class SessionCreated(BaseModel):
    session_id: str
    pattern: Pattern
    label: str
    scores: dict[Pattern, float]
    base: dict


class ExplainRequest(BaseModel):
    user_id: UserId
    details: dict[str, str] = Field(
        default_factory=dict,
        description="分類後の深掘り入力（scope / situation / opinion / cause、すべて任意）。初回だけ送ればよい",
    )


class ExplainResponse(BaseModel):
    attempt: int
    remaining: int
    explanation: str


class CompleteRequest(BaseModel):
    user_id: UserId
    understanding: int = Field(ge=1, le=5, description="理解度（1〜5）")


def _get_owned_session(repo: Repository, session_id: str, user_id: str) -> dict:
    session = repo.get_session(session_id)
    # 他人の記録は「存在しない」として扱う
    if session is None or session["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="記録が見つかりません")
    return session


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/sessions", response_model=SessionCreated)
def create_session(req: CreateSessionRequest, repo: Repo) -> SessionCreated:
    """8問の回答から分類し、記録を作る。"""
    try:
        pattern, scores = classify(req.answers)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    session = repo.create_session(
        {
            "user_id": req.user_id,
            "topic": req.topic.strip(),
            "pattern": pattern.value,
            "scores": {p.value: s for p, s in scores.items()},
        }
    )
    return SessionCreated(
        session_id=session["id"],
        pattern=pattern,
        label=PATTERN_LABELS[pattern],
        scores=scores,
        base=build_base(session["topic"], pattern),
    )


@app.post("/api/sessions/{session_id}/explain", response_model=ExplainResponse)
def explain(session_id: str, req: ExplainRequest, repo: Repo) -> ExplainResponse:
    """解説を作って保存する。回数はサーバーに保存された記録で数える。"""
    session = _get_owned_session(repo, session_id, req.user_id)
    if session["status"] == "completed":
        raise HTTPException(status_code=409, detail="この記録はすでに完了しています")

    limit = settings.max_explanations_per_session
    attempt = len(session["explanations"]) + 1
    if attempt > limit:
        raise HTTPException(
            status_code=429,
            detail=f"AI解説は1セッション{limit}回までです。わからない点を具体的に追記して、新しく質問してください。",
        )

    details = clean_details(req.details)
    if details and details != session["details"]:
        repo.update_session(session_id, {"details": details})
    else:
        details = session["details"]

    base = build_base(session["topic"], Pattern(session["pattern"]))
    try:
        explanation = gemini.generate(build_prompt(base, attempt, details))
    except gemini.GeminiUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    repo.add_explanation(session_id, attempt, explanation)
    return ExplainResponse(attempt=attempt, remaining=limit - attempt, explanation=explanation)


@app.post("/api/sessions/{session_id}/complete")
def complete(session_id: str, req: CompleteRequest, repo: Repo) -> dict:
    """理解度を保存し、Gemini で学習メモに整理して記録を完了にする。"""
    session = _get_owned_session(repo, session_id, req.user_id)
    if session["status"] == "completed":
        return session  # 二重送信されても Gemini を余計に呼ばない
    if not session["explanations"]:
        raise HTTPException(status_code=409, detail="解説を受けてから記録してください")

    session["understanding"] = req.understanding
    fields = {"understanding": req.understanding, "status": "completed", "completed_at": now_iso()}
    summary = summarizer.summarize(session)
    if summary:
        fields.update(summary)
    repo.update_session(session_id, fields)
    return repo.get_session(session_id)


@app.get("/api/sessions")
def list_sessions(
    repo: Repo,
    user_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_-]{8,64}$")],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> list[dict]:
    """自分の記録の一覧（新しい順）。"""
    return repo.list_sessions(user_id, limit)


@app.get("/api/sessions/{session_id}")
def get_session(
    session_id: str,
    repo: Repo,
    user_id: Annotated[str, Query(pattern=r"^[A-Za-z0-9_-]{8,64}$")],
) -> dict:
    """記録1件の詳細（解説の全文を含む）。"""
    return _get_owned_session(repo, session_id, user_id)


@app.get("/api/genres")
def genres() -> list[str]:
    return summarizer.GENRES
