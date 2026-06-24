from fastapi import APIRouter, Request

from app.models.schemas import ApiEnvelope

router = APIRouter()


@router.get("/alerts")
def alerts(request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=request.app.state.repository.latest_alerts(), source="api")

