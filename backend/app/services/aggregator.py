from datetime import datetime, timezone, timedelta
from typing import Any

from app.models.schemas import UnifiedMetric

# 北京时间时区
BEIJING_TZ = timezone(timedelta(hours=8))


def _parse_time(value: Any) -> datetime:
    """解析时间字符串，确保返回北京时间"""
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value)
    else:
        raise ValueError("raw metric time is required")
    
    # 如果是UTC时间，转换为北京时间
    if dt.tzinfo is not None and dt.tzinfo.utcoffset(dt) == timedelta(0):
        dt = dt.astimezone(BEIJING_TZ)
    # 如果没有时区信息，假设是北京时间
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=BEIJING_TZ)
    
    return dt


def _usage_rate(occupied: float, total: float) -> float:
    if total <= 0:
        return 0
    return round(occupied / total, 4)


def aggregate_xiaotie(raw: dict[str, Any]) -> UnifiedMetric:
    summary = raw.get("summary", {})
    tables = raw.get("tables", {})
    return UnifiedMetric(
        platform="xiaotie",
        store_id="feicuicheng",
        revenue=float(summary.get("total_amount", 0)),
        orders=int(summary.get("order_count", 0)),
        usage_rate=_usage_rate(float(tables.get("busy", 0)), float(tables.get("total", 0))),
        time=_parse_time(raw.get("time")),
        source=raw.get("source", "mock"),
    )


def aggregate_wu_laoban(raw: dict[str, Any]) -> UnifiedMetric:
    overview = raw.get("overview", {})
    rooms = raw.get("rooms", {})
    return UnifiedMetric(
        platform="wu_laoban",
        store_id="feicuicheng",
        revenue=float(overview.get("paid_amount", 0)),
        orders=int(overview.get("orders", 0)),
        usage_rate=_usage_rate(float(rooms.get("occupied", 0)), float(rooms.get("total", 0))),
        time=_parse_time(raw.get("time")),
        source=raw.get("source", "mock"),
    )


def aggregate_qgcloud(raw: dict[str, Any]) -> UnifiedMetric:
    """轻购云售卖机聚合"""
    today = raw.get("today", {})
    return UnifiedMetric(
        platform="qgcloud",
        store_id="feicuicheng",
        revenue=float(today.get("amount", 0)),
        orders=int(today.get("count", 0)),
        usage_rate=0.0,  # 售卖机无使用率概念
        time=_parse_time(raw.get("time")),
        source=raw.get("source", "mock"),
    )

