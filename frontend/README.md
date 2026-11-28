# frontend (Next.js)

```bash
npm install
cp .env.example .env.local   # バックエンドのURL
npm run dev
```

http://localhost:3000 を開く（バックエンドも起動しておくこと）。

- `src/app/page.tsx` … ことばマップの画面（入力・○×・先読み・次に勉強すること）
- `src/components/MindMap.tsx` … マップの描画と、言葉を押したときの説明・○×
- `src/lib/mindmap.ts` … バックエンドAPIの呼び出し・見出しのつなぎ方・次に勉強すること・配置の計算
