"use client";

import Link from "next/link";
import { useState } from "react";
import Knit from "@/components/Knit";
import SummaryCard from "@/components/SummaryCard";
import {
  completeSession,
  createSession,
  explainSession,
  type ExplainResponse,
  type SessionCreated,
  type SessionDetail,
} from "@/lib/api";
import { FOLLOW_UP } from "@/lib/followUp";
import { knitStage } from "@/lib/knit";
import { CHOICES, QUESTIONS, UNDERSTANDING_LEVELS } from "@/lib/questions";

type Step = "topic" | "survey" | "result" | "done";

export default function Home() {
  const [step, setStep] = useState<Step>("topic");
  const [topic, setTopic] = useState("");
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(QUESTIONS.length).fill(null),
  );
  const [result, setResult] = useState<SessionCreated | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [explanations, setExplanations] = useState<ExplainResponse[]>([]);
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [record, setRecord] = useState<SessionDetail | null>(null);
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
    const r = await run(() => createSession(topic, answers as number[]));
    if (!r) return;
    setResult(r);
    setStep("result");
  }

  async function handleStartExplain() {
    if (!result) return;
    const ex = await run(() => explainSession(result.session_id, details));
    if (ex) setExplanations([ex]);
  }

  async function handleReexplain() {
    if (!result) return;
    const ex = await run(() => explainSession(result.session_id));
    if (ex) {
      setExplanations((prev) => [...prev, ex]);
      setUnderstanding(null);
    }
  }

  async function handleComplete() {
    if (!result || understanding === null) return;
    const saved = await run(() => completeSession(result.session_id, understanding));
    if (saved) {
      setRecord(saved);
      setStep("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function reset() {
    setStep("topic");
    setTopic("");
    setAnswers(Array(QUESTIONS.length).fill(null));
    setResult(null);
    setDetails({});
    setExplanations([]);
    setUnderstanding(null);
    setRecord(null);
    setError(null);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-28">
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
            maxLength={500}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <p className="text-xs text-navy/50">
            入力内容は記録として保存され、AIの解説に使われます。名前や連絡先などの個人情報は書かないでください。
          </p>
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

          <Knit
            sessionId={result.session_id}
            stage={explanations.length > 0 ? 2 : 1}
            showCaption
          />

          {explanations.length === 0 && (
            <div className="space-y-4 rounded-lg border border-leaf/40 p-4">
              <div>
                <p className="font-bold text-navy">もう少しくわしく教えてください</p>
                <p className="mt-1 text-sm text-navy/70">{FOLLOW_UP[result.pattern].lead}</p>
              </div>
              {FOLLOW_UP[result.pattern].fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-bold text-navy" htmlFor={f.key}>
                    {f.label}
                    <span className="ml-2 text-xs font-normal text-navy/50">任意</span>
                  </label>
                  <textarea
                    id={f.key}
                    className="h-20 w-full rounded-lg border border-zinc-300 p-3 text-sm focus:border-leaf focus:outline-none"
                    placeholder={f.placeholder}
                    maxLength={500}
                    value={details[f.key] ?? ""}
                    onChange={(e) => setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    disabled={loading}
                  />
                </div>
              ))}
              <button
                className="w-full rounded-lg bg-leaf py-3 font-bold text-white disabled:opacity-40"
                disabled={loading}
                onClick={handleStartExplain}
              >
                {loading ? "AIが説明を考えています…" : "解説を聞く"}
              </button>
            </div>
          )}

          {explanations.map((ex) => (
            <article key={ex.attempt} className="rounded-lg border border-zinc-200 p-4">
              <p className="mb-2 text-xs font-bold text-sun">説明 {ex.attempt} 回目</p>
              <div className="whitespace-pre-wrap leading-relaxed">{ex.explanation}</div>
            </article>
          ))}

          {latest && (
            <div className="space-y-3">
              <p className="font-bold text-navy">どのくらい理解できましたか？</p>
              <div className="grid grid-cols-5 gap-1">
                {UNDERSTANDING_LEVELS.map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUnderstanding(u.value)}
                    disabled={loading}
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

              {understanding !== null && understanding >= 4 && (
                <p className="rounded-lg bg-leaf/10 p-3 font-bold text-navy">
                  🎉 理解できました！記録して、次の一歩を確認しましょう。
                </p>
              )}
              {understanding !== null && understanding <= 3 && latest.remaining === 0 && (
                <p className="rounded-lg bg-zinc-100 p-3 text-sm">
                  AI解説は1セッション3回までです。記録しておくと、まだわからない点も整理されます。
                </p>
              )}

              {understanding !== null && understanding <= 3 && latest.remaining > 0 && (
                <button
                  className="w-full rounded-lg bg-sun py-3 font-bold text-white disabled:opacity-40"
                  disabled={loading}
                  onClick={handleReexplain}
                >
                  別の説明を聞く（あと{latest.remaining}回）
                </button>
              )}
              {understanding !== null && (
                <button
                  className="w-full rounded-lg bg-navy py-3 font-bold text-white disabled:opacity-40"
                  disabled={loading}
                  onClick={handleComplete}
                >
                  {loading ? "AIが学習メモにまとめています…" : "記録して終わる"}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {step === "done" && record && (
        <section className="space-y-4">
          <Knit
            sessionId={record.id}
            stage={knitStage({ status: record.status, understanding: record.understanding, explained: true })}
            size="lg"
            showCaption
          />
          <p className="text-center text-sm text-navy/70">
            {record.understanding !== null && record.understanding >= 4
              ? "学習メモとして記録しました。"
              : "学習メモとして記録しました。わかったら、また続きを編みましょう。"}
          </p>
          <SummaryCard session={record} />
          <Link
            href="/records"
            className="block w-full rounded-lg border border-leaf py-3 text-center font-bold text-leaf"
          >
            これまでの記録を見る
          </Link>
          <button className="w-full py-2 text-sm text-navy underline" onClick={reset}>
            新しい「わからない」を入力する
          </button>
        </section>
      )}
    </main>
  );
}
