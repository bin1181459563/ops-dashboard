"""
数据可信度中心服务
检查3个数据源的状态：凤凰云智(影院)、小铁(台球)、無老板(棋牌)
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.database import DashboardRepository
from app.services.collectors.xiaotie import check_xiaotie_token
from app.services.collectors.wu_laoban import check_wu_laoban_token


def _now_beijing() -> datetime:
    """获取当前北京时间 (UTC+8)"""
    return datetime.now(timezone(timedelta(hours=8)))


def _calc_freshness(last_update: str | None, data_source: str = "api") -> dict[str, Any]:
    """
    计算数据新鲜度
    data_source: "api" (实时API) 或 "excel_upload" (Excel导入)
    返回: {"freshness": "fresh|delayed|stale|pending", "label": "...", "minutes_ago": int|None, "note": "..."}
    """
    now = _now_beijing()
    today_str = now.strftime("%Y-%m-%d")
    
    if not last_update:
        if data_source == "excel_upload":
            return {
                "freshness": "pending",
                "label": "待导入",
                "minutes_ago": None,
                "note": f"今日({today_str})尚未导入Excel数据"
            }
        return {"freshness": "stale", "label": "无数据", "minutes_ago": None, "note": "无数据"}

    try:
        last_dt = datetime.fromisoformat(last_update)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone(timedelta(hours=8)))
        minutes_ago = int((now - last_dt).total_seconds() / 60)
        
        # 获取最后更新的日期
        last_date_str = last_dt.strftime("%Y-%m-%d")
        is_today = last_date_str == today_str
        
        # Excel导入模式的特殊逻辑
        if data_source == "excel_upload":
            if is_today:
                # 今天已导入，状态正常
                return {
                    "freshness": "fresh",
                    "label": "今日已导入",
                    "minutes_ago": minutes_ago,
                    "note": f"数据范围包含今日({today_str})"
                }
            else:
                # 今天未导入，但昨天有数据
                days_ago = (now.date() - last_dt.date()).days
                if days_ago == 1:
                    return {
                        "freshness": "delayed",
                        "label": "昨日数据",
                        "minutes_ago": minutes_ago,
                        "note": f"最后导入日期: {last_date_str}，今日({today_str})尚未导入"
                    }
                else:
                    return {
                        "freshness": "stale",
                        "label": f"{days_ago}天前",
                        "minutes_ago": minutes_ago,
                        "note": f"最后导入日期: {last_date_str}，已过{days_ago}天"
                    }
        
        # 实时API模式的逻辑
        if minutes_ago <= 60:
            return {"freshness": "fresh", "label": "实时", "minutes_ago": minutes_ago, "note": None}
        elif minutes_ago <= 360:
            return {"freshness": "delayed", "label": "延迟", "minutes_ago": minutes_ago, "note": None}
        else:
            return {"freshness": "stale", "label": "过期", "minutes_ago": minutes_ago, "note": None}
    except Exception:
        return {"freshness": "stale", "label": "解析失败", "minutes_ago": None, "note": None}


def _determine_status(token_valid: bool, freshness: str, sync_status: str | None) -> dict[str, str]:
    """
    综合判断数据源状态
    返回: {"status": "normal|warning|error", "status_label": "..."}
    """
    if not token_valid:
        return {"status": "error", "status_label": "Token失效"}

    if sync_status == "failed":
        return {"status": "error", "status_label": "同步失败"}

    # pending状态：今日未导入，但不算异常
    if freshness == "pending":
        return {"status": "warning", "status_label": "待导入"}

    # stale状态：对于Excel导入模式，可能是正常的
    if freshness == "stale":
        return {"status": "warning", "status_label": "数据过期"}

    if freshness == "delayed":
        return {"status": "warning", "status_label": "数据延迟"}

    return {"status": "normal", "status_label": "正常"}


def check_cinema_data_quality(repository: DashboardRepository) -> dict[str, Any]:
    """
    检查影院(凤凰云智)数据源状态
    数据来源: daily_snapshots表 + sync_logs表
    """
    # 从daily_snapshots查询影院最新数据
    latest_snapshot = repository.latest_daily_snapshot_for(
        business_type="cinema",
        platform="fenghuang",  # 凤凰云智的platform是fenghuang
        store_id="cinema_feicuicheng",
    )
    last_update = latest_snapshot["created_at"] if latest_snapshot else None
    snapshot_date = latest_snapshot["date"] if latest_snapshot else None

    # 从sync_logs查询影院同步状态
    sync_log = repository.latest_sync_log_for_platform("fenghuang")  # 凤凰云智的platform是fenghuang
    sync_status = sync_log["status"] if sync_log else None
    sync_message = sync_log["message"] if sync_log else None

    # 影院数据是Excel导入模式
    freshness_info = _calc_freshness(last_update, data_source="excel_upload")
    # 影院数据通过Excel上传，不依赖token，假设token总是有效
    status_info = _determine_status(
        token_valid=True,
        freshness=freshness_info["freshness"],
        sync_status=sync_status,
    )

    return {
        "platform": "cinema",
        "business_type": "cinema",
        "name": "凤凰云智(影院)",
        "data_source": "excel_upload",
        "last_update": last_update,
        "snapshot_date": snapshot_date,
        "freshness": freshness_info["freshness"],
        "freshness_label": freshness_info["label"],
        "minutes_ago": freshness_info["minutes_ago"],
        "freshness_note": freshness_info.get("note"),  # 新增：新鲜度说明
        "token_valid": True,
        "token_error": None,
        "sync_status": sync_status,
        "sync_message": sync_message,
        "status": status_info["status"],
        "status_label": status_info["status_label"],
        "snapshot": {
            "revenue": latest_snapshot["revenue"] if latest_snapshot else 0,
            "orders": latest_snapshot["orders"] if latest_snapshot else 0,
            "usage_rate": latest_snapshot["usage_rate"] if latest_snapshot else 0,
            "customer_count": latest_snapshot["customer_count"] if latest_snapshot else 0,
        } if latest_snapshot else None,
    }


def check_xiaotie_data_quality(repository: DashboardRepository) -> dict[str, Any]:
    """
    检查小铁(台球)数据源状态
    数据来源: xiaotie API实时获取 + daily_snapshots表 + sync_logs表
    """
    # 检查token有效性
    token_check = check_xiaotie_token()
    token_valid = token_check.get("valid", False)
    token_error = token_check.get("error")

    # 从sync_logs查询同步状态
    sync_log = repository.latest_sync_log_for_platform("xiaotie")
    sync_status = sync_log["status"] if sync_log else None
    sync_message = sync_log["message"] if sync_log else None

    # 从daily_snapshots查询最新数据
    latest_snapshot = repository.latest_daily_snapshot_for(
        business_type="billiards",
        platform="xiaotie",
        store_id="feicuicheng",
    )
    last_update = latest_snapshot["created_at"] if latest_snapshot else None
    snapshot_date = latest_snapshot["date"] if latest_snapshot else None

    freshness_info = _calc_freshness(last_update)
    status_info = _determine_status(
        token_valid=token_valid,
        freshness=freshness_info["freshness"],
        sync_status=sync_status,
    )

    return {
        "platform": "xiaotie",
        "business_type": "billiards",
        "name": "小铁(台球)",
        "data_source": "api",
        "last_update": last_update,
        "snapshot_date": snapshot_date,
        "freshness": freshness_info["freshness"],
        "freshness_label": freshness_info["label"],
        "minutes_ago": freshness_info["minutes_ago"],
        "token_valid": token_valid,
        "token_error": token_error,
        "sync_status": sync_status,
        "sync_message": sync_message,
        "status": status_info["status"],
        "status_label": status_info["status_label"],
        "snapshot": {
            "revenue": latest_snapshot["revenue"] if latest_snapshot else 0,
            "orders": latest_snapshot["orders"] if latest_snapshot else 0,
            "usage_rate": latest_snapshot["usage_rate"] if latest_snapshot else 0,
            "customer_count": latest_snapshot["customer_count"] if latest_snapshot else 0,
        } if latest_snapshot else None,
    }


def check_wu_laoban_data_quality(repository: DashboardRepository) -> dict[str, Any]:
    """
    检查無老板(棋牌)数据源状态
    数据来源: wu_laoban API实时获取 + daily_snapshots表 + sync_logs表
    """
    # 检查token有效性
    token_check = check_wu_laoban_token()
    token_valid = token_check.get("valid", False)
    token_error = token_check.get("error")

    # 从sync_logs查询同步状态
    sync_log = repository.latest_sync_log_for_platform("wu_laoban")
    sync_status = sync_log["status"] if sync_log else None
    sync_message = sync_log["message"] if sync_log else None

    # 从daily_snapshots查询最新数据
    latest_snapshot = repository.latest_daily_snapshot_for(
        business_type="mahjong",
        platform="wu_laoban",
        store_id="feicuicheng",
    )
    last_update = latest_snapshot["created_at"] if latest_snapshot else None
    snapshot_date = latest_snapshot["date"] if latest_snapshot else None

    freshness_info = _calc_freshness(last_update)
    status_info = _determine_status(
        token_valid=token_valid,
        freshness=freshness_info["freshness"],
        sync_status=sync_status,
    )

    return {
        "platform": "wu_laoban",
        "business_type": "mahjong",
        "name": "無老板(棋牌)",
        "data_source": "api",
        "last_update": last_update,
        "snapshot_date": snapshot_date,
        "freshness": freshness_info["freshness"],
        "freshness_label": freshness_info["label"],
        "minutes_ago": freshness_info["minutes_ago"],
        "token_valid": token_valid,
        "token_error": token_error,
        "sync_status": sync_status,
        "sync_message": sync_message,
        "status": status_info["status"],
        "status_label": status_info["status_label"],
        "snapshot": {
            "revenue": latest_snapshot["revenue"] if latest_snapshot else 0,
            "orders": latest_snapshot["orders"] if latest_snapshot else 0,
            "usage_rate": latest_snapshot["usage_rate"] if latest_snapshot else 0,
            "customer_count": latest_snapshot["customer_count"] if latest_snapshot else 0,
        } if latest_snapshot else None,
    }


def get_data_quality_report(repository: DashboardRepository) -> dict[str, Any]:
    """
    获取完整的数据可信度报告
    返回所有3个数据源的详细状态信息
    """
    cinema = check_cinema_data_quality(repository)
    xiaotie = check_xiaotie_data_quality(repository)
    wu_laoban = check_wu_laoban_data_quality(repository)

    sources = [cinema, xiaotie, wu_laoban]

    # 统计整体状态
    error_count = sum(1 for s in sources if s["status"] == "error")
    warning_count = sum(1 for s in sources if s["status"] == "warning")
    normal_count = sum(1 for s in sources if s["status"] == "normal")

    if error_count > 0:
        overall_status = "error"
        overall_label = "异常"
    elif warning_count > 0:
        overall_status = "warning"
        overall_label = "警告"
    else:
        overall_status = "normal"
        overall_label = "全部正常"

    return {
        "overall_status": overall_status,
        "overall_label": overall_label,
        "summary": {
            "total": len(sources),
            "normal": normal_count,
            "warning": warning_count,
            "error": error_count,
        },
        "sources": sources,
        "checked_at": _now_beijing().isoformat(),
    }
