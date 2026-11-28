"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { settle, step, type Body, type Link } from "@/lib/forceLayout";
import { boxOf, edgesOf, KIND_LABEL, labelWidth, NODE_H, type MapNode, type Status } from "@/lib/mindmap";

const PAD = 40;
const MIN_W = 340;
const MIN_H = 420;
const POPUP_W = 248;
// これ以上動かしたら、押したのではなくドラッグとみなす（px）
const DRAG_THRESHOLD = 6;
// 「次に勉強すること」の置き場所に付ける目印（page.tsx のパネルに付けてある）
export const DROP_ZONE_ATTR = "data-study-drop";

// ○×ごとの見た目（色だけに頼らないよう、まだの言葉は点線にする）
const LOOK: Record<Status, { fill: string; stroke: string; text: string; dash?: string }> = {
  none: { fill: "#ffffff", stroke: "#a1a1aa", text: "#13254a", dash: "4 3" },
  known: { fill: "#3fa77a", stroke: "#3fa77a", text: "#ffffff" },
  unknown: { fill: "#fde7c4", stroke: "#f0a73a", text: "#13254a" },
};

const STATUS_LABEL: Record<Status, string> = { none: "まだ", known: "わかる", unknown: "わからない" };

// ドラッグ中の状態：none＝していない / dragging＝ドラッグ中 / over＝置き場所の上にいる
export type DragState = "none" | "dragging" | "over";

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
  onAddToList: (id: string) => void;
  onDrag: (state: DragState) => void;
  // 斥力・ばねで動いた見出しが落ち着いたときの位置（次に広げる見出しの置き場所の計算に使う）
  onSettle: (positions: Record<string, { x: number; y: number }>) => void;
};

type Pt = { x: number; y: number };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
const NO_BOUNDS: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
const union = (a: Bounds, b: Bounds): Bounds => ({
  minX: Math.min(a.minX, b.minX),
  maxX: Math.max(a.maxX, b.maxX),
  minY: Math.min(a.minY, b.minY),
  maxY: Math.max(a.maxY, b.maxY),
});

// 写しの大きさ（本物より少し小さく、「↗」の分だけ幅を足す）
const refSize = (word: string) => ({ w: Math.round(labelWidth(word) * 0.85) + 14, h: NODE_H - 8 });

const overDropZone = (x: number, y: number) => !!document.elementFromPoint(x, y)?.closest(`[${DROP_ZONE_ATTR}]`);

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
  onAddToList,
  onDrag,
  onSettle,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const allEdges = useMemo(() => edgesOf(nodes), [nodes]);
  // 線は、見出しを最初に出した親とのつながり（木）だけ引く
  const edges = useMemo(() => allEdges.filter(([a, b]) => b.parentId === a.id), [allEdges]);
  // ほかの枝で先に出ていた見出しへのつながりは、長い線を引かずに、親のそばに小さな「写し」を置く。
  // 写しを押すと本物の見出しへ移る（線が地図を横切らないので、交差しない）
  const refs = useMemo(
    () =>
      allEdges
        .filter(([a, b]) => b.parentId !== a.id)
        .map(([a, b]) => ({ id: `ref:${a.id}:${b.id}`, parent: a.id, target: b.id, word: b.word })),
    [allEdges],
  );
  const count = Object.keys(nodes).length + refs.length;

  // ---- 斥力・ばねで、見出しをリアルタイムに動かして落ち着かせる ----
  // 計算用の位置と速さ（毎フレーム書き換える）。画面に出すのは、そのたびに作る layout（state）
  const bodies = useRef(new Map<string, Body>());
  const links = useRef<Link[]>([]);
  const alpha = useRef(0);
  const frame = useRef<number | null>(null);
  // 地図の大きさは、広がることはあっても縮まないようにする（動いている途中に全体がずれて揺れないように）
  const [layout, setLayout] = useState<{ pos: Record<string, Pt>; bounds: Bounds }>({ pos: {}, bounds: NO_BOUNDS });
  const settleRef = useRef(onSettle);
  useEffect(() => {
    settleRef.current = onSettle;
  });
  // ドラッグ：押した場所と、つかんだ見出しの元の位置（「次に勉強すること」に入れたら元に戻す）
  const press = useRef<{ id: string; x: number; y: number; dragging: boolean; from: Pt | null } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // 今の位置を画面に出す（requestAnimationFrame の中から呼ぶ）
  const publish = () => {
    const pos: Record<string, Pt> = {};
    const now = { ...NO_BOUNDS };
    for (const [id, b] of bodies.current) {
      pos[id] = { x: b.x, y: b.y };
      now.minX = Math.min(now.minX, b.x - b.w / 2 - PAD);
      now.maxX = Math.max(now.maxX, b.x + b.w / 2 + PAD);
      now.minY = Math.min(now.minY, b.y - b.h / 2 - PAD);
      now.maxY = Math.max(now.maxY, b.y + b.h / 2 + PAD);
    }
    setLayout((prev) => ({ pos, bounds: union(prev.bounds, now) }));
    return pos;
  };

  // 動かし始める（すでに動いていれば、勢いを足すだけ）。strength は 0〜1
  const kick = (strength: number) => {
    alpha.current = Math.max(alpha.current, strength);
    if (frame.current !== null) return;
    const loop = () => {
      const moved = step(bodies.current, links.current, alpha.current);
      alpha.current = Math.max(alpha.current * 0.97, 0.03);
      const pos = publish();
      // 見出しをドラッグしている間は止めない（周りがリアルタイムに反応するように）
      if (alpha.current <= 0.03 && moved < 0.1 && !press.current?.dragging) {
        frame.current = null;
        settleRef.current(pos);
        return;
      }
      frame.current = requestAnimationFrame(loop);
    };
    frame.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    const bs = bodies.current;
    // 見出しが増えたら、新しい見出しを親の近くから出して、斥力とばねで広げる（○× を付けただけなら動かさない）
    let added = false;
    for (const n of Object.values(nodes)) {
      if (bs.has(n.id)) continue;
      const b = boxOf(n);
      const parent = n.parentId ? bs.get(n.parentId) : undefined;
      // 親から、置く予定の場所へ少し進んだところから出す（飛び出して広がって見える）
      const x = parent ? parent.x + (n.x - parent.x) * 0.25 : n.x;
      const y = parent ? parent.y + (n.y - parent.y) * 0.25 : n.y;
      bs.set(n.id, { x, y, vx: 0, vy: 0, w: b.w, h: b.h, fixed: n.parentId === null });
      added = true;
    }
    // 写しは、親のすぐそば（本物のある向きに少しだけ寄せた場所）から出す
    for (const r of refs) {
      if (bs.has(r.id)) continue;
      const parent = bs.get(r.parent);
      const target = bs.get(r.target);
      if (!parent) continue;
      const dx = target ? target.x - parent.x : 0;
      const dy = target ? target.y - parent.y : 1;
      const d = Math.hypot(dx, dy) || 1;
      const size = refSize(r.word);
      bs.set(r.id, { x: parent.x + (dx / d) * 40, y: parent.y + (dy / d) * 40, vx: 0, vy: 0, ...size, fixed: false });
      added = true;
    }
    const refIds = new Set(refs.map((r) => r.id));
    for (const id of [...bs.keys()]) if (!nodes[id] && !refIds.has(id)) bs.delete(id);
    links.current = [
      ...edges.map(([a, b]) => [a.id, b.id] as Link),
      ...refs.map((r) => [r.parent, r.id] as Link),
    ];
    if (!added) return;

    // 動きを減らす設定のときは、アニメーションせずに一気に落ち着かせる
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => {
        settle(bs, links.current);
        settleRef.current(publish());
      });
      return;
    }
    kick(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, refs]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  // 今の位置（動いている途中の位置）で、見出しの箱を作る。まだ動き始めていない見出しは置いた位置のまま
  const placed = Object.fromEntries(
    Object.values(nodes).map((n) => [n.id, boxOf({ ...n, ...(layout.pos[n.id] ?? {}) })]),
  );
  // 写しの箱（まだ動き始めていなければ親の位置）
  const refPlaced = Object.fromEntries(
    refs.map((r) => [r.id, { ...(layout.pos[r.id] ?? placed[r.parent]), ...refSize(r.word) }]),
  );

  // ドラッグし終えた直後の click を、選択として扱わないための印
  const justDragged = useRef(false);
  const [ghost, setGhost] = useState<{ word: string; x: number; y: number } | null>(null);
  // マウスを乗せたら、少し待ってから説明（○×ボタン付き）を開く。通り過ぎただけでは開かないように
  const HOVER_DELAY = 150;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // マウスを乗せて開いた見出し（このときは画面を勝手にスクロールしない）
  const hoverOpened = useRef<string | null>(null);
  // マウスを乗せて開いた説明は、見出しと説明の両方からマウスが離れたら少しして閉じる
  const HOVER_CLOSE_DELAY = 300;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const scheduleClose = (id: string) => {
    cancelClose();
    if (hoverOpened.current !== id) return; // 押して開いた説明は開いたままにする
    closeTimer.current = setTimeout(() => {
      if (hoverOpened.current === id) {
        hoverOpened.current = null;
        onSelect(null);
      }
    }, HOVER_CLOSE_DELAY);
  };
  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  // 背景をマウスでドラッグして、地図を平行移動する
  const pan = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const justPanned = useRef(false);
  const [panning, setPanning] = useState(false);
  // 表示している枠の大きさ（地図のまわりに、この大きさの余白を付けて自由に動かせるようにする）
  const [view, setView] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 全体の大きさ（中心を原点に置いた座標を、左上が0になるようにずらす）
  const ids = Object.keys(placed);
  const boxesForBounds = [...Object.values(placed), ...Object.values(refPlaced)];
  const bd = union(layout.bounds, {
    minX: Math.min(...boxesForBounds.map((b) => b.x - b.w / 2 - PAD)),
    maxX: Math.max(...boxesForBounds.map((b) => b.x + b.w / 2 + PAD)),
    minY: Math.min(...boxesForBounds.map((b) => b.y - b.h / 2 - PAD)),
    maxY: Math.max(...boxesForBounds.map((b) => b.y + b.h / 2 + PAD)),
  });
  const { minX, maxX, minY, maxY } = bd;
  // 地図の大きさ＋表示枠の大きさ（端の見出しも画面の真ん中まで動かせる）
  const width = Math.max(MIN_W, maxX - minX + view.w);
  const height = Math.max(MIN_H, maxY - minY + view.h);
  const ox = (width - (maxX - minX)) / 2 - minX;
  const oy = (height - (maxY - minY)) / 2 - minY;

  // 地図が左や上に広がったぶんだけスクロール位置もずらして、画面の中で見出しが飛ばないようにする
  const prevOrigin = useRef<{ ox: number; oy: number } | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevOrigin.current;
    if (el && prev) {
      el.scrollLeft += ox - prev.ox;
      el.scrollTop += oy - prev.oy;
    }
    prevOrigin.current = { ox, oy };
  }, [ox, oy]);

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
  }, [focusId, count, view.w, view.h]);

  // 押した言葉と説明が画面の外にはみ出すときだけ、見える位置までスクロールする
  useEffect(() => {
    const el = scrollRef.current;
    const p = selectedId ? placed[selectedId] : null;
    if (!el || !p || hoverOpened.current === selectedId) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---- 見出しのドラッグ（「次に勉強すること」へ追加する） ----
  function onPointerDown(e: ReactPointerEvent<SVGGElement>, id: string) {
    if (e.button !== 0) return;
    const b = bodies.current.get(id);
    press.current = { id, x: e.clientX, y: e.clientY, dragging: false, from: b ? { x: b.x, y: b.y } : null };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  // つかんだ見出しを指（マウス）の位置に動かす。周りの見出しは斥力でリアルタイムに押しのけられる
  function moveTo(id: string, clientX: number, clientY: number) {
    const b = bodies.current.get(id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!b || !rect) return;
    b.x = clientX - rect.left - ox;
    b.y = clientY - rect.top - oy;
    b.vx = b.vy = 0;
    b.fixed = true;
    kick(0.3);
  }

  // 離したら、つかんでいた見出しも力で動けるようにする（知りたい言葉は固定のまま）
  function release(id: string, restore: boolean) {
    const b = bodies.current.get(id);
    const from = press.current?.from;
    if (b) {
      if (restore && from) {
        b.x = from.x;
        b.y = from.y;
      }
      b.fixed = nodes[id]?.parentId === null;
    }
    kick(0.3);
  }

  function onPointerMove(e: ReactPointerEvent<SVGGElement>) {
    const p = press.current;
    if (!p) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return;
    p.dragging = true;
    const over = overDropZone(e.clientX, e.clientY);
    moveTo(p.id, e.clientX, e.clientY);
    // 「次に勉強すること」の上では見出しがパネルに隠れるので、名前を指の横に出す
    setGhost(over ? { word: nodes[p.id].word, x: e.clientX, y: e.clientY } : null);
    onDrag(over ? "over" : "dragging");
  }

  function onPointerUp(e: ReactPointerEvent<SVGGElement>) {
    const p = press.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p?.dragging) {
      press.current = null;
      return;
    }
    // 指を離した直後に来る click だけを無視する（click が来なかったときに次の操作まで無視しないよう、少しで戻す）
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 50);
    setGhost(null);
    onDrag("none");
    const dropped = overDropZone(e.clientX, e.clientY);
    // 「次に勉強すること」に入れたときは、見出しを元の場所に戻す。それ以外は離した場所に置く
    release(p.id, dropped);
    press.current = null;
    if (dropped) onAddToList(p.id);
  }

  function onPointerCancel() {
    const p = press.current;
    if (p?.dragging) {
      setGhost(null);
      onDrag("none");
      release(p.id, true);
    }
    press.current = null;
  }

  // ---- 背景のドラッグで平行移動（マウスだけ。指では、ふつうのスクロールで動かせる） ----
  function onPanStart(e: ReactPointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    if (!el || e.pointerType !== "mouse" || e.button !== 0) return;
    // 見出し・説明・ボタンの上では動かさない
    if ((e.target as Element).closest('[role="button"], button, [data-popup]')) return;
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPanMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = scrollRef.current;
    const p = pan.current;
    if (!el || !p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 3) return;
    if (!p.moved) setPanning(true);
    p.moved = true;
    el.scrollLeft = p.left - dx;
    el.scrollTop = p.top - dy;
  }

  function onPanEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pan.current;
    pan.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!p?.moved) return;
    setPanning(false);
    // 動かし終えた直後の click で、開いている説明を閉じないようにする
    justPanned.current = true;
    setTimeout(() => (justPanned.current = false), 50);
  }

  const selected = selectedId ? nodes[selectedId] : null;
  const sp = selectedId ? placed[selectedId] : null;
  const popupLeft = sp ? Math.min(Math.max(sp.x + ox, POPUP_W / 2 + 8), width - POPUP_W / 2 - 8) : 0;
  const popupBelow = sp ? sp.y + oy < height - 180 : true;
  const busy = selected ? loadingIds.has(selected.id) : false;
  return (
    <div
      ref={scrollRef}
      className={`flex h-full w-full overflow-auto ${panning ? "cursor-grabbing select-none" : "cursor-grab"}`}
      onPointerDown={onPanStart}
      onPointerMove={onPanMove}
      onPointerUp={onPanEnd}
      onPointerCancel={onPanEnd}
    >
      <div
        className="relative m-auto shrink-0"
        style={{ width, height }}
        onClick={() => {
          if (!justPanned.current) onSelect(null);
        }}
      >
        {/* select-none：ドラッグしたときに見出しの文字が選択されないようにする */}
        <svg ref={svgRef} width={width} height={height} role="img" aria-label="ことばマップ" className="select-none">
          <g transform={`translate(${ox} ${oy})`}>
            {edges.map(([a, b]) => (
              <line
                key={`e-${a.id}-${b.id}`}
                x1={placed[a.id].x}
                y1={placed[a.id].y}
                x2={placed[b.id].x}
                y2={placed[b.id].y}
                // 前提の枝は紺、中身の枝は緑
                stroke={b.kind === "inside" ? "#3fa77a" : "#13254a"}
                strokeOpacity={b.kind === "inside" ? 0.6 : 0.35}
                strokeWidth={1.5}
              />
            ))}
            {refs.map((r) => (
              <line
                key={`e-${r.id}`}
                x1={placed[r.parent].x}
                y1={placed[r.parent].y}
                x2={refPlaced[r.id].x}
                y2={refPlaced[r.id].y}
                stroke="#13254a"
                strokeOpacity={0.3}
                strokeWidth={1.5}
                strokeDasharray="5 4"
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
                  // touch-none：見出しの上で指を動かしたら、スクロールではなくドラッグにする
                  className="cursor-grab touch-none outline-none animate-knit-in active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-navy"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  onPointerEnter={(e) => {
                    if (e.pointerType !== "mouse" || press.current || pan.current) return;
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    if (id === selectedId) {
                      cancelClose(); // 説明から見出しに戻ってきた
                      return;
                    }
                    hoverTimer.current = setTimeout(() => {
                      hoverOpened.current = id;
                      onSelect(id);
                    }, HOVER_DELAY);
                  }}
                  onPointerLeave={(e) => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    if (e.pointerType === "mouse" && id === selectedId) scheduleClose(id);
                  }}
                  onPointerDown={(e) => onPointerDown(e, id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerCancel}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDragged.current) {
                      justDragged.current = false;
                      return;
                    }
                    // 押して開いた説明は、マウスが離れても閉じない（閉じるのは背景を押したとき）
                    cancelClose();
                    hoverOpened.current = null;
                    onSelect(id);
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
            {refs.map((r) => {
              const target = nodes[r.target];
              const p = refPlaced[r.id];
              const look = LOOK[target.status];
              return (
                <g
                  key={r.id}
                  className="cursor-pointer outline-none animate-knit-in focus-visible:outline-2 focus-visible:outline-navy"
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelClose();
                    hoverOpened.current = null;
                    onSelect(r.target);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelect(r.target);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${target.word}へ移動（${STATUS_LABEL[target.status]}）`}
                >
                  <title>{`マップにある「${target.word}」へ移動`}</title>
                  <rect
                    x={p.x - p.w / 2}
                    y={p.y - p.h / 2}
                    width={p.w}
                    height={p.h}
                    rx={p.h / 2}
                    fill={look.fill}
                    fillOpacity={0.7}
                    stroke={look.stroke === "#a1a1aa" ? "#a1a1aa" : look.stroke}
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                  />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={look.text}
                    fontSize={11}
                    fontWeight={700}
                  >
                    {`${target.word} ↗`}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {selected && sp && (
          <div
            data-popup
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") cancelClose();
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") scheduleClose(selected.id);
            }}
            className="absolute z-10 cursor-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-lg"
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
            <div className="mt-3 grid grid-cols-2 gap-2">
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
            <div className="mt-2 flex justify-center gap-4 text-xs text-navy/60">
              <button className="underline" onClick={() => onSearch(selected.id)}>
                Webで調べる
              </button>
              {/* ドラッグできない人のための代わり */}
              <button className="underline" onClick={() => onAddToList(selected.id)}>
                次に勉強することに追加
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ドラッグ中に指についてくる見出し */}
      {ghost && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-navy bg-white px-3 py-1 text-sm font-bold text-navy shadow-lg"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {ghost.word}
        </div>
      )}
    </div>
  );
}
