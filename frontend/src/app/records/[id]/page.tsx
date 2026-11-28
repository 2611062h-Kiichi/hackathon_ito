"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Header from "@/components/Header";
import Knit from "@/components/Knit";
import Markdown from "@/components/Markdown";
import SummaryCard from "@/components/SummaryCard";
import { getSession, type SessionDetail } from "@/lib/api";
import { DETAIL_LABELS } from "@/lib/followUp";
import { knitStage } from "@/lib/knit";
import { formatDate } from "@/lib/patterns";

function RecordDetail() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSession(id)
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "読み込みに失敗しました"));
  }, [id]);

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 pt-6 pb-28">
      <Header />
      <Link href="/records" className="text-sm text-navy/70 underline">
        ← 記録一覧へ
      </Link>

      {error && <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!session && !error && <p className="text-center text-navy/60">読み込み中…</p>}

      {session && (
        <>
          <p className="text-xs text-navy/60">{formatDate(session.created_at)}</p>

          <Knit
            sessionId={session.id}
            stage={knitStage({
              status: session.status,
              understanding: session.understanding,
              explained: session.explanations.length > 0,
            })}
            size="lg"
            showCaption
          />

          {session.status === "completed" ? (
            <SummaryCard session={session} />
          ) : (
            <p className="rounded-2xl bg-navy/5 p-3 text-sm">
              この記録は途中で終わっています（学習メモは未作成）。
            </p>
          )}

          <section className="space-y-2">
            <h2 className="font-bold text-navy">わからなかったこと</h2>
            <p className="rounded-2xl bg-paper p-3 shadow-soft">{session.topic}</p>
            {Object.entries(session.details).map(([key, value]) => (
              <p key={key} className="text-sm">
                <span className="font-bold text-navy/70">{DETAIL_LABELS[key] ?? key}：</span>
                {value}
              </p>
            ))}
          </section>

          {session.explanations.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-bold text-navy">受けた説明</h2>
              {session.explanations.map((e) => (
                <details key={e.attempt} className="rounded-2xl bg-paper p-4 shadow-soft">
                  <summary className="cursor-pointer text-sm font-bold text-sun">
                    説明 {e.attempt} 回目
                  </summary>
                  <div className="mt-3 text-sm">
                    <Markdown>{e.content}</Markdown>
                  </div>
                </details>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function RecordDetailPage() {
  // useParams は実行時にしか値がないため Suspense で包む（Next.js 16）
  return (
    <Suspense fallback={<p className="pt-10 text-center text-navy/60">読み込み中…</p>}>
      <RecordDetail />
    </Suspense>
  );
}
