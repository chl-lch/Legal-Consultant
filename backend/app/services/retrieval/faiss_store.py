from pathlib import Path

from langchain_community.vectorstores import FAISS

from app.services.llm.factory import get_embeddings
from app.services.retrieval.types import RetrievedChunk


class FaissStore:
    def __init__(self, index_path: str) -> None:
        self.index_path = Path(index_path)
        self.index_path.parent.mkdir(parents=True, exist_ok=True)

    def rebuild(self, chunks: list[dict]) -> None:
        if not chunks:
            return
        texts = [item["content"] for item in chunks]
        metadatas = [
            {
                "chunk_id": item["chunk_id"],
                "document_id": item["document_id"],
                "document_title": item["document_title"],
                "chunk_index": item["chunk_index"],
                "citations": item["citations"],
                "source_uri": item.get("source_uri"),
                "page_number": item.get("page_number"),
            }
            for item in chunks
        ]
        index = FAISS.from_texts(texts=texts, embedding=get_embeddings(), metadatas=metadatas)
        index.save_local(str(self.index_path))

    def search(self, query: str, top_k: int) -> list[RetrievedChunk]:
        if not (self.index_path / "index.faiss").exists():
            return []
        # allow_dangerous_deserialization is required by LangChain's FAISS wrapper because
        # the index is stored using pickle. This is acceptable here because:
        # 1. The index files are written exclusively by this application's rebuild() method.
        # 2. The index directory should be owned and writable only by the application process.
        # Ensure the data directory is not publicly writable in production deployments.
        index = FAISS.load_local(
            str(self.index_path),
            embeddings=get_embeddings(),
            allow_dangerous_deserialization=True,
        )
        results = index.similarity_search_with_score(query, k=top_k)
        retrieved: list[RetrievedChunk] = []
        for rank, (document, score) in enumerate(results, start=1):
            metadata = document.metadata
            retrieved.append(
                RetrievedChunk(
                    chunk_id=str(metadata["chunk_id"]),
                    document_id=str(metadata["document_id"]),
                    document_title=metadata["document_title"],
                    chunk_index=int(metadata["chunk_index"]),
                    score=float(score if score is not None else rank),
                    content=document.page_content,
                    citations=metadata.get("citations", []),
                    source_uri=metadata.get("source_uri"),
                    page_number=metadata.get("page_number"),
                )
            )
        return retrieved

