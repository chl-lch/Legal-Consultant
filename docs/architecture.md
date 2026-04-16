# Architecture

## Backend flow

1. `POST /api/v1/documents/upload` or `POST /api/v1/documents/from-url`
2. Loader extracts text from PDF or HTML
3. Chunker applies the configured strategy, defaulting to `800` tokens with `150` overlap
4. Alembic-managed PostgreSQL tables persist document metadata and chunk records
5. Dense vectors are rebuilt into a local FAISS index and lexical documents are rebuilt into a BM25 JSON index
6. `POST /api/v1/consultation` classifies the request intent, routes it into a specialized LangChain tool-calling workflow, evaluates the answer, and retries once when evaluation thresholds are missed

## Storage model

- PostgreSQL stores document metadata and chunk records
- FAISS persists dense vector indexes on attached storage
- BM25 index data is serialized to disk for fast lexical fallback
- Uploads are stored on attached storage so the source corpus can be re-processed

## Agent orchestration

- `IntentClassifier` routes to one of four workflows
- `IntentWorkflowEngine` exposes retrieval and metadata tools to the LLM
- `AnswerEvaluator` scores citation accuracy, legal relevance, and hallucination safety on a 1-10 scale
- When any score drops below `EVALUATION_MIN_SCORE`, the workflow re-runs with evaluator feedback

## Observability

- JSON logs are emitted to stdout for shipping to CloudWatch, Datadog, or another collector
- LangSmith tracing is enabled via environment variables
- Each workflow step can be traced independently to identify retrieval failures and prompt weaknesses
