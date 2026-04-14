async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("json")) return res.json();
  return res.text() as any;
}

// Auth
export const sendMagicLink = (email: string) =>
  request("/api/auth/send-magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const verifyToken = (token: string) =>
  request<{ userId: string }>(`/api/auth/verify?token=${token}`);

export const getMe = () =>
  request<{ userId: string }>("/api/auth/me");

// Projects
export const listProjects = () =>
  request<any[]>("/api/projects");

export const createProject = (name: string, clientName?: string) =>
  request<any>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, clientName }),
  });

export const getProject = (id: string) =>
  request<any>(`/api/projects/${id}`);

export const updateProject = (id: string, data: {
  name?: string;
  clientName?: string;
  blendedRate?: number;
  marginPercent?: number;
  weeklyCapacity?: number;
}) =>
  request<any>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// Inputs
export const addInput = (projectId: string, content: string, source?: string) =>
  request<any>(`/api/projects/${projectId}/inputs`, {
    method: "POST",
    body: JSON.stringify({ content, source }),
  });

export const listInputs = (projectId: string) =>
  request<any[]>(`/api/projects/${projectId}/inputs`);

// Scoping
export const startScoping = (projectId: string) =>
  request<any>(`/api/scoping/${projectId}/start`, { method: "POST" });

export const getScopeState = (scopeId: string) =>
  request<any>(`/api/scoping/${scopeId}/state`);

export const answerQuestion = (questionId: string, answer?: string, skipped?: boolean) =>
  request<any>(`/api/scoping/questions/${questionId}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer, skipped }),
  });

export const completeScope = (scopeId: string, answers: { questionId: string; answer: string }[]) =>
  request<{ ok: boolean }>(`/api/scoping/${scopeId}/complete`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });

export const updateScopeItem = (itemId: string, hours: { optimisticHours?: number; likelyHours?: number; pessimisticHours?: number }) =>
  request<any>(`/api/scoping/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(hours),
  });

export async function generateProposal(
  projectId: string,
  pricingMode: "per_phase" | "retainer" = "per_phase",
  retainerMonths?: number
): Promise<Blob> {
  const res = await fetch(`/api/proposals/${projectId}/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pricingMode, retainerMonths }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.blob();
}

// Export
export const exportMarkdown = (projectId: string) =>
  request<string>(`/api/export/${projectId}/markdown`);

export const exportQuestions = (projectId: string) =>
  request<string>(`/api/export/${projectId}/questions`);
