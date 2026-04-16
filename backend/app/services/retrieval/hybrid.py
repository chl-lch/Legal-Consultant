import uuid

from app.core.config import get_settings
from app.repositories.document_repository import DocumentRepository
from app.services.retrieval.bm25_store import Bm25Store
from app.services.retrieval.faiss_store import FaissStore
from app.services.retrieval.types import RetrievedChunk


settings = get_settings()


class HybridRetriever:
    def __init__(self) -> None:
        self.faiss_store = FaissStore(settings.faiss_index_path)
        self.bm25_store = Bm25Store(settings.bm25_index_path)

    async def rebuild_from_repository(self, repository: DocumentRepository) -> None:
        chunks = await repository.get_all_chunks()
        serialized = []
        for chunk in chunks:
            serialized.append(
                {
                    "chunk_id": str(chunk.id),
                    "document_id": str(chunk.document_id),
                    "document_title": chunk.document.title if chunk.document else "Untitled",
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "citations": chunk.citations,
                    "source_uri": chunk.document.source_uri if chunk.document else None,
                    "page_number": chunk.page_number,
                }
            )
        if serialized:
            self.faiss_store.rebuild(serialized)
            self.bm25_store.rebuild(serialized)

    def search(
        self,
        query: str,
        *,
        top_k: int,
        document_ids: list[uuid.UUID] | None = None,
    ) -> list[RetrievedChunk]:
        dense_results = self.faiss_store.search(query, top_k=top_k * 2)
        sparse_results = self.bm25_store.search(query, top_k=top_k * 2)
        allowed = {str(item) for item in (document_ids or [])}

        def filtered(results: list[RetrievedChunk]) -> list[RetrievedChunk]:
            if not allowed:
                return results
            return [item for item in results if item.document_id in allowed]

        merged = reciprocal_rank_fusion(
            [filtered(dense_results), filtered(sparse_results)],
            k=settings.rrf_k,
        )
        return merged[:top_k]


def reciprocal_rank_fusion(result_sets: list[list[RetrievedChunk]], k: int = 60) -> list[RetrievedChunk]:
    fused_scores: dict[str, float] = {}
    chunk_map: dict[str, RetrievedChunk] = {}
    for result_set in result_sets:
        for rank, chunk in enumerate(result_set, start=1):
            fused_scores[chunk.chunk_id] = fused_scores.get(chunk.chunk_id, 0.0) + 1.0 / (k + rank)
            chunk_map[chunk.chunk_id] = chunk
    ordered = sorted(fused_scores.items(), key=lambda item: item[1], reverse=True)
    return [
        RetrievedChunk(
            **{**chunk_map[chunk_id].to_dict(), "score": score},
        )
        for chunk_id, score in ordered
    ]

