"""理解度の入力後に、解説の内容を Gemini で決まった形式に整理する（履歴表示用）。"""

import logging
from typing import Literal, get_args

from pydantic import BaseModel, Field

from . import gemini
from .classifier import Pattern
from .config import settings
from .prompt_builder import format_details

logger = logging.getLogger(__name__)

Genre = Literal["プログラミング", "勉強・学校", "進路・キャリア", "仕事", "人間関係", "生活・お金", "健康", "その他"]
GENRES: list[str] = list(get_args(Genre))

NEXT_STEP_GUIDE: dict[Pattern, str] = {
    Pattern.DECISION: "決めるために次にとる具体的な行動を1つ",
    Pattern.KNOWLEDGE: "次に学ぶとよいこと、または実際に手を動かして試すことを1つ",
    Pattern.PSYCHOLOGICAL: "今日できる、ハードルの低い小さな一歩を1つ",
}

MAX_EXPLANATION_CHARS = 3000


class LearningSummary(BaseModel):
    title: str = Field(description="何について理解したかがわかる30字以内のタイトル")
    genre: Genre = Field(description="内容に最も近いジャンル")
    summary: str = Field(description="理解した内容の要約。2〜3文")
    key_points: list[str] = Field(description="押さえておくべきポイント。短い文で3つまで")
    next_step: str = Field(description="ユーザーが次にとる一歩。具体的に1文で")
    unclear: str = Field(description="まだ理解できていないと思われる点。十分理解できていれば空文字")


def build_summary_prompt(session: dict) -> str:
    pattern = Pattern(session["pattern"])
    explanations = "\n\n".join(
        f"## 説明{e['attempt']}回目\n{e['content'][:MAX_EXPLANATION_CHARS]}" for e in session.get("explanations", [])
    )
    details = format_details(session.get("details")) or "（なし）"
    return f"""以下は、学習サポートアプリでユーザーが受けた説明の記録です。
あとでユーザー本人が見返すための「学習メモ」として整理してください。

# ユーザーのわからなかったこと
{session["topic"]}

# ユーザーからの補足
{details}

# 受けた説明
{explanations}

# ユーザーの理解度（5段階）
{session["understanding"]}（1=全くわからない, 3=半分程度理解, 5=説明できる）

# 整理のルール
- 説明の内容をもとに、ユーザーに語りかける口調ではなく、メモとして簡潔に書く
- next_step は「{NEXT_STEP_GUIDE[pattern]}」にする
- 理解度が3以下なら、unclear にまだわかっていないと思われる点を書く。4以上なら空文字にする
"""


def _demo_summary(session: dict) -> dict:
    return {
        "title": session["topic"][:30],
        "genre": "その他",
        "summary": "【デモモード】GEMINI_API_KEY を設定すると、ここに説明の要約が入ります。",
        "key_points": [],
        "next_step": "",
        "unclear": "",
    }


def summarize(session: dict) -> dict | None:
    """整理した内容を返す。失敗したら None（記録自体は要約なしで保存する）。"""
    if not settings.gemini_api_key:
        return _demo_summary(session)
    try:
        result = gemini.generate_structured(build_summary_prompt(session), LearningSummary)
    except Exception:
        logger.exception("学習メモの整理に失敗しました（要約なしで保存します）")
        return None
    data = result.model_dump()
    data["key_points"] = data["key_points"][:3]
    return data
