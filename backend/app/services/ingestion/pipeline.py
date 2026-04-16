import json
import logging
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.document import DocumentStatus, SourceType
from app.repositories.document_repository import DocumentRepository
from app.schemas.document import UrlIngestionRequest
from app.services.ingestion.chunker import build_chunks
from app.services.ingestion.loaders import load_from_url, load_html_bytes, load_pdf
from app.services.retrieval.hybrid import HybridRetriever


logger = logging.getLogger(__name__)
settings = get_settings()


class IngestionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repository = DocumentRepository(session)
        self.retriever = HybridRetriever()

    async def ingest_upload(
        self,
        *,
        file: UploadFile,
        title: str | None = None,
        metadata_json: dict | None = None,
    ):
        suffix = Path(file.filename or "document").suffix.lower()
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        file_path = upload_dir / (file.filename or "legal_material")

        body = await file.read()
        max_bytes = settings.max_upload_size_mb * 1024 * 1024
        if len(body) > max_bytes:
            raise ValueError(f"File exceeds the maximum allowed size of {settings.max_upload_size_mb} MB.")

        file_path.write_bytes(body)
        try:
            document = await self.repository.create_document(
                title=title or Path(file.filename or "document").stem,
                source_type=SourceType.upload,
                source_uri=str(file_path),
                mime_type=file.content_type,
                metadata_json=metadata_json or {},
            )
            if suffix == ".pdf":
                payload = load_pdf(str(file_path), title=title, metadata_json=metadata_json)
            elif suffix in {".html", ".htm"} or file.content_type == "text/html":
                payload = load_html_bytes(body, source_uri=str(file_path), title=title, metadata_json=metadata_json)
            else:
                raise ValueError("Unsupported file type. Upload PDF or HTML.")
            chunks = build_chunks(payload)
            db_chunks = await self.repository.add_chunks(document.id, chunks)
            await self.repository.set_status(
                document,
                DocumentStatus.ready,
                {
                    "chunk_count": len(db_chunks),
                    "chunk_size": settings.chunk_size,
                    "chunk_overlap": settings.chunk_overlap,
                },
            )
            await self.session.commit()
            await self._refresh_indexes()
            await self.session.refresh(document)
            return document
        except Exception as exc:
            await self.session.rollback()
            logger.exception("upload_ingestion_failed", extra={"filename": file.filename})
            # Clean up the uploaded file only on failure to avoid orphaned files on disk
            try:
                file_path.unlink(missing_ok=True)
            except OSError:
                logger.warning("failed_to_cleanup_upload", extra={"path": str(file_path)})
            raise exc

    async def ingest_url(self, request: UrlIngestionRequest):
        try:
            payload = await load_from_url(str(request.url), title=request.title, metadata_json=request.metadata_json)
            document = await self.repository.create_document(
                title=payload.title,
                source_type=SourceType.url,
                source_uri=str(request.url),
                mime_type=payload.mime_type,
                metadata_json=request.metadata_json,
            )
            chunks = build_chunks(payload)
            db_chunks = await self.repository.add_chunks(document.id, chunks)
            await self.repository.set_status(
                document,
                DocumentStatus.ready,
                {
                    "chunk_count": len(db_chunks),
                    "chunk_size": settings.chunk_size,
                    "chunk_overlap": settings.chunk_overlap,
                },
            )
            await self.session.commit()
            await self._refresh_indexes()
            await self.session.refresh(document)
            return document
        except Exception:
            await self.session.rollback()
            logger.exception("url_ingestion_failed", extra={"url": str(request.url)})
            raise

    async def _refresh_indexes(self) -> None:
        await self.retriever.rebuild_from_repository(self.repository)

    @staticmethod
    def parse_metadata(raw: str | None) -> dict:
        if not raw:
            return {}
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"metadata_json is not valid JSON: {exc}") from exc
