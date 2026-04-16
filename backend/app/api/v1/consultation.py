from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.consultation import (
    AnswerEvaluationResponse,
    ConsultationRequest,
    ConsultationResponse,
    RetrievedChunkResponse,
)
from app.services.agents.intents import IntentClassifier
from app.services.agents.workflows import IntentWorkflowEngine
from app.services.evaluation.answer_evaluator import AnswerEvaluator
from app.services.retrieval.hybrid import HybridRetriever

router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@router.post("", response_model=ConsultationResponse)
@limiter.limit("20/minute")
async def consult(
    http_request: Request,
    request: ConsultationRequest,
    _: AsyncSession = Depends(get_db_session),
) -> ConsultationResponse:
    try:
        classifier = IntentClassifier()
        retriever = HybridRetriever()
        workflow_engine = IntentWorkflowEngine(retriever)
        evaluator = AnswerEvaluator()
        classification = await classifier.classify(request.query)
        attempts = 0
        refinement_prompt = None
        workflow_result = None
        evaluation_result = None
        while attempts <= settings.max_refinement_attempts:
            attempts += 1
            workflow_result = await workflow_engine.run(
                intent=classification.intent,
                query=request.query,
                top_k=request.top_k or 6,
                document_ids=request.document_ids,
                history=[message.model_dump() for message in request.history],
                refinement_prompt=refinement_prompt,
            )
            evaluation_result = await evaluator.evaluate(
                query=request.query,
                answer=workflow_result.answer,
                retrievals=workflow_result.retrievals,
            )
            if not evaluation_result.should_retry or attempts > settings.max_refinement_attempts:
                break
            refinement_prompt = evaluation_result.refinement_prompt
        if workflow_result is None or evaluation_result is None:
            raise RuntimeError("Workflow did not produce a result after all attempts.")
        return ConsultationResponse(
            intent=classification.intent,
            answer=workflow_result.answer,
            retrievals=[RetrievedChunkResponse(**chunk.to_dict()) for chunk in workflow_result.retrievals],
            evaluation=AnswerEvaluationResponse(
                citation_accuracy=evaluation_result.citation_accuracy,
                legal_relevance=evaluation_result.legal_relevance,
                hallucination_risk=evaluation_result.hallucination_risk,
                issues=evaluation_result.issues,
                refinement_prompt=evaluation_result.refinement_prompt,
            ),
            attempts=attempts,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Consultation failed. Please try again.") from exc
