import { useCallback, useEffect, useRef, useState } from "react";
import { AuthPage } from "./components/AuthPage";
import { ConsultationPanel } from "./components/ConsultationPanel";
import { ContractAnalysisPanel } from "./components/ContractAnalysisPanel";
import { DocumentsTable } from "./components/DocumentsTable";
import { OnboardingModal, shouldShowOnboarding } from "./components/OnboardingModal";
import { UpgradePage } from "./components/UpgradePage";
import { UploadForm } from "./components/UploadForm";
import { useAuth } from "./contexts/AuthContext";
import { useTheme } from "./contexts/ThemeContext";
import { useToast } from "./contexts/ToastContext";
import {
  DocumentRecord,
  createCheckoutSession,
  createPortalSession,
  deleteDocument,
  ingestUrl,
  listDocuments,
  uploadDocument,
} from "./lib/api";

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <span className="navbar-logo">⚖</span>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (!user.has_access) return <UpgradePage onLogout={logout} />;

  return <Workspace user={user} onLogout={logout} />;
}

type WorkspaceProps = {
  user: {
    id: string;
    email: string;
    is_on_trial: boolean;
    trial_days_remaining: number | null;
  };
  onLogout: () => void;
};

function Workspace({ user, onLogout }: WorkspaceProps) {
  const toast = useToast();
  const { theme, toggle: toggleTheme } = useTheme();
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents.");
    }
  }, [toast]);

  // Initial load
  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  // Auto-poll while any document is still processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing");

    if (hasProcessing && !pollRef.current) {
      pollRef.current = setInterval(() => {
        void refreshDocuments();
      }, 3000);
    }

    if (!hasProcessing && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, refreshDocuments]);

  async function handleUpload(formData: FormData) {
    await uploadDocument(formData);
    await refreshDocuments();
  }

  async function handleUrlIngest(payload: {
    url: string;
    title?: string;
    metadata_json?: Record<string, unknown>;
  }) {
    await ingestUrl(payload);
    await refreshDocuments();
  }

  async function handleDelete(id: string) {
    await deleteDocument(id);
    setSelectedDocumentIds((cur) => cur.filter((i) => i !== id));
    await refreshDocuments();
  }

  function toggleDocument(id: string) {
    setSelectedDocumentIds((cur) =>
      cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id],
    );
  }

  function handleSelectAll() {
    const readyIds = documents.filter((d) => d.status === "ready").map((d) => d.id);
    setSelectedDocumentIds(readyIds);
  }

  function handleClearSelection() {
    setSelectedDocumentIds([]);
  }

  const processingCount = documents.filter((d) => d.status === "processing").length;
  const [mainTab, setMainTab] = useState<"chat" | "analysis">("chat");

  // Build title lookup for the analysis panel
  const documentTitles: Record<string, string> = {};
  for (const doc of documents) documentTitles[doc.id] = doc.title;

  return (
    <div className="app-shell">
      {/* Trial banner */}
      {user.is_on_trial && (
        <div className="trial-banner">
          <span>
            Free trial — <strong>{user.trial_days_remaining ?? 0} day{user.trial_days_remaining !== 1 ? "s" : ""} remaining</strong>.
            Subscribe to keep access after your trial ends.
          </span>
          <button
            type="button"
            className="trial-cta"
            onClick={async () => {
              try {
                const { checkout_url } = await createCheckoutSession("month");
                window.location.href = checkout_url;
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to start checkout.");
              }
            }}
          >
            Subscribe →
          </button>
        </div>
      )}

      <nav className="navbar">
        <div className="navbar-left">
          {/* Sidebar toggle */}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <div className="navbar-brand">
            <span className="navbar-logo">⚖</span>
            <span className="navbar-name">LexiCounsel</span>
          </div>
          <span className="navbar-tagline">AI-powered legal research assistant</span>
        </div>

        <div className="navbar-user">
          <span className="navbar-email">{user.email}</span>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={async () => {
              try {
                const { portal_url } = await createPortalSession();
                window.location.href = portal_url;
              } catch { /* ignore */ }
            }}
          >
            Billing
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀" : "◑"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </nav>

      <div className={`workspace${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <section className="panel">
              <div className="step-heading">
                <span className="step-badge">1</span>
                <div>
                  <h2>Add Documents</h2>
                  <p className="step-desc">Upload PDF/HTML files or paste a URL to legal materials</p>
                </div>
              </div>
              <UploadForm onUpload={handleUpload} onUrlIngest={handleUrlIngest} />
            </section>

            <section className="panel">
              <div className="step-heading">
                <span className="step-badge">2</span>
                <div>
                  <h2>
                    Select Documents
                    {documents.filter((d) => d.status === "ready").length > 0 && (
                      <span className="doc-count-badge">
                        {documents.filter((d) => d.status === "ready").length}
                      </span>
                    )}
                  </h2>
                  <p className="step-desc">
                    {processingCount > 0 && (
                      <span className="processing-notice">
                        ⟳ {processingCount} document{processingCount > 1 ? "s" : ""} processing…
                      </span>
                    )}
                    {selectedDocumentIds.length > 0
                      ? <strong>{selectedDocumentIds.length} selected</strong>
                      : "Leave all unchecked to search everything."}
                  </p>
                </div>
              </div>
              <DocumentsTable
                documents={documents}
                selectedDocumentIds={selectedDocumentIds}
                onToggle={toggleDocument}
                onSelectAll={handleSelectAll}
                onClearSelection={handleClearSelection}
                onDelete={handleDelete}
                onRefresh={refreshDocuments}
              />
            </section>
          </aside>
        )}

        <main className="main-panel">
          <section className="panel consultation-panel">
            <div className="main-tabs">
              <button
                type="button"
                className={`main-tab${mainTab === "chat" ? " active" : ""}`}
                onClick={() => setMainTab("chat")}
              >
                💬 Ask
              </button>
              <button
                type="button"
                className={`main-tab${mainTab === "analysis" ? " active" : ""}`}
                onClick={() => setMainTab("analysis")}
              >
                🔍 Analyse
              </button>
            </div>

            {mainTab === "chat" ? (
              <>
                <div className="step-heading">
                  <span className="step-badge">{sidebarOpen ? "3" : "1"}</span>
                  <div>
                    <h2>Ask a Legal Question</h2>
                    <p className="step-desc">
                      {selectedDocumentIds.length > 0
                        ? `Searching ${selectedDocumentIds.length} selected document${selectedDocumentIds.length > 1 ? "s" : ""}.`
                        : documents.length > 0
                        ? `Searching all ${documents.length} document${documents.length > 1 ? "s" : ""}. Or ask any general legal question.`
                        : "Ask any legal question. Upload documents for source-cited answers."}
                    </p>
                  </div>
                </div>
                <ConsultationPanel
                  selectedDocumentIds={selectedDocumentIds}
                  hasDocuments={documents.length > 0}
                />
              </>
            ) : (
              <>
                <div className="step-heading">
                  <span className="step-badge">{sidebarOpen ? "3" : "1"}</span>
                  <div>
                    <h2>Contract Intelligence</h2>
                    <p className="step-desc">
                      Analyse a contract for risk and missing clauses, or compare multiple contracts side-by-side.
                    </p>
                  </div>
                </div>
                <ContractAnalysisPanel
                  selectedDocumentIds={selectedDocumentIds}
                  documentTitles={documentTitles}
                />
              </>
            )}
          </section>
        </main>
      </div>

      {showOnboarding && (
        <OnboardingModal onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}
