import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { DocumentRecord, retryDocument } from "../lib/api";

type Props = {
  documents: DocumentRecord[];
  selectedDocumentIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: () => void;
};

export function DocumentsTable({
  documents,
  selectedDocumentIds,
  onToggle,
  onSelectAll,
  onClearSelection,
  onDelete,
  onRefresh,
}: Props) {
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const readyDocs = documents.filter((d) => d.status === "ready");
  const processingDocs = documents.filter((d) => d.status === "processing");
  const failedDocs = documents.filter((d) => d.status === "failed");

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
      toast.success("Document deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRetry(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setRetryingId(id);
    try {
      await retryDocument(id);
      toast.info("Re-processing started.");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="empty-state-box">
        <span className="empty-icon">📄</span>
        <p>No documents yet.</p>
        <p className="muted">Upload a file or add a URL above to get started.</p>
      </div>
    );
  }

  return (
    <div className="table-shell">
      {/* Selection toolbar */}
      <div className="table-toolbar">
        <span className="table-count">
          {readyDocs.length} ready
          {processingDocs.length > 0 && (
            <span className="processing-inline"> · {processingDocs.length} processing</span>
          )}
          {failedDocs.length > 0 && (
            <span className="failed-inline"> · {failedDocs.length} failed</span>
          )}
        </span>
        <div className="table-actions">
          {selectedDocumentIds.length > 0 ? (
            <button type="button" className="toolbar-btn" onClick={onClearSelection}>
              Clear selection
            </button>
          ) : (
            readyDocs.length > 0 && (
              <button type="button" className="toolbar-btn" onClick={onSelectAll}>
                Select all ready
              </button>
            )
          )}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th scope="col" style={{ width: "2.5rem" }}></th>
            <th scope="col">Document</th>
            <th scope="col">Source</th>
            <th scope="col">Status</th>
            <th scope="col">Added</th>
            <th scope="col" style={{ width: "4rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const isReady = doc.status === "ready";
            const isFailed = doc.status === "failed";
            const selected = selectedDocumentIds.includes(doc.id);
            const isDeleting = deletingId === doc.id;
            const isRetrying = retryingId === doc.id;

            return (
              <tr
                key={doc.id}
                className={[
                  selected ? "row-selected" : "",
                  !isReady ? "row-disabled" : "",
                ].join(" ")}
                onClick={() => isReady && onToggle(doc.id)}
                style={{
                  cursor: isReady ? "pointer" : "default",
                  opacity: isDeleting ? 0.4 : 1,
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!isReady}
                    onChange={() => isReady && onToggle(doc.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <strong className="truncate" style={{ display: "block", maxWidth: "18ch" }}>
                    {doc.title}
                  </strong>
                  {doc.source_uri ? (
                    <div className="muted truncate">{doc.source_uri}</div>
                  ) : null}
                </td>
                <td>
                  <span className="source-chip">
                    {doc.source_type === "upload" ? "File" : "URL"}
                  </span>
                </td>
                <td>
                  <span className={`status-chip ${doc.status}`}>{statusLabel(doc.status)}</span>
                </td>
                <td className="muted">{new Date(doc.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="row-actions">
                    {isFailed && (
                      <button
                        type="button"
                        className="retry-btn"
                        disabled={isRetrying}
                        onClick={(e) => handleRetry(e, doc.id)}
                        title="Retry processing"
                      >
                        {isRetrying ? "…" : "↻"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="delete-btn"
                      disabled={isDeleting}
                      onClick={(e) => handleDelete(e, doc.id)}
                      title="Delete document"
                    >
                      {isDeleting ? "…" : "✕"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selectedDocumentIds.length === 0 && readyDocs.length > 0 && (
        <p className="table-hint">
          No documents selected — searching all {readyDocs.length} ready document{readyDocs.length > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "processing") return "Processing…";
  if (status === "failed") return "Failed";
  return status;
}
