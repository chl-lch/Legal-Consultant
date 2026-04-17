import json
from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LexiCounsel API"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"
    database_url: str
    upload_dir: str = "/app/data/uploads"
    faiss_index_path: str = "/app/data/indexes/faiss"
    bm25_index_path: str = "/app/data/indexes/bm25_index.json"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    max_upload_size_mb: int = 50
    openai_embedding_model: str = "text-embedding-3-large"
    openai_base_url: str | None = None
    langsmith_api_key: str = ""
    langchain_tracing_v2: bool = False
    langchain_project: str = "LexiCounsel"
    rrf_k: int = 60
    default_top_k: int = 6
    chunk_size: int = 800
    chunk_overlap: int = 150
    evaluation_min_score: int = 7
    max_refinement_attempts: int = 1
    cors_origins: str = "http://localhost:3000"
    request_timeout_seconds: int = 90
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_id: str = ""           # recurring price ID from Stripe dashboard
    stripe_price_amount: int = 2900     # in cents (e.g. 2900 = $29.00)
    stripe_price_currency: str = "usd"
    stripe_annual_price_id: str = ""        # annual recurring price ID (optional)
    stripe_annual_price_amount: int = 29000 # in cents (e.g. 29000 = $290/year)
    app_base_url: str = "http://localhost:3000"
    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "noreply@lexicounsel.io"

    @computed_field
    @property
    def cors_origins_list(self) -> list[str]:
        value = self.cors_origins.strip()
        if not value:
            return ["http://localhost:3000"]
        if value.startswith("["):
            return [item.strip() for item in json.loads(value) if item.strip()]
        return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
