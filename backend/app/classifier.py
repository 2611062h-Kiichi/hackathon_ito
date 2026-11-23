"""8問アンケートの採点と3パターン分類（AI不使用・ルールベース）。

回答は各問 0〜3 点:
    3 = かなり当てはまる / 2 = 少し当てはまる / 1 = あまり当てはまらない / 0 = 当てはまらない
"""

from enum import StrEnum


class Pattern(StrEnum):
    DECISION = "decision"  # 判断できない状態
    KNOWLEDGE = "knowledge"  # 情報不足状態
    PSYCHOLOGICAL = "psychological"  # 心理的ブレーキ状態


PATTERN_LABELS: dict[Pattern, str] = {
    Pattern.DECISION: "判断の整理",
    Pattern.KNOWLEDGE: "情報不足",
    Pattern.PSYCHOLOGICAL: "心理的ブレーキ",
}

# 同点のときに優先する順（先にあるほど優先）
TIE_BREAK_ORDER = [Pattern.KNOWLEDGE, Pattern.DECISION, Pattern.PSYCHOLOGICAL]

NUM_QUESTIONS = 8


def score(answers: list[int]) -> dict[Pattern, float]:
    if len(answers) != NUM_QUESTIONS:
        raise ValueError(f"回答は{NUM_QUESTIONS}問分必要です（受け取り: {len(answers)}）")
    if any(a not in (0, 1, 2, 3) for a in answers):
        raise ValueError("各回答は0〜3の整数である必要があります")

    q1, q2, q3, q4, q5, q6, q7, q8 = answers
    return {
        Pattern.DECISION: (q1 + q2 + q3) / 3,
        Pattern.KNOWLEDGE: (q4 + q5 + q6) / 3,
        Pattern.PSYCHOLOGICAL: (q7 + q8) / 2,
    }


def classify(answers: list[int]) -> tuple[Pattern, dict[Pattern, float]]:
    scores = score(answers)
    best = max(TIE_BREAK_ORDER, key=lambda p: (scores[p], -TIE_BREAK_ORDER.index(p)))
    return best, scores
