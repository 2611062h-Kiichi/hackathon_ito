# backend (FastAPI)

```bash
uv sync
cp .env.example .env   # GEMINI_API_KEY などを設定
uv run uvicorn app.main:app --reload
```

- API ドキュメント: http://localhost:8000/docs
- テスト: `uv run pytest`
- Lint: `uv run ruff check .`

## API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/health` | 死活確認 |
| POST | `/api/classify` | `{topic, answers[8]}` → 3分類 + 質問土台 |
| POST | `/api/explain` | `{base, attempt}` → Gemini解説（1セッション3回まで） |
