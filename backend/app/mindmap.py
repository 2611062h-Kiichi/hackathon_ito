"""ことばマップ：わからない言葉から、関連する言葉を放射状に広げる機能。

- 1つの言葉につき候補を7個返す。画面側で、すでにマップにある言葉を除いて5個を表示する
- 表示した5個の先も1回の呼び出しでまとめて作っておく（先読み）
- 各言葉には一言説明を付ける（押したときに表示し、そのまま「わからなかった言葉」に記録する）
"""

import logging
import unicodedata
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from google.genai import errors, types
from pydantic import BaseModel, Field

from . import gemini
from .config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mindmap", tags=["mindmap"])

CANDIDATES_PER_WORD = 7
MAX_TARGETS = 5

# ことばマップは押すたびに待たせるので、アプリ全体の設定とは別に速いモデルを使う。
# （モデル名, 考える量）を上から順に試す。考える量を最小にすると、中身はほぼ同じで数倍速い
MODELS: list[tuple[str, str | None]] = [
    ("gemini-3.5-flash", "minimal"),
    ("gemini-3.5-flash-lite", None),
]
TIMEOUT_MS = 35_000  # 返事がないモデルで待ち続けないように、この時間で次のモデルへ
RETRYABLE_CODES = {*gemini.RETRYABLE_CODES, 504}

Word = Field(min_length=1, max_length=50)

# 候補の言葉が、元の言葉を理解するうえでどんな役割か（画面に小さな印として出す）
Role = Literal["前提", "しくみ", "違い", "つまずき", "場面"]


class Target(BaseModel):
    word: str = Word
    path: list[str] = Field(
        default_factory=list, max_length=20, description="中心の言葉からこの言葉の親までの経路（中心を含む）"
    )


class ExpandRequest(BaseModel):
    targets: list[Target] = Field(min_length=1, max_length=MAX_TARGETS)
    exclude: list[str] = Field(default_factory=list, max_length=300, description="すでにマップにある言葉")


class Candidate(BaseModel):
    word: str = Field(description="知っておくとよい言葉。12文字以内の用語")
    role: Role = Field(description="元の言葉を理解するうえでの役割")
    meaning: str = Field(description="元の言葉とのつながりがわかる一言説明。やさしい言葉で30文字以内")


class Expansion(BaseModel):
    word: str = Field(description="広げる元の言葉（入力そのまま）")
    meaning: str = Field(description="広げる元の言葉の一言説明。やさしい言葉で30文字以内")
    candidates: list[Candidate] = Field(description=f"知っておくとよい言葉を{CANDIDATES_PER_WORD}個")


class ExpandResult(BaseModel):
    results: list[Expansion]


def normalize(word: str) -> str:
    """重複判定用。全角・半角や大文字・小文字、空白の違いを無視する。"""
    return "".join(unicodedata.normalize("NFKC", word).lower().split())


def build_prompt(req: ExpandRequest) -> str:
    lines = []
    for i, t in enumerate(req.targets, 1):
        if t.path:
            lines.append(f"{i}. {t.word}（たどった道: {' → '.join([*t.path, t.word])}）")
        else:
            lines.append(f"{i}. {t.word}（中心の言葉）")
    exclude = "、".join(req.exclude[:300]) or "（なし）"
    return f"""あなたは、初めての人がどこでつまずくかをよく知っている案内役です。
相手は、言葉を名前だけ知っていて、何がわからないのかも説明できない人です。
次の言葉それぞれについて、「この言葉がわかるために知っておくとよい言葉」を{CANDIDATES_PER_WORD}個ずつ挙げてください。

# 言葉
{chr(10).join(lines)}

# すでに画面に出ている言葉（使わない）
{exclude}

# 良い候補とは
わかると、元の言葉の理解が一歩進む言葉。
- 教科書や解説書の「索引」に載るような、その分野の用語に限る
- {CANDIDATES_PER_WORD}個の中に、次の役割（role）のうち3種類以上を混ぜる。当てはまらない役割は無理に使わない
  - 前提：先に知らないと話が通じない言葉（中心の言葉のときだけ多めに）
  - しくみ：中で何が起きているかを作っている部品や考え方
  - 違い：比べるとわかる相手（似ている言葉、対になる言葉）
  - つまずき：初心者が誤解しやすい点・難しく感じる点
  - 場面：実際に使われる場面や、次に出会う言葉
- たどった道が深くなったら、基本に戻らず、その言葉の一歩先（しくみ・違い・つまずき）を中心にする
- どの言葉も、中心の言葉（たどった道の最初の言葉）の話題からそれない。
  「違い」で出た別の分野の言葉を広げるときも、中心の言葉と比べてわかることを選ぶ

# 出さないもの
- 説明がなくても誰でもわかる普通の言葉や、「中心」「周り」「性質」のようなぼんやりした一般語
- 元の言葉を言い換えただけの言葉、元の言葉に何かを付け足しただけの言葉
- たどった道にある言葉、同じ言葉の重複

# 書き方
- word は12文字以内の用語。文や説明は書かない
- meaning は中学生にもわかる言葉で30文字以内。辞書の定義ではなく、元の言葉とのつながりがわかるように書く
- results は上の言葉と同じ順番・同じ数で返す。word は入力の言葉をそのまま書く
"""


DEMO_ROLES: list[Role] = ["前提", "しくみ", "違い", "つまずき", "場面"]


def _demo_result(req: ExpandRequest) -> ExpandResult:
    """APIキー未設定時の固定データ（画面の動作確認用）。"""
    return ExpandResult(
        results=[
            Expansion(
                word=t.word,
                meaning=f"【デモ】「{t.word}」の一言説明",
                candidates=[
                    Candidate(
                        word=f"{t.word}の関連{i}",
                        role=DEMO_ROLES[(i - 1) % len(DEMO_ROLES)],
                        meaning=f"【デモ】{t.word}に関係する言葉{i}",
                    )
                    for i in range(1, CANDIDATES_PER_WORD + 1)
                ],
            )
            for t in req.targets
        ]
    )


def _clean(target: Target, expansion: Expansion | None) -> Expansion:
    """元の言葉・経路と同じ言葉、候補どうしの重複、空の言葉を取り除く。"""
    seen = {normalize(w) for w in [*target.path, target.word]}
    candidates: list[Candidate] = []
    for c in expansion.candidates if expansion else []:
        word, key = c.word.strip(), normalize(c.word)
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(Candidate(word=word[:50], role=c.role, meaning=c.meaning.strip()[:100]))
    return Expansion(
        word=target.word,
        meaning=(expansion.meaning.strip()[:100] if expansion else ""),
        candidates=candidates[:CANDIDATES_PER_WORD],
    )


def _generate(prompt: str) -> ExpandResult:
    """MODELS を順に試す。混雑・時間切れのときは次のモデルへ。"""
    last_error: Exception | None = None
    for model, thinking in MODELS:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExpandResult,
            thinking_config=types.ThinkingConfig(thinking_level=thinking) if thinking else None,
            http_options=types.HttpOptions(timeout=TIMEOUT_MS),
        )
        try:
            response = gemini._get_client().models.generate_content(model=model, contents=prompt, config=config)
        except errors.APIError as e:
            if e.code not in RETRYABLE_CODES:
                raise
            logger.warning("ことばマップ: %s が使えないため次のモデルを試します: %s %s", model, e.code, e.status)
            last_error = e
            continue
        except httpx.TimeoutException as e:
            logger.warning("ことばマップ: %s が時間切れのため次のモデルを試します", model)
            last_error = e
            continue
        if isinstance(response.parsed, ExpandResult):
            return response.parsed
        return ExpandResult.model_validate_json(response.text or "")
    raise gemini.GeminiUnavailableError(
        "AIが混み合っています。少し時間をおいてもう一度お試しください。"
    ) from last_error


def expand_words(req: ExpandRequest) -> ExpandResult:
    if settings.gemini_api_key:
        raw = _generate(build_prompt(req))
    else:
        raw = _demo_result(req)
    # AIが順番や言葉を変えて返しても、入力の言葉と対応づける
    by_word = {normalize(e.word): e for e in raw.results}
    results = []
    for i, t in enumerate(req.targets):
        expansion = by_word.get(normalize(t.word))
        if expansion is None and len(raw.results) == len(req.targets):
            expansion = raw.results[i]
        results.append(_clean(t, expansion))
    return ExpandResult(results=results)


@router.post("/expand", response_model=ExpandResult)
def expand(req: ExpandRequest) -> ExpandResult:
    """言葉（最大5個）それぞれについて、知っておくとよい用語を7個（役割・一言説明つき）返す。"""
    try:
        return expand_words(req)
    except gemini.GeminiUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("ことばマップの生成に失敗しました")
        raise HTTPException(status_code=502, detail="言葉を作れませんでした。もう一度お試しください。") from e
