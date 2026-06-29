"""
卖品推荐 API
卖品组合 / 品类分析
"""
from fastapi import APIRouter, HTTPException, Request

from app.services.concession_recommendations import (
    analyze_concession_combinations,
    generate_concession_suggestions,
)

router = APIRouter()


@router.get("/concession/recommendations")
def get_concession_recommendations(request: Request) -> dict:
    """获取卖品推荐"""
    try:
        return generate_concession_suggestions(request.app.state.repository)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取卖品推荐失败: {exc}") from exc


@router.get("/concession/analysis")
def get_concession_analysis(request: Request) -> dict:
    """获取品类分析"""
    try:
        return analyze_concession_combinations(request.app.state.repository)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"获取品类分析失败: {exc}") from exc
