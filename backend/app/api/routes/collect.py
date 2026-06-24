from fastapi import APIRouter, Query, Request

from app.models.schemas import ApiEnvelope

router = APIRouter()


@router.post("/collect/run")
def run_collect(request: Request) -> ApiEnvelope:
    result = request.app.state.collection_job.run_once()
    return ApiEnvelope(data=result, source=result.get("source", "mixed"))


@router.get("/collect/history")
def collect_history(request: Request, limit: int = Query(default=10, ge=1, le=50)) -> ApiEnvelope:
    runs = request.app.state.repository.latest_collection_runs(limit=limit)
    return ApiEnvelope(data=runs, source="api" if runs else "none")
