"use client";

import { useEffect, useMemo, useRef } from "react";
import { boxOf, ROLE_HINT, type MapNode } from "@/lib/mindmap";

const PAD = 40;
const MIN_W = 340;
const MIN_H = 420;
const POPUP_W = 240;

type Props = {
  nodes: Record<string, MapNode>;
  rootId: string;
  selectedId: string | null;
  loadingIds: Set<string>;
  searchedIds: Set<string>;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onExpand: (id: string) => void;
  onSearch: (id: string) => void;
};

export default function MindMap({
  nodes,
  rootId,
  selectedId,
  loadingIds,
  searchedIds,
  focusId,
  onSelect,
  onExpand,
  onSearch,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => Object.fromEntries(Object.values(nodes).map((n) => [n.id, boxOf(n)])), [nodes]);

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

  // 広げた言葉と、その先の言葉がまとめて見えるようにスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    const focus = focusId ? nodes[focusId] : null;
    if (!el || !focus) return;
    const group = [focus.id, ...focus.children].map((id) => placed[id]).filter(Boolean);
    const cx = (Math.min(...group.map((b) => b.x - b.w / 2)) + Math.max(...group.map((b) => b.x + b.w / 2))) / 2;
    const cy = (Math.min(...group.map((b) => b.y - b.h / 2)) + Math.max(...group.map((b) => b.y + b.h / 2))) / 2;
    el.scrollTo({ left: cx + ox - el.clientWidth / 2, top: cy + oy - el.clientHeight / 2, behavior: "smooth" });
    // 配置が変わったときだけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, nodes]);

  // 押した言葉と説明が画面の外にはみ出すときだけ、見える位置までスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    const p = selectedId ? placed[selectedId] : null;
    if (!el || !p) return;
    const left = p.x + ox - POPUP_W / 2 - 8;
    const right = p.x + ox + POPUP_W / 2 + 8;
    const top = p.y + oy - p.h / 2 - 8;
    const bottom = p.y + oy + p.h / 2 + 150;
    const visible =
      left >= el.scrollLeft &&
      right <= el.scrollLeft + el.clientWidth &&
      top >= el.scrollTop &&
      bottom <= el.scrollTop + el.clientHeight;
    if (!visible) {
      el.scrollTo({ left: (left + right) / 2 - el.clientWidth / 2, top: (top + bottom) / 2 - el.clientHeight / 2, behavior: "smooth" });
    }
    // 選んだときだけ動かす
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const selected = selectedId ? nodes[selectedId] : null;
  const sp = selectedId ? placed[selectedId] : null;
  const popupLeft = sp ? Math.min(Math.max(sp.x + ox, POPUP_W / 2 + 8), width - POPUP_W / 2 - 8) : 0;
  const popupBelow = sp ? sp.y + oy < height - 180 : true;

  return (
    <div
      ref={scrollRef}
      className="flex h-[60vh] min-h-[420px] overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50/60"
    >
      <div className="relative m-auto shrink-0" style={{ width, height }} onClick={() => onSelect(null)}>
        <svg width={width} height={height} role="img" aria-label="ことばマップ">
          <g transform={`translate(${ox} ${oy})`}>
            {ids.map((id) => {
              const parent = nodes[id].parentId;
              if (!parent) return null;
              const a = placed[parent];
              const b = placed[id];
              return (
                <line
                  key={`e-${id}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#3fa77a"
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                />
              );
            })}
            {ids.map((id) => {
              const n = nodes[id];
              const p = placed[id];
              const isRoot = id === rootId;
              const active = id === selectedId;
              const fill = isRoot ? "#13254a" : n.expanded ? "#3fa77a" : "#ffffff";
              const stroke = isRoot ? "#13254a" : searchedIds.has(id) ? "#f0a73a" : "#3fa77a";
              const text = isRoot || n.expanded ? "#ffffff" : "#13254a";
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
                  aria-label={n.word}
                >
                  <rect
                    x={p.x - p.w / 2}
                    y={p.y - p.h / 2}
                    width={p.w}
                    height={p.h}
                    rx={p.h / 2}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={active ? 3 : 1.5}
                  />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={text}
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
            <p className="font-bold text-navy">{selected.word}</p>
            {selected.role && (
              <p className="mt-1 text-xs text-navy/60">
                <span className="mr-1 rounded-full bg-leaf/15 px-2 py-0.5 font-bold text-leaf">{selected.role}</span>
                {ROLE_HINT[selected.role]}
              </p>
            )}
            <p className="mt-1 text-sm text-navy/80">{selected.meaning || "説明を準備しています…"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="rounded-lg bg-leaf py-2 text-sm font-bold text-white disabled:opacity-40"
                disabled={selected.expanded || loadingIds.has(selected.id)}
                onClick={() => onExpand(selected.id)}
              >
                {loadingIds.has(selected.id) ? "作っています…" : selected.expanded ? "広げ済み" : "広げる"}
              </button>
              <button
                className="rounded-lg border border-leaf py-2 text-sm font-bold text-leaf"
                onClick={() => onSearch(selected.id)}
              >
                Web検索
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
