-- ITOGUCHI 履歴保存用テーブル
-- Supabase の SQL Editor に貼り付けて実行する（何度実行しても壊れないようにしてある）

-- 1回の「わからない」ごとに1行
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,                       -- 端末ID（ブラウザで発行）
  topic         text not null,                       -- わからない内容
  pattern       text not null check (pattern in ('decision', 'knowledge', 'psychological')),
  scores        jsonb not null,                      -- 3パターンのスコア
  details       jsonb not null default '{}'::jsonb,  -- 深掘りの追加入力
  understanding smallint check (understanding between 1 and 5),
  status        text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  -- 理解度入力後に Gemini で整理した内容
  title         text,
  genre         text,
  summary       text,
  key_points    jsonb,
  next_step     text,
  unclear       text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists sessions_user_created_idx
  on public.sessions (user_id, created_at desc);

-- 解説1回ごとに1行（1セッション最大3回）
create table if not exists public.explanations (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  attempt     smallint not null check (attempt between 1 and 3),
  content     text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, attempt)
);

-- 画面から直接DBを読み書きさせない（必ずバックエンド経由にする）。
-- ポリシーを作らずに RLS を有効にすると、secret キーを持つバックエンド以外はアクセスできない。
alter table public.sessions enable row level security;
alter table public.explanations enable row level security;

-- Data API でのアクセスはバックエンド（secret キー = service_role）にだけ許可する。
-- 「Grant API access to new tables automatically」をオフにしたプロジェクトでも動くように明示する。
revoke all on public.sessions, public.explanations from anon, authenticated;
grant select, insert, update, delete on public.sessions, public.explanations to service_role;
