from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.repositories.document_repository import DocumentRepository
from app.schemas.document import DocumentResponse, UrlIngestionRequest
from app.services.ingestion.pipeline import IngestionService

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(session: AsyncSession = Depends(get_db_session)) -> list[DocumentResponse]:
    repository = DocumentRepository(session)
    return await repository.list_documents()


@router.post("/upload", response_model=DocumentResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    metadata_json: str | None = Form(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> DocumentResponse:
    try:
        service = IngestionService(session)
        parsed_metadata = service.parse_metadata(metadata_json)
        return await service.ingest_upload(file=file, title=title, metadata_json=parsed_metadata)
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
) -> DocumentResponse:
    try:
        service = IngestionService(session)
        return await service.ingest_url(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="URL ingestion failed. Please try again.") from exc

