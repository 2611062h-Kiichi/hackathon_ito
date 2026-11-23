# frontend (Next.js)

```bash
npm install
cp .env.example .env.local   # バックエンドのURL
npm run dev
```

http://localhost:3000 を開く（バックエンドも起動しておくこと）。

- `src/app/page.tsx` … 入力 → 8問アンケート → 分類結果・AI解説 → 理解度確認
- `src/lib/questions.ts` … アンケートの質問文・選択肢
- `src/lib/api.ts` … バックエンドAPIの呼び出し
