import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import Chunk, Document, DocumentStatus, SourceType


class DocumentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_document(
        self,
        *,
        title: str,
        source_type: SourceType,
        source_uri: str | None,
        mime_type: str | None,
        metadata_json: dict,
        user_id: uuid.UUID | None = None,
    ) -> Document:
        document = Document(
            title=title,
            source_type=source_type,
            source_uri=source_uri,
            mime_type=mime_type,
            metadata_json=metadata_json,
            status=DocumentStatus.processing,
            user_id=user_id,
        )
        self.session.add(document)
        await self.session.flush()
        return document

    async def add_chunks(self, document_id: uuid.UUID, chunks: list[dict]) -> list[Chunk]:
        db_chunks = [
            Chunk(
                document_id=document_id,
                chunk_index=item["chunk_index"],
                content=item["content"],
                token_count=item["token_count"],
                page_number=item.get("page_number"),
                citations=item.get("citations", []),
                metadata_json=item.get("metadata_json", {}),
            )
            for item in chunks
        ]
        self.session.add_all(db_chunks)
        await self.session.flush()
        return db_chunks

    async def set_status(self, document: Document, status: DocumentStatus, metadata_json: dict | None = None) -> None:
        document.status = status
        if metadata_json:
            document.metadata_json = {**document.metadata_json, **metadata_json}
        await self.session.flush()

    async def list_documents(self, user_id: uuid.UUID | None = None) -> list[Document]:
        query = select(Document).order_by(Document.created_at.desc())
        if user_id is not None:
            query = query.where(Document.user_id == user_id)
        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def get_document(self, document_id: uuid.UUID) -> Document | None:
        result = await self.session.execute(select(Document).where(Document.id == document_id))
        return result.scalar_one_or_none()

    async def delete_document(self, document: Document) -> None:
        await self.session.delete(document)
        await self.session.flush()

    async def get_chunks_by_document(self, document_id: uuid.UUID) -> list[Chunk]:
        result = await self.session.execute(
            select(Chunk)
            .where(Chunk.document_id == document_id)
            .order_by(Chunk.chunk_index)
        )
        return list(result.scalars().all())

    async def clear_chunks(self, document_id: uuid.UUID) -> None:
        from sqlalchemy import delete as sa_delete
        await self.session.execute(sa_delete(Chunk).where(Chunk.document_id == document_id))
        await self.session.flush()

    async def get_all_chunks(self) -> list[Chunk]:
        result = await self.session.execute(
            select(Chunk).options(selectinload(Chunk.document)).order_by(Chunk.created_at.asc())
        )
        return list(result.scalars().all())
