"use client";

import { useEffect, useMemo, useRef } from "react";
import { boxOf, edgesOf, KIND_LABEL, type MapNode, type Status } from "@/lib/mindmap";

const PAD = 40;
const MIN_W = 340;
const MIN_H = 420;
const POPUP_W = 248;

// ○×ごとの見た目（色だけに頼らないよう、まだの言葉は点線にする）
const LOOK: Record<Status, { fill: string; stroke: string; text: string; dash?: string }> = {
  none: { fill: "#ffffff", stroke: "#a1a1aa", text: "#13254a", dash: "4 3" },
  known: { fill: "#3fa77a", stroke: "#3fa77a", text: "#ffffff" },
  unknown: { fill: "#fde7c4", stroke: "#f0a73a", text: "#13254a" },
};

const STATUS_LABEL: Record<Status, string> = { none: "まだ", known: "わかる", unknown: "わからない" };

type Props = {
  nodes: Record<string, MapNode>;
  rootId: string;
  selectedId: string | null;
  loadingIds: Set<string>;
  nextIds: Set<string>;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onMark: (id: string, status: "known" | "unknown") => void;
  onSearch: (id: string) => void;
};

export default function MindMap({
  nodes,
  rootId,
  selectedId,
  loadingIds,
  nextIds,
  focusId,
  onSelect,
  onMark,
  onSearch,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => Object.fromEntries(Object.values(nodes).map((n) => [n.id, boxOf(n)])), [nodes]);
  const edges = useMemo(() => edgesOf(nodes), [nodes]);
  const count = Object.keys(nodes).length;

  // 全体の大きさ（中心を原点に置いた座標を、左上が0になるようにずらす）
  const ids = Object.keys(placed);
  const minX = Math.min(...ids.map((id) => placed[id].x - placed[id].w / 2)) - PAD;
  const maxX = Math.max(...ids.map((id) => placed[id].x + placed[id].w / 2)) + PAD;
  const minY = Math.min(...ids.map((id) => placed[id].y - placed[id].h / 2)) - PAD;
  const maxY = Math.max(...ids.map((id) => placed[id].y + placed[id].h / 2)) + PAD;
  const width = Math.max(MIN_W, maxX - minX);
  const height = Math.max(MIN_H, maxY - minY);
  const ox = (width - (maxX - minX)) / 2 - minX;
  const oy = (height - (maxY - minY)) / 2 - minY;

  // 広げた言葉と、その先の言葉がまとめて見えるようにスクロールする（言葉が増えたときだけ）
  useEffect(() => {
    const el = scrollRef.current;
    const focus = focusId ? nodes[focusId] : null;
    if (!el || !focus) return;
    const group = [focus.id, ...focus.children].map((id) => placed[id]).filter(Boolean);
    const cx = (Math.min(...group.map((b) => b.x - b.w / 2)) + Math.max(...group.map((b) => b.x + b.w / 2))) / 2;
    const cy = (Math.min(...group.map((b) => b.y - b.h / 2)) + Math.max(...group.map((b) => b.y + b.h / 2))) / 2;
    el.scrollTo({ left: cx + ox - el.clientWidth / 2, top: cy + oy - el.clientHeight / 2, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, count]);

  // 押した言葉と説明が画面の外にはみ出すときだけ、見える位置までスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    const p = selectedId ? placed[selectedId] : null;
    if (!el || !p) return;
    const left = p.x + ox - POPUP_W / 2 - 8;
    const right = p.x + ox + POPUP_W / 2 + 8;
    const top = p.y + oy - p.h / 2 - 8;
    const bottom = p.y + oy + p.h / 2 + 170;
    const visible =
      left >= el.scrollLeft &&
      right <= el.scrollLeft + el.clientWidth &&
      top >= el.scrollTop &&
      bottom <= el.scrollTop + el.clientHeight;
    if (!visible) {
      el.scrollTo({ left: (left + right) / 2 - el.clientWidth / 2, top: (top + bottom) / 2 - el.clientHeight / 2, behavior: "smooth" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = selectedId ? nodes[selectedId] : null;
  const sp = selectedId ? placed[selectedId] : null;
  const popupLeft = sp ? Math.min(Math.max(sp.x + ox, POPUP_W / 2 + 8), width - POPUP_W / 2 - 8) : 0;
  const popupBelow = sp ? sp.y + oy < height - 200 : true;
  const busy = selected ? loadingIds.has(selected.id) : false;

  return (
    <div
      ref={scrollRef}
      className="flex h-[60vh] min-h-[420px] overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50/60"
    >
      <div className="relative m-auto shrink-0" style={{ width, height }} onClick={() => onSelect(null)}>
        <svg width={width} height={height} role="img" aria-label="ことばマップ">
          <g transform={`translate(${ox} ${oy})`}>
            {edges.map(([a, b]) => (
              <line
                key={`e-${a.id}-${b.id}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                // 前提の枝は紺、中身の枝は緑
                stroke={b.kind === "inside" ? "#3fa77a" : "#13254a"}
                strokeOpacity={b.kind === "inside" ? 0.6 : 0.35}
                strokeWidth={1.5}
                // ほかの枝で先に出ていた言葉へつないだ線は点線
                strokeDasharray={b.parentId === a.id ? undefined : "5 4"}
              />
            ))}
            {ids.map((id) => {
              const n = nodes[id];
              const p = placed[id];
              const isRoot = id === rootId;
              const active = id === selectedId;
              const look = LOOK[n.status];
              return (
                <g
                  key={id}
                  className="cursor-pointer animate-knit-in"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(active ? null : id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelect(active ? null : id);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.word}（${STATUS_LABEL[n.status]}）`}
                >
                  <rect
                    x={p.x - p.w / 2}
                    y={p.y - p.h / 2}
                    width={p.w}
                    height={p.h}
                    rx={p.h / 2}
                    fill={look.fill}
                    stroke={active ? "#13254a" : nextIds.has(id) ? "#13254a" : look.stroke}
                    strokeWidth={active ? 3 : nextIds.has(id) ? 2.5 : isRoot ? 2.5 : 1.5}
                    strokeDasharray={active || nextIds.has(id) ? undefined : look.dash}
                  />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={look.text}
                    fontSize={isRoot ? 16 : 13}
                    fontWeight={isRoot ? 900 : 700}
                  >
                    {loadingIds.has(id) ? "…" : n.word}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {selected && sp && (
          <div
            className="absolute z-10 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
            style={{
              width: POPUP_W,
              left: popupLeft,
              top: popupBelow ? sp.y + oy + sp.h / 2 + 8 : sp.y + oy - sp.h / 2 - 8,
              transform: popupBelow ? "translateX(-50%)" : "translate(-50%, -100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-navy">
              {selected.kind && (
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 align-middle text-xs ${
                    selected.kind === "inside" ? "bg-leaf/15 text-leaf" : "bg-navy/10 text-navy"
                  }`}
                >
                  {KIND_LABEL[selected.kind]}
                </span>
              )}
              {selected.word}
            </p>
            {selected.kind ? (
              <>
                <p className="mt-2 text-xs font-bold text-navy/60">こんなことができる？</p>
                <p className="mt-0.5 text-sm text-navy/90">{selected.meaning || "…"}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-navy/80">{selected.meaning || "説明を準備しています…"}</p>
            )}
            <p className="mt-3 text-xs font-bold text-navy/60">この見出し、わかる？</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                className={`rounded-lg py-2 text-sm font-bold ${
                  selected.status === "known" ? "bg-leaf text-white" : "border border-leaf text-leaf"
                }`}
                aria-pressed={selected.status === "known"}
                onClick={() => onMark(selected.id, "known")}
              >
                ○ わかる
              </button>
              <button
                className={`rounded-lg py-2 text-sm font-bold disabled:opacity-60 ${
                  selected.status === "unknown" ? "bg-sun text-navy" : "border border-sun text-amber-700"
                }`}
                aria-pressed={selected.status === "unknown"}
                disabled={busy}
                onClick={() => onMark(selected.id, "unknown")}
              >
                {busy ? "作っています…" : "× わからない"}
              </button>
            </div>
            <button className="mt-2 w-full text-xs text-navy/60 underline" onClick={() => onSearch(selected.id)}>
              Webで調べる
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
