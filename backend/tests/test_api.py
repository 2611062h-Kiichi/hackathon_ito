import pytest
from fastapi.testclient import TestClient

from app import gemini
from app.classifier import Pattern, classify
from app.main import app
from app.prompt_builder import build_base, build_prompt

client = TestClient(app)


@pytest.mark.parametrize(
    ("answers", "expected"),
    [
        ([3, 3, 3, 0, 0, 0, 0, 0], Pattern.DECISION),
        ([0, 0, 0, 3, 3, 3, 0, 0], Pattern.KNOWLEDGE),
        ([0, 0, 0, 0, 0, 0, 3, 3], Pattern.PSYCHOLOGICAL),
        ([2, 2, 2, 2, 2, 2, 2, 2], Pattern.KNOWLEDGE),  # 同点は情報不足を優先
    ],
)
def test_classify(answers, expected):
    pattern, _ = classify(answers)
    assert pattern == expected


@pytest.mark.parametrize("answers", [[0] * 7, [4, 0, 0, 0, 0, 0, 0, 0]])
def test_classify_invalid(answers):
    with pytest.raises(ValueError):
        classify(answers)


def test_classify_api():
    res = client.post("/api/classify", json={"topic": "Git", "answers": [0, 0, 0, 3, 3, 2, 1, 0]})
    assert res.status_code == 200
    body = res.json()
    assert body["pattern"] == "knowledge"
    assert body["base"] == {"topic": "Git", "pattern": "knowledge", "goal": "知識補完", "level": "beginner"}


def test_prompt_includes_details():
    base = build_base("Git", Pattern.KNOWLEDGE)
    prompt = build_prompt(base, 1, {"scope": "ブランチの使い方", "situation": "  ", "unknown": "無視される"})
    assert "深掘りしたい範囲: ブランチの使い方" in prompt
    assert "今の状況" not in prompt
    assert "無視される" not in prompt


def test_prompt_without_details():
    prompt = build_prompt(build_base("Git", Pattern.KNOWLEDGE), 1)
    assert "ユーザーからの補足" not in prompt


def test_explain_passes_details(monkeypatch):
    captured = {}
    monkeypatch.setattr(gemini, "generate", lambda prompt: captured.setdefault("prompt", prompt))
    base = {"topic": "進路", "pattern": "decision", "goal": "選択肢整理・比較・優先順位付け", "level": "beginner"}
    details = {"situation": "就職か進学で迷っている", "opinion": "研究は好き"}
    res = client.post("/api/explain", json={"base": base, "attempt": 1, "details": details})
    assert res.status_code == 200
    assert "今の状況: 就職か進学で迷っている" in captured["prompt"]
    assert "ユーザー自身の考え・意見: 研究は好き" in captured["prompt"]


def test_explain_limit(monkeypatch):
    monkeypatch.setattr(gemini, "generate", lambda prompt: "dummy")
    base = {"topic": "Git", "pattern": "knowledge", "goal": "知識補完", "level": "beginner"}
    res = client.post("/api/explain", json={"base": base, "attempt": 3})
    assert res.status_code == 200
    assert res.json()["remaining"] == 0
    assert client.post("/api/explain", json={"base": base, "attempt": 4}).status_code == 429
