"""
员工AI教练 API
员工分析 / 培训建议
"""
from fastapi import APIRouter, HTTPException

from app.services.employee_ai_coach import (
    analyze_employee_performance,
    generate_coaching_suggestions,
)

router = APIRouter()


@router.get("/employee/coach")
def get_employee_coach() -> dict:
    """获取员工分析"""
    try:
        return analyze_employee_performance()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取员工分析失败: {exc}") from exc


@router.get("/employee/coach/suggestions")
def get_coach_suggestions() -> dict:
    """获取培训建议"""
    try:
        return generate_coaching_suggestions()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取培训建议失败: {exc}") from exc
