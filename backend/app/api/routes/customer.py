"""
客户分析 API
RFM模型 / 复购率 / 消费变化
"""
from fastapi import APIRouter, Query

from app.services.customer_analysis import (
    calculate_rfm_mahjong,
    calculate_rfm_billiards,
    calculate_repurchase_mahjong,
    calculate_consumption_trend_mahjong,
)

router = APIRouter()


@router.get("/customer/rfm")
def get_rfm(
    platform: str = Query(default="mahjong", pattern="^(mahjong|billiards)$"),
    days: int = Query(default=90, ge=7, le=365),
) -> dict:
    """获取RFM客户分层分析"""
    if platform == "mahjong":
        return calculate_rfm_mahjong(days)
    return calculate_rfm_billiards()


@router.get("/customer/repurchase")
def get_repurchase(
    months: int = Query(default=6, ge=2, le=12),
) -> dict:
    """获取复购率趋势（按月 cohort）"""
    return calculate_repurchase_mahjong(months)


@router.get("/customer/trend")
def get_consumption_trend() -> dict:
    """获取消费变化趋势（本月 vs 上月）"""
    return calculate_consumption_trend_mahjong()
