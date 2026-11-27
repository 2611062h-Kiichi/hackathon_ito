import type { Pattern } from "./api";

export const PATTERN_LABELS: Record<Pattern, string> = {
  decision: "判断の整理",
  knowledge: "情報不足",
  psychological: "心理的ブレーキ",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
