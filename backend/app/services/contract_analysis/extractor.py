"""GPT-powered structured clause extraction for a single contract document."""
from __future__ import annotations

import json
import textwrap

from langchain_core.messages import HumanMessage, SystemMessage

from app.models.document import Chunk, Document
from app.schemas.analysis import ClauseDetail, ContractClauses, ContractReport
from app.services.llm.factory import get_chat_llm

# Maximum characters to feed into the extraction prompt (~12 k tokens at 4 chars/token)
_MAX_CHARS = 48_000

_SYSTEM_PROMPT = textwrap.dedent("""\
    You are an expert contract lawyer. Analyse the contract text provided and
    return a single JSON object — no markdown fences, no extra keys — that
    strictly matches the schema below.

    Schema:
    {
      "contract_type": "<NDA|Service Agreement|Employment|Lease|SaaS|…>",
      "parties": ["Party A", "Party B"],
      "effective_date": "<ISO-8601 date or null>",
      "overall_risk": "<low|medium|high|unknown>",
      "clauses": {
        "<clause_key>": {
          "present": <true|false>,
          "risk_level": "<low|medium|high|unknown>",
          "summary": "<1-2 sentence summary>",
          "concern": "<specific concern or null>",
          "quote": "<verbatim excerpt ≤ 120 chars or null>"
        }
      },
      "missing_standard_clauses": ["<clause name>"],
      "red_flags": ["<flag description>"],
      "executive_summary": "<3-5 sentence plain-English summary>"
    }

    Clause keys to analyse (all 10 must appear in "clauses", even if absent):
      liability_cap, termination, ip_ownership, confidentiality,
      dispute_resolution, force_majeure, indemnification,
      governing_law, payment_terms, warranties

    Rules:
    - If a clause is absent set present=false and risk_level="unknown".
    - overall_risk = highest risk among present clauses, or "unknown" if none present.
    - missing_standard_clauses = clause keys where present=false.
    - Keep each summary ≤ 60 words.
    - Return ONLY the JSON object, nothing else.
""")


def _build_text(chunks: list[Chunk]) -> str:
    parts = [c.content for c in chunks]
    text = "\n\n".join(parts)
    return text[:_MAX_CHARS]


def _parse_response(raw: str) -> dict:
    raw = raw.strip()
    # strip accidental markdown code fences
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip().rstrip("`").strip()
    return json.loads(raw)


async def extract_contract_report(
    document: Document,
    chunks: list[Chunk],
) -> ContractReport:
    """Call the LLM and return a structured ContractReport for one document."""
    text = _build_text(chunks)
    llm = get_chat_llm(temperature=0.0)

    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=f"CONTRACT TEXT:\n\n{text}"),
    ]

    result = await llm.ainvoke(messages)
    raw = result.content if hasattr(result, "content") else str(result)
    data = _parse_response(raw)

    # Build typed clause objects
    raw_clauses = data.get("clauses", {})
    clause_details: dict[str, ClauseDetail] = {}
    for key, val in raw_clauses.items():
        try:
            clause_details[key] = ClauseDetail(**val)
        except Exception:
            pass

    return ContractReport(
        document_id=str(document.id),
        document_title=document.title,
        contract_type=data.get("contract_type", "Unknown"),
        parties=data.get("parties", []),
        effective_date=data.get("effective_date"),
        overall_risk=data.get("overall_risk", "unknown"),
        clauses=ContractClauses(**{k: v for k, v in clause_details.items()}),
        missing_standard_clauses=data.get("missing_standard_clauses", []),
        red_flags=data.get("red_flags", []),
        executive_summary=data.get("executive_summary", ""),
    )
