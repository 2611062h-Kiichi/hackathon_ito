"use client";

import { useState } from "react";
import {
  classify,
  explain,
  type ClassifyResponse,
  type ExplainResponse,
} from "@/lib/api";
import { CHOICES, QUESTIONS, UNDERSTANDING_LEVELS } from "@/lib/questions";

type Step = "topic" | "survey" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("topic");
  const [topic, setTopic] = useState("");
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(QUESTIONS.length).fill(null),
  );
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [explanations, setExplanations] = useState<ExplainResponse[]>([]);
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = explanations.at(-1);
  const allAnswered = answers.every((a) => a !== null);

  async function run<T>(fn: () => Promise<T>) {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitSurvey() {
    const r = await run(() => classify(topic, answers as number[]));
    if (!r) return;
    setResult(r);
    setStep("result");
    const ex = await run(() => explain(r.base, 1));
    if (ex) setExplanations([ex]);
  }

  async function handleReexplain() {
    if (!result || !latest) return;
    const ex = await run(() => explain(result.base, latest.attempt + 1));
    if (ex) {
      setExplanations((prev) => [...prev, ex]);
      setUnderstanding(null);
    }
  }

  function reset() {
    setStep("topic");
    setTopic("");
    setAnswers(Array(QUESTIONS.length).fill(null));
    setResult(null);
    setExplanations([]);
    setUnderstanding(null);
    setError(null);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-wide text-navy">ITOGUCHI</h1>
        <p className="mt-1 text-sm text-navy/70">イトグチ</p>
        <p className="mt-3 font-bold text-navy">わかるが、次の一歩の力になる。</p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {step === "topic" && (
        <section className="space-y-4">
          <label className="block font-bold text-navy" htmlFor="topic">
            何がわからないですか？
          </label>
          <textarea
            id="topic"
            className="h-32 w-full rounded-lg border border-zinc-300 p-3 focus:border-leaf focus:outline-none"
            placeholder="例：Gitがわからない"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <button
            className="w-full rounded-lg bg-leaf py-3 font-bold text-white disabled:opacity-40"
            disabled={!topic.trim()}
            onClick={() => setStep("survey")}
          >
            次へ（8問アンケート）
          </button>
        </section>
      )}

      {step === "survey" && (
        <section className="space-y-6">
          {QUESTIONS.map((q, i) => (
            <fieldset key={i} className="rounded-lg border border-zinc-200 p-4">
              <legend className="px-1 font-bold text-navy">
                Q{i + 1}. {q}
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {CHOICES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      setAnswers((prev) => prev.map((a, j) => (j === i ? c.value : a)))
                    }
                    className={`rounded-md border px-2 py-2 text-sm ${
                      answers[i] === c.value
                        ? "border-leaf bg-leaf text-white"
                        : "border-zinc-300 hover:border-leaf"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            className="w-full rounded-lg bg-leaf py-3 font-bold text-white disabled:opacity-40"
            disabled={!allAnswered || loading}
            onClick={handleSubmitSurvey}
          >
            {loading ? "分析中…" : "分析する"}
          </button>
        </section>
      )}

      {step === "result" && result && (
        <section className="space-y-6">
          <div className="rounded-lg bg-leaf/10 p-4">
            <p className="text-sm text-navy/70">あなたのつまずきタイプ</p>
            <p className="text-2xl font-black text-navy">{result.label}</p>
            <p className="mt-1 text-sm text-navy/70">AIのサポート: {result.base.goal}</p>
          </div>

          {explanations.map((ex) => (
            <article key={ex.attempt} className="rounded-lg border border-zinc-200 p-4">
              <p className="mb-2 text-xs font-bold text-sun">説明 {ex.attempt} 回目</p>
              <div className="whitespace-pre-wrap leading-relaxed">{ex.explanation}</div>
            </article>
          ))}

          {loading && <p className="text-center text-navy/70">AIが説明を考えています…</p>}

          {latest && !loading && (
            <div className="space-y-3">
              <p className="font-bold text-navy">どのくらい理解できましたか？</p>
              <div className="grid grid-cols-5 gap-1">
                {UNDERSTANDING_LEVELS.map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUnderstanding(u.value)}
                    className={`rounded-md border p-2 text-xs ${
                      understanding === u.value
                        ? "border-leaf bg-leaf text-white"
                        : "border-zinc-300 hover:border-leaf"
                    }`}
                  >
                    <span className="block text-lg font-bold">{u.value}</span>
                    {u.label}
                  </button>
                ))}
              </div>

              {understanding !== null && understanding <= 3 && latest.remaining > 0 && (
                <button
                  className="w-full rounded-lg bg-sun py-3 font-bold text-white"
                  onClick={handleReexplain}
                >
                  別の説明を聞く（あと{latest.remaining}回）
                </button>
              )}
              {understanding !== null && understanding <= 3 && latest.remaining === 0 && (
                <p className="rounded-lg bg-zinc-100 p-3 text-sm">
                  AI解説は1セッション3回までです。わからない点をもっと具体的に書いて、もう一度質問してみましょう。
                </p>
              )}
              {understanding !== null && understanding >= 4 && (
                <p className="rounded-lg bg-leaf/10 p-3 font-bold text-navy">
                  🎉 理解できました！次の一歩へ進みましょう。
                </p>
              )}
              {understanding !== null && (
                <button className="w-full py-2 text-sm text-navy underline" onClick={reset}>
                  新しい「わからない」を入力する
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
