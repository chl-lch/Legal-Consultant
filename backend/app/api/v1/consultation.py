import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import require_active_subscription as get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.consultation import (
    AnswerEvaluationResponse,
    ConsultationRequest,
    ConsultationResponse,
    RetrievedChunkResponse,
)
from app.services.agents.intents import IntentClassifier
from app.services.agents.workflows import IntentWorkflowEngine, WorkflowResult
from app.services.evaluation.answer_evaluator import AnswerEvaluator
from app.services.retrieval.hybrid import HybridRetriever

router = APIRouter()
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)


@router.post("", response_model=ConsultationResponse)
@limiter.limit("20/minute")
async def consult(
    request: Request,
    body: ConsultationRequest,
    _: AsyncSession = Depends(get_db_session),
    __: User = Depends(get_current_user),
) -> ConsultationResponse:
    try:
        classifier = IntentClassifier()
        retriever = HybridRetriever()
        workflow_engine = IntentWorkflowEngine(retriever)
        evaluator = AnswerEvaluator()
        classification = await classifier.classify(body.query)
        attempts = 0
        refinement_prompt = None
        workflow_result = None
        evaluation_result = None
        while attempts <= settings.max_refinement_attempts:
            attempts += 1
            workflow_result = await workflow_engine.run(
                intent=classification.intent,
                query=body.query,
                top_k=body.top_k or 6,
                document_ids=body.document_ids,
                history=[message.model_dump() for message in body.history],
                refinement_prompt=refinement_prompt,
            )
            evaluation_result = await evaluator.evaluate(
                query=body.query,
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


@router.post("/stream")
@limiter.limit("20/minute")
async def consult_stream(
    request: Request,
    body: ConsultationRequest,
    _: AsyncSession = Depends(get_db_session),
    __: User = Depends(get_current_user),
) -> StreamingResponse:
    async def generate():
        try:
            classifier = IntentClassifier()
            retriever = HybridRetriever()
            workflow_engine = IntentWorkflowEngine(retriever)
            evaluator = AnswerEvaluator()

            # Phase 1: classify (fast ~0.3s) — tell client intent immediately
            classification = await classifier.classify(body.query)
            yield _sse({"type": "intent", "intent": classification.intent})

            # Phase 2: stream tokens from the agent
            workflow_result: WorkflowResult | None = None
            async for item in workflow_engine.stream_run(
                intent=classification.intent,
                query=body.query,
                top_k=body.top_k or 6,
                document_ids=body.document_ids,
                history=[m.model_dump() for m in body.history],
            ):
                if isinstance(item, str):
                    yield _sse({"type": "token", "content": item})
                else:
                    workflow_result = item

            if workflow_result is None:
                yield _sse({"type": "error", "detail": "No response generated."})
                return

            # Phase 3: evaluate quality (non-streaming, ~1s)
            yield _sse({"type": "evaluating"})
            evaluation_result = await evaluator.evaluate(
                query=body.query,
                answer=workflow_result.answer,
                retrievals=workflow_result.retrievals,
            )

            # Phase 4: send final metadata
            yield _sse({
                "type": "done",
                "intent": classification.intent,
                "answer": workflow_result.answer,
                "retrievals": [chunk.to_dict() for chunk in workflow_result.retrievals],
                "evaluation": {
                    "citation_accuracy": evaluation_result.citation_accuracy,
                    "legal_relevance": evaluation_result.legal_relevance,
                    "hallucination_risk": evaluation_result.hallucination_risk,
                    "issues": evaluation_result.issues,
                    "refinement_prompt": evaluation_result.refinement_prompt,
                },
                "attempts": 1,
            })

        except Exception:
            yield _sse({"type": "error", "detail": "Consultation failed. Please try again."})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
