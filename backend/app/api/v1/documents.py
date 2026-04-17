import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_active_subscription as get_current_user
from app.db.session import get_db_session
from app.models.user import User
from app.repositories.document_repository import DocumentRepository
from app.schemas.document import DocumentResponse, UrlIngestionRequest
from app.services.ingestion.pipeline import IngestionService
from app.services.retrieval.hybrid import HybridRetriever

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    repository = DocumentRepository(session)
    return await repository.list_documents(user_id=current_user.id)


@router.post("/upload", response_model=DocumentResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    metadata_json: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    try:
        service = IngestionService(session)
        parsed_metadata = service.parse_metadata(metadata_json)
        return await service.ingest_upload(
            file=file, title=title, metadata_json=parsed_metadata, user_id=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Document ingestion failed. Please try again.") from exc


@router.post("/from-url", response_model=DocumentResponse)
@limiter.limit("10/minute")
async def ingest_url(
    request: Request,
    body: UrlIngestionRequest,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    try:
        service = IngestionService(session)
        return await service.ingest_url(body, user_id=current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="URL ingestion failed. Please try again.") from exc


@router.post("/{document_id}/retry", response_model=DocumentResponse)
async def retry_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    repository = DocumentRepository(session)
    document = await repository.get_document(document_id)
    if document is None or document.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found.")
    if document.status not in ("failed", "processing"):
        raise HTTPException(status_code=400, detail="Only failed documents can be retried.")
    try:
        service = IngestionService(session)
        return await service.retry_document(document)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Retry failed. Please try again.") from exc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    repository = DocumentRepository(session)
    document = await repository.get_document(document_id)
    if document is None or document.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found.")
    await repository.delete_document(document)
    await session.commit()
    # Rebuild retrieval indexes after deletion
    retriever = HybridRetriever()
    await retriever.rebuild_from_repository(repository)
