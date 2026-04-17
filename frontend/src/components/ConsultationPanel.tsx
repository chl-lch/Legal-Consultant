import { FormEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ConvMessage, useConversations } from "../hooks/useConversations";
import { ConsultationResponse, StreamEvent, consultStream } from "../lib/api";

type Feedback = "up" | "down";
type Message = ConvMessage & { response?: ConsultationResponse };

type Props = {
  selectedDocumentIds: string[];
  hasDocuments: boolean;
  onSubmit?: unknown;
};

function exportChat(messages: Message[]): void {
  const lines: string[] = ["LexiCounsel — Chat Export", "=".repeat(40), ""];
  for (const msg of messages) {
    if (msg.streaming) continue;
    if (msg.role === "user") {
      lines.push(`You: ${msg.content}`, "");
    } else {
      lines.push(`LexiCounsel: ${msg.content}`, "");
      if (msg.response) {
        const e = msg.response.evaluation;
        lines.push(
          `[Citations: ${e.citation_accuracy}/10 · Relevance: ${e.legal_relevance}/10 · Accuracy: ${10 - e.hallucination_risk}/10]`,
          "",
        );
      }
    }
  }
  lines.push(
    "—",
    "Note: AI responses are for informational purposes only and do not constitute legal advice.",
  );
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lexicounsel-chat-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConsultationPanel({ selectedDocumentIds, hasDocuments }: Props) {
  const {
    index,
    activeId,
    messages,
    setMessages,
    newConversation,
    switchConversation,
    deleteConversation,
    clearActive,
    activeTitle,
  } = useConversations();

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim() || query.trim().length < 5) return;

    const userContent = query.trim();
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const assistantIdx = messages.length + 1;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: userContent },
      { role: "assistant", content: "", streaming: true, streamPhase: "thinking" },
    ]);
    setQuery("");
    setBusy(true);
    setError(null);
    scrollToBottom();

    try {
      const stream = consultStream({
        query: userContent,
        document_ids: selectedDocumentIds,
        history,
        top_k: 6,
      });

      for await (const event of stream) {
        handleStreamEvent(event, assistantIdx);
        if (event.type === "token") scrollToBottom();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Consultation failed.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  function handleStreamEvent(event: StreamEvent, assistantIdx: number) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = { ...updated[assistantIdx] };

      if (event.type === "intent") {
        msg.streamPhase = "writing";
      } else if (event.type === "token") {
        msg.content += event.content;
        msg.streamPhase = "writing";
      } else if (event.type === "evaluating") {
        msg.streamPhase = "evaluating";
      } else if (event.type === "done") {
        msg.content = event.answer;
        msg.streaming = false;
        msg.streamPhase = undefined;
        msg.response = {
          intent: event.intent,
          answer: event.answer,
          retrievals: event.retrievals,
          evaluation: event.evaluation,
          attempts: event.attempts,
        };
      } else if (event.type === "error") {
        msg.content = event.detail;
        msg.streaming = false;
        msg.streamPhase = undefined;
      }

      updated[assistantIdx] = msg;
      return updated;
    });
  }

  function handleFeedback(idx: number, value: Feedback) {
    setMessages((prev) => {
      const updated = [...prev];
      const msg = { ...updated[idx] };
      msg.feedback = msg.feedback === value ? undefined : value;
      updated[idx] = msg;
      return updated;
    });
  }

  return (
    <div className="consultation-inner">
      {/* Conversation bar */}
      <div className="conv-bar">
        <div className="conv-bar-left">
          <button
            type="button"
            className="conv-switcher"
            onClick={() => setShowConvList((v) => !v)}
            title="Switch conversation"
          >
            <span className="conv-title-text">{activeTitle}</span>
            <span className="conv-caret">{showConvList ? "▴" : "▾"}</span>
          </button>

          {showConvList && (
            <div className="conv-dropdown">
              <button
                type="button"
                className="conv-new-btn"
                onClick={() => { newConversation(); setShowConvList(false); }}
              >
                + New conversation
              </button>
              {index.length === 0 ? (
                <p className="conv-empty">No conversations yet.</p>
              ) : (
                <ul className="conv-list">
                  {index.map((c) => (
                    <li
                      key={c.id}
                      className={`conv-item${c.id === activeId ? " active" : ""}`}
                    >
                      <button
                        type="button"
                        className="conv-item-title"
                        onClick={() => { switchConversation(c.id); setShowConvList(false); }}
                      >
                        <span>{c.title}</span>
                        <span className="conv-item-date">
                          {new Date(c.updatedAt).toLocaleDateString()}
                        </span>
                      </button>
                      {c.id !== activeId && (
                        <button
                          type="button"
                          className="conv-item-delete"
                          onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                          title="Delete conversation"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="conv-new-icon"
          onClick={newConversation}
          title="New conversation"
        >
          ✎
        </button>
      </div>

      {/* Chat history */}
      <div className="chat-history" onClick={() => showConvList && setShowConvList(false)}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <span className="empty-icon">💬</span>
            {hasDocuments ? (
              <>
                <p>Ask anything about your documents, or any general legal question.</p>
                <ul className="example-questions">
                  <li>What are the termination clauses in this agreement?</li>
                  <li>Summarise the key obligations of each party.</li>
                  <li>Identify indemnity and liability risks.</li>
                  <li>What does Section 5 say about dispute resolution?</li>
                </ul>
              </>
            ) : (
              <>
                <p>Ask any legal question — or upload documents for deeper, source-cited answers.</p>
                <ul className="example-questions">
                  <li>What is the difference between a deed and a contract?</li>
                  <li>Explain limitation of liability clauses.</li>
                  <li>What are common indemnification provisions?</li>
                  <li>How does force majeure work in commercial contracts?</li>
                </ul>
              </>
            )}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={`${activeId}-${i}`} className={`chat-bubble ${msg.role}`}>
              {msg.role === "user" ? (
                <p>{msg.content}</p>
              ) : (
                <AssistantMessage
                  msg={msg as Message}
                  onFeedback={(v) => handleFeedback(i, v)}
                />
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="form-feedback error">{error}</p> : null}

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            hasDocuments
              ? "Ask about your documents, or any legal question…"
              : "Ask any legal question…"
          }
          disabled={busy}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (query.trim().length >= 5) e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="chat-actions">
          {messages.length > 0 && (
            <>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => exportChat(messages as Message[])}
                disabled={busy}
                title="Export chat"
              >
                Export
              </button>
              <button type="button" className="btn-ghost" onClick={clearActive} disabled={busy}>
                Clear chat
              </button>
            </>
          )}
          <button type="submit" disabled={busy || query.trim().length < 5}>
            {busy ? "Analyzing…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssistantMessage({
  msg,
  onFeedback,
}: {
  msg: Message;
  onFeedback: (v: Feedback) => void;
}) {
  const [showSources, setShowSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const r = msg.response;

  function handleCopy() {
    void navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="assistant-msg">
      <div className="answer-text markdown-body">
        {msg.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        ) : null}

        {msg.streaming && (
          <span className="stream-phase">
            {msg.streamPhase === "thinking" && (
              <span className="stream-thinking">
                <span className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="stream-label">Thinking…</span>
              </span>
            )}
            {msg.streamPhase === "writing" && <span className="stream-cursor" />}
            {msg.streamPhase === "evaluating" && (
              <span className="stream-evaluating">Reviewing quality…</span>
            )}
          </span>
        )}
      </div>

      {/* Legal disclaimer */}
      {!msg.streaming && msg.content && (
        <p className="legal-disclaimer">
          AI-generated. Not legal advice. Consult a qualified attorney for legal matters.
        </p>
      )}

      {!msg.streaming && r && (
        <div className="msg-meta">
          <div className="score-row">
            <ScorePill label="Citations" value={r.evaluation.citation_accuracy} />
            <ScorePill label="Relevance" value={r.evaluation.legal_relevance} />
            <ScorePill label="Accuracy" value={10 - r.evaluation.hallucination_risk} />
            <span className="intent-chip">{intentLabel(r.intent)}</span>
            <div className="msg-actions">
              <button
                type="button"
                className={`feedback-btn${msg.feedback === "up" ? " active-up" : ""}`}
                onClick={() => onFeedback("up")}
                title="Helpful"
              >
                👍
              </button>
              <button
                type="button"
                className={`feedback-btn${msg.feedback === "down" ? " active-down" : ""}`}
                onClick={() => onFeedback("down")}
                title="Not helpful"
              >
                👎
              </button>
              <button type="button" className="copy-btn" onClick={handleCopy} title="Copy answer">
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>

          {r.evaluation.issues.length > 0 && (
            <div className="eval-issues">
              {r.evaluation.issues.map((issue: string) => (
                <p key={issue} className="issue-item">
                  ⚠ {issue}
                </p>
              ))}
            </div>
          )}

          {r.retrievals.length > 0 && (
            <div className="sources-section">
              <button
                type="button"
                className="sources-toggle"
                onClick={() => setShowSources((v) => !v)}
              >
                {showSources ? "▾" : "▸"} {r.retrievals.length} source
                {r.retrievals.length > 1 ? "s" : ""} referenced
              </button>
              {showSources && (
                <div className="sources-grid">
                  {r.retrievals.map((chunk: { chunk_id: string; document_title: string; page_number?: number | null; content: string }) => (
                    <div key={chunk.chunk_id} className="source-card">
                      <div className="source-header">
                        <strong>{chunk.document_title}</strong>
                        {chunk.page_number != null && (
                          <span className="muted">p.{chunk.page_number}</span>
                        )}
                      </div>
                      <p className="source-excerpt">{chunk.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const color = value >= 7 ? "good" : value >= 5 ? "mid" : "bad";
  return (
    <span className={`score-pill ${color}`}>
      {label} {value}/10
    </span>
  );
}

function intentLabel(intent: string) {
  const map: Record<string, string> = {
    statute_lookup: "Statute lookup",
    clause_extraction: "Clause extraction",
    document_summarisation: "Summarisation",
    risk_assessment: "Risk assessment",
  };
  return map[intent] ?? intent;
}
