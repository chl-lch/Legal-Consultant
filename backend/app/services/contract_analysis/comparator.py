"""Multi-document comparison: runs extractor on N documents and builds a side-by-side matrix."""
from __future__ import annotations

import asyncio

from app.models.document import Chunk, Document
from app.repositories.document_repository import DocumentRepository
from app.schemas.analysis import (
    ComparisonCell,
    ComparisonReport,
    ComparisonRow,
    ContractReport,
)
from app.services.contract_analysis.extractor import extract_contract_report

# Ordered clause keys + human-readable labels
_CLAUSE_LABELS: list[tuple[str, str]] = [
    ("liability_cap", "Liability Cap"),
    ("termination", "Termination"),
    ("ip_ownership", "IP Ownership"),
    ("confidentiality", "Confidentiality"),
    ("dispute_resolution", "Dispute Resolution"),
    ("force_majeure", "Force Majeure"),
    ("indemnification", "Indemnification"),
    ("governing_law", "Governing Law"),
    ("payment_terms", "Payment Terms"),
    ("warranties", "Warranties"),
]


async def _report_for_document(
    document: Document,
    repo: DocumentRepository,
) -> ContractReport:
    chunks: list[Chunk] = await repo.get_chunks_by_document(document.id)
    return await extract_contract_report(document, chunks)


async def compare_contracts(
    documents: list[Document],
    repo: DocumentRepository,
) -> ComparisonReport:
    """Run extraction in parallel on all documents and assemble a ComparisonReport."""
    tasks = [_report_for_document(doc, repo) for doc in documents]
    reports: list[ContractReport] = await asyncio.gather(*tasks)

    doc_titles: dict[str, str] = {r.document_id: r.document_title for r in reports}
    overall_risks: dict[str, str] = {r.document_id: r.overall_risk for r in reports}

    rows: list[ComparisonRow] = []
    for clause_key, clause_label in _CLAUSE_LABELS:
        cells: dict[str, ComparisonCell] = {}
        for report in reports:
            clause_obj = getattr(report.clauses, clause_key, None)
            if clause_obj is None or not clause_obj.present:
                cells[report.document_id] = ComparisonCell(
                    summary="Not present",
                    risk_level="absent",
                )
            else:
                cells[report.document_id] = ComparisonCell(
                    summary=clause_obj.summary,
                    risk_level=clause_obj.risk_level,
                )
        rows.append(
            ComparisonRow(
                clause_key=clause_key,
                clause_label=clause_label,
                cells=cells,
            )
        )

    return ComparisonReport(
        document_titles=doc_titles,
        overall_risks=overall_risks,
        rows=rows,
    )
