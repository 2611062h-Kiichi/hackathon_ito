// ことばマップの配置を、斥力（見出しどうしが押し合う）とばね（線でつながった見出しを適度な距離に保つ）で整える。
// 1回の step で少しずつ動かし、画面では毎フレーム呼んで、なめらかに落ち着かせる。

export type Body = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  fixed: boolean; // 知りたい言葉は動かさない
};

export type Link = [string, string];

const MARGIN = 14; // 見出しどうしのすき間
const REPULSION = 6000; // 離れた見出しどうしの押し合う強さ
const REPULSION_RANGE = 360; // これより遠い見出しどうしは押し合わない
const SPRING = 0.04; // 線の長さを保つ強さ
const EDGE_CLEARANCE = 12; // 線と、関係ない見出しのすき間
const DAMPING = 0.55; // 動きの減り方（小さいほどすぐ止まる）
const MAX_SPEED = 30;

// 線でつながった見出しのちょうどいい距離（見出しの幅に合わせる）
const restLength = (a: Body, b: Body) => (a.w + b.w) / 4 + 70;

/**
 * 1回分だけ動かす。alpha（1 → 0）が小さいほど動きを弱くして、だんだん落ち着かせる。
 * 戻り値：いちばん大きく動いた量（px）。小さくなったら止めてよい。
 */
export function step(bodies: Map<string, Body>, links: Link[], alpha: number): number {
  const ids = [...bodies.keys()];
  const fx = new Map<string, number>(ids.map((id) => [id, 0]));
  const fy = new Map<string, number>(ids.map((id) => [id, 0]));
  const push = (id: string, x: number, y: number) => {
    fx.set(id, fx.get(id)! + x);
    fy.set(id, fy.get(id)! + y);
  };

  // 見出しどうし：重なっていたら強く押し返し、近ければ弱く押し合う
  for (let i = 0; i < ids.length; i++) {
    const a = bodies.get(ids[i])!;
    for (let j = i + 1; j < ids.length; j++) {
      const b = bodies.get(ids[j])!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
      }
      const ox = (a.w + b.w) / 2 + MARGIN - Math.abs(dx);
      const oy = (a.h + b.h) / 2 + MARGIN - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        // 重なり：めり込みの少ない向きに押し出す
        if (ox < oy) {
          const s = Math.sign(dx) * ox * 0.5;
          push(ids[i], -s, 0);
          push(ids[j], s, 0);
        } else {
          const s = Math.sign(dy) * oy * 0.5;
          push(ids[i], 0, -s);
          push(ids[j], 0, s);
        }
        continue;
      }
      const d = Math.hypot(dx, dy);
      if (d > REPULSION_RANGE) continue;
      const f = (REPULSION / (d * d)) * alpha;
      push(ids[i], (-dx / d) * f, (-dy / d) * f);
      push(ids[j], (dx / d) * f, (dy / d) * f);
    }
  }

  // 線（ばね）：つながった見出しを、ちょうどいい距離に近づける
  for (const [ia, ib] of links) {
    const a = bodies.get(ia);
    const b = bodies.get(ib);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = (d - restLength(a, b)) * SPRING * alpha;
    push(ia, (dx / d) * f, (dy / d) * f);
    push(ib, (-dx / d) * f, (-dy / d) * f);
  }

  // 線と見出し：関係ない線の上（近く）にある見出しを、線から離す
  for (const [ia, ib] of links) {
    const a = bodies.get(ia);
    const b = bodies.get(ib);
    if (!a || !b) continue;
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const len2 = sx * sx + sy * sy || 1;
    for (const id of ids) {
      if (id === ia || id === ib) continue;
      const n = bodies.get(id)!;
      const t = Math.max(0, Math.min(1, ((n.x - a.x) * sx + (n.y - a.y) * sy) / len2));
      const px = a.x + sx * t;
      const py = a.y + sy * t;
      let dx = n.x - px;
      let dy = n.y - py;
      if (Math.hypot(dx, dy) < 0.5) {
        // 線のちょうど上にいるときは、線に垂直な向きへどかす
        const sl = Math.sqrt(len2);
        dx = (-sy / sl) * 0.5;
        dy = (sx / sl) * 0.5;
      }
      // 見出しの箱が線に触れているか（線へ向かう向きでの、箱の中心から縁までの長さと比べる）
      const d = Math.hypot(dx, dy);
      const ux = Math.abs(dx / d);
      const uy = Math.abs(dy / d);
      const extent = Math.min(ux > 1e-6 ? n.w / 2 / ux : Infinity, uy > 1e-6 ? n.h / 2 / uy : Infinity);
      const need = extent + EDGE_CLEARANCE;
      if (d >= need) continue;
      const s = (need - d) * 0.35;
      push(id, (dx / d) * s, (dy / d) * s);
      push(ia, (-dx / d) * s * 0.25, (-dy / d) * s * 0.25);
      push(ib, (-dx / d) * s * 0.25, (-dy / d) * s * 0.25);
    }
  }

  let moved = 0;
  for (const id of ids) {
    const b = bodies.get(id)!;
    if (b.fixed) {
      b.vx = b.vy = 0;
      continue;
    }
    b.vx = (b.vx + fx.get(id)!) * DAMPING;
    b.vy = (b.vy + fy.get(id)!) * DAMPING;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx = (b.vx / speed) * MAX_SPEED;
      b.vy = (b.vy / speed) * MAX_SPEED;
    }
    b.x += b.vx;
    b.y += b.vy;
    moved = Math.max(moved, Math.hypot(b.vx, b.vy));
  }
  return moved;
}

// 落ち着くまで一気に動かす（動きを減らす設定のときや、試算用）
export function settle(bodies: Map<string, Body>, links: Link[], maxSteps = 400): void {
  let alpha = 1;
  for (let i = 0; i < maxSteps; i++) {
    const moved = step(bodies, links, alpha);
    alpha = Math.max(alpha * 0.985, 0.05);
    if (alpha <= 0.05 && moved < 0.05) break;
  }
}
