"""
会员消费分析API
"""
from fastapi import APIRouter, Query

from app.services.member_analysis import get_member_analysis

router = APIRouter()


@router.get("/cinema/member-analysis")
def member_analysis(
    days: int = Query(default=30, ge=1, le=365),
) -> dict:
    """获取会员消费分析数据"""
    return get_member_analysis(days=days)
