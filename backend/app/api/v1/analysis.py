"""Contract intelligence endpoints: health report + comparison matrix."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_active_subscription as get_current_user
from app.db.session import get_db_session as get_session
from app.models.document import Document, DocumentStatus
from app.models.user import User
from app.repositories.document_repository import DocumentRepository
from app.schemas.analysis import CompareRequest, ComparisonReport, ContractReport
from app.services.contract_analysis.comparator import compare_contracts
from app.services.contract_analysis.extractor import extract_contract_report

router = APIRouter()


async def _get_ready_document(
    document_id: uuid.UUID,
    repo: DocumentRepository,
    user: User,
) -> Document:
    doc = await repo.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    if doc.user_id and doc.user_id != user.id and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    if doc.status != DocumentStatus.ready:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document is not yet ready. Wait for processing to complete.",
        )
    return doc


@router.post(
    "/report/{document_id}",
    response_model=ContractReport,
    summary="Generate a contract health report for a single document",
)
async def get_contract_report(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ContractReport:
    repo = DocumentRepository(session)
    doc = await _get_ready_document(document_id, repo, current_user)
    chunks = await repo.get_chunks_by_document(document_id)
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document has no text chunks. Re-upload or retry processing.",
        )
    return await extract_contract_report(doc, chunks)


@router.post(
    "/compare",
    response_model=ComparisonReport,
    summary="Compare multiple contracts side-by-side",
)
async def compare_documents(
    body: CompareRequest,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ComparisonReport:
    if len(body.document_ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide at least 2 document IDs to compare.",
        )
    if len(body.document_ids) > 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Maximum 5 documents can be compared at once.",
        )

    repo = DocumentRepository(session)
    documents: list[Document] = []
    for raw_id in body.document_ids:
        doc_id = uuid.UUID(raw_id)
        doc = await _get_ready_document(doc_id, repo, current_user)
        documents.append(doc)

    return await compare_contracts(documents, repo)
