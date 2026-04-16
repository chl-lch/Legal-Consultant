from dataclasses import dataclass

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompts import PromptTemplate
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services.llm.factory import get_chat_llm, has_llm_credentials
from app.services.retrieval.types import RetrievedChunk


settings = get_settings()


class EvaluationPayload(BaseModel):
    citation_accuracy: int = Field(ge=1, le=10)
    legal_relevance: int = Field(ge=1, le=10)
    hallucination_risk: int = Field(
        ge=1,
        le=10,
        description="Higher means lower hallucination risk and stronger grounding.",
    )
    issues: list[str] = Field(default_factory=list)
    refinement_prompt: str | None = None


@dataclass(slots=True)
class EvaluationResult:
    citation_accuracy: int
    legal_relevance: int
    hallucination_risk: int
    issues: list[str]
    refinement_prompt: str | None

    @property
    def should_retry(self) -> bool:
        threshold = settings.evaluation_min_score
        return any(
            score < threshold
            for score in [self.citation_accuracy, self.legal_relevance, self.hallucination_risk]
        )


class AnswerEvaluator:
    async def evaluate(self, *, query: str, answer: str, retrievals: list[RetrievedChunk]) -> EvaluationResult:
        if not has_llm_credentials():
            return self._heuristic(query, answer)
        parser = PydanticOutputParser(pydantic_object=EvaluationPayload)
        prompt = PromptTemplate.from_template(
            "Evaluate the answer for the legal query.\n"
            "Score citation_accuracy, legal_relevance, and hallucination_risk from 1 to 10, where 10 is best.\n"
            "{format_instructions}\n\n"
            "Query:\n{query}\n\n"
            "Answer:\n{answer}\n\n"
            "Retrieved evidence:\n{retrievals}"
        )
        formatted_prompt = prompt.format(
            format_instructions=parser.get_format_instructions(),
            query=query,
            answer=answer,
            retrievals="\n\n".join(
                f"{item.document_title} chunk {item.chunk_index}: {item.content}" for item in retrievals
            ),
        )
        raw = await get_chat_llm().ainvoke(formatted_prompt)
        parsed = parser.parse(raw.content)
        return EvaluationResult(**parsed.model_dump())

    def _heuristic(self, query: str, answer: str) -> EvaluationResult:
        citation_accuracy = 8 if "[" in answer and "]" in answer else 5
        legal_relevance = 8 if any(word in answer.lower() for word in query.lower().split()) else 6
        hallucination_risk = 7 if citation_accuracy >= 8 else 5
        issues = []
        if citation_accuracy < settings.evaluation_min_score:
            issues.append("Answer is missing explicit citations.")
        refinement_prompt = "Use direct evidence from retrieved chunks and add citations for every material claim."
        return EvaluationResult(
            citation_accuracy=citation_accuracy,
            legal_relevance=legal_relevance,
            hallucination_risk=hallucination_risk,
            issues=issues,
            refinement_prompt=refinement_prompt,
        )

