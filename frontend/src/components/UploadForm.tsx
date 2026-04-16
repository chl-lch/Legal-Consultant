import { FormEvent, useState } from "react";

type Props = {
  onUpload: (formData: FormData) => Promise<void>;
  onUrlIngest: (payload: { url: string; title?: string; metadata_json?: Record<string, unknown> }) => Promise<void>;
};

export function UploadForm({ onUpload, onUrlIngest }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [metadata, setMetadata] = useState('{"jurisdiction":"AU","practice_area":"commercial"}');
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    if (fileTitle) {
      formData.append("title", fileTitle);
    }
    formData.append("metadata_json", metadata);
    setBusy(true);
    try {
      setError(null);
      await onUpload(formData);
      setFile(null);
      setFileTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUrlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url) {
      return;
    }
    let parsedMetadata: Record<string, unknown>;
    try {
      parsedMetadata = JSON.parse(metadata);
    } catch {
      setError("Metadata is not valid JSON. Please check the format.");
      return;
    }
    setBusy(true);
    try {
      setError(null);
      await onUrlIngest({
        url,
        title: urlTitle || undefined,
        metadata_json: parsedMetadata,
      });
      setUrl("");
      setUrlTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL ingestion failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="eyebrow">Corpus Intake</p>
        <h2>Ingest legal materials</h2>
      </div>
      <div className="split-grid">
        <form className="stack" onSubmit={handleFileSubmit}>
          <label>
            PDF or HTML file
            <input
              type="file"
              accept=".pdf,.html,.htm"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Optional title
            <input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} />
          </label>
          <label>
            Metadata JSON
            <textarea value={metadata} onChange={(event) => setMetadata(event.target.value)} rows={5} />
          </label>
          <button disabled={busy || !file} type="submit">
            {busy ? "Processing..." : "Upload document"}
          </button>
        </form>
        <form className="stack" onSubmit={handleUrlSubmit}>
          <label>
            HTML source URL
            <input
              type="url"
              placeholder="https://www.legislation.gov.au/..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label>
            Shared title
            <input value={urlTitle} onChange={(event) => setUrlTitle(event.target.value)} />
          </label>
          <label>
            Metadata JSON
            <textarea value={metadata} onChange={(event) => setMetadata(event.target.value)} rows={5} />
          </label>
          <button disabled={busy || !url} type="submit">
            {busy ? "Processing..." : "Ingest URL"}
          </button>
        </form>
      </div>
      {error ? <p className="error-inline">{error}</p> : null}
    </section>
  );
}
