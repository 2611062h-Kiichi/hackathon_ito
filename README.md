<p align="center">
  <img src="docs/images/logo.jpg" alt="ITOGUCHI イトグチ" width="360">
</p>

<h3 align="center">わかるが、次の一歩の力になる。</h3>

---

## ITOGUCHI（イトグチ）とは

**知りたいことに、自分がわかることからたどり着くための勉強アプリ**です。大学の勉強やプログラミングのように、教科書や入門書がある分野向けです。

知りたいことは、いきなり理解しようとしても難しいもの。
ITOGUCHI では、知りたい言葉を1つ入れると、**教科書の目次に載っている見出し**が「前提」と「中身」の2つの枝で、学ぶ順に広がります。
見出しごとに「こんなことができる？」に ○（わかる）か ×（わからない）を答えていくと、どこまでがわかっていて、どこからがわからないのかが見えてきます。

```
知りたい言葉を入れる → 前提・中身の見出しが広がる → ○ で止める / × でさらに広げる → 次に勉強することがわかる
```

### ことばマップのしくみ

```
     クラスとインスタンス ┐          ┌ メソッドのオーバーライド
                          ├【継承】┤
         メソッドと変数   ┘          └ スーパークラス
   （前提：継承の章より前に学ぶ）   （中身：継承の章の中で学ぶ）
```

- **前提の枝**：その言葉の章より前の章の見出し。**中身の枝**：その言葉の章の中の見出し
- 見出しはすべて、× を付けた言葉の直下に兄弟として並びます（目次の順番は学ぶ順であって、前の見出しが次の見出しの前提とは限らないため）
- 見出しを押すと「こんなことができる？」（例：親クラスのメソッドを子クラスで上書きして定義できる）が出ます
- **○（わかる）**：その枝はそこで止まります
- **×（わからない）**：その見出しの前提・中身が、さらに広がります
- **次に勉強すること**：× の見出しのうち、先に学ぶ見出しが全部 ○ のもの。勉強して ○ に変えると、次に進みます
- 別の枝で出てきた同じ見出しは、新しく作らずに点線でつなぎます（○× も引き継がれます）
- 画面に出た見出しの先は裏でまとめて作っておく（先読み）ので、× を押すとすぐ広がります

## 技術スタック

| 領域 | 技術 |
|---|---|
| フロントエンド | Next.js / TypeScript / Tailwind CSS（`frontend/`） |
| バックエンド | Python / FastAPI（`backend/`） |
| AI | Gemini 3.5 Flash（混雑時は 3.5 Flash Lite） |
| 開発・運用 | GitHub / GitHub Actions / npm / uv / Vercel（画面）/ Render（API） |

## ディレクトリ構成

```
hackathon_ito/
├─ frontend/                    Next.js アプリ
│  └─ src/
│     ├─ app/page.tsx           ことばマップの画面（入力・○×・先読み・次に勉強すること）
│     ├─ components/MindMap.tsx マップの描画と ○× のポップアップ
│     └─ lib/mindmap.ts         API呼び出し・見出しのつなぎ方・次に勉強すること・配置の計算
├─ backend/                     FastAPI アプリ
│  ├─ app/
│  │  ├─ main.py                アプリ本体（CORS・ルーター登録）
│  │  ├─ mindmap.py             目次の見出しを作るAPI（AIへの命令・モデル切り替え・結果の掃除）
│  │  ├─ gemini.py              Gemini への接続
│  │  └─ config.py              設定（.env）
│  └─ tests/
├─ docs/
│  └─ specification.md          仕様書
└─ .github/workflows/ci.yml
```

## セットアップ

必要なもの: [Node.js](https://nodejs.org/) 20以上、[uv](https://docs.astral.sh/uv/)

```bash
git clone https://github.com/2611062h-Kiichi/hackathon_ito.git
cd hackathon_ito
```

**バックエンド**（ターミナル1）

```bash
cd backend
uv sync
cp .env.example .env      # GEMINI_API_KEY を設定（未設定ならデモの言葉が返る）
uv run uvicorn app.main:app --reload
```

→ http://localhost:8000/docs でAPIを試せます。

**フロントエンド**（ターミナル2）

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

→ http://localhost:3000 を開く。

Gemini APIキーは [Google AI Studio](https://aistudio.google.com/apikey) で取得できます。**`.env` は絶対にコミットしないでください。**
無料枠はモデルごとに1日の回数上限があります（3.5 Flash は1日20回）。

## 開発の進め方

1. `main` から作業ブランチを切る（例: `feat/save-records`、`fix/layout-overlap`）
2. こまめにコミットしてプッシュする
3. Pull Request を作成する（CIが通ったらマージ）

```bash
git switch main && git pull
git switch -c feat/xxx
# ...作業...
git add . && git commit -m "記録の保存を追加"
git push -u origin feat/xxx
```

## TODO

- [x] 知りたい言葉の入力
- [x] 教科書の目次の見出しを前提・中身の枝で表示
- [x] ○ で止める・× でさらに広げる
- [x] 同じ見出しをつなぐ
- [x] 次に勉強することの表示
- [x] 先読み（画面に出た見出しの先をまとめて生成）
- [ ] マップの保存（閉じても残す）
- [ ] AI利用回数の制限（無料枠を守る）
- [ ] デプロイ（Vercel / Render）

詳細は [docs/specification.md](docs/specification.md) を参照してください。
