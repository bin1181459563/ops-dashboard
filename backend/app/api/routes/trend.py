from fastapi import APIRouter, Request
from typing import Optional

router = APIRouter()


@router.get("/trend/revenue")
def revenue_trend(
    request: Request,
    platform: Optional[str] = None,
    days: int = 7,
) -> dict:
    """获取收入趋势数据（按小时聚合）"""
    repository = request.app.state.repository

    if platform:
        trends = {platform: repository.get_hourly_revenue_all(platform, days)}
    else:
        trends = {
            "xiaotie": repository.get_hourly_revenue_all("xiaotie", days),
            "wu_laoban": repository.get_hourly_revenue_all("wu_laoban", days),
        }

    return {"trends": trends}


@router.get("/trend/orders")
def orders_trend(
    request: Request,
    platform: Optional[str] = None,
    days: int = 7,
) -> dict:
    """获取订单趋势数据（按小时聚合）"""
    repository = request.app.state.repository

    if platform:
        trends = {platform: repository.get_hourly_orders_all(platform, days)}
    else:
        trends = {
            "xiaotie": repository.get_hourly_orders_all("xiaotie", days),
            "wu_laoban": repository.get_hourly_orders_all("wu_laoban", days),
        }

    return {"trends": trends}


@router.get("/trend/hourly")
def hourly_revenue(
    request: Request,
    platform: str,
    date: Optional[str] = None,
) -> dict:
    """获取某天的每小时收入"""
    repository = request.app.state.repository
    hourly = repository.get_hourly_revenue(platform, date)
    return {"platform": platform, "hourly": hourly}
