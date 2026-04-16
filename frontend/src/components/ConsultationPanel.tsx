import { FormEvent, useState } from "react";
import { ConsultationResponse } from "../lib/api";

type Props = {
  selectedDocumentIds: string[];
  onSubmit: (payload: {
    query: string;
    document_ids: string[];
    history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    top_k: number;
  }) => Promise<ConsultationResponse>;
};

export function ConsultationPanel({ selectedDocumentIds, onSubmit }: Props) {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ConsultationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      setError(null);
      const result = await onSubmit({
        query,
        document_ids: selectedDocumentIds,
        history: [],
        top_k: 6,
      });
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consultation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel consultation-panel">
      <div className="panel-heading">
        <p className="eyebrow">Consultation</p>
        <h2>Run the legal assistant</h2>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Question
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={6}
            placeholder="Example: Identify indemnity and termination risks in the attached supplier agreement."
          />
        </label>
        <button disabled={busy || query.length < 10} type="submit">
          {busy ? "Analyzing..." : "Consult"}
        </button>
      </form>
      {error ? <p className="error-inline">{error}</p> : null}
      {response ? (
        <div className="response-stack">
          <div className="metric-row">
            <div className="metric-card">
              <span>Intent</span>
              <strong>{response.intent}</strong>
            </div>
            <div className="metric-card">
              <span>Attempts</span>
              <strong>{response.attempts}</strong>
            </div>
            <div className="metric-card">
              <span>Citation Accuracy</span>
              <strong>{response.evaluation.citation_accuracy}/10</strong>
            </div>
            <div className="metric-card">
              <span>Legal Relevance</span>
              <strong>{response.evaluation.legal_relevance}/10</strong>
            </div>
            <div className="metric-card">
              <span>Hallucination Safety</span>
              <strong>{response.evaluation.hallucination_risk}/10</strong>
            </div>
          </div>

          <article className="answer-card">
            <h3>Answer</h3>
            <p>{response.answer}</p>
          </article>
          {response.evaluation.issues.length > 0 ? (
            <article className="answer-card">
              <h3>Evaluation issues</h3>
              <ul>
                {response.evaluation.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </article>
          ) : null}

          <section className="retrieval-grid">
            {response.retrievals.map((retrieval) => (
              <article key={retrieval.chunk_id} className="retrieval-card">
                <header>
                  <strong>{retrieval.document_title}</strong>
                  <span>chunk {retrieval.chunk_index}</span>
                </header>
                <p>{retrieval.content}</p>
              </article>
            ))}
          </section>
        </div>
      ) : null}
    </section>
  );
}
