"use client";

import { useRef, useState, type ReactNode } from "react";
import MindMap from "@/components/MindMap";
import {
  expandWords,
  googleSearchUrl,
  pathTo,
  pickNew,
  placeChildren,
  ROLE_HINT,
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
  // わからなかった言葉（押した順）
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [searchedIds, setSearchedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const nodesRef = useRef<Record<string, MapNode>>({});
  const nextId = useRef(1);
  // 先読みした候補（言葉のID → AIが返した7個）
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

  function record(id: string) {
    setRecordIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function addChildren(parentId: string, picks: Candidate[]): string[] {
    const ids = picks.map(() => `n${nextId.current++}`);
    updateNodes((prev) => {
      const positions = placeChildren(prev, parentId, picks.map((c) => c.word));
      const next = { ...prev, [parentId]: { ...prev[parentId], expanded: true, children: ids } };
      picks.forEach((c, i) => {
        next[ids[i]] = {
          id: ids[i],
          word: c.word,
          role: c.role,
          meaning: c.meaning,
          parentId,
          children: [],
          expanded: false,
          ...positions[i],
        };
      });
      return next;
    });
    return ids;
  }

  // 表示した言葉の先を、1回の呼び出しでまとめて作っておく
  function prefetch(ids: string[]) {
    if (!ids.length) return;
    const gen = generation.current;
    const targets = ids.map((id) => ({ word: nodesRef.current[id].word, path: pathTo(nodesRef.current, id) }));
    const batch = expandWords(targets, allWords());
    ids.forEach((id, i) => {
      const p = batch.then((r) => {
        if (gen !== generation.current) return [];
        return r[i]?.candidates ?? [];
      });
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

  async function start() {
    const word = input.trim();
    if (!word) return;
    const gen = ++generation.current;
    prefetched.current.clear();
    nextId.current = 1;
    nodesRef.current = {};
    updateNodes(() => ({
      [ROOT_ID]: { id: ROOT_ID, word, meaning: "", role: null, parentId: null, children: [], expanded: true, x: 0, y: 0 },
    }));
    setRecordIds([ROOT_ID]);
    setSearchedIds(new Set());
    setSelectedId(null);
    setFocusId(ROOT_ID);
    setError(null);
    setLoading(ROOT_ID, true);
    try {
      const [r] = await expandWords([{ word, path: [] }], []);
      if (gen !== generation.current) return;
      updateNodes((prev) => ({ ...prev, [ROOT_ID]: { ...prev[ROOT_ID], meaning: r?.meaning ?? "" } }));
      const ids = addChildren(ROOT_ID, pickNew(r?.candidates ?? [], [word]));
      prefetch(ids);
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
    record(id);
    try {
      const candidates = await candidatesFor(id);
      if (gen !== generation.current) return;
      // 表示するときのマップの状態で、重複を除いて選ぶ
      const picks = pickNew(candidates, allWords());
      if (!picks.length) {
        // 次に押したときは、今のマップの状態で AI に作り直してもらう
        prefetched.current.delete(id);
        setError(`「${node.word}」から新しい言葉が見つかりませんでした`);
        return;
      }
      const ids = addChildren(id, picks);
      setSelectedId(null);
      setFocusId(id);
      prefetch(ids);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(id, false);
    }
  }

  function search(id: string) {
    const node = nodesRef.current[id];
    if (!node) return;
    window.open(googleSearchUrl(nodesRef.current[ROOT_ID].word, node.word), "_blank", "noopener,noreferrer");
    record(id);
    setSearchedIds((prev) => new Set(prev).add(id));
  }

  function reset() {
    generation.current++;
    prefetched.current.clear();
    nodesRef.current = {};
    setNodes(null);
    setInput("");
    setRecordIds([]);
    setSearchedIds(new Set());
    setSelectedId(null);
    setError(null);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pt-10 pb-28">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black tracking-wide text-navy">ことばマップ</h1>
        <p className="mt-2 text-sm text-navy/70">言葉をたどって、わからないことを見つけよう</p>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!nodes && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label className="block font-bold text-navy" htmlFor="word">
            わからない言葉は？
          </label>
          <input
            id="word"
            className="w-full rounded-lg border border-zinc-300 p-3 focus:border-leaf focus:outline-none"
            placeholder="例：NISA"
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
            マップを作る
          </button>
        </form>
      )}

      {nodes && (
        <section className="space-y-6">
          <p className="text-center text-xs text-navy/60">気になる言葉を押すと、説明と「広げる」「Web検索」が出ます</p>
          <MindMap
            nodes={nodes}
            rootId={ROOT_ID}
            selectedId={selectedId}
            loadingIds={loadingIds}
            searchedIds={searchedIds}
            focusId={focusId}
            onSelect={setSelectedId}
            onExpand={expand}
            onSearch={search}
          />

          <div className="rounded-2xl border border-zinc-200 p-4">
            <h2 className="font-bold text-navy">わからなかった言葉</h2>
            <ul className="mt-3 space-y-2">
              {recordIds
                .filter((id) => nodes[id])
                .map((id) => {
                  const n = nodes[id];
                  return (
                    <li key={id}>
                      <button
                        className="w-full rounded-lg bg-zinc-50 p-3 text-left hover:bg-zinc-100"
                        onClick={() => {
                          setSelectedId(id);
                          setFocusId(id);
                        }}
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-navy">{n.word}</span>
                          {id === ROOT_ID && <Tag className="bg-navy/10 text-navy">はじめの言葉</Tag>}
                          {n.role && (
                            <span className="text-xs text-navy/50" title={ROLE_HINT[n.role]}>
                              {n.role}
                            </span>
                          )}
                          {id !== ROOT_ID && n.expanded && <Tag className="bg-leaf/15 text-leaf">広げた</Tag>}
                          {searchedIds.has(id) && <Tag className="bg-sun/20 text-amber-700">検索した</Tag>}
                        </span>
                        <span className="mt-1 block text-sm text-navy/70">{n.meaning || "…"}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>

          <button className="w-full rounded-lg border border-zinc-300 py-3 font-bold text-navy" onClick={reset}>
            新しい言葉で始める
          </button>
        </section>
      )}
    </main>
  );
}

function Tag({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${className}`}>{children}</span>;
}
