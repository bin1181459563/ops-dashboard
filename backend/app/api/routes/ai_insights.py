"""
AI洞察 API
包含经营异常预警、自动经营日报/周报/月报
"""
from fastapi import APIRouter, Request, Query
from app.services.ai_insights import (
    analyze_anomalies,
    generate_daily_report,
    generate_weekly_report,
    generate_monthly_report,
)
from app.services.revenue_forecast import forecast_revenue
from app.services.cross_business import analyze_cross_business

router = APIRouter()


@router.get("/ai/anomalies")
def get_anomalies(request: Request) -> dict:
    """获取经营异常预警"""
    repository = request.app.state.repository
    result = analyze_anomalies(repository)
    return result


@router.get("/ai/daily-report")
def get_daily_report(request: Request) -> dict:
    """获取今日经营日报"""
    repository = request.app.state.repository
    result = generate_daily_report(repository)
    result["report_type"] = "daily"
    result["title"] = f"翡翠城经营日报 {result.get('report_date', '')}"
    return result


@router.get("/ai/weekly-report")
def get_weekly_report(request: Request) -> dict:
    """获取本周经营周报（真实聚合7天数据）"""
    repository = request.app.state.repository
    result = generate_weekly_report(repository)
    result["title"] = "翡翠城经营周报"
    return result


@router.get("/ai/monthly-report")
def get_monthly_report(request: Request) -> dict:
    """获取本月经营月报"""
    repository = request.app.state.repository
    result = generate_monthly_report(repository)
    result["title"] = "翡翠城经营月报"
    return result


@router.get("/ai/revenue-forecast")
def get_revenue_forecast(request: Request) -> dict:
    """收入预测：基于历史数据预测未来7天/30天营收"""
    repository = request.app.state.repository
    result = forecast_revenue(repository)
    return result


@router.get("/ai/cross-business")
def get_cross_business(request: Request) -> dict:
    """多业务联动分析：台球+棋牌+影院交叉营销建议"""
    repository = request.app.state.repository
    result = analyze_cross_business(repository)
    return result
