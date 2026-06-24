from fastapi import APIRouter, Query, Request

from app.models.schemas import ApiEnvelope

router = APIRouter()


@router.get("/sync/logs")
def sync_logs(request: Request, platform: str | None = Query(default=None), limit: int = Query(default=20, ge=1, le=100)) -> ApiEnvelope:
    repository = request.app.state.repository
    return ApiEnvelope(data=repository.latest_sync_logs(platform=platform, limit=limit), source="api")
