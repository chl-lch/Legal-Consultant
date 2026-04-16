import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, HttpUrl

from app.models.document import DocumentStatus, SourceType


class DocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    source_type: SourceType
    source_uri: str | None
    mime_type: str | None
    status: DocumentStatus
    metadata_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class UrlIngestionRequest(BaseModel):
    url: HttpUrl
    title: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict)

