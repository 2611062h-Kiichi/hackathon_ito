import pytest
from fastapi.testclient import TestClient

from app import gemini
from app.classifier import Pattern, classify
from app.main import app

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


def test_explain_limit(monkeypatch):
    monkeypatch.setattr(gemini, "generate", lambda prompt: "dummy")
    base = {"topic": "Git", "pattern": "knowledge", "goal": "知識補完", "level": "beginner"}
    res = client.post("/api/explain", json={"base": base, "attempt": 3})
    assert res.status_code == 200
    assert res.json()["remaining"] == 0
    assert client.post("/api/explain", json={"base": base, "attempt": 4}).status_code == 429
