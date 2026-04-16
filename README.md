# LexiCounsel

LexiCounsel is a production-oriented legal consultation assistant built with FastAPI, LangChain, hybrid retrieval, and a React operator console. The system ingests PDF and HTML legal materials, stores document metadata in PostgreSQL, persists dense vectors in FAISS, fuses them with BM25 lexical search, routes incoming consultations across four specialized legal workflows, and self-evaluates generated answers before returning them.

## Core capabilities

- FastAPI API with async PostgreSQL persistence and structured JSON logging
- PDF and HTML ingestion pipeline with configurable chunking defaults set to `800` tokens and `150` token overlap
- Hybrid retrieval using FAISS plus BM25 with reciprocal rank fusion
- Intent classifier covering `statute_lookup`, `clause_extraction`, `document_summarisation`, and `risk_assessment`
- LangChain tool-calling workflows for each legal intent
- Self-evaluation layer scoring citation accuracy, legal relevance, and hallucination risk with automatic retry
- Dockerized backend and frontend, local Docker Compose, and AWS EC2 deployment guidance
- LangSmith tracing support for step-level observability

## Repository layout

```text
backend/   FastAPI service, ingestion pipeline, retrieval, agent orchestration, tests
frontend/  React + TypeScript operator console
infra/     Nginx and AWS deployment assets
docs/      Architecture and deployment notes
scripts/   Operational and evaluation scripts
evaluation/ Benchmark schema for chunking experiments
```

## Quick start

1. Copy the env templates.
2. Start the stack with Docker Compose.
3. Upload legal materials through the UI or call the ingestion API.
4. Query the consultation endpoint.

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

The frontend is exposed on `http://localhost:3000` and proxies `/api` traffic to the FastAPI backend.

## Backend environment

Key runtime variables live in [backend/.env.example](/Users/liuchunhou/AI Project/LexiCounsel/backend/.env.example). The most important ones are:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBEDDING_MODEL`
- `LANGSMITH_API_KEY`
- `LANGCHAIN_TRACING_V2`
- `FAISS_INDEX_PATH`
- `BM25_INDEX_PATH`

## Production deployment

For AWS EC2 + RDS deployment, use the guidance in [docs/deployment.md](/Users/liuchunhou/AI Project/LexiCounsel/docs/deployment.md). In production, point `DATABASE_URL` at RDS PostgreSQL, mount persistent storage for `data/indexes` and `data/uploads`, and publish structured logs to your platform log pipeline.

