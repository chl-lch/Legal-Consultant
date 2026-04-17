from fastapi import APIRouter

from app.api.v1 import analysis, auth, billing, consultation, documents, health

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
api_router.include_router(documents.router, prefix="/documents", tags=["documents"])
api_router.include_router(consultation.router, prefix="/consultation", tags=["consultation"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])

