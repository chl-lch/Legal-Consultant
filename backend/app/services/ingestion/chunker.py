from dataclasses import dataclass

import tiktoken
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import get_settings
from app.services.ingestion.loaders import LegalDocumentPayload


settings = get_settings()
encoding = tiktoken.get_encoding("cl100k_base")


@dataclass(slots=True)
class ChunkingStrategy:
    chunk_size: int
    chunk_overlap: int


def _count_tokens(text: str) -> int:
    return len(encoding.encode(text))


def build_chunks(
    payload: LegalDocumentPayload,
    strategy: ChunkingStrategy | None = None,
) -> list[dict]:
    strategy = strategy or ChunkingStrategy(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        chunk_size=strategy.chunk_size,
        chunk_overlap=strategy.chunk_overlap,
        separators=["\n\n", "\n", ". ", "; ", " "],
    )
    chunk_rows: list[dict] = []
    chunk_index = 0
    for section in payload.sections:
        for chunk in splitter.split_text(section.text):
            citation = {"page_number": section.page_number} if section.page_number else {}
            chunk_rows.append(
                {
                    "chunk_index": chunk_index,
                    "content": chunk,
                    "token_count": _count_tokens(chunk),
                    "page_number": section.page_number,
                    "citations": [citation] if citation else [],
                    "metadata_json": {
                        **payload.metadata_json,
                        **section.metadata,
                    },
                }
            )
            chunk_index += 1
    return chunk_rows

