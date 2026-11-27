import pytest
from fastapi.testclient import TestClient

from app import gemini, summarizer
from app.classifier import Pattern, classify
from app.main import app
from app.prompt_builder import build_base, build_prompt
from app.repository import InMemoryRepository, get_repository

USER = "user-aaaaaaaa"
OTHER = "user-bbbbbbbb"


@pytest.fixture
def repo():
    r = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: r
    yield r
    app.dependency_overrides.clear()


@pytest.fixture
def client(repo):
    return TestClient(app)


@pytest.fixture(autouse=True)
def fake_ai(monkeypatch):
    """Gemini を呼ばないようにする。"""
    prompts: list[str] = []

    def fake_generate(prompt):
        prompts.append(prompt)
        return f"解説{len(prompts)}"

    monkeypatch.setattr(gemini, "generate", fake_generate)
    monkeypatch.setattr(
        summarizer,
        "summarize",
        lambda s: {
            "title": "Gitのブランチ",
            "genre": "プログラミング",
            "summary": "要約",
            "key_points": ["a"],
            "next_step": "ブランチを作る",
            "unclear": "",
        },
    )
    return prompts


def start(client, user=USER, answers=None):
    res = client.post(
        "/api/sessions",
        json={"user_id": user, "topic": "Git", "answers": answers or [0, 0, 0, 3, 3, 2, 1, 0]},
    )
    assert res.status_code == 200
    return res.json()


# --- 分類 ---


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


# --- プロンプト ---


def test_prompt_includes_details():
    base = build_base("Git", Pattern.KNOWLEDGE)
    prompt = build_prompt(base, 1, {"scope": "ブランチの使い方", "situation": "  ", "unknown": "無視される"})
    assert "深掘りしたい範囲: ブランチの使い方" in prompt
    assert "今の状況" not in prompt
    assert "無視される" not in prompt


def test_prompt_without_details():
    prompt = build_prompt(build_base("Git", Pattern.KNOWLEDGE), 1)
    assert "ユーザーからの補足" not in prompt


# --- セッションの流れ ---


def test_create_session(client, repo):
    body = start(client)
    assert body["pattern"] == "knowledge"
    assert body["base"] == {"topic": "Git", "pattern": "knowledge", "goal": "知識補完", "level": "beginner"}
    saved = repo.get_session(body["session_id"])
    assert saved["user_id"] == USER
    assert saved["status"] == "in_progress"


def test_explain_saves_and_counts_on_server(client, repo, fake_ai):
    sid = start(client)["session_id"]
    url = f"/api/sessions/{sid}/explain"
    r1 = client.post(url, json={"user_id": USER, "details": {"scope": "ブランチ", "evil": "x"}})
    assert r1.json() == {"attempt": 1, "remaining": 2, "explanation": "解説1"}
    # 2回目以降は details を送らなくても、保存した内容がプロンプトに使われる
    r2 = client.post(url, json={"user_id": USER})
    assert r2.json()["attempt"] == 2
    assert "深掘りしたい範囲: ブランチ" in fake_ai[1]
    client.post(url, json={"user_id": USER})
    assert client.post(url, json={"user_id": USER}).status_code == 429

    saved = repo.get_session(sid)
    assert saved["details"] == {"scope": "ブランチ"}
    assert [e["attempt"] for e in saved["explanations"]] == [1, 2, 3]


def test_complete_saves_summary(client):
    sid = start(client)["session_id"]
    client.post(f"/api/sessions/{sid}/explain", json={"user_id": USER})
    res = client.post(f"/api/sessions/{sid}/complete", json={"user_id": USER, "understanding": 4})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed"
    assert body["understanding"] == 4
    assert body["genre"] == "プログラミング"
    assert body["next_step"] == "ブランチを作る"
    # 完了後は解説を追加できない
    assert client.post(f"/api/sessions/{sid}/explain", json={"user_id": USER}).status_code == 409


def test_complete_requires_explanation(client):
    sid = start(client)["session_id"]
    res = client.post(f"/api/sessions/{sid}/complete", json={"user_id": USER, "understanding": 3})
    assert res.status_code == 409


def test_complete_keeps_record_when_summary_fails(client, monkeypatch):
    monkeypatch.setattr(summarizer, "summarize", lambda s: None)
    sid = start(client)["session_id"]
    client.post(f"/api/sessions/{sid}/explain", json={"user_id": USER})
    body = client.post(f"/api/sessions/{sid}/complete", json={"user_id": USER, "understanding": 2}).json()
    assert body["status"] == "completed"
    assert body["summary"] is None


def test_history_is_per_user(client):
    start(client, USER)
    start(client, USER)
    other_sid = start(client, OTHER)["session_id"]

    mine = client.get("/api/sessions", params={"user_id": USER}).json()
    assert len(mine) == 2
    assert "explanations" not in mine[0]
    # 他人の記録は見られない・操作できない
    assert client.get(f"/api/sessions/{other_sid}", params={"user_id": USER}).status_code == 404
    assert client.post(f"/api/sessions/{other_sid}/explain", json={"user_id": USER}).status_code == 404


def test_invalid_user_id_rejected(client):
    res = client.post("/api/sessions", json={"user_id": "x", "topic": "Git", "answers": [0] * 8})
    assert res.status_code == 422


# --- Gemini のフォールバック ---


class _FakeModels:
    def __init__(self, failing: set[str]):
        self.failing = failing
        self.called: list[str] = []

    def generate_content(self, model, contents, config=None):
        self.called.append(model)
        if model in self.failing:
            raise gemini.errors.ServerError(503, {"error": {"message": "busy", "status": "UNAVAILABLE"}})
        return type("R", (), {"text": f"from {model}", "parsed": None})()


def _use_fake(monkeypatch, failing: set[str]) -> _FakeModels:
    fake = _FakeModels(failing)
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "dummy")
    monkeypatch.setattr(gemini.settings, "gemini_model", "main-model")
    monkeypatch.setattr(gemini.settings, "gemini_fallback_models", "backup-1,backup-2")
    monkeypatch.setattr(gemini, "_get_client", lambda: type("C", (), {"models": fake})())
    return fake


def test_gemini_falls_back_when_busy(monkeypatch):
    monkeypatch.undo()  # fake_ai を外して本物の generate を使う
    fake = _use_fake(monkeypatch, failing={"main-model"})
    assert gemini.generate("p") == "from backup-1"
    assert fake.called == ["main-model", "backup-1"]


def test_explain_returns_503_when_all_models_busy(client, monkeypatch):
    sid = start(client)["session_id"]
    monkeypatch.undo()
    _use_fake(monkeypatch, failing={"main-model", "backup-1", "backup-2"})
    res = client.post(f"/api/sessions/{sid}/explain", json={"user_id": USER})
    assert res.status_code == 503
    assert "混み合っています" in res.json()["detail"]
