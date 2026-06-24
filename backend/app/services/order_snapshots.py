from datetime import datetime, timezone
from typing import Any

from app.core.config import settings
from app.services.collectors.xiaotie import get_authorization
from app.services.detail_xiaotie import _api_get as xiaotie_get
from app.services.detail_xiaotie import _date_range_today
from app.services.detail_wu_laoban import _api_get as wu_laoban_get


def collect_order_snapshots(limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    items.extend(_xiaotie_orders(limit=limit))
    items.extend(_wu_laoban_orders(limit=limit))
    items.sort(key=lambda item: item.get("time") or "", reverse=True)
    return items[:limit]


def _xiaotie_orders(limit: int) -> list[dict[str, Any]]:
    auth = get_authorization()
    if not auth:
        return []
    try:
        start, end = _date_range_today()
        payload = xiaotie_get(
            "/api/system/order/table_orders/",
            {
                "expand": "Member.SocialUser,Coupon,Table",
                "limit": str(limit),
                "skip": "0",
                "node_id": settings.xiaotie_node_id,
                "created_at__gte": start,
                "created_at__lt": end,
                "order": "created_at desc",
            },
            auth,
        )
    except Exception:
        return []

    rows = []
    for order in payload.get("Results", [])[:limit]:
        info = order.get("info") or {}
        table = info.get("table_address") or info.get("table_name") or "未知桌台"
        entrance = info.get("entrance") or info.get("coupon_exchange_type") or "开台"
        rows.append(
            {
                "platform": "xiaotie",
                "business_type": "billiards",
                "title": f"{table} 开台",
                "amount": _cents(order.get("payed_money") or order.get("order_payed") or info.get("coupon_payed")),
                "status": _xiaotie_status(order.get("status")),
                "time": order.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "source": "api",
                "detail": entrance,
            }
        )
    return rows


def _wu_laoban_orders(limit: int) -> list[dict[str, Any]]:
    if not settings.wu_laoban_admin_token:
        return []
    try:
        today = datetime.now().strftime("%Y%m%d")
        payload = wu_laoban_get(
            "/admin/order/list",
            {
                "sid": settings.wu_laoban_sid,
                "date1": today,
                "date2": today,
                "page": 1,
                "limit": limit,
            },
        )
    except Exception:
        return []

    rows = []
    for order in payload.get("result", {}).get("list", [])[:limit]:
        room = order.get("area_name") or order.get("area") or order.get("room_name") or "棋牌订单"
        rows.append(
            {
                "platform": "wu_laoban",
                "business_type": "mahjong",
                "title": f"{room}",
                "amount": float(order.get("pay_price") or order.get("total_price") or 0),
                "status": _wu_status(order.get("use_status")),
                "time": _wu_time(order),
                "source": "api",
                "detail": order.get("order_sn") or order.get("order_no") or "無老板订单",
            }
        )
    return rows


def _cents(value: Any) -> float:
    return round(float(value or 0) / 100, 2)


def _xiaotie_status(value: Any) -> str:
    return {1: "待开始", 2: "进行中", 3: "已完成", 4: "已取消"}.get(int(value or 0), "进行中")


def _wu_status(value: Any) -> str:
    return {1: "已预约", 2: "进行中", 3: "已完成", 4: "已取消"}.get(int(value or 0), "订单")


def _wu_time(order: dict[str, Any]) -> str:
    value = order.get("create_time") or order.get("created_at")
    if value:
        return str(value).replace(" ", "T") + "+08:00" if "T" not in str(value) else str(value)
    return datetime.now(timezone.utc).isoformat()
