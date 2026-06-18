from fastapi import APIRouter
from app.core.config import settings

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health():
    return {"status": "ok", "env": settings.APP_ENV, "pacs_ae": settings.PACS_AE_TITLE}