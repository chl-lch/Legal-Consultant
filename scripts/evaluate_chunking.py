#!/usr/bin/env python3
import argparse
import json
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.ingestion.chunker import ChunkingStrategy, build_chunks  # noqa: E402
from app.services.ingestion.loaders import LegalDocumentPayload, LoadedSection  # noqa: E402
from app.services.retrieval.bm25_store import Bm25Store  # noqa: E402


@dataclass
class BenchmarkResult:
    chunk_size: int
    chunk_overlap: int
    precision: float
    recall: float
    f1: float


def build_payload(record: dict) -> LegalDocumentPayload:
    return LegalDocumentPayload(
        title=record["title"],
        source_uri=record.get("source_uri"),
        mime_type="text/plain",
        sections=[
            LoadedSection(text=section["text"], page_number=None, metadata={"section_id": section["section_id"]})
            for section in record["sections"]
        ],
        metadata_json={},
    )


def score_strategy(benchmark: dict, strategy: ChunkingStrategy, top_k: int) -> BenchmarkResult:
    index_path = ROOT / "data" / "indexes" / f"bm25_benchmark_{strategy.chunk_size}_{strategy.chunk_overlap}.json"
    store = Bm25Store(str(index_path))
    serialized = []
    for document in benchmark["documents"]:
        payload = build_payload(document)
        document_chunks = build_chunks(payload, strategy=strategy)
        for chunk in document_chunks:
            serialized.append(
                {
                    "chunk_id": f"{document['document_id']}:{chunk['chunk_index']}",
                    "document_id": document["document_id"],
                    "document_title": document["title"],
                    "chunk_index": chunk["chunk_index"],
                    "content": chunk["content"],
                    "citations": chunk.get("citations", []),
                    "source_uri": document.get("source_uri"),
                    "page_number": chunk.get("page_number"),
                }
            )
    store.rebuild(serialized)

    precisions = []
    recalls = []
    f1_scores = []
    for query in benchmark["queries"]:
        retrieved = store.search(query["query"], top_k=top_k)
        hits = 0
        for item in retrieved:
            if any(snippet.lower() in item.content.lower() for snippet in query["expected_snippets"]):
                hits += 1
        precision = hits / max(len(retrieved), 1)
        recall = 1.0 if hits > 0 else 0.0
        f1 = 0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
        precisions.append(precision)
        recalls.append(recall)
        f1_scores.append(f1)
    return BenchmarkResult(
        chunk_size=strategy.chunk_size,
        chunk_overlap=strategy.chunk_overlap,
        precision=statistics.mean(precisions),
        recall=statistics.mean(recalls),
        f1=statistics.mean(f1_scores),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark chunking strategies for retrieval F1.")
    parser.add_argument(
        "--benchmark",
        default=str(ROOT / "evaluation" / "chunking_benchmark.example.json"),
        help="Path to the benchmark corpus JSON file.",
    )
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    benchmark = json.loads(Path(args.benchmark).read_text(encoding="utf-8"))
    strategies = [
        ChunkingStrategy(400, 50),
        ChunkingStrategy(800, 150),
        ChunkingStrategy(1200, 200),
    ]
    results = [score_strategy(benchmark, strategy, top_k=args.top_k) for strategy in strategies]
    print("chunk_size chunk_overlap precision recall f1")
    for result in results:
        print(
            f"{result.chunk_size:<10} {result.chunk_overlap:<13} "
            f"{result.precision:.3f} {result.recall:.3f} {result.f1:.3f}"
        )
    best = max(results, key=lambda item: item.f1)
    print(
        f"\nRecommended default: chunk_size={best.chunk_size}, "
        f"chunk_overlap={best.chunk_overlap} based on benchmark F1."
    )


if __name__ == "__main__":
    main()
