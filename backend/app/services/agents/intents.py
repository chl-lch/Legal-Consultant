import re
from typing import Literal

from pydantic import BaseModel, Field

from app.services.llm.factory import get_chat_llm, has_llm_credentials


LegalIntent = Literal[
    "statute_lookup",
    "clause_extraction",
    "document_summarisation",
    "risk_assessment",
]


class IntentClassification(BaseModel):
    intent: LegalIntent
    rationale: str = Field(min_length=3)
    confidence: float = Field(ge=0, le=1)


class IntentClassifier:
    async def classify(self, query: str) -> IntentClassification:
        if not has_llm_credentials():
            return self._heuristic_classification(query)
        llm = get_chat_llm().with_structured_output(IntentClassification)
        prompt = (
            "Classify the user's legal request into exactly one intent: statute_lookup, "
            "clause_extraction, document_summarisation, or risk_assessment. "
            "Return the strongest intent for routing."
        )
        try:
            return await llm.ainvoke(f"{prompt}\n\nUser query:\n{query}")
        except Exception:
            return self._heuristic_classification(query)

    def _heuristic_classification(self, query: str) -> IntentClassification:
        tokens = set(re.findall(r"[a-z_]+", query.lower()))
        if tokens.intersection({"clause", "clauses", "termination", "indemnity", "liability", "extract"}):
            intent = "clause_extraction"
        elif tokens.intersection({"summarise", "summary", "overview", "brief"}):
            intent = "document_summarisation"
        elif tokens.intersection({"section", "statute", "act", "regulation", "law"}):
            intent = "statute_lookup"
        else:
            intent = "risk_assessment"
        return IntentClassification(intent=intent, rationale="Heuristic fallback classification", confidence=0.55)
