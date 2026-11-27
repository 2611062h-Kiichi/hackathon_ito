// 編み物の演出（#6）
// 記録ごとに編み物を1つ割り当て、理解が進むと編み上がっていく。
// 画像は public/knit/{item}-{stage}.png（元画像: docs/images/knitting.png）

export const KNIT_ITEMS = [
  { id: "scarf", name: "マフラー" },
  { id: "hat", name: "ニット帽" },
  { id: "sweater", name: "セーター" },
  { id: "socks", name: "くつした" },
] as const;

export type KnitItem = (typeof KNIT_ITEMS)[number];

// 1 = 編み始め / 2 = 編みかけ / 3 = 完成
export type KnitStage = 1 | 2 | 3;

/** 記録IDから編み物を決める（ランダムに見えて、同じ記録なら毎回同じものになる） */
export function knitItemFor(sessionId: string): KnitItem {
  let hash = 0;
  for (const ch of sessionId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return KNIT_ITEMS[hash % KNIT_ITEMS.length];
}

/** 理解度が4以上で完成。それ以外は編みかけ（解説を受ける前は編み始め） */
export function knitStage(opts: {
  status: "in_progress" | "completed";
  understanding: number | null;
  explained: boolean;
}): KnitStage {
  if (opts.status === "completed") {
    return opts.understanding !== null && opts.understanding >= 4 ? 3 : 2;
  }
  return opts.explained ? 2 : 1;
}

export function knitImage(item: KnitItem, stage: KnitStage): string {
  return `/knit/${item.id}-${stage}.png`;
}

export function knitCaption(item: KnitItem, stage: KnitStage): string {
  if (stage === 3) return `${item.name}が完成しました！`;
  if (stage === 2) return `${item.name}を編んでいます…`;
  return `${item.name}を編みはじめました`;
}
