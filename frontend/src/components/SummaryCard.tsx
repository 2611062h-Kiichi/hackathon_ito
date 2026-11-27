import type { SessionDetail } from "@/lib/api";
import { PATTERN_LABELS } from "@/lib/patterns";

// Gemini が整理した学習メモの表示
export default function SummaryCard({ session }: { session: SessionDetail }) {
  return (
    <article className="space-y-4 rounded-xl border-2 border-leaf/40 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {session.genre && (
          <span className="rounded-full bg-leaf/15 px-2 py-0.5 font-bold text-leaf">
            {session.genre}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-navy/70">
          {PATTERN_LABELS[session.pattern]}
        </span>
        {session.understanding && (
          <span className="text-navy/70">理解度 {session.understanding} / 5</span>
        )}
      </div>

      <h2 className="text-xl font-black text-navy">{session.title ?? session.topic}</h2>

      {session.summary ? (
        <p className="leading-relaxed">{session.summary}</p>
      ) : (
        <p className="text-sm text-navy/60">（AIが混み合っていたため、要約は作成されませんでした）</p>
      )}

      {session.key_points && session.key_points.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {session.key_points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {session.next_step && (
        <div className="rounded-lg bg-sun/15 p-3">
          <p className="text-xs font-bold text-sun">次の一歩</p>
          <p className="mt-1 font-bold text-navy">{session.next_step}</p>
        </div>
      )}

      {session.unclear && (
        <div className="rounded-lg bg-zinc-100 p-3">
          <p className="text-xs font-bold text-navy/70">まだわからないかもしれないこと</p>
          <p className="mt-1 text-sm">{session.unclear}</p>
        </div>
      )}
    </article>
  );
}
