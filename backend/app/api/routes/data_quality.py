"""
数据可信度中心 API
检查各数据源的状态和新鲜度
"""
from fastapi import APIRouter, Request
from app.services.data_quality import get_data_quality_report

router = APIRouter()


@router.get("/data-quality")
def get_data_quality(request: Request) -> dict:
    """获取数据可信度报告"""
    repository = request.app.state.repository
    report = get_data_quality_report(repository)
    return report


@router.get("/data-quality/summary")
def get_data_quality_summary(request: Request) -> dict:
    """获取数据可信度摘要（适合首页展示）"""
    repository = request.app.state.repository
    report = get_data_quality_report(repository)
    
    # 提取摘要信息
    sources = report.get("sources", [])
    summary = {
        "status": "ok",
        "total_sources": len(sources),
        "fresh_count": sum(1 for s in sources if s.get("freshness") == "fresh"),
        "delayed_count": sum(1 for s in sources if s.get("freshness") == "delayed"),
        "stale_count": sum(1 for s in sources if s.get("freshness") == "stale"),
        "error_count": sum(1 for s in sources if s.get("status") == "error"),
        "warning_count": sum(1 for s in sources if s.get("status") == "warning"),
        "sources": sources,
    }
    
    # 整体状态判断
    if summary["error_count"] > 0:
        summary["overall_status"] = "error"
    elif summary["warning_count"] > 0 or summary["stale_count"] > 0:
        summary["overall_status"] = "warning"
    else:
        summary["overall_status"] = "normal"
    
    return summary
