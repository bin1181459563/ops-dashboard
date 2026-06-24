"""
客户分析 API
优质客户 / 正常客户 / 沉睡客户识别
"""
from fastapi import APIRouter, HTTPException

from app.services.customer_wake_up import analyze_customers

router = APIRouter()


@router.get("/customer/wake-up")
def get_customer_analysis() -> dict:
    """获取客户分析报告"""
    try:
        return analyze_customers()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
