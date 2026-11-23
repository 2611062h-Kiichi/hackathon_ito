const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Pattern = "decision" | "knowledge" | "psychological";

export type PromptBase = {
  topic: string;
  pattern: Pattern;
  goal: string;
  level: string;
};

export type ClassifyResponse = {
  pattern: Pattern;
  label: string;
  scores: Record<Pattern, number>;
  base: PromptBase;
};

export type ExplainResponse = {
  attempt: number;
  remaining: number;
  explanation: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail ?? `APIエラー (${res.status})`);
  }
  return res.json();
}

export const classify = (topic: string, answers: number[]) =>
  post<ClassifyResponse>("/api/classify", { topic, answers });

export const explain = (base: PromptBase, attempt: number) =>
  post<ExplainResponse>("/api/explain", { base, attempt });
