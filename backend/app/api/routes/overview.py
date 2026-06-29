from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, Request

from app.models.schemas import ApiEnvelope
from app.core.config import settings
from app.services.cinema_excel import cinema_overview
from app.services.collectors.xiaotie import check_xiaotie_token
from app.services.collectors.wu_laoban import check_wu_laoban_token

router = APIRouter()


@router.get("/overview")
def overview(request: Request) -> ApiEnvelope:
    repository = request.app.state.repository
    # 只取今天的快照，避免把昨日fallback数据混入主页面卡片
    latest_revenue = repository.latest_revenue(today_only=True)
    latest_orders = repository.latest_orders(today_only=True)
    latest_usage = repository.latest_usage(today_only=True)
    platforms = _latest_platform_metrics(latest_revenue, latest_orders, latest_usage)
    source_status = _source_status(repository, platforms)
    included_platforms = [
        platform
        for platform, item in platforms.items()
        if source_status.get(platform, {}).get("status") == "ok" and item.get("source") == "api"
    ]
    excluded_platforms = [
        platform
        for platform, status in source_status.items()
        if status.get("status") != "ok" or (platform in platforms and platforms[platform].get("source") != "api")
    ]
    total_revenue = sum(platforms[platform].get("revenue", 0) for platform in included_platforms)
    total_orders = sum(platforms[platform].get("orders", 0) for platform in included_platforms)
    sources = [platforms[platform].get("source", "api") for platform in included_platforms]
    
    # 影院以数据库营业日快照为准，取截至今天的最新可用快照
    cinema = cinema_overview(repository)
    
    if cinema["status"] == "ok":
        total_revenue += cinema.get("revenue", 0)
        total_orders += cinema.get("screenings", 0)
        if "cinema" not in included_platforms:
            included_platforms.append("cinema")
        if "cinema" in excluded_platforms:
            excluded_platforms.remove("cinema")
        sources.append("database")

    return ApiEnvelope(
        data={
            "store_id": "feicuicheng",
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "included_platforms": included_platforms,
            "excluded_platforms": excluded_platforms,
            "source_status": source_status,
            "last_sync_time": _latest_sync_time(repository, platforms),
            "platforms": platforms,
            "cinema": cinema,
            "alerts": repository.latest_alerts(5),
        },
        source=_combine_sources(sources),
    )


@router.get("/token-status")
def token_status() -> dict:
    """检查所有平台的token状态"""
    xiaotie_status = check_xiaotie_token()
    wu_laoban_status = check_wu_laoban_token()

    return {
        "xiaotie": xiaotie_status,
        "wu_laoban": wu_laoban_status,
    }


@router.post("/token/xiaotie/update")
def update_xiaotie_token(payload: Any = Body(...)) -> dict:
    token = str(payload.get("token", "") if isinstance(payload, dict) else payload).strip()
    if not token:
        return {"success": False, "message": "token不能为空"}
    token_file: Path = settings.xiaotie_token_file
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(token, encoding="utf-8")
    return {"success": True, "message": "小铁 token 已更新，可手动触发采集"}


def _latest_platform_metrics(revenue_rows: list[dict], order_rows: list[dict], usage_rows: list[dict]) -> dict:
    platforms: dict[str, dict] = {}
    for row in revenue_rows:
        if row["platform"] not in platforms:
            platforms[row["platform"]] = dict(row)
    for row in order_rows:
        platforms.setdefault(row["platform"], {})
        if "orders" not in platforms[row["platform"]]:
            platforms[row["platform"]].update({"orders": row["orders"], "order_time": row["time"]})
    for row in usage_rows:
        platforms.setdefault(row["platform"], {})
        if "usage_rate" not in platforms[row["platform"]]:
            platforms[row["platform"]].update({"usage_rate": row["usage_rate"], "usage_time": row["time"]})
    return platforms


def _combine_sources(sources: list[str]) -> str:
    if not sources:
        return "none"
    unique = set(sources)
    return unique.pop() if len(unique) == 1 else "mixed"


def _source_status(repository, platforms: dict) -> dict:
    wu_status = check_wu_laoban_token()
    xiaotie_status = check_xiaotie_token()
    cinema = cinema_overview(repository)
    status = {
        "wu_laoban": {
            "status": "ok" if wu_status.get("valid") and platforms.get("wu_laoban", {}).get("source") == "api" else "sync_failed",
            "data_source": platforms.get("wu_laoban", {}).get("source", "api"),
            "last_sync_time": repository.last_successful_sync_time("wu_laoban") or platforms.get("wu_laoban", {}).get("time"),
            "message": "正常" if wu_status.get("valid") else wu_status.get("error") or "棋牌暂无可用真实数据",
        },
        "xiaotie": {
            "status": "ok" if xiaotie_status.get("valid") and platforms.get("xiaotie", {}).get("source") == "api" else "token_invalid",
            "data_source": platforms.get("xiaotie", {}).get("source", "api"),
            "last_sync_time": repository.last_successful_sync_time("xiaotie") or platforms.get("xiaotie", {}).get("time"),
            "message": "正常" if xiaotie_status.get("valid") else "小铁 token 已失效，请重新抓取 token 后更新。",
        },
        "cinema": {
            "status": cinema["status"],
            "data_source": "database",
            "last_sync_time": cinema.get("last_import_time"),
            "message": cinema["message"],
        },
    }
    for platform, item in platforms.items():
        if item.get("source") != "api" and platform in status:
            status[platform]["status"] = "placeholder"
            status[platform]["message"] = "当前仅有占位数据，未计入总收入"
    return status


def _latest_sync_time(repository, platforms: dict) -> str | None:
    times = []
    for platform, item in platforms.items():
        last_success = repository.last_successful_sync_time(platform)
        if last_success:
            times.append(last_success)
        elif item.get("time"):
            times.append(item["time"])
    return max(times) if times else None
