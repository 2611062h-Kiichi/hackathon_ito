"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Knit from "@/components/Knit";
import { listSessions, type SessionSummary } from "@/lib/api";
import { KNIT_ITEMS, knitImage, knitItemFor, knitStage } from "@/lib/knit";
import { formatDate, PATTERN_LABELS } from "@/lib/patterns";

const ALL = "すべて";

// 一覧には解説の回数が含まれないので、途中の記録は「編み始め」として表示する
const stageOf = (s: SessionSummary) =>
  knitStage({ status: s.status, understanding: s.understanding, explained: false });

export default function RecordsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [genre, setGenre] = useState(ALL);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, []);

  // 記録に出てくるジャンルだけを絞り込みの候補にする（#4）
  const genres = useMemo(() => {
    const found = new Set((sessions ?? []).map((s) => s.genre).filter((g): g is string => !!g));
    return [ALL, ...found];
  }, [sessions]);

  const shown = (sessions ?? []).filter((s) => genre === ALL || s.genre === genre);

  // 完成した編み物のコレクション（#6）
  const completedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions ?? []) {
      if (stageOf(s) === 3) {
        const id = knitItemFor(s.id).id;
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  }, [sessions]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-28">
      <h1 className="mb-1 text-2xl font-black text-navy">記録</h1>
      <p className="mb-6 text-sm text-navy/60">これまでに見つけた「糸口」の学習メモです。</p>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!sessions && !error && <p className="text-center text-navy/60">読み込み中…</p>}

      {sessions && sessions.length === 0 && (
        <div className="space-y-4 rounded-lg bg-zinc-50 p-6 text-center">
          <p className="text-navy/70">まだ記録がありません。</p>
          <Link href="/" className="inline-block rounded-lg bg-leaf px-4 py-2 font-bold text-white">
            糸口を探しにいく
          </Link>
        </div>
      )}

      {sessions && sessions.length > 0 && (
        <>
          <section className="mb-6 rounded-xl bg-sun/10 p-4">
            <p className="mb-2 text-sm font-bold text-navy">完成した編み物</p>
            <ul className="grid grid-cols-4 gap-2">
              {KNIT_ITEMS.map((item) => {
                const count = completedCounts[item.id] ?? 0;
                return (
                  <li key={item.id} className="flex flex-col items-center text-xs">
                    <Image
                      src={knitImage(item, 3)}
                      alt={item.name}
                      width={72}
                      height={45}
                      className={count === 0 ? "opacity-25 grayscale" : ""}
                    />
                    <span className="mt-1 text-navy/70">
                      {item.name} ×{count}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                  genre === g
                    ? "border-leaf bg-leaf text-white"
                    : "border-zinc-300 text-navy/70 hover:border-leaf"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <ul className="space-y-3">
            {shown.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/records/${s.id}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-200 p-3 hover:border-leaf"
                >
                  <div className="shrink-0">
                    <Knit sessionId={s.id} stage={stageOf(s)} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-navy/60">
                      <span>{formatDate(s.created_at)}</span>
                      {s.genre && (
                        <span className="rounded-full bg-leaf/15 px-2 py-0.5 font-bold text-leaf">
                          {s.genre}
                        </span>
                      )}
                      <span>{PATTERN_LABELS[s.pattern]}</span>
                      {s.status === "in_progress" && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5">途中</span>
                      )}
                    </div>
                    <p className="font-bold text-navy">{s.title ?? s.topic}</p>
                    {s.next_step && (
                      <p className="mt-1 line-clamp-1 text-sm text-navy/70">次の一歩：{s.next_step}</p>
                    )}
                    {s.understanding && (
                      <p className="mt-1 text-xs text-navy/60">理解度 {s.understanding} / 5</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
