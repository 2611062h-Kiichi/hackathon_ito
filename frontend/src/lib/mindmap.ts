// ことばマップ：API呼び出し、○×の状態、見出しのつなぎ方、放射状に並べる計算
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 見出しの枝：before＝前提（その言葉の章より前の章）/ inside＝中身（その言葉の章の中）
export type Kind = "before" | "inside";
export const KIND_LABEL: Record<Kind, string> = { before: "前提", inside: "中身" };

// candidates は、前提の見出し（学ぶ順）→ 中身の見出し（学ぶ順）の順で並んでいる
export type Candidate = { word: string; kind: Kind; meaning: string };
export type Expansion = { word: string; meaning: string; candidates: Candidate[] };
export type ExpandTarget = { word: string; path: string[] };

export async function expandWords(targets: ExpandTarget[], existing: string[]): Promise<Expansion[]> {
  const res = await fetch(`${API_URL}/api/mindmap/expand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targets, existing: existing.slice(0, 300) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = typeof data?.detail === "string" ? data.detail : null;
    throw new Error(detail ?? `APIエラー (${res.status})`);
  }
  const data: { results: Expansion[] } = await res.json();
  return data.results;
}

// 重複判定用：全角・半角、大文字・小文字、空白の違いを無視する
export const normalize = (word: string) => word.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

// 「微分 導関数 とは」のように知りたい言葉を付けて検索する（言葉に含まれていれば付けない）
export function googleSearchUrl(root: string, word: string): string {
  const query = normalize(word).includes(normalize(root)) ? `${word} とは` : `${root} ${word} とは`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ---- マップの状態 ----

// none：まだ○×を付けていない / known：○ わかる / unknown：× わからない
export type Status = "none" | "known" | "unknown";

export type MapNode = {
  id: string;
  word: string;
  // 見出しなら「わかる＝何ができることか」、知りたい言葉ならその言葉の一言説明
  meaning: string;
  // どちらの枝の見出しか（知りたい言葉は null）
  kind: Kind | null;
  // 最初にこの見出しを出した親（経路のたどり方に使う）。知りたい言葉は null
  parentId: string | null;
  // この見出しより先に学ぶ見出し。ほかの枝で先に出ていた見出しは、新しく作らずにここでつなぐ
  children: string[];
  status: Status;
  // × で一度広げたか（同じ見出しを二度広げない）
  expanded: boolean;
  x: number;
  y: number;
};

// 知りたい言葉からこの言葉の親までの経路（その言葉自身は含まない）
export function pathTo(nodes: Record<string, MapNode>, id: string): string[] {
  const path: string[] = [];
  let cur = nodes[id]?.parentId ?? null;
  while (cur) {
    path.unshift(nodes[cur].word);
    cur = nodes[cur].parentId;
  }
  return path;
}

// from から子をたどって to に着けるか（つなぐと輪になってしまうかの判定）
function reaches(nodes: Record<string, MapNode>, from: string, to: string): boolean {
  const stack = [from];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...nodes[id].children);
  }
  return false;
}

const attach = (nodes: Record<string, MapNode>, parentId: string, childId: string): Record<string, MapNode> => ({
  ...nodes,
  [parentId]: { ...nodes[parentId], children: [...nodes[parentId].children, childId] },
});

/**
 * × を付けた見出しに、AI が返した見出しをつなぐ。
 * 前提・中身どちらの見出しも、× を付けた見出しの直下に並べる（同じ章の見出しどうしは兄弟）。
 *   官能基 ─ ヒドロキシ基      （中身）
 *   官能基 ─ カルボキシ基      （中身）
 * 目次の順番は「学ぶ順」であって「前の見出しがわからないと次がわからない」とは限らないので、
 * 見出しどうしを親子にはしない。見出しの前提は、その見出しに × を付けたときに改めて広げる。
 * すでにマップにある見出しが出てきたら、新しく作らずに点線でつなぐ。
 */
export function growTree(
  nodes: Record<string, MapNode>,
  parentId: string,
  candidates: Candidate[],
  newId: () => string,
): { nodes: Record<string, MapNode>; freshIds: string[]; linkedIds: string[] } {
  let next: Record<string, MapNode> = { ...nodes, [parentId]: { ...nodes[parentId], expanded: true } };
  const byWord = new Map(Object.values(nodes).map((n) => [normalize(n.word), n.id]));
  const freshIds: string[] = [];
  const linkedIds: string[] = [];
  const isRoot = nodes[parentId].parentId === null;
  for (const kind of ["before", "inside"] as const) {
    const fresh: Candidate[] = [];
    for (const c of candidates.filter((c) => c.kind === kind)) {
      const key = normalize(c.word);
      if (!key || fresh.some((f) => normalize(f.word) === key)) continue;
      const existing = byWord.get(key);
      if (!existing) {
        fresh.push(c);
        continue;
      }
      const ok = existing !== parentId && !next[parentId].children.includes(existing) && !reaches(next, existing, parentId);
      if (ok) {
        next = attach(next, parentId, existing);
        linkedIds.push(existing);
      }
    }
    // 知りたい言葉からは、前提を左・中身を右に。見出しからは、外向きに前提を左寄り・中身を右寄りに広げる
    const bias = (kind === "before" ? -1 : 1) * (isRoot ? Math.PI / 2 : 0.6);
    const positions = placeChildren(next, parentId, fresh.map((c) => c.word), bias);
    fresh.forEach((c, i) => {
      const id = newId();
      next = {
        ...next,
        [id]: { id, word: c.word, meaning: c.meaning, kind, parentId, children: [], status: "none", expanded: false, ...positions[i] },
      };
      next = attach(next, parentId, id);
      byWord.set(normalize(c.word), id);
      freshIds.push(id);
    });
  }
  return { nodes: next, freshIds, linkedIds };
}

/**
 * 次に勉強する見出し：× の見出しのうち、その先に学ぶ見出しがすべて ○ のもの。
 * 土台がそろっているので、今すぐ勉強を始められる。深い（基本に近い）ものから並べる。
 */
export function nextToStudy(nodes: Record<string, MapNode>, busy: Set<string>): MapNode[] {
  const depth = (n: MapNode) => pathTo(nodes, n.id).length;
  return Object.values(nodes)
    .filter((n) => n.status === "unknown" && n.expanded && !busy.has(n.id))
    .filter((n) => n.children.every((c) => nodes[c].status === "known"))
    .sort((a, b) => depth(b) - depth(a));
}

// ---- 配置の計算 ----
// 広げたときに、すでにある言葉は動かさず、新しい言葉を親の近くの空いている場所に置く。

export type Box = { x: number; y: number; w: number; h: number };

export const NODE_H = 36;
export const ROOT_H = 48;
const MARGIN = 12; // 言葉どうしのすき間
const DIST_STEP = 28; // 空きが見つからないときに、親から離す幅
const ANGLE_STEP = Math.PI / 18; // 10°ずつずらして空きを探す

// 文字数から見た目の幅を見積もる（全角13px・半角7.5px＋余白）
export function labelWidth(word: string, isRoot = false): number {
  let w = 0;
  for (const ch of word) w += ch.charCodeAt(0) < 0x2000 ? 7.5 : 13;
  return Math.round(w * (isRoot ? 1.25 : 1) + (isRoot ? 36 : 26));
}

export const boxOf = (n: MapNode): Box => {
  const isRoot = n.parentId === null;
  return { x: n.x, y: n.y, w: labelWidth(n.word, isRoot), h: isRoot ? ROOT_H : NODE_H };
};

// マップの線（親 → 先に学ぶ見出し）。ほかの枝からつないだ線も含む
export function edgesOf(nodes: Record<string, MapNode>): [MapNode, MapNode][] {
  return Object.values(nodes).flatMap((p) => p.children.map((c) => [p, nodes[c]] as [MapNode, MapNode]));
}

const overlaps = (a: Box, b: Box, m = MARGIN) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + m;

// 線分が箱の中を通るか（線の上に言葉が乗らないようにする）
function segmentHits(x1: number, y1: number, x2: number, y2: number, b: Box): boolean {
  const samples = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 10));
  for (let i = 1; i < samples; i++) {
    const t = i / samples;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (Math.abs(x - b.x) < b.w / 2 + 4 && Math.abs(y - b.y) < b.h / 2 + 4) return true;
  }
  return false;
}

// 向き a に対する、箱の中心から縁までの長さ
const extentAlong = (b: { w: number; h: number }, a: number) =>
  Math.min(
    Math.abs(Math.cos(a)) > 1e-6 ? b.w / 2 / Math.abs(Math.cos(a)) : Infinity,
    Math.abs(Math.sin(a)) > 1e-6 ? b.h / 2 / Math.abs(Math.sin(a)) : Infinity,
  );

/**
 * 親のまわりに、新しい言葉の位置を決める（重ならない・線が言葉の上を通らない場所）。
 * bias：外向きの向きから、どれだけ回した向きを優先するか（ラジアン）
 */
export function placeChildren(
  nodes: Record<string, MapNode>,
  parentId: string,
  words: string[],
  bias = 0,
): { x: number; y: number }[] {
  const parent = nodes[parentId];
  const parentBox = boxOf(parent);
  // 親の箱は同じオブジェクトを使う（線が親の箱を通るのは当たり前なので、判定から外すため）
  const boxes = [parentBox, ...Object.values(nodes).filter((n) => n.id !== parentId).map(boxOf)];
  const edges: [{ x: number; y: number }, { x: number; y: number }][] = edgesOf(nodes);

  const isRoot = parent.parentId === null;
  const grand = isRoot ? null : nodes[parent.parentId!];
  // 外向き（中心から親へ向かう向き）を基準に扇形に広げる。知りたい言葉は上を基準にする
  const outward = (grand ? Math.atan2(parent.y - grand.y, parent.x - grand.x) : -Math.PI / 2) + bias;
  const step = Math.PI / 6;

  const result: { x: number; y: number }[] = [];
  words.forEach((word, i) => {
    const size = { w: labelWidth(word), h: NODE_H };
    const preferred = outward + (i - (words.length - 1) / 2) * step;
    const fits = (x: number, y: number, strict: boolean) => {
      const box = { x, y, ...size };
      if (boxes.some((b) => overlaps(box, b))) return false;
      if (!strict) return true;
      // 新しい線が他の言葉の上を通らない
      if (boxes.some((b) => b !== parentBox && segmentHits(parent.x, parent.y, x, y, b))) return false;
      // 新しい言葉が既存の線の上に乗らない
      return !edges.some(([a, b]) => segmentHits(a.x, a.y, b.x, b.y, box));
    };
    // 親に近い場所から、希望の向きの左右へずらしながら空きを探す
    const search = (strict: boolean, maxSteps: number, maxTurn: number) => {
      for (let k = 0; k < maxSteps; k++) {
        for (let j = 0; j <= maxTurn; j++) {
          for (const sign of j === 0 ? [1] : [1, -1]) {
            const a = preferred + sign * j * ANGLE_STEP;
            const dist = extentAlong(parentBox, a) + extentAlong(size, a) + 40 + k * DIST_STEP;
            const x = parent.x + dist * Math.cos(a);
            const y = parent.y + dist * Math.sin(a);
            if (fits(x, y, strict)) return { x, y };
          }
        }
      }
      return null;
    };
    // まず線も重ならない場所を近くで探し、なければ言葉が重ならないことだけを守る
    const pos = search(true, 8, 12) ?? search(false, 40, 17) ?? { x: parent.x, y: parent.y + 2000 };
    result.push(pos);
    boxes.push({ ...pos, ...size });
    edges.push([parent, pos]);
  });
  return result;
}
