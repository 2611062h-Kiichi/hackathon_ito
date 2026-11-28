from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app import gemini, mindmap
from app.config import settings
from app.main import app
from app.mindmap import Candidate, ExpandRequest, ExpandResult, Expansion, Target

client = TestClient(app)


def expansion(word, words, meaning="説明"):
    return Expansion(
        word=word, meaning=meaning, candidates=[Candidate(word=w, role="しくみ", meaning=f"{w}の説明") for w in words]
    )


@pytest.fixture
def fake_ai(monkeypatch):
    """Gemini を呼ばずに、決めた結果を返す。"""
    calls: list[str] = []
    result: dict[str, ExpandResult] = {}

    def fake(prompt):
        calls.append(prompt)
        return result["value"]

    monkeypatch.setattr(settings, "gemini_api_key", "dummy")
    monkeypatch.setattr(mindmap, "_generate", fake)
    return calls, result


def test_demo_mode_returns_seven_candidates(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "NISA"}]})
    assert res.status_code == 200
    [r] = res.json()["results"]
    assert r["word"] == "NISA"
    assert len(r["candidates"]) == 7


def test_removes_path_and_duplicates(fake_ai):
    calls, result = fake_ai
    result["value"] = ExpandResult(
        results=[expansion("手数料", ["NISA", "投資信託", "信託報酬", "信託報酬", "ｎｉｓａ", " ", "ネット証券"])]
    )
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "手数料", "path": ["NISA", "投資信託"]}], "exclude": ["リスク"]},
    )
    assert res.status_code == 200
    words = [c["word"] for c in res.json()["results"][0]["candidates"]]
    assert words == ["信託報酬", "ネット証券"]
    # プロンプトに経路と画面にある言葉が入る
    assert "NISA → 投資信託 → 手数料" in calls[0]
    assert "リスク" in calls[0]


def test_returns_role_and_prompt_asks_for_terms(fake_ai):
    calls, result = fake_ai
    result["value"] = ExpandResult(results=[expansion("化学", ["モル"])])
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "化学"}]})
    assert res.json()["results"][0]["candidates"] == [{"word": "モル", "role": "しくみ", "meaning": "モルの説明"}]
    # 中心の言葉は「たどった道」ではなく中心として伝え、役割と用語の基準を指示する
    assert "化学（中心の言葉）" in calls[0]
    assert "索引" in calls[0]
    for role in ["前提", "しくみ", "違い", "つまずき", "場面"]:
        assert role in calls[0]


def test_batch_keeps_request_order(fake_ai):
    _, result = fake_ai
    # AIが順番を入れ替えて返しても、リクエストの順番で返す
    result["value"] = ExpandResult(results=[expansion("リスク", ["元本割れ"]), expansion("積立", ["毎月"])])
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "積立", "path": ["NISA"]}, {"word": "リスク", "path": ["NISA"]}]},
    )
    assert [r["word"] for r in res.json()["results"]] == ["積立", "リスク"]
    assert res.json()["results"][0]["candidates"][0]["word"] == "毎月"


def test_missing_result_becomes_empty(fake_ai):
    _, result = fake_ai
    result["value"] = ExpandResult(results=[expansion("積立", ["毎月"])])
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "積立", "path": ["NISA"]}, {"word": "リスク", "path": ["NISA"]}]},
    )
    assert res.json()["results"][1] == {"word": "リスク", "meaning": "", "candidates": []}


class FakeModels:
    """モデルごとに「混雑」「時間切れ」「成功」を決めて、呼ばれた順番を記録する。"""

    def __init__(self, behavior):
        self.behavior = behavior
        self.called: list[str] = []

    def generate_content(self, model, contents, config):
        self.called.append(model)
        outcome = self.behavior[model]
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(parsed=outcome, text="")


def use_models(monkeypatch, behavior):
    models = FakeModels(behavior)
    monkeypatch.setattr(settings, "gemini_api_key", "dummy")
    monkeypatch.setattr(gemini, "_get_client", lambda: SimpleNamespace(models=models))
    return models


busy_error = errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE", "message": "busy"}})
deadline_error = errors.ServerError(504, {"error": {"code": 504, "status": "DEADLINE_EXCEEDED", "message": "slow"}})


@pytest.mark.parametrize("error", [busy_error, deadline_error, httpx.ReadTimeout("timeout")])
def test_falls_back_to_next_model(monkeypatch, error):
    first, second = (m for m, _ in mindmap.MODELS)
    models = use_models(monkeypatch, {first: error, second: ExpandResult(results=[expansion("NISA", ["非課税"])])})
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "NISA"}]})
    assert res.status_code == 200
    assert res.json()["results"][0]["candidates"][0]["word"] == "非課税"
    assert models.called == [first, second]


def test_ai_busy_returns_503(monkeypatch):
    use_models(monkeypatch, {m: busy_error for m, _ in mindmap.MODELS})
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "NISA"}]})
    assert res.status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"targets": []},
        {"targets": [{"word": ""}]},
        {"targets": [{"word": f"w{i}"} for i in range(6)]},
    ],
)
def test_invalid_request(body):
    assert client.post("/api/mindmap/expand", json=body).status_code == 422


def test_normalize():
    assert mindmap.normalize("ＮＩＳＡ ") == mindmap.normalize("nisa")
    assert "NISA" in mindmap.build_prompt(ExpandRequest(targets=[Target(word="NISA")]))
