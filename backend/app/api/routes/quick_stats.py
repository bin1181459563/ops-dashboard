"""
轻量级首页数据端点 - 只返回首页卡片需要的核心数据
避免调用重量级的 detail API（47个第三方调用）
"""
from fastapi import APIRouter

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


@router.get("/quick-stats")
def quick_stats() -> dict:
    """
    首页快速数据 - 只返回卡片需要的核心字段
    如果缓存中有 detail 数据，直接提取关键字段返回
    如果没有缓存，返回 null，前端可以异步加载
    """
    xiaotie = _get_xiaotie_cache()
    wu_laoban = _get_wu_laoban_cache()
    
    result = {
        "xiaotie": None,
        "wu_laoban": None,
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
