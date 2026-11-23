// 8問アンケート（Q1〜3: 判断 / Q4〜6: 情報不足 / Q7〜8: 心理的ブレーキ）
export const QUESTIONS = [
  "選択肢がいくつかあって、どれを選べばいいか決められない",
  "調べた情報はあるが、何を優先すべきか整理できていない",
  "判断の基準（何を大事にするか）がはっきりしない",
  "出てくる用語の意味がよくわからない",
  "そもそも全体の仕組みや流れがわからない",
  "何を調べればいいのかもわからない",
  "失敗したらどうしようと不安になる",
  "自分にはできないのではと感じる",
] as const;

export const CHOICES = [
  { label: "かなり当てはまる", value: 3 },
  { label: "少し当てはまる", value: 2 },
  { label: "あまり当てはまらない", value: 1 },
  { label: "当てはまらない", value: 0 },
] as const;

export const UNDERSTANDING_LEVELS = [
  { value: 1, label: "全くわからない" },
  { value: 2, label: "少しわかる" },
  { value: 3, label: "半分程度理解" },
  { value: 4, label: "ほぼ理解" },
  { value: 5, label: "説明できる" },
] as const;
