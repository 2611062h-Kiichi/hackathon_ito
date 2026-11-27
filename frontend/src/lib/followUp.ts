import type { Pattern } from "./api";

// 分類後に表示する深掘り入力欄。key はバックエンドの DETAIL_LABELS と共通
export type DetailKey = "scope" | "situation" | "opinion" | "cause";

// 記録の詳細ページで表示する名前
export const DETAIL_LABELS: Record<string, string> = {
  scope: "深掘りしたい範囲",
  situation: "今の状況",
  opinion: "自分の考え・意見",
  cause: "不安の原因",
};

export type FollowUpField = {
  key: DetailKey;
  label: string;
  placeholder: string;
};

export const FOLLOW_UP: Record<Pattern, { lead: string; fields: FollowUpField[] }> = {
  knowledge: {
    lead: "どのあたりを詳しく知りたいですか？範囲をしぼると、説明がもっとわかりやすくなります。",
    fields: [
      {
        key: "scope",
        label: "深掘りしたい範囲",
        placeholder: "例：ブランチの使い方、コミットとプッシュの違い",
      },
    ],
  },
  decision: {
    lead: "いまの状況と、あなた自身の考えを教えてください。選択肢の整理に使います。",
    fields: [
      {
        key: "situation",
        label: "今の状況",
        placeholder: "例：就職と大学院進学のどちらにするか迷っている",
      },
      {
        key: "opinion",
        label: "あなたの考え・意見",
        placeholder: "例：研究は好きだけど、早く働きたい気持ちもある",
      },
    ],
  },
  psychological: {
    lead: "どんな状況で、何が不安なのかを教えてください。気持ちの整理に使います。",
    fields: [
      {
        key: "situation",
        label: "今の状況",
        placeholder: "例：来週プログラミングの課題を発表する",
      },
      {
        key: "cause",
        label: "不安の原因（思い当たること）",
        placeholder: "例：前に発表で質問に答えられなかった",
      },
    ],
  },
};
