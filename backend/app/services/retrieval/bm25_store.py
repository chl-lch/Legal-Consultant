import json
from pathlib import Path

from rank_bm25 import BM25Okapi

from app.services.retrieval.types import RetrievedChunk


class Bm25Store:
    def __init__(self, index_path: str) -> None:
        self.index_path = Path(index_path)
        self.index_path.parent.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return text.lower().split()

    def rebuild(self, chunks: list[dict]) -> None:
        self.index_path.write_text(json.dumps(chunks, ensure_ascii=True, indent=2), encoding="utf-8")

    def search(self, query: str, top_k: int) -> list[RetrievedChunk]:
        if not self.index_path.exists():
            return []
        items = json.loads(self.index_path.read_text(encoding="utf-8"))
        if not items:
            return []
        tokenized_corpus = [self._tokenize(item["content"]) for item in items]
        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(self._tokenize(query))
        ranked = sorted(zip(items, scores, strict=False), key=lambda item: item[1], reverse=True)[:top_k]
        return [
            RetrievedChunk(
                chunk_id=str(item["chunk_id"]),
                document_id=str(item["document_id"]),
                document_title=item["document_title"],
                chunk_index=int(item["chunk_index"]),
                score=float(score),
                content=item["content"],
                citations=item.get("citations", []),
                source_uri=item.get("source_uri"),
                page_number=item.get("page_number"),
            )
            for item, score in ranked
        ]

