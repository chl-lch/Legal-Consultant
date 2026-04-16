import { useEffect, useState } from "react";
import { ConsultationPanel } from "./components/ConsultationPanel";
import { DocumentsTable } from "./components/DocumentsTable";
import { UploadForm } from "./components/UploadForm";
import {
  ConsultationResponse,
  DocumentRecord,
  consult,
  ingestUrl,
  listDocuments,
  uploadDocument,
} from "./lib/api";

export default function App() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refreshDocuments() {
    try {
      setError(null);
      setDocuments(await listDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents.");
    }
  }

  useEffect(() => {
    void refreshDocuments();
  }, []);

  async function handleUpload(formData: FormData) {
    await uploadDocument(formData);
    await refreshDocuments();
  }

  async function handleUrlIngest(payload: { url: string; title?: string; metadata_json?: Record<string, unknown> }) {
    await ingestUrl(payload);
    await refreshDocuments();
  }

  async function handleConsult(payload: {
    query: string;
    document_ids: string[];
    history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    top_k: number;
  }): Promise<ConsultationResponse> {
    return consult(payload);
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">LexiCounsel</p>
          <h1>Production legal consultation operations console</h1>
          <p className="hero-copy">
            Hybrid retrieval, intent-routed LangChain agents, and answer self-evaluation for statute
            lookup, clause extraction, document summarization, and risk assessment.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <span>Chunking default</span>
            <strong>800 / 150</strong>
          </div>
          <div>
            <span>Retrieval</span>
            <strong>FAISS + BM25</strong>
          </div>
          <div>
            <span>Evaluation</span>
            <strong>3-score gating</strong>
          </div>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="dashboard-grid">
        <UploadForm onUpload={handleUpload} onUrlIngest={handleUrlIngest} />
        <ConsultationPanel selectedDocumentIds={selectedDocumentIds} onSubmit={handleConsult} />
      </section>

      <DocumentsTable
        documents={documents}
        selectedDocumentIds={selectedDocumentIds}
        onToggle={toggleDocument}
      />
    </main>
  );
}
