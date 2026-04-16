from functools import lru_cache

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from app.core.config import get_settings


settings = get_settings()


def has_llm_credentials() -> bool:
    return bool(settings.openai_api_key)


@lru_cache
def get_chat_llm(temperature: float = 0.0) -> ChatOpenAI:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for LLM workflows.")
    return ChatOpenAI(
        model=settings.openai_model,
        temperature=temperature,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        timeout=settings.request_timeout_seconds,
    )


@lru_cache
def get_embeddings() -> OpenAIEmbeddings:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is required for embeddings.")
    return OpenAIEmbeddings(
        model=settings.openai_embedding_model,
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url or None,
        request_timeout=settings.request_timeout_seconds,
    )

