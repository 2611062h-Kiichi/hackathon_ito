"""分類結果からAIへの質問土台（JSON）と、Geminiに渡すプロンプトを生成する。"""

from .classifier import Pattern

GOALS: dict[Pattern, str] = {
    Pattern.DECISION: "選択肢整理・比較・優先順位付け",
    Pattern.KNOWLEDGE: "知識補完",
    Pattern.PSYCHOLOGICAL: "不安の整理・小さな行動支援",
}

INSTRUCTIONS: dict[Pattern, str] = {
    Pattern.DECISION: (
        "ユーザーは情報はあるが判断できずにいます。選択肢を整理し、比較表や判断基準を示し、"
        "優先順位をつけて次に取るべき行動を1つ提案してください。"
    ),
    Pattern.KNOWLEDGE: (
        "ユーザーは必要な知識や用語が不足しています。前提知識から順に、専門用語は言い換えながら、"
        "身近な具体例を使って説明してください。深掘りしたい範囲が指定されている場合は、その範囲を中心に、"
        "関連する用語や知識も幅広く紹介してください。"
    ),
    Pattern.PSYCHOLOGICAL: (
        "ユーザーは失敗への不安や自信のなさでつまずいています。不安を言語化して整理し、"
        "今日できる小さな一歩を具体的に提案してください。否定せず、励ます口調で。"
    ),
}

# 再説明の段階（attempt: 1始まり）
ATTEMPT_STYLES = {
    1: "通常の説明",
    2: "具体例を中心にした説明",
    3: "まったくの初心者向けに、たとえ話を使ったやさしい説明",
}


# 分類後の追加入力（深掘り）の項目。キーはフロントエンドと共通
DETAIL_LABELS: dict[str, str] = {
    "scope": "深掘りしたい範囲",
    "situation": "今の状況",
    "opinion": "ユーザー自身の考え・意見",
    "cause": "ユーザーが考える原因",
}
MAX_DETAIL_LENGTH = 500


def format_details(details: dict[str, str] | None) -> str:
    """追加入力をプロンプト用の箇条書きにする。未知のキー・空欄は無視する。"""
    lines = []
    for key, label in DETAIL_LABELS.items():
        value = (details or {}).get(key, "").strip()
        if value:
            lines.append(f"- {label}: {value[:MAX_DETAIL_LENGTH]}")
    return "\n".join(lines)


def build_base(topic: str, pattern: Pattern, level: str = "beginner") -> dict:
    return {
        "topic": topic,
        "pattern": pattern.value,
        "goal": GOALS[pattern],
        "level": level,
    }


def build_prompt(base: dict, attempt: int, details: dict[str, str] | None = None) -> str:
    pattern = Pattern(base["pattern"])
    style = ATTEMPT_STYLES.get(attempt, ATTEMPT_STYLES[1])
    detail_text = format_details(details)
    detail_section = f"\n# ユーザーからの補足\n{detail_text}\n" if detail_text else ""
    return f"""あなたは「わからない」を「わかる」に変える学習サポーターです。

# ユーザーのわからないこと
{base["topic"]}

# 分析結果
- つまずきの原因: {base["goal"]}
- レベル: {base["level"]}
{detail_section}
# 指示
{INSTRUCTIONS[pattern]}
今回は「{style}」をしてください（{attempt}回目の説明）。
日本語で、400〜600字程度、見出しや箇条書きを使って読みやすくまとめてください。
最後に、理解できたか確かめる簡単な問いを1つ添えてください。
"""
