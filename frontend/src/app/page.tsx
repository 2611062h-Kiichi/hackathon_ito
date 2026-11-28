"use client";

import { useRef, useState, type ReactNode } from "react";
import MindMap from "@/components/MindMap";
import {
  expandWords,
  googleSearchUrl,
  growTree,
  nextToStudy,
  pathTo,
  type Candidate,
  type MapNode,
} from "@/lib/mindmap";

const ROOT_ID = "n0";

export default function MindMapPage() {
  const [input, setInput] = useState("");
  const [nodes, setNodes] = useState<Record<string, MapNode> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // 広げた結果のお知らせ（新しい言葉が出なかったときなど、マップのすぐ上に出す）
  const [notice, setNotice] = useState<string | null>(null);

  const nodesRef = useRef<Record<string, MapNode>>({});
  const nextId = useRef(1);
  // 先読みした候補（言葉のID → AIが返した言葉）
  const prefetched = useRef(new Map<string, Promise<Candidate[]>>());
  // 新しく始め直したときに、前のマップの結果を捨てるための番号
  const generation = useRef(0);
  // 処理中の言葉（二度押しで AI を二重に呼ばないように、state ではなく ref で判定する）
  const inFlight = useRef(new Set<string>());

  function updateNodes(fn: (prev: Record<string, MapNode>) => Record<string, MapNode>) {
    nodesRef.current = fn(nodesRef.current);
    setNodes(nodesRef.current);
  }

  const allWords = () => Object.values(nodesRef.current).map((n) => n.word);
  const firstUnmarked = (except?: string) =>
    Object.values(nodesRef.current).find((n) => n.status === "none" && n.id !== except)?.id ?? null;

  function setLoading(id: string, on: boolean) {
    if (on) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setLoadingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // 画面に出た言葉の先を、1回の呼び出しでまとめて作っておく（× を押したらすぐ広がるように）
  function prefetch(ids: string[]) {
    if (!ids.length) return;
    const gen = generation.current;
    const targets = ids.map((id) => ({ word: nodesRef.current[id].word, path: pathTo(nodesRef.current, id) }));
    const batch = expandWords(targets, allWords());
    ids.forEach((id, i) => {
      const p = batch.then((r) => (gen === generation.current ? (r[i]?.candidates ?? []) : []));
      p.catch(() => {}); // 失敗したら、押したときに作り直す
      prefetched.current.set(id, p);
    });
  }

  async function candidatesFor(id: string): Promise<Candidate[]> {
    const cached = prefetched.current.get(id);
    if (cached) {
      const result = await cached.catch(() => null);
      if (result?.length) return result;
    }
    const target = { word: nodesRef.current[id].word, path: pathTo(nodesRef.current, id) };
    const [r] = await expandWords([target], allWords());
    return r?.candidates ?? [];
  }

  // 前提・中身の見出しをマップにつないで、まだ○×のない見出しを開く
  function grow(id: string, candidates: Candidate[]) {
    const word = nodesRef.current[id].word;
    let freshIds: string[] = [];
    let linkedIds: string[] = [];
    updateNodes((prev) => {
      const r = growTree(prev, id, candidates, () => `n${nextId.current++}`);
      freshIds = r.freshIds;
      linkedIds = r.linkedIds;
      return r.nodes;
    });
    const linked = linkedIds.map((l) => `「${nodesRef.current[l].word}」`).join("");
    if (!freshIds.length && !linkedIds.length) {
      // これより前に学ぶことが出てこない＝ここが土台。次に勉強することとして扱う
      setNotice(`「${word}」の前に学ぶ見出しは見つかりませんでした。ここから勉強を始めましょう。`);
      return;
    }
    if (!freshIds.length) {
      setNotice(`「${word}」で確かめる見出しは、すでにマップにある${linked}でした。点線でつないでいます。`);
    } else if (linkedIds.length) {
      setNotice(`マップにある${linked}も「${word}」に関わる見出しなので、点線でつないでいます。`);
    } else {
      setNotice(null);
    }
    setFocusId(id);
    setSelectedId((cur) => cur ?? firstUnmarked());
    prefetch(freshIds);
  }

  async function start() {
    const word = input.trim();
    if (!word) return;
    const gen = ++generation.current;
    prefetched.current.clear();
    nextId.current = 1;
    nodesRef.current = {};
    // 知りたい言葉は、はじめから × （わからない）として広げる
    updateNodes(() => ({
      [ROOT_ID]: { id: ROOT_ID, word, meaning: "", kind: null, parentId: null, children: [], status: "unknown", expanded: false, x: 0, y: 0 },
    }));
    setSelectedId(null);
    setFocusId(ROOT_ID);
    setError(null);
    setNotice(null);
    setLoading(ROOT_ID, true);
    try {
      const [r] = await expandWords([{ word, path: [] }], []);
      if (gen !== generation.current) return;
      updateNodes((prev) => ({ ...prev, [ROOT_ID]: { ...prev[ROOT_ID], meaning: r?.meaning ?? "" } }));
      grow(ROOT_ID, r?.candidates ?? []);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(ROOT_ID, false);
    }
  }

  async function expand(id: string) {
    const node = nodesRef.current[id];
    if (!node || node.expanded || inFlight.current.has(id)) return;
    const gen = generation.current;
    setError(null);
    setLoading(id, true);
    try {
      const candidates = await candidatesFor(id);
      if (gen !== generation.current) return;
      grow(id, candidates);
    } catch (e) {
      // 広げられなかったら、もう一度 × を押せば作り直す
      prefetched.current.delete(id);
      if (gen === generation.current) setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(id, false);
    }
  }

  // ○ はそこで止める。× はその言葉の直前に学ぶことを広げる。付けたら、まだの言葉へ進む
  function mark(id: string, status: "known" | "unknown") {
    const node = nodesRef.current[id];
    if (!node) return;
    updateNodes((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
    if (status === "unknown" && !node.expanded) void expand(id);
    setSelectedId(firstUnmarked(id));
  }

  function search(id: string) {
    const node = nodesRef.current[id];
    if (!node) return;
    window.open(googleSearchUrl(nodesRef.current[ROOT_ID].word, node.word), "_blank", "noopener,noreferrer");
  }

  function reset() {
    generation.current++;
    prefetched.current.clear();
    nodesRef.current = {};
    setNodes(null);
    setInput("");
    setSelectedId(null);
    setError(null);
    setNotice(null);
  }

  const list = nodes ? Object.values(nodes) : [];
  const next = nodes ? nextToStudy(nodes, loadingIds) : [];
  const nextIds = new Set(next.map((n) => n.id));
  const counts = {
    known: list.filter((n) => n.status === "known").length,
    unknown: list.filter((n) => n.status === "unknown").length,
    none: list.filter((n) => n.status === "none").length,
  };
  const root = nodes?.[ROOT_ID];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-12">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black tracking-wide text-navy">ことばマップ</h1>
        <p className="mt-2 text-sm text-navy/70">知りたいことに、わかることからたどり着こう</p>
      </header>

      {error && !nodes && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!nodes && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label className="block font-bold text-navy" htmlFor="word">
            知りたいことは？
          </label>
          <p className="text-xs text-navy/60">大学の勉強やプログラミングなど、教科書や入門書がある分野で使えます。</p>
          <input
            id="word"
            className="w-full rounded-lg border border-zinc-300 p-3 focus:border-leaf focus:outline-none"
            placeholder="例：微分、継承、React"
            maxLength={50}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <p className="text-xs text-navy/50">
            入力した言葉と、たどった言葉はAIに送られます。名前や連絡先などの個人情報は入れないでください。
          </p>
          <button
            type="submit"
            className="w-full rounded-lg bg-leaf py-3 font-bold text-white disabled:opacity-40"
            disabled={!input.trim()}
          >
            はじめる
          </button>
        </form>
      )}

      {nodes && root && (
        <section className="space-y-6">
          <div className="space-y-2 text-center text-xs text-navy/70">
            <p>
              見出しを押して、わかるなら <b className="text-leaf">○</b>、わからないなら <b className="text-amber-700">×</b>{" "}
              を付けよう。× を付けると、教科書の目次から「前提」と「中身」の見出しが広がります。
            </p>
            <p className="flex flex-wrap justify-center gap-2">
              <Legend className="bg-leaf text-white">○ わかる {counts.known}</Legend>
              <Legend className="border border-sun bg-[#fde7c4] text-navy">× わからない {counts.unknown}</Legend>
              <Legend className="border border-dashed border-zinc-400 bg-white text-navy">まだ {counts.none}</Legend>
            </p>
            <p className="flex flex-wrap justify-center gap-3">
              <span>
                <span className="mr-1 inline-block h-0.5 w-5 bg-navy/50 align-middle" />
                前提（その章より前に学ぶ）
              </span>
              <span>
                <span className="mr-1 inline-block h-0.5 w-5 bg-leaf align-middle" />
                中身（その章の中で学ぶ）
              </span>
            </p>
          </div>

          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!error && notice && <p className="rounded-lg bg-navy/5 p-3 text-sm text-navy">{notice}</p>}

          <MindMap
            nodes={nodes}
            rootId={ROOT_ID}
            selectedId={selectedId}
            loadingIds={loadingIds}
            nextIds={nextIds}
            focusId={focusId}
            onSelect={setSelectedId}
            onMark={mark}
            onSearch={search}
          />

          <div className="rounded-2xl border border-zinc-200 p-4">
            <h2 className="font-bold text-navy">次に勉強すること</h2>
            {root.status === "known" ? (
              <p className="mt-2 text-sm text-navy/80">
                知りたかった「{root.word}」がわかるようになりました。おつかれさまでした！
              </p>
            ) : next.length ? (
              <>
                <p className="mt-1 text-xs text-navy/60">
                  先に学ぶ見出しがわかっているので、ここから始められます。勉強したら ○ に変えると、次に進みます。
                </p>
                <ul className="mt-3 space-y-2">
                  {next.map((n) => {
                    const known = n.children.map((c) => nodes[c].word);
                    return (
                      <li key={n.id} className="rounded-lg bg-zinc-50 p-3">
                        <button
                          className="w-full text-left"
                          onClick={() => {
                            setSelectedId(n.id);
                            setFocusId(n.id);
                          }}
                        >
                          <span className="font-bold text-navy">{n.word}</span>
                          <span className="mt-1 block text-sm text-navy/70">{n.meaning || "…"}</span>
                          {known.length > 0 && (
                            <span className="mt-1 block text-xs text-leaf">わかっている：{known.join("・")}</span>
                          )}
                        </button>
                        <button className="mt-2 text-xs text-navy/60 underline" onClick={() => search(n.id)}>
                          Webで調べる
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-navy/60">
                {loadingIds.size
                  ? "言葉を作っています…"
                  : `まだ ○× を付けていない見出しが ${counts.none} 個あります。× の見出しの先が全部 ○ になると、ここに出ます。`}
              </p>
            )}
          </div>

          <button className="w-full rounded-lg border border-zinc-300 py-3 font-bold text-navy" onClick={reset}>
            新しい言葉で始める
          </button>
        </section>
      )}
    </main>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 font-bold ${className}`}>{children}</span>;
}
