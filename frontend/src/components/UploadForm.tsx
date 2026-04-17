import { DragEvent, FormEvent, useRef, useState } from "react";
import { useToast } from "../contexts/ToastContext";

type Props = {
  onUpload: (formData: FormData) => Promise<void>;
  onUrlIngest: (payload: { url: string; title?: string; metadata_json?: Record<string, unknown> }) => Promise<void>;
};

const ACCEPTED_EXTS = [".pdf", ".html", ".htm"];
const ACCEPT_ATTR = ACCEPTED_EXTS.join(",");

export function UploadForm({ onUpload, onUrlIngest }: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<"file" | "url">("file");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // URL ingest state
  const [url, setUrl] = useState("");
  const [urlTitle, setUrlTitle] = useState("");

  // Shared
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jurisdiction, setJurisdiction] = useState("AU");
  const [practiceArea, setPracticeArea] = useState("commercial");
  const [busy, setBusy] = useState(false);

  function buildMetadata(): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    if (jurisdiction.trim()) meta.jurisdiction = jurisdiction.trim();
    if (practiceArea.trim()) meta.practice_area = practiceArea.trim();
    return meta;
  }

  function validateFile(f: File): boolean {
    const ext = "." + f.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTS.includes(ext)) {
      toast.error(`Unsupported file type "${ext}". Upload PDF or HTML only.`);
      return false;
    }
    return true;
  }

  function handleFileChange(f: File | null) {
    if (!f) return;
    if (!validateFile(f)) return;
    setFile(f);
    if (!fileTitle.trim()) setFileTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange(dropped);
  }

  async function handleFileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    if (fileTitle.trim()) formData.append("title", fileTitle.trim());
    formData.append("metadata_json", JSON.stringify(buildMetadata()));
    setBusy(true);
    try {
      await onUpload(formData);
      toast.success(`"${fileTitle.trim() || file.name}" uploaded — processing started.`);
      setFile(null);
      setFileTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      await onUrlIngest({
        url: url.trim(),
        title: urlTitle.trim() || undefined,
        metadata_json: buildMetadata(),
      });
      toast.success("URL added — processing started.");
      setUrl("");
      setUrlTitle("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "URL ingestion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="upload-form">
      {/* Tabs */}
      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn${tab === "file" ? " active" : ""}`}
          onClick={() => setTab("file")}
        >
          Upload File
        </button>
        <button
          type="button"
          className={`tab-btn${tab === "url" ? " active" : ""}`}
          onClick={() => setTab("url")}
        >
          From URL
        </button>
      </div>

      {/* File upload */}
      {tab === "file" && (
        <form className="stack" onSubmit={handleFileSubmit}>
          {/* Drop zone */}
          <div
            className={`drop-zone${dragOver ? " drag-over" : ""}${file ? " has-file" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Click or drag a file here to upload"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              style={{ display: "none" }}
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="drop-zone-selected">
                <span className="drop-zone-file-icon">📄</span>
                <div>
                  <strong>{file.name}</strong>
                  <p className="muted">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  type="button"
                  className="drop-zone-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setFileTitle("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  title="Remove file"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="drop-zone-idle">
                <span className="drop-zone-icon">{dragOver ? "📂" : "☁"}</span>
                <p><strong>Drop a file here</strong> or click to browse</p>
                <p className="muted">PDF · HTML · HTM · up to 50 MB</p>
              </div>
            )}
          </div>

          {/* Title */}
          <label>
            <span className="field-label">Document title <span className="optional">(optional)</span></span>
            <input
              type="text"
              value={fileTitle}
              placeholder="e.g. Supplier Agreement – Acme Corp"
              onChange={(e) => setFileTitle(e.target.value)}
            />
          </label>

          <AdvancedSettings
            show={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            jurisdiction={jurisdiction}
            practiceArea={practiceArea}
            onJurisdictionChange={setJurisdiction}
            onPracticeAreaChange={setPracticeArea}
          />
          <button disabled={busy || !file} type="submit">
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </form>
      )}

      {/* URL ingest */}
      {tab === "url" && (
        <form className="stack" onSubmit={handleUrlSubmit}>
          <label>
            <span className="field-label">Web URL</span>
            <input
              type="url"
              value={url}
              placeholder="https://www.legislation.gov.au/…"
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Document title <span className="optional">(optional)</span></span>
            <input
              type="text"
              value={urlTitle}
              placeholder="e.g. Corporations Act 2001"
              onChange={(e) => setUrlTitle(e.target.value)}
            />
          </label>
          <AdvancedSettings
            show={showAdvanced}
            onToggle={() => setShowAdvanced((v) => !v)}
            jurisdiction={jurisdiction}
            practiceArea={practiceArea}
            onJurisdictionChange={setJurisdiction}
            onPracticeAreaChange={setPracticeArea}
          />
          <button disabled={busy || !url.trim()} type="submit">
            {busy ? "Fetching…" : "Add from URL"}
          </button>
        </form>
      )}
    </div>
  );
}

type AdvancedProps = {
  show: boolean;
  onToggle: () => void;
  jurisdiction: string;
  practiceArea: string;
  onJurisdictionChange: (v: string) => void;
  onPracticeAreaChange: (v: string) => void;
};

function AdvancedSettings({
  show, onToggle, jurisdiction, practiceArea, onJurisdictionChange, onPracticeAreaChange,
}: AdvancedProps) {
  return (
    <div className="advanced-section">
      <button type="button" className="advanced-toggle" onClick={onToggle}>
        {show ? "▾" : "▸"} Advanced settings
      </button>
      {show && (
        <div className="advanced-body stack">
          <label>
            <span className="field-label">Jurisdiction</span>
            <input
              type="text"
              value={jurisdiction}
              placeholder="e.g. AU, US, UK"
              onChange={(e) => onJurisdictionChange(e.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Practice area</span>
            <input
              type="text"
              value={practiceArea}
              placeholder="e.g. commercial, employment"
              onChange={(e) => onPracticeAreaChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
