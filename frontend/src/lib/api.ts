export type DocumentRecord = {
  id: string;
  title: string;
  source_type: string;
  source_uri: string | null;
  mime_type: string | null;
  status: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export type ConsultationResponse = {
  intent: string;
  answer: string;
  attempts: number;
  evaluation: {
    citation_accuracy: number;
    legal_relevance: number;
    hallucination_risk: number;
    issues: string[];
    refinement_prompt?: string | null;
  };
  retrievals: Array<{
    chunk_id: string;
    document_id: string;
    document_title: string;
    chunk_index: number;
    score: number;
    content: string;
    page_number?: number | null;
    source_uri?: string | null;
  }>;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const TOKEN_KEY = "lc_token";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (response.status === 401) {
    // Token expired or invalid — clear it so the app falls back to the auth page
    localStorage.removeItem(TOKEN_KEY);
    window.location.reload();
    throw new Error("Session expired. Please sign in again.");
  }

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      detail = (JSON.parse(body) as { detail?: string }).detail ?? body;
    } catch {
      // plain text error
    }
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

export function listDocuments(): Promise<DocumentRecord[]> {
  return request<DocumentRecord[]>("/documents");
}

export function uploadDocument(formData: FormData): Promise<DocumentRecord> {
  return request<DocumentRecord>("/documents/upload", {
    method: "POST",
    body: formData,
  });
}

export function ingestUrl(payload: { url: string; title?: string; metadata_json?: Record<string, unknown> }) {
  return request<DocumentRecord>("/documents/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type StreamEvent =
  | { type: "intent"; intent: string }
  | { type: "token"; content: string }
  | { type: "evaluating" }
  | { type: "done"; intent: string; answer: string; retrievals: ConsultationResponse["retrievals"]; evaluation: ConsultationResponse["evaluation"]; attempts: number }
  | { type: "error"; detail: string };

export async function* consultStream(payload: {
  query: string;
  document_ids: string[];
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  top_k?: number;
}): AsyncGenerator<StreamEvent> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/consultation/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          yield JSON.parse(line.slice(6)) as StreamEvent;
        } catch {
          // malformed event — skip
        }
      }
    }
  }
}

export function createCheckoutSession(interval: "month" | "year" = "month"): Promise<{ checkout_url: string }> {
  return request<{ checkout_url: string }>("/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval }),
  });
}

export function createPortalSession(): Promise<{ portal_url: string }> {
  return request<{ portal_url: string }>("/billing/portal", { method: "POST" });
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: "DELETE" });
}

export type PlanInfo = { amount_cents: number; currency: string; interval: string };
export type PlansResponse = { monthly: PlanInfo; annual: PlanInfo | null };

export function fetchPlans(): Promise<PlansResponse> {
  return request<PlansResponse>("/billing/plans");
}

export function retryDocument(id: string): Promise<DocumentRecord> {
  return request<DocumentRecord>(`/documents/${id}/retry`, { method: "POST" });
}

export function forgotPassword(email: string): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
}

export function consult(payload: {
  query: string;
  document_ids: string[];
  history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  top_k?: number;
}) {
  return request<ConsultationResponse>("/consultation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── Contract Intelligence ──────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "unknown";

export type ClauseDetail = {
  present: boolean;
  risk_level: RiskLevel;
  summary: string;
  concern: string | null;
  quote: string | null;
};

export type ContractClauses = {
  liability_cap?: ClauseDetail | null;
  termination?: ClauseDetail | null;
  ip_ownership?: ClauseDetail | null;
  confidentiality?: ClauseDetail | null;
  dispute_resolution?: ClauseDetail | null;
  force_majeure?: ClauseDetail | null;
  indemnification?: ClauseDetail | null;
  governing_law?: ClauseDetail | null;
  payment_terms?: ClauseDetail | null;
  warranties?: ClauseDetail | null;
};

export type ContractReport = {
  document_id: string;
  document_title: string;
  contract_type: string;
  parties: string[];
  effective_date: string | null;
  overall_risk: RiskLevel;
  clauses: ContractClauses;
  missing_standard_clauses: string[];
  red_flags: string[];
  executive_summary: string;
};

export type ComparisonCell = {
  summary: string;
  risk_level: RiskLevel | "absent";
};

export type ComparisonRow = {
  clause_key: string;
  clause_label: string;
  cells: Record<string, ComparisonCell>;
};

export type ComparisonReport = {
  document_titles: Record<string, string>;
  overall_risks: Record<string, RiskLevel>;
  rows: ComparisonRow[];
};

export function getContractReport(documentId: string): Promise<ContractReport> {
  return request<ContractReport>(`/analysis/report/${documentId}`, { method: "POST" });
}

export function compareContracts(documentIds: string[]): Promise<ComparisonReport> {
  return request<ComparisonReport>("/analysis/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });
}
