"""ことばマップ：知りたい言葉から、教科書の目次の見出しをたどって「どこまでわかっているか」を確かめる機能。

- 「わからない（×）」と答えた言葉について、教科書の目次に載っている見出しを2つの枝で返す
  - 前提（before）：その言葉の章より前の章の見出し
  - 中身（inside）：その言葉の章の中の見出し
  どちらも学ぶ順（基本 → 先）に1〜3個
- 見出しには「わかる＝何ができることか」を付ける（相手はそれを見て ○ / × を答える）
- 画面に出た見出しの先も1回の呼び出しでまとめて作っておく（先読み）
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

MAX_PER_KIND = 3  # 1つの枝の見出しの数の上限
MAX_TARGETS = 8  # 先読みでまとめて頼む言葉の数の上限

# ことばマップは押すたびに待たせるので、速いモデルを使う。
# （モデル名, 考える量）を上から順に試す。考える量を最小にすると、中身はほぼ同じで数倍速い
MODELS: list[tuple[str, str | None]] = [
    ("gemini-3.5-flash", "minimal"),
    ("gemini-3.5-flash-lite", None),
]
TIMEOUT_MS = 35_000  # 返事がないモデルで待ち続けないように、この時間で次のモデルへ

Word = Field(min_length=1, max_length=50)
Kind = Literal["before", "inside"]


class Target(BaseModel):
    word: str = Word
    path: list[str] = Field(
        default_factory=list, max_length=20, description="知りたい言葉（中心）からこの言葉の親までの経路"
    )


class ExpandRequest(BaseModel):
    targets: list[Target] = Field(min_length=1, max_length=MAX_TARGETS)
    existing: list[str] = Field(
        default_factory=list,
        max_length=300,
        description="すでにマップにある言葉（同じ見出しなら同じ表記で使ってよい）",
    )


# ---- AI に返させる形（前提と中身を分けて、章も書かせる。章は言葉選びの手がかりで、画面には返さない） ----


class TocStep(BaseModel):
    chapter: str = Field(description="この見出しが載っている教科書・入門書・公式ドキュメントの章（例：数学Ⅱ 微分法）")
    word: str = Field(description="その章の目次に載っている見出しの言葉をそのまま。12文字以内")
    can_do: str = Field(description="その見出しが「わかる」とは何ができることか。「〜できる」で終わる30文字以内")


class TocTree(BaseModel):
    word: str = Field(description="わからない言葉（入力そのまま）")
    meaning: str = Field(description="わからない言葉の一言説明。やさしい言葉で30文字以内")
    before: list[TocStep] = Field(description=f"前提：この言葉の章より前の章の見出しを、学ぶ順に1〜{MAX_PER_KIND}個")
    inside: list[TocStep] = Field(description=f"中身：この言葉の章の中の見出しを、学ぶ順に1〜{MAX_PER_KIND}個")


class TocResult(BaseModel):
    results: list[TocTree]


# ---- 画面に返す形 ----


class Candidate(BaseModel):
    word: str
    kind: Kind = Field(description="before：前提の枝 / inside：中身の枝")
    meaning: str = Field(description="この見出しが「わかる」とは何ができることか")


class Expansion(BaseModel):
    word: str
    meaning: str
    candidates: list[Candidate] = Field(description="前提の見出し（学ぶ順）→ 中身の見出し（学ぶ順）")


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
            lines.append(f"{i}. {t.word}（知りたい言葉）")
    existing = "、".join(req.existing[:300]) or "（なし）"
    return f"""あなたは、勉強をする人が「どこまでわかっているか」を確かめるための、学習の地図を作る先生です。
相手は、次の言葉が「わからない」と答えました。
それぞれについて、教科書の目次をもとに、確かめる見出しを挙げてください。相手は見出しごとに「わかる／わからない」を答えます。

# わからない言葉
{chr(10).join(lines)}

# すでにマップにある言葉
{existing}
（同じ見出しがこの中にあれば、同じ書き方で使ってよい）

# 見出しの選び方（いちばん大事）
- その分野の定番の教科書・入門書・公式ドキュメントを思い浮かべ、**目次に実際に載っている見出しの言葉をそのまま**使う
  （例：数学なら「微分係数」「導関数」「平均値の定理」、Python なら「制御構文」「関数」「クラス」「継承」）
- 説明的な言い換え（「コードの流用」「設計図と実体」など）や、自分で作った言葉は使わない
- 1つの見出しは、目次の節（1〜2ページ〜1章）くらいのまとまりにする
- chapter には、その見出しが載っている教科書・入門書の章を書く

# 2つに分ける
- before（前提）：この言葉の章より前の章に載っている見出し。学ぶ順に1〜{MAX_PER_KIND}個
- inside（中身）：この言葉の章の中に載っている見出し。学ぶ順に1〜{MAX_PER_KIND}個
- この言葉を学び終えた後の章の見出しは出さない
- たどった道は分野の手がかりとして使う。見出しは、たどった道の言葉ではなく、**この言葉そのもの**の前提と中身にする
- この言葉自身と、たどった道にある言葉は見出しにしない
- 数を埋めるために足さない

# 書き方
- word：見出しの言葉。12文字以内
- can_do：その見出しが「わかる」とは何ができることか。「〜できる」で終わる、30文字以内
- meaning：わからない言葉そのものの一言説明を30文字以内
- results は上の言葉と同じ順番・同じ数で返す。word は入力の言葉をそのまま書く
"""


def _demo_result(req: ExpandRequest) -> TocResult:
    """APIキー未設定時の固定データ（画面の動作確認用）。"""

    def steps(word: str, label: str) -> list[TocStep]:
        return [
            TocStep(chapter="デモ", word=f"{word}の{label}{i}", can_do=f"【デモ】{word}の{label}{i}を説明できる")
            for i in range(1, 3)
        ]

    return TocResult(
        results=[
            TocTree(
                word=t.word,
                meaning=f"【デモ】「{t.word}」の一言説明",
                before=steps(t.word, "前提"),
                inside=steps(t.word, "中身"),
            )
            for t in req.targets
        ]
    )


def _clean(target: Target, tree: TocTree | None) -> Expansion:
    """元の言葉・経路と同じ見出し、見出しどうしの重複、空の見出しを取り除き、前提 → 中身の順に並べる。"""
    seen = {normalize(w) for w in [*target.path, target.word]}
    candidates: list[Candidate] = []
    for kind, steps in (("before", tree.before if tree else []), ("inside", tree.inside if tree else [])):
        kept = 0
        for s in steps:
            word, key = s.word.strip(), normalize(s.word)
            if not key or key in seen or kept == MAX_PER_KIND:
                continue
            seen.add(key)
            kept += 1
            candidates.append(Candidate(word=word[:50], kind=kind, meaning=s.can_do.strip()[:100]))
    return Expansion(word=target.word, meaning=(tree.meaning.strip()[:100] if tree else ""), candidates=candidates)


def _generate(prompt: str) -> TocResult:
    """MODELS を順に試す。混雑・時間切れのときは次のモデルへ。"""
    last_error: Exception | None = None
    for model, thinking in MODELS:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=TocResult,
            thinking_config=types.ThinkingConfig(thinking_level=thinking) if thinking else None,
            http_options=types.HttpOptions(timeout=TIMEOUT_MS),
        )
        try:
            response = gemini.get_client().models.generate_content(model=model, contents=prompt, config=config)
        except errors.APIError as e:
            if e.code not in gemini.RETRYABLE_CODES:
                raise
            logger.warning("ことばマップ: %s が使えないため次のモデルを試します: %s %s", model, e.code, e.status)
            last_error = e
            continue
        except httpx.TimeoutException as e:
            logger.warning("ことばマップ: %s が時間切れのため次のモデルを試します", model)
            last_error = e
            continue
        if isinstance(response.parsed, TocResult):
            return response.parsed
        return TocResult.model_validate_json(response.text or "")
    raise gemini.GeminiUnavailableError(
        "AIが混み合っています。少し時間をおいてもう一度お試しください。"
    ) from last_error


def expand_words(req: ExpandRequest) -> ExpandResult:
    raw = _generate(build_prompt(req)) if settings.gemini_api_key else _demo_result(req)
    # AIが順番や言葉を変えて返しても、入力の言葉と対応づける
    by_word = {normalize(t.word): t for t in raw.results}
    results = []
    for i, t in enumerate(req.targets):
        tree = by_word.get(normalize(t.word))
        if tree is None and len(raw.results) == len(req.targets):
            tree = raw.results[i]
        results.append(_clean(t, tree))
    return ExpandResult(results=results)


@router.post("/expand", response_model=ExpandResult)
def expand(req: ExpandRequest) -> ExpandResult:
    """わからない言葉それぞれについて、教科書の目次の見出しを前提・中身の2つの枝で返す（学ぶ順、「〜できる」付き）。"""
    try:
        return expand_words(req)
    except gemini.GeminiUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.exception("ことばマップの生成に失敗しました")
        raise HTTPException(status_code=502, detail="言葉を作れませんでした。もう一度お試しください。") from e
