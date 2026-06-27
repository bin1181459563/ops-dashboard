"""员工绩效 API"""
from fastapi import APIRouter, Query, Request

from app.services.employee_performance import get_employee_performance

router = APIRouter()


@router.get("/cinema/employee-performance")
def employee_performance(
    request: Request,
    start_date: str | None = Query(default=None, description="开始日期 YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="结束日期 YYYY-MM-DD"),
) -> dict:
    """获取员工绩效（卖品套餐+活动套餐+充值+开卡）
    数据来源: daily_snapshots 数据库
    start_date: 开始日期，None表示不限制
    end_date: 结束日期，None表示不限制
    """
    repo = request.app.state.repository
    return get_employee_performance(repo, start_date, end_date)
