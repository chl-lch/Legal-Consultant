"""Pydantic schemas for contract analysis (health report & comparison)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

RiskLevel = Literal["low", "medium", "high", "unknown"]


class ClauseDetail(BaseModel):
    present: bool
    risk_level: RiskLevel
    summary: str
    concern: str | None = None
    quote: str | None = None


class ContractClauses(BaseModel):
    liability_cap: ClauseDetail | None = None
    termination: ClauseDetail | None = None
    ip_ownership: ClauseDetail | None = None
    confidentiality: ClauseDetail | None = None
    dispute_resolution: ClauseDetail | None = None
    force_majeure: ClauseDetail | None = None
    indemnification: ClauseDetail | None = None
    governing_law: ClauseDetail | None = None
    payment_terms: ClauseDetail | None = None
    warranties: ClauseDetail | None = None


class ContractReport(BaseModel):
    document_id: str
    document_title: str
    contract_type: str
    parties: list[str]
    effective_date: str | None = None
    overall_risk: RiskLevel
    clauses: ContractClauses
    missing_standard_clauses: list[str]
    red_flags: list[str]
    executive_summary: str


# ── Comparison ────────────────────────────────────────────────

class ComparisonCell(BaseModel):
    summary: str
    risk_level: Literal["low", "medium", "high", "unknown", "absent"]


class ComparisonRow(BaseModel):
    clause_key: str
    clause_label: str
    cells: dict[str, ComparisonCell]  # document_id → cell


class ComparisonReport(BaseModel):
    document_titles: dict[str, str]   # document_id → title
    overall_risks: dict[str, RiskLevel]
    rows: list[ComparisonRow]


# ── Request bodies ────────────────────────────────────────────

class CompareRequest(BaseModel):
    document_ids: list[str]
