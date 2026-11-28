from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app import gemini, mindmap
from app.config import settings
from app.main import app
from app.mindmap import ExpandRequest, Target, TocResult, TocStep, TocTree

client = TestClient(app)


def step(word):
    return TocStep(chapter="章", word=word, can_do=f"{word}ができる")


def tree(word, before=(), inside=(), meaning="説明"):
    return TocTree(word=word, meaning=meaning, before=[step(w) for w in before], inside=[step(w) for w in inside])


@pytest.fixture
def fake_ai(monkeypatch):
    """Gemini を呼ばずに、決めた結果を返す。"""
    calls: list[str] = []
    result: dict[str, TocResult] = {}

    def fake(prompt):
        calls.append(prompt)
        return result["value"]

    monkeypatch.setattr(settings, "gemini_api_key", "dummy")
    monkeypatch.setattr(mindmap, "_generate", fake)
    return calls, result


def test_demo_mode_returns_before_and_inside(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "微分"}]})
    assert res.status_code == 200
    [r] = res.json()["results"]
    assert r["word"] == "微分"
    kinds = [c["kind"] for c in r["candidates"]]
    assert "before" in kinds and "inside" in kinds


def test_returns_before_then_inside_in_learning_order(fake_ai):
    _, result = fake_ai
    result["value"] = TocResult(results=[tree("微分", before=["平均変化率", "極限"], inside=["微分係数", "導関数"])])
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "微分"}]})
    r = res.json()["results"][0]
    assert r["meaning"] == "説明"
    assert r["candidates"] == [
        {"word": "平均変化率", "kind": "before", "meaning": "平均変化率ができる"},
        {"word": "極限", "kind": "before", "meaning": "極限ができる"},
        {"word": "微分係数", "kind": "inside", "meaning": "微分係数ができる"},
        {"word": "導関数", "kind": "inside", "meaning": "導関数ができる"},
    ]


def test_removes_path_self_and_duplicates(fake_ai):
    calls, result = fake_ai
    result["value"] = TocResult(
        results=[tree("継承", before=["Python", "クラス", " ", "クラス"], inside=["継承", "ｸﾗｽ", "オーバーライド"])]
    )
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "継承", "path": ["Python"]}], "existing": ["メソッド"]},
    )
    assert res.status_code == 200
    words = [c["word"] for c in res.json()["results"][0]["candidates"]]
    assert words == ["クラス", "オーバーライド"]
    # プロンプトに経路とマップにある言葉が入る
    assert "Python → 継承" in calls[0]
    assert "メソッド" in calls[0]


def test_keeps_at_most_three_per_branch(fake_ai):
    _, result = fake_ai
    result["value"] = TocResult(results=[tree("React", before=[f"b{i}" for i in range(5)], inside=["i1"])])
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "React"}]})
    kinds = [c["kind"] for c in res.json()["results"][0]["candidates"]]
    assert kinds.count("before") == mindmap.MAX_PER_KIND
    assert kinds.count("inside") == 1


def test_prompt_asks_for_textbook_headings(fake_ai):
    calls, result = fake_ai
    result["value"] = TocResult(results=[tree("モル", before=["原子量"])])
    client.post("/api/mindmap/expand", json={"targets": [{"word": "モル"}]})
    assert "モル（知りたい言葉）" in calls[0]
    # 目次の見出しをそのまま使い、前提と中身に分け、後で学ぶことは出させない
    assert "目次に実際に載っている見出しの言葉をそのまま" in calls[0]
    assert "before（前提）" in calls[0] and "inside（中身）" in calls[0]
    assert "学び終えた後の章の見出しは出さない" in calls[0]
    # 深くなっても広がるように、中身は1段細かい見出しを必ず出させる（自分自身や広い見出しは入れない）
    assert "1段細かく" in calls[0]
    assert "中身は必ず1個以上入れる" in calls[0]


def test_batch_keeps_request_order(fake_ai):
    _, result = fake_ai
    # AIが順番を入れ替えて返しても、リクエストの順番で返す
    result["value"] = TocResult(results=[tree("継承", inside=["オーバーライド"]), tree("関数", before=["制御構文"])])
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "関数", "path": ["Python"]}, {"word": "継承", "path": ["Python"]}]},
    )
    assert [r["word"] for r in res.json()["results"]] == ["関数", "継承"]
    assert res.json()["results"][0]["candidates"][0]["word"] == "制御構文"


def test_missing_result_becomes_empty(fake_ai):
    _, result = fake_ai
    result["value"] = TocResult(results=[tree("関数", before=["制御構文"])])
    res = client.post(
        "/api/mindmap/expand",
        json={"targets": [{"word": "関数", "path": ["Python"]}, {"word": "継承", "path": ["Python"]}]},
    )
    assert res.json()["results"][1] == {"word": "継承", "meaning": "", "candidates": []}


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
    monkeypatch.setattr(gemini, "get_client", lambda: SimpleNamespace(models=models))
    return models


busy_error = errors.ServerError(503, {"error": {"code": 503, "status": "UNAVAILABLE", "message": "busy"}})
deadline_error = errors.ServerError(504, {"error": {"code": 504, "status": "DEADLINE_EXCEEDED", "message": "slow"}})


@pytest.mark.parametrize("error", [busy_error, deadline_error, httpx.ReadTimeout("timeout")])
def test_falls_back_to_next_model(monkeypatch, error):
    first, second = (m for m, _ in mindmap.MODELS)
    models = use_models(monkeypatch, {first: error, second: TocResult(results=[tree("微分", before=["極限"])])})
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "微分"}]})
    assert res.status_code == 200
    assert res.json()["results"][0]["candidates"][0]["word"] == "極限"
    assert models.called == [first, second]


def test_ai_busy_returns_503(monkeypatch):
    use_models(monkeypatch, {m: busy_error for m, _ in mindmap.MODELS})
    res = client.post("/api/mindmap/expand", json={"targets": [{"word": "微分"}]})
    assert res.status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"targets": []},
        {"targets": [{"word": ""}]},
        {"targets": [{"word": f"w{i}"} for i in range(mindmap.MAX_TARGETS + 1)]},
    ],
)
def test_invalid_request(body):
    assert client.post("/api/mindmap/expand", json=body).status_code == 422


def test_normalize():
    assert mindmap.normalize("ＮＩＳＡ ") == mindmap.normalize("nisa")
    assert "NISA" in mindmap.build_prompt(ExpandRequest(targets=[Target(word="NISA")]))
