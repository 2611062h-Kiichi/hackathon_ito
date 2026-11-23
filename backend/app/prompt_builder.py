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
        "身近な具体例を使って説明してください。"
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


def build_base(topic: str, pattern: Pattern, level: str = "beginner") -> dict:
    return {
        "topic": topic,
        "pattern": pattern.value,
        "goal": GOALS[pattern],
        "level": level,
    }


def build_prompt(base: dict, attempt: int) -> str:
    pattern = Pattern(base["pattern"])
    style = ATTEMPT_STYLES.get(attempt, ATTEMPT_STYLES[1])
    return f"""あなたは「わからない」を「わかる」に変える学習サポーターです。

# ユーザーのわからないこと
{base["topic"]}

# 分析結果
- つまずきの原因: {base["goal"]}
- レベル: {base["level"]}

# 指示
{INSTRUCTIONS[pattern]}
今回は「{style}」をしてください（{attempt}回目の説明）。
日本語で、400〜600字程度、見出しや箇条書きを使って読みやすくまとめてください。
最後に、理解できたか確かめる簡単な問いを1つ添えてください。
"""
