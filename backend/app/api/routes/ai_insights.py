"""
AI洞察 API
包含经营异常预警、自动经营日报/周报/月报
"""
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel
from typing import Optional
from app.services.ai_insights import (
    analyze_anomalies,
    generate_daily_report,
    generate_weekly_report,
    generate_monthly_report,
)
from app.services.revenue_forecast import forecast_revenue, update_maoyan_boxoffice
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


# ============================================================
# 手动更新大盘数据
# ============================================================

class BoxofficePrediction(BaseModel):
    """单日大盘预测"""
    date: str  # 日期，如 "2026-06-26"
    total_box: float  # 大盘预测票房（万元）

class BoxofficeUpdate(BaseModel):
    """大盘数据更新请求"""
    predictions: list[BoxofficePrediction]  # 未来几天的预测数据

class BoxofficeBatchImport(BaseModel):
    """批量导入历史大盘数据"""
    data: list[BoxofficePrediction]  # 历史数据列表


@router.post("/ai/boxoffice")
def update_boxoffice(data: BoxofficeUpdate, request: Request) -> dict:
    """手动更新未来几天大盘预测数据，并计算影院预测"""
    from app.services.revenue_forecast import predict_cinema_from_boxoffice
    
    repository = request.app.state.repository
    
    # 保存大盘预测数据（持久化到数据库）
    for pred in data.predictions:
        update_maoyan_boxoffice(repository, pred.date, pred.total_box)
    
    # 计算影院预测
    cinema_predictions = predict_cinema_from_boxoffice(
        repository,
        [{"date": p.date, "total_box": p.total_box} for p in data.predictions]
    )
    
    return {
        "status": "ok",
        "boxoffice_predictions": [{"date": p.date, "total_box": p.total_box} for p in data.predictions],
        "cinema_predictions": cinema_predictions,
    }


@router.get("/ai/boxoffice")
def get_boxoffice(request: Request) -> dict:
    """获取当前大盘数据（从数据库读取）"""
    from app.services.revenue_forecast import get_maoyan_boxoffice
    repository = request.app.state.repository
    result = get_maoyan_boxoffice(repository)
    if result:
        return result
    return {"status": "no_data", "message": "暂无大盘数据"}


@router.post("/ai/boxoffice/batch")
def batch_import_boxoffice(data: BoxofficeBatchImport, request: Request) -> dict:
    """批量导入历史大盘数据，计算市占率"""
    from app.services.revenue_forecast import batch_import_boxoffice
    
    repository = request.app.state.repository
    
    # 批量导入（持久化到数据库）
    result = batch_import_boxoffice(repository, [{"date": p.date, "total_box": p.total_box} for p in data.data])
    
    return result


# ============================================================
# XGBoost 预测模型
# ============================================================

class XGBoostTrainRequest(BaseModel):
    business_type: str = "cinema"
    platform: str = "fenghuang"
    store_id: str = "cinema_feicuicheng"


class XGBoostPredictRequest(BaseModel):
    business_type: str = "cinema"
    platform: str = "fenghuang"
    store_id: str = "cinema_feicuicheng"
    days: int = 7
    boxoffice_predictions: list[BoxofficePrediction] = []


@router.post("/ai/xgboost/train")
def train_xgboost_model(data: XGBoostTrainRequest, request: Request) -> dict:
    """训练 XGBoost 预测模型"""
    from app.services.xgboost_predictor import train_model
    
    repository = request.app.state.repository
    
    # 获取大盘数据
    box_office_data = repository.get_box_office_dict(days=180)
    
    result = train_model(
        repository,
        data.business_type,
        data.platform,
        data.store_id,
        box_office_data,
    )
    
    return result


@router.post("/ai/xgboost/predict")
def predict_with_xgboost(data: XGBoostPredictRequest, request: Request) -> dict:
    """使用 XGBoost 模型预测"""
    from app.services.xgboost_predictor import predict_with_xgboost
    
    repository = request.app.state.repository
    
    # 准备大盘预测数据
    boxoffice_predictions = None
    if data.boxoffice_predictions:
        boxoffice_predictions = [{"date": p.date, "total_box": p.total_box} for p in data.boxoffice_predictions]
    
    result = predict_with_xgboost(
        repository,
        data.business_type,
        data.platform,
        data.store_id,
        data.days,
        boxoffice_predictions,
    )
    
    return result


@router.get("/ai/xgboost/info")
def get_xgboost_info(
    business_type: str = "cinema",
    platform: str = "fenghuang",
    store_id: str = "cinema_feicuicheng",
) -> dict:
    """获取 XGBoost 模型信息"""
    from app.services.xgboost_predictor import get_model_info
    
    return get_model_info(business_type, platform, store_id)
