"""
無老板（顽麻社·24H自助棋牌）数据采集器
API认证: Cookie(admin_token) + applet-token(MD5签名)
"""

import hashlib
import json
import ssl
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.models.schemas import utc_now
from app.services.collectors.http_client import get_json_with_retry

# SSL上下文（跳过验证）
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _make_applet_token(path: str, ts: int) -> str:
    """
    生成 applet-token
    算法: MD5("https://admin.5laoban.com/" + path + ts + "https://admin.5laoban.com/")
    """
    base = f"{settings.wu_laoban_base_url}/"
    raw = f"{base}{path}{ts}{base}"
    return hashlib.md5(raw.encode()).hexdigest()


def _build_cookies() -> str:
    """构建Cookie头"""
    return f"admin_token={settings.wu_laoban_admin_token}"


def _api_get(path: str, params: dict[str, Any] = None) -> dict[str, Any]:
    """
    调用無老板API
    认证: Cookie + applet-token(MD5签名) + mid
    """
    ts = int(time.time() * 1000)
    token = _make_applet_token(path.lstrip("/"), ts)

    query_params = params or {}
    query_params["timestamp_private"] = ts

    url = f"{settings.wu_laoban_base_url}{path}"

    headers = {
        "Accept": "application/json, text/plain, */*",
        "applet-token": token,
        "mid": settings.wu_laoban_mid,
        "pageId": "100192",
        "timezone-offset": str(60000 * 8),  # UTC+8
        "trace-id": hashlib.md5(str(ts).encode()).hexdigest(),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Cookie": _build_cookies(),
    }

    payload = get_json_with_retry(url, headers=headers, params=query_params, verify=_SSL_CTX)
    _api_get.last_meta = get_json_with_retry.last_meta
    return payload


_api_get.last_meta = {"retried": False, "retry_count": 0}


def check_wu_laoban_token() -> dict:
    """
    检测無老板token是否有效
    返回: {"valid": bool, "error": str | None}
    """
    if not settings.wu_laoban_admin_token:
        return {"valid": False, "error": "未配置admin_token"}

    try:
        today = datetime.now().strftime("%Y%m%d")
        # 调用一个轻量级API来验证token
        result = _api_get("/admin/stats/finance", {
            "isbrand": 0,
            "date1": today,
            "date2": today,
            "sids[]": settings.wu_laoban_sid,
            "store": settings.wu_laoban_sid,
        })
        # 如果能成功获取数据，说明token有效
        if "result" in result:
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": "API返回异常"}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return {"valid": False, "error": "token已失效(401)"}
        return {"valid": False, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def collect_wu_laoban_raw() -> dict | None:
    """
    采集無老板真实数据
    返回格式:
    {
        "source": "api",
        "overview": {"paid_amount": float, "orders": int},
        "rooms": {"total": int, "occupied": int},
        "finance": {...},
        "time": str
    }
    """
    if not settings.wu_laoban_admin_token:
        return None

    try:
        today = datetime.now().strftime("%Y%m%d")
        yesterday_ts = int((time.time() - 86400) * 1000)
        yesterday = datetime.fromtimestamp(yesterday_ts / 1000).strftime("%Y%m%d")

        # 1. 财务数据（今日）
        finance = _api_get("/admin/stats/finance", {
            "isbrand": 0,
            "date1": today,
            "date2": today,
            "sids[]": settings.wu_laoban_sid,
            "store": settings.wu_laoban_sid,
        })

        # 2. 订单数据（今日）
        orders = _api_get("/admin/stats/orders", {
            "isbrand": 0,
            "date1": today,
            "date2": today,
            "sids[]": settings.wu_laoban_sid,
            "store": settings.wu_laoban_sid,
        })

        # 3. 位置数据（今日，用于计算使用率）
        place = _api_get("/admin/stats/place", {
            "isbrand": 0,
            "date1": today,
            "date2": today,
            "sids[]": settings.wu_laoban_sid,
            "store": settings.wu_laoban_sid,
        })

        # 安全提取nowData（凌晨时段可能返回空list而非dict）
        def _safe_dict(data: Any, key: str, fallback: Any = None, check_keys: list[str] = None) -> dict:
            """
            提取字典中的嵌套字段。
            - 如果 nowData 是 dict 且当日关键字段有有效数值 → 直接返回
            - 如果 nowData 是空 list、None、或当日字段全为零 → fallback 到 lastData
            check_keys: 要检查的字段列表（如 ['order_num','uid_num','user_new']），为None则直接返回dict
            """
            val = data.get(key) if isinstance(data, dict) else None
            if isinstance(val, dict):
                # 没指定check_keys则直接返回
                if not check_keys:
                    return val
                # 检查指定字段是否有>0的值（兼容字符串数值）
                for k in check_keys:
                    try:
                        if float(val.get(k, 0)) > 0:
                            return val
                    except (ValueError, TypeError):
                        continue
                # 当日字段全为零 → fallback
            # nowData 不是有效dict 或 当日字段全零 → 尝试 fallback 到 lastData
            if fallback is not None:
                fb = data.get(fallback) if isinstance(data, dict) else None
                if isinstance(fb, dict):
                    return fb
            return {}

        # 解析财务数据
        # 注意：不fallback到lastData，今日无数据就是0
        fin_result = finance.get("result", {})
        fin_now = fin_result.get("nowData") if isinstance(fin_result, dict) else None
        fin_data = fin_now if isinstance(fin_now, dict) else {}
        paid_amount = float(fin_data.get("amount", 0))

        # 解析订单数据（nowData可能为空list，fallback到lastData）
        order_result = orders.get("result", {})
        order_data = _safe_dict(order_result, "nowData", "lastData", check_keys=["order_num", "uid_num", "user_new"])
        order_count = int(order_data.get("order_num", 0))
        user_count = int(order_data.get("uid_num", 0))
        new_user = int(order_data.get("user_new", 0))

        # 解析位置数据（计算使用率）
        # place stats API 今日数据可能为0，改用订单列表推断
        place_result = place.get("result", {})
        place_list = place_result.get("list", []) if isinstance(place_result, dict) else []
        total_rooms = len(place_list) if place_list else 6  # 默认6个包间
        # 从订单列表获取：进行中的订单数 + 今日订单数
        try:
            orders_list_resp = _api_get("/admin/order/list", {
                "isbrand": 0,
                "page": 1,
                "limit": 100,
                "store": settings.wu_laoban_sid,
            })
            olr = orders_list_resp.get("result", {})
            orders_list = olr.get("list", []) if isinstance(olr, dict) else []
            occupied_rooms = sum(1 for o in orders_list if isinstance(o, dict) and o.get("use_status") == 2)
            # 从订单列表数今日订单（stats API 的 order_num 在当日数据少时不准）
            today_str = f"{today[:4]}-{today[4:6]}-{today[6:]}"
            today_order_count = sum(1 for o in orders_list if isinstance(o, dict) and today_str in o.get("create_time", ""))
            order_count = today_order_count
        except Exception:
            occupied_rooms = sum(1 for p in place_list if isinstance(p, dict) and int(p.get("order_num", 0)) > 0)

        payload = {
            "source": "api",
            "overview": {"paid_amount": paid_amount, "orders": order_count},
            "rooms": {"total": total_rooms, "occupied": occupied_rooms},
            "finance": {
                "income_pay_detail": fin_data.get("income_pay_detail", {}),
                "income_order_detail": fin_data.get("income_order_detail", {}),
            },
            "time": utc_now().astimezone(timezone.utc).isoformat(),
        }
        collect_wu_laoban_raw.last_meta = _api_get.last_meta
        return payload

    except Exception as e:
        collect_wu_laoban_raw.last_meta = _api_get.last_meta
        print(f"[wu_laoban] 采集失败: {e}")
        raise


def mock_wu_laoban_raw() -> dict:
    """Mock数据（当API不可用时使用）"""
    return {
        "source": "mock",
        "overview": {"paid_amount": 926.0, "orders": 21},
        "rooms": {"total": 6, "occupied": 4},
        "finance": {
            "income_pay_detail": {"mtyd": 51.8, "mttg": 129.6},
            "income_order_detail": {},
        },
        "time": utc_now().astimezone(timezone.utc).isoformat(),
    }


collect_wu_laoban_raw.last_meta = {"retried": False, "retry_count": 0}
