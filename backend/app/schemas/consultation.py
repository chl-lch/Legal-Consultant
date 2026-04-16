import uuid
from typing import Literal

from pydantic import BaseModel, Field


LegalIntent = Literal[
    "statute_lookup",
    "clause_extraction",
    "document_summarisation",
    "risk_assessment",
]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str = Field(max_length=4000)


class ConsultationRequest(BaseModel):
    query: str = Field(min_length=5, max_length=2000)
    top_k: int | None = Field(default=None, ge=1, le=12)
    document_ids: list[uuid.UUID] = Field(default_factory=list, max_length=50)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class RetrievedChunkResponse(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    chunk_index: int
    score: float
    content: str
    citations: list[dict]
    source_uri: str | None = None
    page_number: int | None = None


class AnswerEvaluationResponse(BaseModel):
    citation_accuracy: int
    legal_relevance: int
    hallucination_risk: int
    issues: list[str]
    refinement_prompt: str | None = None


class ConsultationResponse(BaseModel):
    intent: LegalIntent
    answer: str
    retrievals: list[RetrievedChunkResponse]
    evaluation: AnswerEvaluationResponse
    attempts: int

