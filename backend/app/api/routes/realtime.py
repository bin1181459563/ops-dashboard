from fastapi import APIRouter, Request

from app.models.schemas import ApiEnvelope
from app.services.order_snapshots import collect_order_snapshots

router = APIRouter()


@router.get("/revenue/realtime")
def revenue_realtime(request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=request.app.state.repository.latest_revenue(), source="api")


@router.get("/orders/realtime")
def orders_realtime(request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=request.app.state.repository.latest_orders(), source="api")


@router.get("/orders/snapshots")
def order_snapshots() -> ApiEnvelope:
    return ApiEnvelope(data=collect_order_snapshots(), source="api")


@router.get("/usage/realtime")
def usage_realtime(request: Request) -> ApiEnvelope:
    return ApiEnvelope(data=request.app.state.repository.latest_usage(), source="api")
