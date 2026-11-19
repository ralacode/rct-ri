// 質問・要望（看護師・職員が投稿し、指定された職員が回答する）の API。

export type FeedbackKind = "question" | "request" | "other";

export type FeedbackItem = {
  id: number;
  kind: FeedbackKind;
  body: string;
  submitterRole: "nurse" | "staff";
  submitterName: string;
  department: string;
  answer: string;
  answeredBy: string;
  answeredAt: string | null;
  createdAt: string;
};

export type NewFeedback = {
  kind: FeedbackKind;
  body: string;
  submitterName: string;
  department: string;
};

export const FEEDBACK_KINDS: readonly { value: FeedbackKind; label: string }[] =
  [
    { value: "question", label: "わからないこと" },
    { value: "request", label: "こういうことがしたい" },
    { value: "other", label: "その他" },
  ];

export function feedbackKindLabel(kind: FeedbackKind) {
  return FEEDBACK_KINDS.find((item) => item.value === kind)?.label ?? kind;
}

export const FEEDBACK_BODY_MAX = 2000;
export const FEEDBACK_ANSWER_MAX = 4000;
export const FEEDBACK_SHORT_MAX = 50;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function listFeedback() {
  return request<FeedbackItem[]>("/feedback");
}

export function createFeedback(input: NewFeedback) {
  return request<FeedbackItem>("/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function answerFeedback(id: number, answer: string) {
  return request<FeedbackItem>(`/feedback/${id}/answer`, {
    method: "PUT",
    body: JSON.stringify({ answer }),
  });
}
