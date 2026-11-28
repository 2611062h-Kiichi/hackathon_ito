"use client";

import { useRef, useState, type ReactNode } from "react";
import MindMap, { DROP_ZONE_ATTR, type DragState } from "@/components/MindMap";
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
  // 「次に勉強すること」のパネルを開いているか
  const [panelOpen, setPanelOpen] = useState(false);
  // 自分で「次に勉強すること」に入れた見出し（ドラッグ・追加ボタン）。入れた順
  const [pinned, setPinned] = useState<string[]>([]);
  const [drag, setDrag] = useState<DragState>("none");

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

  // ○ はそこで止める。× はその見出しの前提・中身を広げる。付けたら説明を閉じる（次の説明は勝手に開かない）
  function mark(id: string, status: "known" | "unknown") {
    const node = nodesRef.current[id];
    if (!node) return;
    updateNodes((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
    if (status === "unknown" && !node.expanded) void expand(id);
    setSelectedId(null);
  }

  function search(id: string) {
    const node = nodesRef.current[id];
    if (!node) return;
    window.open(googleSearchUrl(nodesRef.current[ROOT_ID].word, node.word), "_blank", "noopener,noreferrer");
  }

  // 斥力・ばねで落ち着いた位置を覚えておく（次に広げる見出しは、この位置をもとに置く）
  function savePositions(positions: Record<string, { x: number; y: number }>) {
    updateNodes((prev) => {
      const next = { ...prev };
      for (const [id, pos] of Object.entries(positions)) if (next[id]) next[id] = { ...next[id], ...pos };
      return next;
    });
  }

  function addToList(id: string) {
    setPinned((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPanelOpen(true);
  }

  function removeFromList(id: string) {
    setPinned((prev) => prev.filter((p) => p !== id));
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
    setPanelOpen(false);
    setPinned([]);
  }

  const list = nodes ? Object.values(nodes) : [];
  const next = nodes ? nextToStudy(nodes, loadingIds) : [];
  const nextIds = new Set(next.map((n) => n.id));
  // パネルに出す順：自分で入れた見出し → まだ入っていないおすすめ（土台がそろった × の見出し）
  const studyList = nodes
    ? [
        ...pinned.filter((id) => nodes[id]).map((id) => ({ node: nodes[id], pinned: true })),
        ...next.filter((n) => !pinned.includes(n.id)).map((node) => ({ node, pinned: false })),
      ]
    : [];
  const counts = {
    known: list.filter((n) => n.status === "known").length,
    unknown: list.filter((n) => n.status === "unknown").length,
    none: list.filter((n) => n.status === "none").length,
  };
  const root = nodes?.[ROOT_ID];

  // マップを作ったら、ページ全体をマップにする（上は最小限のバーだけ）
  if (nodes && root) {
    const message = error ?? notice;
    return (
      <main className="fixed inset-0 flex flex-col bg-zinc-50">
        <header className="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 text-xs">
          <h1 className="font-black text-navy">ことばマップ</h1>
          <span className="flex flex-wrap items-center gap-1.5">
            <Legend className="bg-leaf text-white">○ {counts.known}</Legend>
            <Legend className="border border-sun bg-[#fde7c4] text-navy">× {counts.unknown}</Legend>
            <Legend className="border border-dashed border-zinc-400 bg-white text-navy">まだ {counts.none}</Legend>
          </span>
          <span className="hidden items-center gap-2 text-navy/60 sm:flex">
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 bg-navy/50 align-middle" />
              前提
            </span>
            <span>
              <span className="mr-1 inline-block h-0.5 w-4 bg-leaf align-middle" />
              中身
            </span>
          </span>
          <button
            className="ml-auto rounded-lg border border-zinc-300 px-2 py-1 font-bold text-navy hover:bg-zinc-50"
            onClick={reset}
          >
            新しく始める
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
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
            onAddToList={addToList}
            onDrag={setDrag}
            onSettle={savePositions}
          />

          {message && (
            <div
              className={`absolute top-3 left-1/2 z-20 flex w-[min(92%,36rem)] -translate-x-1/2 items-start gap-2 rounded-lg p-3 text-sm shadow-md ${
                error ? "bg-red-50 text-red-700" : "bg-white text-navy"
              }`}
              role="status"
            >
              <p className="flex-1">{message}</p>
              <button
                className="text-navy/50 hover:text-navy"
                aria-label="閉じる"
                onClick={() => {
                  setError(null);
                  setNotice(null);
                }}
              >
                ×
              </button>
            </div>
          )}

          <div
            {...{ [DROP_ZONE_ATTR]: "" }}
            className={`absolute right-3 bottom-3 left-3 z-20 rounded-xl border-2 bg-white shadow-lg transition-colors sm:right-auto sm:w-80 ${
              drag === "over" ? "border-leaf bg-leaf/10" : drag === "dragging" ? "border-dashed border-leaf" : "border-zinc-200"
            }`}
          >
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-bold text-navy"
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen((v) => !v)}
            >
              <span>
                {root.status === "known" ? `「${root.word}」がわかるようになりました` : "次に勉強すること"}
                {root.status !== "known" && studyList.length > 0 && (
                  <span className="ml-2 rounded-full bg-navy px-1.5 text-xs text-white">{studyList.length}</span>
                )}
              </span>
              <span aria-hidden>{panelOpen ? "▾" : "▴"}</span>
            </button>
            {drag !== "none" && <p className="px-3 pb-2 text-xs font-bold text-leaf">ここに離すと追加します</p>}
            {panelOpen && (
              <div className="max-h-[40vh] overflow-auto border-t border-zinc-100 px-3 pb-3">
                {root.status === "known" && <p className="mt-2 text-sm text-navy/80">おつかれさまでした！</p>}
                {studyList.length ? (
                  <ul className="mt-2 space-y-2">
                    {studyList.map(({ node: n, pinned: isPinned }) => {
                      const known = n.children.filter((c) => nodes[c].status === "known").map((c) => nodes[c].word);
                      return (
                        <li key={n.id} className="rounded-lg bg-zinc-50 p-2">
                          <div className="flex items-start gap-2">
                            <button
                              className="flex-1 text-left"
                              onClick={() => {
                                setSelectedId(n.id);
                                setFocusId(n.id);
                              }}
                            >
                              <span className="font-bold text-navy">{n.word}</span>
                              {!isPinned && (
                                <span className="ml-2 rounded-full bg-navy/10 px-1.5 text-[10px] text-navy">おすすめ</span>
                              )}
                              <span className="mt-0.5 block text-xs text-navy/70">{n.meaning || "…"}</span>
                              {known.length > 0 && (
                                <span className="mt-0.5 block text-xs text-leaf">わかっている：{known.join("・")}</span>
                              )}
                            </button>
                            {isPinned && (
                              <button
                                className="text-navy/40 hover:text-navy"
                                aria-label={`${n.word}をリストから外す`}
                                onClick={() => removeFromList(n.id)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <button className="mt-1 text-xs text-navy/60 underline" onClick={() => search(n.id)}>
                            Webで調べる
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  root.status !== "known" && (
                    <p className="mt-2 text-xs text-navy/60">
                      見出しをここへドラッグすると追加できます。× の見出しの先が全部 ○ になったものは、おすすめとして自動で出ます。
                    </p>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-12">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black tracking-wide text-navy">ことばマップ</h1>
        <p className="mt-2 text-sm text-navy/70">知りたいことに、わかることからたどり着こう</p>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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
    </main>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 font-bold ${className}`}>{children}</span>;
}
