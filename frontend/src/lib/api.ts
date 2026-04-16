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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }
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

