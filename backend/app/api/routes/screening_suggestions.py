"""
排片建议 API
排片优化 / 场次分析
"""
from fastapi import APIRouter, HTTPException, Query, Request

from app.services.screening_suggestions import (
    analyze_screening_performance,
    generate_screening_suggestions,
)

router = APIRouter()


@router.get("/cinema/screening-suggestions")
def get_screening_suggestions(
    request: Request,
    days: int = Query(default=30, ge=7, le=90),
) -> dict:
    """获取排片建议"""
    try:
        repository = request.app.state.repository
        return generate_screening_suggestions(repository, days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取排片建议失败: {exc}") from exc


@router.get("/cinema/screening-analysis")
def get_screening_analysis(
    request: Request,
    days: int = Query(default=30, ge=7, le=90),
) -> dict:
    """获取场次分析"""
    try:
        repository = request.app.state.repository
        return analyze_screening_performance(repository, days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取场次分析失败: {exc}") from exc
