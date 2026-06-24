"""
轻购云售卖机数据采集器
API域名: api.wrshg.com
认证方式: Auth-Token (JWT)
金额单位: 分（除以100得元）
"""
import ssl
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.models.schemas import utc_now
from app.services.collectors.http_client import get_json_with_retry

# API基础URL
QGCLOUD_BASE_URL = "https://api.wrshg.com"

# SSL上下文（忽略证书验证）
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def get_qgcloud_token() -> str:
    """读取轻购云token"""
    if settings.qgcloud_token:
        return settings.qgcloud_token.strip()
    token_file = settings.qgcloud_token_file
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()
    return ""


def _headers(token: str) -> dict:
    """通用请求头"""
    return {
        "Auth-Token": token,
        "xweb_xhr": "1",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }


def _api_get(endpoint: str, params: dict, token: str) -> dict:
    """通用GET请求"""
    url = f"{QGCLOUD_BASE_URL}{endpoint}"
    payload = get_json_with_retry(url, headers=_headers(token), params=params, verify=_SSL_CTX)
    _api_get.last_meta = get_json_with_retry.last_meta
    return payload


_api_get.last_meta = {"retried": False, "retry_count": 0}


def _fen_to_yuan(value: Any) -> float:
    """分转元"""
    return round(float(value or 0) / 100, 2)


def _date_str(dt: datetime) -> str:
    """日期转YYYY-MM-DD字符串"""
    return dt.strftime("%Y-%m-%d")


def collect_qgcloud_raw() -> dict | None:
    """
    采集轻购云售卖机数据
    返回结构:
    {
        "source": "api",
        "today": {"amount": float, "count": int, "cost": float, "profit": float},
        "month": {"amount": float, "count": int, "cost": float, "profit": float, "margin": str},
        "year": {"amount": float, "count": int, "cost": float, "profit": float, "margin": str},
        "goods": [{"name": str, "count": int, "amount": float}],
        "time": str
    }
    """
    token = get_qgcloud_token()
    if not token:
        return None

    try:
        payload = _collect_from_api(token)
        collect_qgcloud_raw.last_meta = _api_get.last_meta
        return payload
    except httpx.HTTPStatusError as exc:
        collect_qgcloud_raw.last_meta = _api_get.last_meta
        if exc.response.status_code == 401:
            raise PermissionError("轻购云 token 已失效，请重新抓取 token 后更新。") from exc
        raise
    except Exception:
        collect_qgcloud_raw.last_meta = _api_get.last_meta
        raise


def _collect_from_api(token: str) -> dict:
    """从API采集数据"""
    now = datetime.now()
    today = _date_str(now)
    month_start = f"{now.year}-{now.month:02d}-01"
    year_start = f"{now.year}-01-01"

    # 今日统计
    today_data = _api_get(
        "/mctmp-center/statistic/homepage/v1",
        {"time_type": "0", "start_date": today, "end_date": today},
        token,
    ).get("data", {})

    # 本月统计
    month_data = _api_get(
        "/mctmp-center/statistic/homepage/v1",
        {"time_type": "0", "start_date": month_start, "end_date": today},
        token,
    ).get("data", {})

    # 今年统计
    year_data = _api_get(
        "/mctmp-center/statistic/homepage/v1",
        {"time_type": "1", "start_date": year_start, "end_date": today},
        token,
    ).get("data", {})

    # 热销商品（本月TOP10）
    goods_data = _api_get(
        "/mctmp-center/statistic/goods/v1",
        {"time_type": "0", "start_date": month_start, "end_date": today, "page": "1", "size": "10"},
        token,
    ).get("data", {})

    goods_list = []
    for g in goods_data.get("rows", []):
        goods_list.append({
            "name": g.get("goods_name", ""),
            "count": g.get("sale_count", 0),
            "amount": _fen_to_yuan(g.get("sale_amount", 0)),
            "proportion": g.get("sale_proportion", "0%"),
        })

    return {
        "source": "api",
        "today": {
            "amount": _fen_to_yuan(today_data.get("sale_amount", 0)),
            "count": today_data.get("sale_count", 0),
            "cost": _fen_to_yuan(today_data.get("cost_amount", 0)),
            "profit": _fen_to_yuan(today_data.get("sum_gross_profit", 0)),
        },
        "month": {
            "amount": _fen_to_yuan(month_data.get("sale_amount", 0)),
            "count": month_data.get("sale_count", 0),
            "cost": _fen_to_yuan(month_data.get("cost_amount", 0)),
            "profit": _fen_to_yuan(month_data.get("sum_gross_profit", 0)),
            "margin": month_data.get("sum_gross_profit_margin", "0%"),
            "unit_price": float(month_data.get("unit_price", 0)) / 100,
        },
        "year": {
            "amount": _fen_to_yuan(year_data.get("sale_amount", 0)),
            "count": year_data.get("sale_count", 0),
            "cost": _fen_to_yuan(year_data.get("cost_amount", 0)),
            "profit": _fen_to_yuan(year_data.get("sum_gross_profit", 0)),
            "margin": year_data.get("sum_gross_profit_margin", "0%"),
        },
        "goods": goods_list,
        "time": utc_now().isoformat(),
    }


def check_qgcloud_token() -> dict:
    """检测轻购云token是否有效"""
    token = get_qgcloud_token()
    if not token:
        return {"valid": False, "error": "未配置token", "expires_in": None}
    try:
        result = _api_get("/mctmp-center/home_page/v1", {}, token)
        if result.get("code") == 0:
            return {"valid": True, "error": None, "expires_in": None}
        return {"valid": False, "error": result.get("msg", "未知错误"), "expires_in": None}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return {"valid": False, "error": "token已失效(401)", "expires_in": None}
        return {"valid": False, "error": f"HTTP {e.response.status_code}", "expires_in": None}
    except Exception as e:
        return {"valid": False, "error": str(e), "expires_in": None}


collect_qgcloud_raw.last_meta = {"retried": False, "retry_count": 0}
