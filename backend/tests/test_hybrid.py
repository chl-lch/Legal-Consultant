from app.services.retrieval.hybrid import reciprocal_rank_fusion
from app.services.retrieval.types import RetrievedChunk


def make_chunk(chunk_id: str, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id="doc-1",
        document_title="Example",
        chunk_index=0,
        score=score,
        content="content",
        citations=[],
    )


def test_reciprocal_rank_fusion_prefers_consensus_results() -> None:
    dense = [make_chunk("a", 0.9), make_chunk("b", 0.8), make_chunk("c", 0.7)]
    sparse = [make_chunk("b", 12.0), make_chunk("a", 11.0), make_chunk("d", 9.0)]

    results = reciprocal_rank_fusion([dense, sparse], k=60)

    assert [item.chunk_id for item in results[:3]] == ["a", "b", "c"] or [
        item.chunk_id for item in results[:3]
    ] == ["b", "a", "c"]
    assert "d" in [item.chunk_id for item in results]

