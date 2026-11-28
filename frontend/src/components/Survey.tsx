"use client";

import { useState } from "react";
import { CHOICES, QUESTIONS } from "@/lib/questions";

type Props = {
  answers: (number | null)[];
  onAnswer: (index: number, value: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
};

/** 8問を1問ずつ表示する。選ぶと自動で次の問題へ進む */
export default function Survey({ answers, onAnswer, onBack, onSubmit, loading }: Props) {
  const [index, setIndex] = useState(() => {
    const firstEmpty = answers.findIndex((a) => a === null);
    return firstEmpty === -1 ? QUESTIONS.length - 1 : firstEmpty;
  });
  const answered = answers.filter((a) => a !== null).length;
  const allAnswered = answered === QUESTIONS.length;
  const progress = answered / QUESTIONS.length;
  const isLast = index === QUESTIONS.length - 1;

  function choose(value: number) {
    onAnswer(index, value);
    if (!isLast) setTimeout(() => setIndex((i) => Math.min(i + 1, QUESTIONS.length - 1)), 220);
  }

  return (
    <section className="space-y-5">
      {/* 進み具合：糸の上を毛糸玉が転がっていく */}
      <div>
        <div className="mb-1 flex justify-between text-xs font-bold text-navy/60">
          <span>
            Q{index + 1} / {QUESTIONS.length}
          </span>
          <span>あと{QUESTIONS.length - answered}問</span>
        </div>
        <div className="relative h-6">
          <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-navy/10" />
          <div
            className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-yarn transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 h-5 w-5 rounded-full border-2 border-paper bg-yarn shadow transition-all duration-300"
            style={{ left: `${Math.max(progress, 0.02) * 100}%`, transform: `translate(-50%, -50%) rotate(${progress * 720}deg)` }}
            aria-hidden
          >
            <div className="absolute inset-1 rounded-full border border-white/50" />
          </div>
        </div>
      </div>

      <div key={index} className="animate-fade-up rounded-3xl bg-paper p-5 shadow-soft">
        <p className="mb-5 min-h-14 text-lg font-bold leading-relaxed text-navy">{QUESTIONS[index]}</p>
        <div className="space-y-2">
          {CHOICES.map((c) => {
            const selected = answers[index] === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => choose(c.value)}
                disabled={loading}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left font-bold transition ${
                  selected
                    ? "border-leaf bg-leaf text-white"
                    : "border-navy/10 bg-white text-navy hover:border-leaf/60 active:scale-[0.99]"
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-white" : "border-navy/25"
                  }`}
                  aria-hidden
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="px-2 py-2 text-sm font-bold text-navy/60"
          onClick={() => (index === 0 ? onBack() : setIndex(index - 1))}
          disabled={loading}
        >
          ← {index === 0 ? "入力にもどる" : "前の質問"}
        </button>
        {!isLast && answers[index] !== null && (
          <button
            type="button"
            className="px-2 py-2 text-sm font-bold text-leaf"
            onClick={() => setIndex(index + 1)}
          >
            次の質問 →
          </button>
        )}
      </div>

      {isLast && (
        <button
          className="w-full rounded-full bg-leaf py-4 text-lg font-black text-white shadow-soft transition disabled:opacity-40"
          disabled={!allAnswered || loading}
          onClick={onSubmit}
        >
          {loading ? "分析しています…" : "わからないの原因を分析する"}
        </button>
      )}
    </section>
  );
}
