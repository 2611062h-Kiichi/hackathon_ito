from app import gemini, summarizer
from app.summarizer import LearningSummary, build_summary_prompt

SESSION = {
    "topic": "Gitがわからない",
    "pattern": "knowledge",
    "details": {"scope": "ブランチ"},
    "understanding": 2,
    "explanations": [{"attempt": 1, "content": "ブランチは下書き"}, {"attempt": 2, "content": "例: ノート"}],
}


def test_prompt_contains_everything():
    prompt = build_summary_prompt(SESSION)
    assert "Gitがわからない" in prompt
    assert "深掘りしたい範囲: ブランチ" in prompt
    assert "説明2回目" in prompt
    assert "次に学ぶとよいこと" in prompt  # 情報不足パターン向けの次の一歩


def test_summarize_returns_structured(monkeypatch):
    monkeypatch.setattr(summarizer.settings, "gemini_api_key", "dummy")
    result = LearningSummary(
        title="t", genre="プログラミング", summary="s", key_points=["1", "2", "3", "4"], next_step="n", unclear="u"
    )
    monkeypatch.setattr(gemini, "generate_structured", lambda prompt, schema: result)
    data = summarizer.summarize(SESSION)
    assert data["genre"] == "プログラミング"
    assert data["key_points"] == ["1", "2", "3"]  # 3つまでに制限


def test_summarize_returns_none_on_failure(monkeypatch):
    monkeypatch.setattr(summarizer.settings, "gemini_api_key", "dummy")

    def boom(prompt, schema):
        raise gemini.GeminiUnavailableError("busy")

    monkeypatch.setattr(gemini, "generate_structured", boom)
    assert summarizer.summarize(SESSION) is None


def test_summarize_demo_mode(monkeypatch):
    monkeypatch.setattr(summarizer.settings, "gemini_api_key", "")
    assert summarizer.summarize(SESSION)["genre"] == "その他"
