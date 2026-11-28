# backend (FastAPI)

```bash
uv sync
cp .env.example .env   # GEMINI_API_KEY を設定（未設定ならデモの言葉が返る）
uv run uvicorn app.main:app --reload
```

- API ドキュメント: http://localhost:8000/docs
- テスト: `uv run pytest`
- Lint: `uv run ruff check .`

## API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/health` | 死活確認 |
| POST | `/api/mindmap/expand` | `{targets[1..8], existing}` → わからない言葉ごとに、教科書の目次の見出しを前提・中身の枝で（各1〜3個、学ぶ順、「〜できる」付き） |
