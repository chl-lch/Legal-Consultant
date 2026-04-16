# Deployment

## Local container stack

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
```

## AWS EC2 + RDS production shape

1. Provision PostgreSQL on Amazon RDS.
2. Provision an EC2 instance with persistent EBS storage for `data/indexes` and `data/uploads`.
3. Copy the repository to the instance.
4. Set `DATABASE_URL` to the RDS endpoint.
5. Set `OPENAI_API_KEY`, `LANGSMITH_API_KEY`, `LANGCHAIN_TRACING_V2=true`, and `LANGCHAIN_PROJECT`.
6. Build and launch the containers with Docker Compose or your preferred orchestrator.
7. Put the frontend and backend behind an ALB or Nginx reverse proxy with TLS termination.

The backend container runs `alembic upgrade head` before starting Uvicorn. If you deploy outside Docker, run:

```bash
cd backend
DATABASE_URL=postgresql+asyncpg://... alembic upgrade head
```

## Recommended production configuration

- Run the backend with at least 2 vCPUs and enough RAM for your embedding model and FAISS index size
- Mount persistent volumes for `data/indexes` and `data/uploads`
- Terminate TLS upstream and restrict backend ingress to trusted sources
- Forward JSON logs to CloudWatch or another log platform
- Enable LangSmith tracing for step-by-step chain visibility
- Back up the PostgreSQL database and the EBS index volume separately

## Hardening notes

- Keep Alembic migrations in the release pipeline even though the container auto-applies them at boot
- Move ingestion into a durable job queue such as Celery or AWS SQS when processing large documents or high volume uploads
- Add authentication and tenant isolation before exposing the service to end users
- Add content retention rules if the corpus contains privileged or sensitive legal materials
