"""
轻量级首页数据端点 - 只返回首页卡片需要的核心数据
避免调用重量级的 detail API（47个第三方调用）
"""
from datetime import date
from fastapi import APIRouter, Request

from app.models.schemas import ApiEnvelope

router = APIRouter()

# 缓存：从 detail 模块共享缓存
def _get_xiaotie_cache():
    """获取台球缓存数据（如果有）"""
    try:
        from app.services.detail_xiaotie import _xiaotie_cache
        if _xiaotie_cache:
            return _xiaotie_cache
    except Exception:
        pass
    return None

def _get_wu_laoban_cache():
    """获取棋牌缓存数据（如果有）"""
    try:
        from app.services.detail_wu_laoban import _wu_laoban_cache
        if _wu_laoban_cache:
            return _wu_laoban_cache
    except Exception:
        pass
    return None


def _cinema_monthly_yearly(repository) -> dict:
    """从 daily_snapshots 聚合影院的月度/年度数据"""
    today = date.today()
    month_start = today.replace(day=1).isoformat()
    year_start = today.replace(month=1, day=1).isoformat()
    today_str = today.isoformat()
    
    # 查询当月数据
    month_snapshots = repository.daily_snapshots_for(
        "cinema", "fenghuang", "cinema_feicuicheng",
        days=31, max_date=today_str, start_date=month_start
    )
    # 查询当年数据
    year_snapshots = repository.daily_snapshots_for(
        "cinema", "fenghuang", "cinema_feicuicheng",
        days=366, max_date=today_str, start_date=year_start
    )
    
    month_revenue = sum(s.get("revenue", 0) or 0 for s in month_snapshots)
    month_customers = sum(s.get("customer_count", 0) or 0 for s in month_snapshots)
    year_revenue = sum(s.get("revenue", 0) or 0 for s in year_snapshots)
    year_customers = sum(s.get("customer_count", 0) or 0 for s in year_snapshots)
    
    return {
        "summary_month": {
            "revenue": round(month_revenue, 2),
            "customer_count": month_customers,
        },
        "summary_year": {
            "revenue": round(year_revenue, 2),
            "customer_count": year_customers,
        },
    }


@router.get("/quick-stats")
def quick_stats(request: Request) -> dict:
    """
    首页快速数据 - 只返回卡片需要的核心字段
    如果缓存中有 detail 数据，直接提取关键字段返回
    如果没有缓存，返回 null，前端可以异步加载
    """
    xiaotie = _get_xiaotie_cache()
    wu_laoban = _get_wu_laoban_cache()
    repository = request.app.state.repository
    
    result = {
        "xiaotie": None,
        "wu_laoban": None,
        "cinema": None,
        "has_detail_cache": False,
    }
    
    if xiaotie:
        result["has_detail_cache"] = True
        result["xiaotie"] = {
            "busy_count": xiaotie.get("busy_count", 0),
            "total_count": xiaotie.get("total_count", 0),
            "summary_month": {
                "revenue": xiaotie.get("summary_month", {}).get("revenue", 0),
            },
            "summary_year": {
                "revenue": xiaotie.get("summary_year", {}).get("revenue", 0),
            },
        }
    
    if wu_laoban:
        result["has_detail_cache"] = True
        result["wu_laoban"] = {
            "active_orders": wu_laoban.get("busy_count", 0),
            "total_rooms": wu_laoban.get("total_rooms", 0),
            "summary_month": {
                "revenue": wu_laoban.get("summary_month", {}).get("revenue", 0),
            },
            "summary_year": {
                "revenue": wu_laoban.get("summary_year", {}).get("revenue", 0),
            },
        }
    
    # 影院月度/年度数据（从 daily_snapshots 聚合）
    try:
        cinema_stats = _cinema_monthly_yearly(repository)
        result["cinema"] = cinema_stats
    except Exception as e:
        print(f"[quick_stats] 影院数据聚合失败: {e}")
        result["cinema"] = {
            "summary_month": {"revenue": 0, "customer_count": 0},
            "summary_year": {"revenue": 0, "customer_count": 0},
        }
    
    return result


@router.post("/detail/refresh")
def refresh_detail() -> dict:
    """
    手动触发 detail 数据刷新（后台任务）
    前端可以调用这个端点来触发后台刷新，而不阻塞页面加载
    """
    import threading
    
    def _refresh():
        try:
            from app.services.detail_xiaotie import get_xiaotie_full_detail
            from app.services.detail_wu_laoban import get_wu_laoban_full_detail
            get_xiaotie_full_detail()
            get_wu_laoban_full_detail()
        except Exception as e:
            print(f"[refresh_detail] 后台刷新失败: {e}")
    
    # 在后台线程中执行，不阻塞响应
    thread = threading.Thread(target=_refresh, daemon=True)
    thread.start()
    
    return {"status": "ok", "message": "后台刷新已启动"}
