import ssl
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.models.schemas import utc_now
from app.services.collectors.http_client import get_json_with_retry

ENDPOINTS = {
    "summary": "/api/system/stat/dashboards/new_summary/",
    "tables": "/api/system/device/tables/",
}


def check_xiaotie_token() -> dict:
    """
    检测小铁token是否有效
    返回: {"valid": bool, "error": str | None, "expires_in": float | None}
    """
    authorization = get_authorization()
    if not authorization:
        return {"valid": False, "error": "未配置token", "expires_in": None}

    try:
        # 调用一个轻量级API来验证token
        start, end = _today_range()
        result = _api_get(
            ENDPOINTS["summary"],
            {
                "node_id": settings.xiaotie_node_id,
                "date_type": "1",
                "node_type": "Site",
                "start_date": start,
                "end_date": end,
            },
            authorization,
        )
        # 如果能成功获取数据，说明token有效
        if "Result" in result:
            return {"valid": True, "error": None, "expires_in": None}
        else:
            return {"valid": False, "error": "API返回异常", "expires_in": None}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return {"valid": False, "error": "token已失效(401)", "expires_in": None}
        return {"valid": False, "error": f"HTTP {e.response.status_code}", "expires_in": None}
    except Exception as e:
        return {"valid": False, "error": str(e), "expires_in": None}


def collect_xiaotie_raw() -> dict | None:
    authorization = get_authorization()
    if not authorization:
        return None

    try:
        payload = _collect_from_api(authorization)
        collect_xiaotie_raw.last_meta = _api_get.last_meta
        return payload
    except httpx.HTTPStatusError as exc:
        collect_xiaotie_raw.last_meta = _api_get.last_meta
        if exc.response.status_code == 401:
            raise PermissionError("小铁 token 已失效，请重新抓取 token 后更新。") from exc
        raise
    except Exception:
        collect_xiaotie_raw.last_meta = _api_get.last_meta
        raise


def get_authorization() -> str:
    if settings.xiaotie_authorization:
        return settings.xiaotie_authorization.strip()
    token_file = settings.xiaotie_token_file
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()
    return ""


def _collect_from_api(authorization: str) -> dict:
    start, end = _today_range()
    summary_payload = _api_get(
        ENDPOINTS["summary"],
        {
            "node_id": settings.xiaotie_node_id,
            "date_type": "1",
            "node_type": "Site",
            "start_date": start,
            "end_date": end,
        },
        authorization,
    )
    tables_payload = _api_get(
        ENDPOINTS["tables"],
        {
            "expand": "Device,PayRuleGroup.PayRules",
            "node_id": settings.xiaotie_node_id,
            "count": "true",
            "limit": "50",
        },
        authorization,
    )
    summary = summary_payload.get("Result", {})
    tables = tables_payload.get("Results", [])
    total_tables = int(tables_payload.get("Count") or len(tables) or 13)
    busy_tables = sum(1 for table in tables if table.get("open"))

    return {
        "source": "api",
        "summary": {
            "total_amount": _cents_to_yuan(summary.get("order_payed", summary.get("order_money", 0))),
            "order_count": summary.get("order_count", 0),
        },
        "tables": {"total": total_tables, "busy": busy_tables},
        "time": utc_now().astimezone(timezone.utc).isoformat(),
    }


def _api_get(endpoint: str, params: dict[str, Any], authorization: str) -> dict[str, Any]:
    headers = {
        "Authorization": authorization,
        "Xi-App-Id": settings.xiaotie_app_id,
        "xweb_xhr": "1",
        "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }
    url = f"{settings.xiaotie_base_url.rstrip('/')}{endpoint}"
    ssl_context = ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    payload = get_json_with_retry(url, headers=headers, params=params, verify=ssl_context)
    _api_get.last_meta = get_json_with_retry.last_meta
    return payload


_api_get.last_meta = {"retried": False, "retry_count": 0}


def _today_range() -> tuple[str, str]:
    today = datetime.now().strftime("%Y-%m-%d")
    start = f"{today}T00:00:00+08:00"
    end = f"{today}T23:59:59+08:00"
    return start, end


def _cents_to_yuan(value: Any) -> float:
    return round(float(value or 0) / 100, 2)


def mock_xiaotie_raw() -> dict:
    return {
        "source": "mock",
        "summary": {"total_amount": 1388.0, "order_count": 34},
        "tables": {"total": 13, "busy": 8},
        "time": utc_now().astimezone(timezone.utc).isoformat(),
    }


collect_xiaotie_raw.last_meta = {"retried": False, "retry_count": 0}
