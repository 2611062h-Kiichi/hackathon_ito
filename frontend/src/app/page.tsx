"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import Header from "@/components/Header";
import Knit from "@/components/Knit";
import KnittingLoader from "@/components/KnittingLoader";
import Markdown from "@/components/Markdown";
import SummaryCard from "@/components/SummaryCard";
import Survey from "@/components/Survey";
import YarnDivider from "@/components/YarnDivider";
import {
  completeSession,
  createSession,
  explainSession,
  type ExplainResponse,
  type Pattern,
  type SessionCreated,
  type SessionDetail,
} from "@/lib/api";
import { FOLLOW_UP } from "@/lib/followUp";
import { knitItemFor, knitStage } from "@/lib/knit";
import { QUESTIONS, UNDERSTANDING_LEVELS } from "@/lib/questions";

type Step = "topic" | "survey" | "result" | "done";
type Pending = "classify" | "explain" | "reexplain" | "complete" | null;

// AIを待つ間に流すメッセージ（つまずきタイプごと）
const EXPLAIN_MESSAGES: Record<Pattern, string[]> = {
  knowledge: [
    "前提になる知識から、順番を組み立てています",
    "身近なたとえを探しています",
    "むずかしい言葉を、やさしく言いかえています",
    "もうすぐ編み上がります",
  ],
  decision: [
    "選択肢をならべて整理しています",
    "比べるための「ものさし」を考えています",
    "次の一手をしぼりこんでいます",
    "もうすぐ編み上がります",
  ],
  psychological: [
    "気持ちを言葉にしています",
    "不安の正体を、ひと目ずつほどいています",
    "今日できる小さな一歩を探しています",
    "もうすぐ編み上がります",
  ],
};
const REEXPLAIN_MESSAGE = "さっきとは別の角度から考えています";
const COMPLETE_MESSAGES = [
  "説明をふり返っています",
  "大事なポイントを拾い集めています",
  "あなたの次の一歩を考えています",
  "学習メモにまとめています",
];

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
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = pending !== null;
  const latest = explanations.at(-1);
  const yarnColor = result ? knitItemFor(result.session_id).color : undefined;

  async function run<T>(kind: Exclude<Pending, null>, fn: () => Promise<T>) {
    setPending(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setPending(null);
    }
  }

  async function handleSubmitSurvey() {
    const r = await run("classify", () => createSession(topic, answers as number[]));
    if (!r) return;
    setResult(r);
    setStep("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleStartExplain() {
    if (!result) return;
    const ex = await run("explain", () => explainSession(result.session_id, details));
    if (ex) setExplanations([ex]);
  }

  async function handleReexplain() {
    if (!result) return;
    const ex = await run("reexplain", () => explainSession(result.session_id));
    if (ex) {
      setExplanations((prev) => [...prev, ex]);
      setUnderstanding(null);
    }
  }

  async function handleComplete() {
    if (!result || understanding === null) return;
    const saved = await run("complete", () => completeSession(result.session_id, understanding));
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
    window.scrollTo({ top: 0 });
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pt-6 pb-28">
      <Header />

      {error && (
        <p className="mb-4 animate-fade-up rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {step === "topic" && (
        <section className="animate-fade-up space-y-6">
          <div className="text-center">
            <p className="text-2xl font-black leading-snug text-navy">
              わかるが、
              <br />
              次の一歩の力になる。
            </p>
            <p className="mt-3 text-sm leading-relaxed text-navy/70">
              「わからない」の原因を見つけて、
              <br />
              あなたに合った説明で理解までつなぎます。
            </p>
          </div>

          {/* 編み物が完成していく見本 */}
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3].map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                {i > 0 && <span className="text-sm text-navy/30">›</span>}
                <Image src={`/knit/scarf-${stage}.png`} alt="" width={96} height={60} />
              </div>
            ))}
          </div>
          <p className="-mt-4 text-center text-xs text-navy/50">理解が進むと、編み物が完成していきます</p>

          <div className="rounded-3xl bg-paper p-5 shadow-soft">
            <label className="block text-lg font-black text-navy" htmlFor="topic">
              何がわからないですか？
            </label>
            <textarea
              id="topic"
              className="mt-3 h-28 w-full resize-none rounded-2xl border-2 border-navy/10 bg-white p-3 focus:border-leaf focus:outline-none"
              placeholder="例：Gitのブランチがわからない"
              maxLength={500}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <p className="mt-2 text-xs leading-relaxed text-navy/50">
              入力内容は記録として保存され、AIの解説に使われます。名前や連絡先などの個人情報は書かないでください。
            </p>
          </div>

          <button
            className="w-full rounded-full bg-leaf py-4 text-lg font-black text-white shadow-soft transition active:scale-[0.99] disabled:bg-navy/15 disabled:text-navy/40 disabled:shadow-none"
            disabled={!topic.trim()}
            onClick={() => setStep("survey")}
          >
            8つの質問に答える
          </button>
        </section>
      )}

      {step === "survey" && (
        <Survey
          answers={answers}
          onAnswer={(i, v) => setAnswers((prev) => prev.map((a, j) => (j === i ? v : a)))}
          onBack={() => setStep("topic")}
          onSubmit={handleSubmitSurvey}
          loading={loading}
        />
      )}

      {step === "result" && result && (
        <section className="space-y-5">
          <div className="animate-fade-up rounded-3xl bg-navy p-5 text-white shadow-soft">
            <p className="text-sm text-white/70">あなたのつまずきタイプ</p>
            <p className="mt-1 text-3xl font-black">{result.label}</p>
            <p className="mt-2 text-sm text-white/80">AIのサポート：{result.base.goal}</p>
          </div>

          {pending !== "explain" && (
            <Knit sessionId={result.session_id} stage={explanations.length > 0 ? 2 : 1} showCaption />
          )}

          {explanations.length === 0 && pending !== "explain" && (
            <div className="animate-fade-up space-y-4 rounded-3xl bg-paper p-5 shadow-soft">
              <div>
                <p className="text-lg font-black text-navy">もう少しくわしく教えてください</p>
                <p className="mt-1 text-sm leading-relaxed text-navy/70">
                  {FOLLOW_UP[result.pattern].lead}
                </p>
              </div>
              {FOLLOW_UP[result.pattern].fields.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-bold text-navy" htmlFor={f.key}>
                    {f.label}
                    <span className="ml-2 rounded-full bg-navy/5 px-2 py-0.5 text-xs font-normal text-navy/50">
                      任意
                    </span>
                  </label>
                  <textarea
                    id={f.key}
                    className="h-20 w-full resize-none rounded-2xl border-2 border-navy/10 bg-white p-3 text-sm focus:border-leaf focus:outline-none"
                    placeholder={f.placeholder}
                    maxLength={500}
                    value={details[f.key] ?? ""}
                    onChange={(e) => setDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
              <button
                className="w-full rounded-full bg-leaf py-4 text-lg font-black text-white shadow-soft transition active:scale-[0.99]"
                onClick={handleStartExplain}
              >
                解説を聞く
              </button>
            </div>
          )}

          {pending === "explain" && (
            <KnittingLoader messages={EXPLAIN_MESSAGES[result.pattern]} color={yarnColor} />
          )}

          {explanations.map((ex) => (
            <article key={ex.attempt} className="animate-fade-up rounded-3xl bg-paper p-5 shadow-soft">
              <p className="mb-3 inline-block rounded-full bg-sun/15 px-3 py-1 text-xs font-bold text-sun">
                説明 {ex.attempt} 回目
              </p>
              <Markdown>{ex.explanation}</Markdown>
            </article>
          ))}

          {pending === "reexplain" && (
            <KnittingLoader
              messages={[REEXPLAIN_MESSAGE, ...EXPLAIN_MESSAGES[result.pattern].slice(1)]}
              color={yarnColor}
            />
          )}
          {pending === "complete" && <KnittingLoader messages={COMPLETE_MESSAGES} color={yarnColor} />}

          {latest && !pending && (
            <div className="space-y-3">
              <YarnDivider color={yarnColor} />
              <p className="text-center text-lg font-black text-navy">どのくらい理解できましたか？</p>
              <div className="grid grid-cols-5 gap-1.5">
                {UNDERSTANDING_LEVELS.map((u) => (
                  <button
                    key={u.value}
                    onClick={() => setUnderstanding(u.value)}
                    aria-pressed={understanding === u.value}
                    className={`rounded-2xl border-2 px-1 py-2 text-[11px] leading-tight font-bold transition ${
                      understanding === u.value
                        ? "border-leaf bg-leaf text-white"
                        : "border-navy/10 bg-white text-navy/70 hover:border-leaf/60"
                    }`}
                  >
                    <span className="block text-xl font-black">{u.value}</span>
                    {u.label}
                  </button>
                ))}
              </div>

              {understanding !== null && understanding >= 4 && (
                <p className="animate-fade-up rounded-2xl bg-leaf/10 p-3 text-center font-bold text-navy">
                  🎉 理解できました！記録して、編み物を仕上げましょう。
                </p>
              )}
              {understanding !== null && understanding <= 3 && latest.remaining === 0 && (
                <p className="animate-fade-up rounded-2xl bg-navy/5 p-3 text-sm">
                  AI解説は1回の質問につき3回までです。記録しておくと、まだわからない点も整理されます。
                </p>
              )}

              {understanding !== null && understanding <= 3 && latest.remaining > 0 && (
                <button
                  className="w-full animate-fade-up rounded-full bg-sun py-4 font-black text-white shadow-soft transition active:scale-[0.99]"
                  onClick={handleReexplain}
                >
                  別の説明を聞く（あと{latest.remaining}回）
                </button>
              )}
              {understanding !== null && (
                <button
                  className="w-full animate-fade-up rounded-full bg-navy py-4 font-black text-white shadow-soft transition active:scale-[0.99]"
                  onClick={handleComplete}
                >
                  記録して終わる
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {step === "done" && record && (
        <section className="space-y-5">
          <div className="animate-fade-up rounded-3xl bg-paper px-5 pt-6 pb-5 text-center shadow-soft">
            <Knit
              sessionId={record.id}
              stage={knitStage({ status: record.status, understanding: record.understanding, explained: true })}
              size="lg"
              showCaption
            />
            <p className="mt-2 text-sm text-navy/70">
              {record.understanding !== null && record.understanding >= 4
                ? "学習メモとして記録しました。"
                : "学習メモとして記録しました。わかったら、また続きを編みましょう。"}
            </p>
          </div>
          <SummaryCard session={record} />
          <Link
            href="/records"
            className="block w-full rounded-full border-2 border-leaf bg-paper py-3.5 text-center font-black text-leaf"
          >
            これまでの記録を見る
          </Link>
          <button className="w-full py-2 text-sm font-bold text-navy/60" onClick={reset}>
            新しい「わからない」を入力する
          </button>
        </section>
      )}
    </main>
  );
}
