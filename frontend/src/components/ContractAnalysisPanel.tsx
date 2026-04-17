import { useState } from "react";
import {
  ClauseDetail,
  ComparisonReport,
  ContractReport,
  RiskLevel,
  compareContracts,
  getContractReport,
} from "../lib/api";

type Mode = "report" | "compare";

type Props = {
  selectedDocumentIds: string[];
  documentTitles: Record<string, string>;
};

const CLAUSE_LABELS: Record<string, string> = {
  liability_cap: "Liability Cap",
  termination: "Termination",
  ip_ownership: "IP Ownership",
  confidentiality: "Confidentiality",
  dispute_resolution: "Dispute Resolution",
  force_majeure: "Force Majeure",
  indemnification: "Indemnification",
  governing_law: "Governing Law",
  payment_terms: "Payment Terms",
  warranties: "Warranties",
};

function RiskBadge({ level }: { level: string }) {
  return <span className={`risk-badge risk-${level}`}>{level}</span>;
}

function ClauseRow({ label, clause }: { label: string; clause: ClauseDetail | null | undefined }) {
  const [expanded, setExpanded] = useState(false);

  if (!clause || !clause.present) {
    return (
      <tr className="clause-row absent">
        <td className="clause-name">{label}</td>
        <td><RiskBadge level="absent" /></td>
        <td className="clause-summary muted">Not present</td>
      </tr>
    );
  }

  return (
    <>
      <tr
        className={`clause-row ${clause.concern || clause.quote ? "expandable" : ""}`}
        onClick={() => (clause.concern || clause.quote) && setExpanded((v) => !v)}
      >
        <td className="clause-name">
          {(clause.concern || clause.quote) && (
            <span className="clause-caret">{expanded ? "▾" : "▸"}</span>
          )}
          {label}
        </td>
        <td><RiskBadge level={clause.risk_level} /></td>
        <td className="clause-summary">{clause.summary}</td>
      </tr>
      {expanded && (
        <tr className="clause-detail-row">
          <td colSpan={3}>
            {clause.concern && (
              <p className="clause-concern">
                <strong>Concern:</strong> {clause.concern}
              </p>
            )}
            {clause.quote && (
              <blockquote className="clause-quote">&ldquo;{clause.quote}&rdquo;</blockquote>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ReportView({ report }: { report: ContractReport }) {
  return (
    <div className="analysis-report">
      <div className="report-header">
        <div className="report-meta">
          <span className="report-type">{report.contract_type}</span>
          {report.effective_date && (
            <span className="report-date muted">Effective: {report.effective_date}</span>
          )}
        </div>
        <div className="report-risk-block">
          <span className="report-risk-label">Overall Risk</span>
          <RiskBadge level={report.overall_risk} />
        </div>
      </div>

      {report.parties.length > 0 && (
        <p className="report-parties">
          <strong>Parties:</strong> {report.parties.join(" · ")}
        </p>
      )}

      <div className="report-summary">
        <p>{report.executive_summary}</p>
      </div>

      {report.red_flags.length > 0 && (
        <div className="red-flags">
          <h4>Red Flags</h4>
          <ul>
            {report.red_flags.map((flag) => (
              <li key={flag}>⚠ {flag}</li>
            ))}
          </ul>
        </div>
      )}

      {report.missing_standard_clauses.length > 0 && (
        <div className="missing-clauses">
          <h4>Missing Standard Clauses</h4>
          <ul>
            {report.missing_standard_clauses.map((key) => (
              <li key={key}>{CLAUSE_LABELS[key] ?? key}</li>
            ))}
          </ul>
        </div>
      )}

      <h4>Clause Analysis</h4>
      <table className="clause-table">
        <thead>
          <tr>
            <th>Clause</th>
            <th>Risk</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(CLAUSE_LABELS).map(([key, label]) => (
            <ClauseRow
              key={key}
              label={label}
              clause={report.clauses[key as keyof typeof report.clauses]}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompareView({ report }: { report: ComparisonReport }) {
  const docIds = Object.keys(report.document_titles);

  return (
    <div className="comparison-report">
      <div className="comparison-header">
        {docIds.map((id) => (
          <div key={id} className="comparison-doc-header">
            <span className="comparison-doc-title">{report.document_titles[id]}</span>
            <RiskBadge level={report.overall_risks[id] ?? "unknown"} />
          </div>
        ))}
      </div>

      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th className="col-clause">Clause</th>
              {docIds.map((id) => (
                <th key={id}>{report.document_titles[id]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.clause_key}>
                <td className="col-clause">{row.clause_label}</td>
                {docIds.map((id) => {
                  const cell = row.cells[id];
                  if (!cell) return <td key={id} className="muted">—</td>;
                  return (
                    <td key={id} className={`compare-cell risk-bg-${cell.risk_level}`}>
                      <div className="compare-cell-risk">
                        <RiskBadge level={cell.risk_level} />
                      </div>
                      <p className="compare-cell-summary">{cell.summary}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ContractAnalysisPanel({ selectedDocumentIds, documentTitles }: Props) {
  const [mode, setMode] = useState<Mode>("report");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ContractReport | null>(null);
  const [comparison, setComparison] = useState<ComparisonReport | null>(null);

  const canAnalyze = selectedDocumentIds.length === 1;
  const canCompare = selectedDocumentIds.length >= 2 && selectedDocumentIds.length <= 5;

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setComparison(null);
    try {
      const result = await getContractReport(selectedDocumentIds[0]);
      setReport(result);
      setMode("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCompare() {
    if (!canCompare) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setComparison(null);
    try {
      const result = await compareContracts(selectedDocumentIds);
      setComparison(result);
      setMode("compare");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }

  const showResult = !loading && !error && (report || comparison);

  return (
    <div className="analysis-panel">
      <div className="analysis-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleAnalyze}
          disabled={loading || !canAnalyze}
          title={canAnalyze ? undefined : "Select exactly 1 document to analyse"}
        >
          {loading && mode === "report" ? "Analysing…" : "Analyse Contract"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleCompare}
          disabled={loading || !canCompare}
          title={canCompare ? undefined : "Select 2–5 documents to compare"}
        >
          {loading && mode === "compare" ? "Comparing…" : `Compare (${selectedDocumentIds.length} selected)`}
        </button>
      </div>

      {!canAnalyze && !canCompare && selectedDocumentIds.length === 0 && (
        <p className="analysis-hint muted">
          Select a document from the sidebar to analyse, or select 2–5 to compare side-by-side.
        </p>
      )}

      {loading && (
        <div className="analysis-loading">
          <span className="spinner" />
          <span>{mode === "compare" ? "Comparing contracts…" : "Analysing contract…"} This may take 15–30 seconds.</span>
        </div>
      )}

      {error && <p className="form-feedback error">{error}</p>}

      {showResult && report && <ReportView report={report} />}
      {showResult && comparison && <CompareView report={comparison} />}
    </div>
  );
}

// needed by DocumentsTable
export type { RiskLevel };
