"""
审计日志 API
记录和查询系统操作日志
"""
from fastapi import APIRouter, Request, Query
from typing import Optional
from app.services.audit_log import log_operation, get_logs, get_log_stats

router = APIRouter()


@router.get("/audit/logs")
def get_audit_logs(
    request: Request,
    actor: Optional[str] = Query(default=None, description="操作者"),
    action: Optional[str] = Query(default=None, description="操作类型"),
    business_type: Optional[str] = Query(default=None, description="业务类型(cinema/billiards/mahjong)"),
    status: Optional[str] = Query(default=None, description="状态(success/fail)"),
    page: int = Query(default=1, ge=1, description="页码"),
    page_size: int = Query(default=50, ge=1, le=200, description="每页数量"),
) -> dict:
    """查询审计日志"""
    repository = request.app.state.repository
    result = get_logs(
        repository,
        actor=actor,
        action=action,
        business_type=business_type,
        status=status,
        page=page,
        page_size=page_size,
    )
    return result


@router.get("/audit/stats")
def get_audit_stats(
    request: Request,
    days: int = Query(default=7, ge=1, le=90, description="统计天数"),
) -> dict:
    """获取审计日志统计"""
    repository = request.app.state.repository
    result = get_log_stats(repository, days=days)
    return result


@router.post("/audit/log")
async def create_audit_log(request: Request) -> dict:
    """手动记录审计日志"""
    body = await request.json()
    repository = request.app.state.repository
    
    log_id = log_operation(
        repository,
        actor=body.get("actor", "user"),
        action=body.get("action", "unknown"),
        target_type=body.get("target_type"),
        target_id=body.get("target_id"),
        business_type=body.get("business_type"),
        status=body.get("status", "success"),
        request_payload=body.get("request_payload"),
        result_summary=body.get("result_summary"),
        error_message=body.get("error_message"),
    )
    
    return {"status": "ok", "log_id": log_id}
