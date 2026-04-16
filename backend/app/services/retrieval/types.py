from dataclasses import asdict, dataclass


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_title: str
    chunk_index: int
    score: float
    content: str
    citations: list[dict]
    source_uri: str | None = None
    page_number: int | None = None

    def to_dict(self) -> dict:
        return asdict(self)

