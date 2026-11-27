import { getUserId } from "./userId";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Pattern = "decision" | "knowledge" | "psychological";

export type PromptBase = {
  topic: string;
  pattern: Pattern;
  goal: string;
  level: string;
};

export type SessionCreated = {
  session_id: string;
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

// 一覧で返る項目
export type SessionSummary = {
  id: string;
  topic: string;
  pattern: Pattern;
  understanding: number | null;
  status: "in_progress" | "completed";
  title: string | null;
  genre: string | null;
  summary: string | null;
  next_step: string | null;
  created_at: string;
  completed_at: string | null;
};

// 詳細で返る項目
export type SessionDetail = SessionSummary & {
  details: Record<string, string>;
  key_points: string[] | null;
  unclear: string | null;
  explanations: { attempt: number; content: string; created_at: string }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const detail = typeof data?.detail === "string" ? data.detail : null;
    throw new Error(detail ?? `APIエラー (${res.status})`);
  }
  return res.json();
}

const post = <T>(path: string, body: Record<string, unknown>) =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify({ user_id: getUserId(), ...body }),
  });

const get = <T>(path: string, params: Record<string, string> = {}) =>
  request<T>(`${path}?${new URLSearchParams({ user_id: getUserId(), ...params })}`);

export const createSession = (topic: string, answers: number[]) =>
  post<SessionCreated>("/api/sessions", { topic, answers });

export const explainSession = (sessionId: string, details: Record<string, string> = {}) =>
  post<ExplainResponse>(`/api/sessions/${sessionId}/explain`, { details });

export const completeSession = (sessionId: string, understanding: number) =>
  post<SessionDetail>(`/api/sessions/${sessionId}/complete`, { understanding });

export const listSessions = () => get<SessionSummary[]>("/api/sessions");

export const getSession = (sessionId: string) =>
  get<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`);
