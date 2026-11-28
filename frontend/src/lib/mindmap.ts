// ことばマップ：API呼び出しと、放射状に並べる計算
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// 1回に表示する言葉の数（AIは7個返すので、重複を除いてこの数だけ使う）
export const SHOW_COUNT = 5;

// 候補の言葉が、元の言葉を理解するうえでどんな役割か
export type Role = "前提" | "しくみ" | "違い" | "つまずき" | "場面";
export const ROLE_HINT: Record<Role, string> = {
  前提: "先に知っておくと話が通じる言葉",
  しくみ: "中で何が起きているかを作っている言葉",
  違い: "比べるとわかる言葉",
  つまずき: "初めての人がつまずきやすい言葉",
  場面: "実際に使われる場面の言葉",
};

export type Candidate = { word: string; role: Role; meaning: string };
export type Expansion = { word: string; meaning: string; candidates: Candidate[] };
export type ExpandTarget = { word: string; path: string[] };

export async function expandWords(targets: ExpandTarget[], exclude: string[]): Promise<Expansion[]> {
  const res = await fetch(`${API_URL}/api/mindmap/expand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targets, exclude: exclude.slice(0, 300) }),
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

// すでにマップにある言葉を除いて、表示する分だけ選ぶ
export function pickNew(candidates: Candidate[], existing: Iterable<string>, count = SHOW_COUNT): Candidate[] {
  const seen = new Set(Array.from(existing, normalize));
  const picked: Candidate[] = [];
  for (const c of candidates) {
    const key = normalize(c.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    picked.push(c);
    if (picked.length === count) break;
  }
  return picked;
}

// 「NISA 手数料 とは」のように中心の言葉を付けて検索する（言葉に中心の言葉が含まれていれば付けない）
export function googleSearchUrl(root: string, word: string): string {
  const query = normalize(word).includes(normalize(root)) ? `${word} とは` : `${root} ${word} とは`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// ---- 配置の計算 ----
// 広げたときに、すでにある言葉は動かさず、新しい言葉を親の近くの空いている場所に置く。

export type MapNode = {
  id: string;
  word: string;
  meaning: string;
  role: Role | null; // 中心の言葉は null
  parentId: string | null;
  children: string[];
  expanded: boolean;
  x: number;
  y: number;
};

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

/** 親のまわりに、新しい言葉の位置を決める（重ならない・線が言葉の上を通らない場所）。 */
export function placeChildren(nodes: Record<string, MapNode>, parentId: string, words: string[]): { x: number; y: number }[] {
  const parent = nodes[parentId];
  const parentBox = boxOf(parent);
  // 親の箱は同じオブジェクトを使う（線が親の箱を通るのは当たり前なので、判定から外すため）
  const boxes = [parentBox, ...Object.values(nodes).filter((n) => n.id !== parentId).map(boxOf)];
  const edges = Object.values(nodes)
    .filter((n) => n.parentId)
    .map((n) => [nodes[n.parentId!], n] as const);

  const isRoot = parent.parentId === null;
  const grand = isRoot ? null : nodes[parent.parentId!];
  // 外向き（中心から親へ向かう向き）を基準に扇形に広げる。中心の言葉はぐるっと一周
  const outward = grand ? Math.atan2(parent.y - grand.y, parent.x - grand.x) : -Math.PI / 2;
  const step = isRoot ? (2 * Math.PI) / words.length : Math.PI / 6;

  const result: { x: number; y: number }[] = [];
  words.forEach((word, i) => {
    const size = { w: labelWidth(word), h: NODE_H };
    const preferred = isRoot ? outward + i * step : outward + (i - (words.length - 1) / 2) * step;
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
    const box = { ...pos, ...size };
    boxes.push(box);
    edges.push([parent, { ...parent, ...pos, parentId: parentId }]);
  });
  return result;
}

// 中心から言葉までの経路（中心を含み、その言葉自身は含まない）
export function pathTo(nodes: Record<string, MapNode>, id: string): string[] {
  const path: string[] = [];
  let cur = nodes[id]?.parentId ?? null;
  while (cur) {
    path.unshift(nodes[cur].word);
    cur = nodes[cur].parentId;
  }
  return path;
}
