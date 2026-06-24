"""
棋牌详情API - 包间实时状态、收入构成、6维度经营统计+环比、订单统计
"""
import hashlib
import ssl
import time
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _make_applet_token(path: str, ts: int) -> str:
    base = f"{settings.wu_laoban_base_url}/"
    raw = f"{base}{path}{ts}{base}"
    return hashlib.md5(raw.encode()).hexdigest()


def _api_get(path: str, params: dict[str, Any] = None) -> dict[str, Any]:
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
        "timezone-offset": str(60000 * 8),
        "trace-id": hashlib.md5(str(ts).encode()).hexdigest(),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Cookie": f"admin_token={settings.wu_laoban_admin_token}",
    }
    with httpx.Client(timeout=15, verify=_SSL_CTX) as client:
        response = client.get(url, headers=headers, params=query_params)
        response.raise_for_status()
        return response.json()


# 所有包间（固定）
ALL_ROOMS = [
    {"name": "财八筒", "type": "中包"},
    {"name": "怪叫胡", "type": "中包"},
    {"name": "杠上花", "type": "大包"},
    {"name": "喵将台", "type": "中包"},
    {"name": "连庄阁", "type": "大包"},
    {"name": "胡牌院", "type": "大包"},
]


def _safe_result(resp: dict) -> dict:
    """安全提取result字段，处理API返回list而非dict的情况"""
    result = resp.get("result", {})
    if isinstance(result, list):
        return result[0] if result and isinstance(result[0], dict) else {}
    return result if isinstance(result, dict) else {}


def _safe_list(resp: dict, key: str = "list") -> list:
    """安全提取result中的列表字段"""
    result = _safe_result(resp)
    val = result.get(key, [])
    return val if isinstance(val, list) else []


def _date_range_yesterday() -> tuple[str, str]:
    """昨天"""
    yesterday = datetime.now() - timedelta(days=1)
    d = yesterday.strftime("%Y%m%d")
    return d, d


def _date_range_week() -> tuple[str, str]:
    """本周一到今天"""
    now = datetime.now()
    monday = now - timedelta(days=now.weekday())
    return monday.strftime("%Y%m%d"), now.strftime("%Y%m%d")


def _date_range_last_week() -> tuple[str, str]:
    """上周同期（上周一到上周同一天）"""
    now = datetime.now()
    # 本周一
    this_monday = now - timedelta(days=now.weekday())
    # 上周一
    last_monday = this_monday - timedelta(days=7)
    # 上周同一天（上周一 + 本周已过天数）
    days_passed = (now - this_monday).days
    last_week_same_day = last_monday + timedelta(days=days_passed)
    return last_monday.strftime("%Y%m%d"), last_week_same_day.strftime("%Y%m%d")


def _date_range_month() -> tuple[str, str]:
    """本月1号到今天"""
    now = datetime.now()
    month_start = f"{now.year}{now.month:02d}01"
    return month_start, now.strftime("%Y%m%d")


def _date_range_last_month() -> tuple[str, str]:
    """上月同期（上月1号到上月同一天）"""
    now = datetime.now()
    # 上月1号
    first_of_month = datetime(now.year, now.month, 1)
    last_month_end = first_of_month - timedelta(days=1)
    last_month_start = datetime(last_month_end.year, last_month_end.month, 1)
    # 上月同一天（如果上月没有这一天，就用上月最后一天）
    try:
        same_day = datetime(last_month_end.year, last_month_end.month, now.day)
    except ValueError:
        same_day = last_month_end
    return last_month_start.strftime("%Y%m%d"), same_day.strftime("%Y%m%d")


def _date_range_year() -> tuple[str, str]:
    """本年1月1号到今天"""
    now = datetime.now()
    year_start = f"{now.year}0101"
    return year_start, now.strftime("%Y%m%d")


def _date_range_last_year_month() -> tuple[str, str]:
    """去年本月（去年同月1号到去年同月同一天）"""
    now = datetime.now()
    # 去年同月
    try:
        last_year_month_start = datetime(now.year - 1, now.month, 1)
        last_year_same_day = datetime(now.year - 1, now.month, now.day)
    except ValueError:
        # 2月29日等边界情况
        last_year_month_start = datetime(now.year - 1, now.month, 1)
        last_year_same_day = datetime(now.year - 1, now.month, 28)
    return last_year_month_start.strftime("%Y%m%d"), last_year_same_day.strftime("%Y%m%d")


def _date_range_last_year_same_day() -> tuple[str, str]:
    """去年同日（只取去年同一天）"""
    now = datetime.now()
    # 去年同一天
    try:
        same_day = datetime(now.year - 1, now.month, now.day)
    except ValueError:
        # 2月29日等边界情况
        same_day = datetime(now.year - 1, now.month, 28)
    return same_day.strftime("%Y%m%d"), same_day.strftime("%Y%m%d")


def _date_range_last_year() -> tuple[str, str]:
    """去年全年（1月1日到去年同一天）"""
    now = datetime.now()
    # 去年1月1日
    last_year_start = datetime(now.year - 1, 1, 1)
    # 去年同一天
    try:
        last_year_same_day = datetime(now.year - 1, now.month, now.day)
    except ValueError:
        last_year_same_day = datetime(now.year - 1, now.month, 28)
    return last_year_start.strftime("%Y%m%d"), last_year_same_day.strftime("%Y%m%d")


def _parse_finance(finance_resp: dict) -> dict:
    """解析财务数据"""
    result = _safe_result(finance_resp)
    fin = result.get("nowData", {})
    if isinstance(fin, list):
        fin = fin[0] if fin and isinstance(fin[0], dict) else {}
    pay = fin.get("income_pay_detail", {}) if isinstance(fin, dict) else {}
    qd = fin.get("income_qd_detail", {}) if isinstance(fin, dict) else {}
    return {
        "total": round(float(fin.get("amount", 0)), 2),
        # 支付方式明细
        "wechat": round(float(pay.get("wx", 0)), 2),
        "alipay": round(float(pay.get("alipay", 0)), 2),
        "meituan": round(float(pay.get("mtyd", 0)) + float(pay.get("mttg", 0)) + float(pay.get("mtsy", 0)), 2),
        "cash": round(float(pay.get("cash", 0)), 2),
        "other": round(float(pay.get("other", 0) or 0), 2),
        "member_card": round(float(pay.get("member_card", 0) or 0), 2),
        "group_buy": round(float(pay.get("tg", 0) or 0), 2),
        # 渠道明细
        "channel_mt": round(float(qd.get("mt", 0)), 2),  # 美团
        "channel_mtsy": round(float(qd.get("mtsy", 0)), 2),  # 美团闪游
        "channel_wx": round(float(qd.get("wx", 0)), 2),  # 微信
        "channel_gd": round(float(qd.get("gd", 0) or 0), 2),  # 高德
    }


def _parse_place_stats(resp: dict) -> list:
    """解析包间排名数据 — 兼容两种API格式：
    1. 新格式: result.list[] 含 place_name/amount/order_num
    2. 旧格式: result 中 area_* 扁平字段
    """
    result = _safe_result(resp)
    stats = []

    # 新格式: result.list[] 数组
    place_list = result.get("list", [])
    if isinstance(place_list, list) and place_list:
        for item in place_list:
            # place_name 格式: "财八筒(中包)" → 拆分名称和类型
            raw_name = item.get("place_name", "")
            if "(" in raw_name and raw_name.endswith(")"):
                name = raw_name.split("(")[0]
                room_type = raw_name.split("(")[1].rstrip(")")
            else:
                name = raw_name
                room_type = ""
            stats.append({
                "name": name,
                "type": room_type,
                "orders": int(item.get("order_num", 0) or 0),
                "revenue": round(float(item.get("amount", 0) or 0), 2),
            })
        stats.sort(key=lambda x: x["revenue"], reverse=True)
        return stats

    # 旧格式: area_* 扁平字段（兼容）
    for k, v in result.items():
        if k.startswith("area_"):
            area_name = k.replace("area_", "")
            stats.append({"name": area_name, "type": "", "orders": 0, "revenue": round(float(v or 0), 2)})
    stats.sort(key=lambda x: x["revenue"], reverse=True)
    return stats


def _parse_orders(orders_resp: dict) -> dict:
    """解析订单统计"""
    result = _safe_result(orders_resp)
    now_data = result.get("nowData", {})
    last_data = result.get("lastData", {})

    # 检查 nowData 是否有有效数据
    def has_valid_data(data: dict) -> bool:
        return any(int(v) > 0 for k, v in data.items() if k in ["order_num", "uid_num", "user_new"] and str(v).isdigit())

    raw = now_data if has_valid_data(now_data) else last_data

    # 解析时间字段（如 "2.93H" -> 176 分钟）
    def parse_time_hours(val) -> int:
        if isinstance(val, str) and "H" in val:
            try:
                return int(float(val.replace("H", "")) * 60)
            except ValueError:
                return 0
        return int(val or 0)

    return {
        "order_count": int(raw.get("order_num", 0)),
        "user_count": int(raw.get("uid_num", 0)),
        "new_user_count": int(raw.get("user_new", 0)),
        "rebuy_count": int(raw.get("re_person_num", 0)),
        "first_count": int(raw.get("first_person_num", 0)),
        "first_price_avg": round(float(raw.get("first_price_avg", 0)), 2),
        "rebuy_price_avg": round(float(raw.get("re_price_avg", 0)), 2),
        "first_time_avg": parse_time_hours(raw.get("first_time_avg", 0)),
        "rebuy_time_avg": parse_time_hours(raw.get("re_time_avg", 0)),
    }


def get_wu_laoban_full_detail() -> dict | None:
    """
    获取棋牌全量详情数据
    包含：包间实时状态、6维度经营统计+环比、收入构成、订单统计详情、各包间收入排名
    """
    if not settings.wu_laoban_admin_token:
        return None

    try:
        today = datetime.now().strftime("%Y%m%d")
        sid = settings.wu_laoban_sid

        # === 1. 获取6个时间维度的财务数据 ===
        d_yesterday = _date_range_yesterday()
        d_week = _date_range_week()
        d_last_week = _date_range_last_week()
        d_month = _date_range_month()
        d_last_month = _date_range_last_month()
        d_year = _date_range_year()
        d_last_year_month = _date_range_last_year_month()
        d_last_year_same_day = _date_range_last_year_same_day()
        d_last_year = _date_range_last_year()

        # 并行获取所有财务数据
        finance_calls = {
            "today": {"date1": today, "date2": today},
            "yesterday": {"date1": d_yesterday[0], "date2": d_yesterday[1]},
            "week": {"date1": d_week[0], "date2": d_week[1]},
            "last_week": {"date1": d_last_week[0], "date2": d_last_week[1]},
            "month": {"date1": d_month[0], "date2": d_month[1]},
            "last_month": {"date1": d_last_month[0], "date2": d_last_month[1]},
            "year": {"date1": d_year[0], "date2": d_year[1]},
            "last_year_month": {"date1": d_last_year_month[0], "date2": d_last_year_month[1]},
            "last_year_same_day": {"date1": d_last_year_same_day[0], "date2": d_last_year_same_day[1]},
            "last_year": {"date1": d_last_year[0], "date2": d_last_year[1]},
        }

        finance_data = {}
        for key, dates in finance_calls.items():
            resp = _api_get("/admin/stats/finance", {
                "isbrand": 0, "date1": dates["date1"], "date2": dates["date2"],
                "sids[]": sid, "store": sid,
            })
            finance_data[key] = _parse_finance(resp)

        # === 2. 获取6个时间维度的订单统计 ===
        orders_data = {}
        for key, dates in finance_calls.items():
            resp = _api_get("/admin/stats/orders", {
                "isbrand": 0, "date1": dates["date1"], "date2": dates["date2"],
                "sids[]": sid, "store": sid,
            })
            orders_data[key] = _parse_orders(resp)

        # === 3. 订单列表（推断实时状态 + 聚合今日数据）===
        orders_result = _api_get("/admin/order/list", {
            "isbrand": 0, "page": 1, "limit": 100, "store": sid,
        })
        orders_list = _safe_list(orders_result)

        # 从订单列表聚合今日包间排名数据
        today_place_stats = {}
        today_order_count = 0
        today_user_set = set()
        today_new_user_count = 0

        for o in orders_list:
            create_time = o.get("create_time", "")
            if today[:4] + "-" + today[4:6] + "-" + today[6:] not in create_time:
                continue

            # 包间统计
            area = o.get("area_title", "").replace("包间 ", "").split("(")[0]
            if area:
                if area not in today_place_stats:
                    today_place_stats[area] = {"orders": 0, "revenue": 0}
                today_place_stats[area]["orders"] += 1
                today_place_stats[area]["revenue"] += float(o.get("pay_price", 0))

            # 订单统计
            today_order_count += 1
            user = o.get("user_name", "")
            if user:
                today_user_set.add(user)

        # 构建今日包间排名
        place_ranking_today = []
        for room in ALL_ROOMS:
            s = today_place_stats.get(room["name"], {"orders": 0, "revenue": 0})
            place_ranking_today.append({
                "name": room["name"],
                "type": room["type"],
                "orders": s["orders"],
                "revenue": round(s["revenue"], 2),
            })
        place_ranking_today.sort(key=lambda x: x["revenue"], reverse=True)

        # 构建今日订单统计（用财务API的数据补充）
        orders_data_today = {
            "order_count": today_order_count,
            "user_count": len(today_user_set),
            "new_user_count": orders_data["today"]["new_user_count"],  # 用统计API的数据
            "rebuy_count": orders_data["today"]["rebuy_count"],
            "first_count": orders_data["today"]["first_count"],
            "first_price_avg": orders_data["today"]["first_price_avg"],
            "rebuy_price_avg": orders_data["today"]["rebuy_price_avg"],
            "first_time_avg": orders_data["today"]["first_time_avg"],
            "rebuy_time_avg": orders_data["today"]["rebuy_time_avg"],
        }
        # 覆盖今日数据
        orders_data["today"] = orders_data_today

        # === 4. 包间排名（本月/本年）===
        place_calls = {
            "month": {"date1": d_month[0], "date2": d_month[1]},
            "year": {"date1": d_year[0], "date2": d_year[1]},
        }

        place_data = {}
        for key, dates in place_calls.items():
            resp = _api_get("/admin/stats/place", {
                "isbrand": 0, "date1": dates["date1"], "date2": dates["date2"],
                "sids[]": sid, "store": sid,
            })
            place_data[key] = _parse_place_stats(resp)

        # 添加今日数据
        place_data["today"] = place_ranking_today

        # === 解析包间实时状态 ===
        active_orders = [o for o in orders_list if o.get("use_status") == 2]

        busy_rooms = set()
        room_details = {}
        for o in active_orders:
            area = o.get("area_title", "").replace("包间 ", "")
            busy_rooms.add(area)
            room_details[area] = {
                "user": o.get("user_name", "未知"),
                "time_range": o.get("date_title", ""),
                "remaining_min": o.get("rem_time", 0) // 60,
            }

        rooms = []
        for room in ALL_ROOMS:
            full_name = f"{room['name']}({room['type']})"
            is_busy = full_name in busy_rooms
            detail = room_details.get(full_name, {})
            rooms.append({
                "name": room["name"],
                "type": room["type"],
                "status": "使用中" if is_busy else "空闲",
                "user": detail.get("user", ""),
                "time_range": detail.get("time_range", ""),
                "remaining_min": detail.get("remaining_min", 0),
            })

        # 合并今日统计到包间
        place_map = {p["name"]: p for p in place_data["today"]}
        for room in rooms:
            stats = place_map.get(room["name"], {})
            room["today_orders"] = stats.get("orders", 0)
            room["today_revenue"] = stats.get("revenue", 0)

        # === 构建经营统计对象（对齐台球的格式）===
        def build_summary(finance: dict, orders: dict) -> dict:
            return {
                "revenue": finance["total"],  # 实收金额（总收入）
                "order_count": orders["order_count"],
                "user_count": orders["user_count"],
                "new_user_count": orders["new_user_count"],
            }

        # 构建各维度的汇总
        summary_today = build_summary(finance_data["today"], orders_data["today"])
        summary_week = build_summary(finance_data["week"], orders_data["week"])
        summary_month = build_summary(finance_data["month"], orders_data["month"])
        summary_year = build_summary(finance_data["year"], orders_data["year"])

        # === 构建环比数据 ===
        comparison = {
            "yesterday": build_summary(finance_data["yesterday"], orders_data["yesterday"]),
            "last_week": build_summary(finance_data["last_week"], orders_data["last_week"]),
            "last_month": build_summary(finance_data["last_month"], orders_data["last_month"]),
            "last_year_month": build_summary(finance_data["last_year_month"], orders_data["last_year_month"]),
            "last_year_same_day": build_summary(finance_data["last_year_same_day"], orders_data["last_year_same_day"]),
            "last_year": build_summary(finance_data["last_year"], orders_data["last_year"]),
        }

        # === 订单统计详情（日/周/月/年）===
        def build_order_stats(orders: dict) -> dict:
            return {
                "order_count": orders["order_count"],
                "user_count": orders["user_count"],
                "new_user_count": orders["new_user_count"],
                "rebuy_count": orders["rebuy_count"],
                "first_count": orders["first_count"],
                "first_price_avg": orders["first_price_avg"],
                "rebuy_price_avg": orders["rebuy_price_avg"],
                "first_time_avg": orders["first_time_avg"],
                "rebuy_time_avg": orders["rebuy_time_avg"],
            }

        order_stats = {
            "today": build_order_stats(orders_data["today"]),
            "week": build_order_stats(orders_data["week"]),
            "month": build_order_stats(orders_data["month"]),
            "year": build_order_stats(orders_data["year"]),
        }

        # === 5. 用户排行榜（总榜）===
        user_ranking = _api_get("/admin/user/ranking", {
            "isbrand": 0, "store": sid, "type": "total_time",
        })
        ranking_list = _safe_list(user_ranking)
        user_ranking_total = []
        for u in ranking_list[:20]:
            name = u.get("user_name", "")
            if "<img" in name:
                name = name.split("/>")[-1].strip()
            user_ranking_total.append({
                "name": name,
                "total_time": u.get("total_time", ""),
                "money": u.get("money", 0),
                "check_num": u.get("check_num", ""),
            })

        # === 5b. 用户排行榜（本周）===
        user_ranking_week = _api_get("/admin/user/ranking", {
            "isbrand": 0, "store": sid, "type": "week_time",
        })
        week_list = _safe_list(user_ranking_week)
        user_ranking_week_data = []
        for u in week_list[:20]:
            name = u.get("user_name", "")
            if "<img" in name:
                name = name.split("/>")[-1].strip()
            user_ranking_week_data.append({
                "name": name,
                "total_time": u.get("total_time", ""),
                "money": u.get("money", 0),
                "check_num": u.get("check_num", ""),
            })

        # === 5c. 用户排行榜（本月）===
        user_ranking_month = _api_get("/admin/user/ranking", {
            "isbrand": 0, "store": sid, "type": "month_time",
        })
        month_list = _safe_list(user_ranking_month)
        user_ranking_month_data = []
        for u in month_list[:20]:
            name = u.get("user_name", "")
            if "<img" in name:
                name = name.split("/>")[-1].strip()
            user_ranking_month_data.append({
                "name": name,
                "total_time": u.get("total_time", ""),
                "money": u.get("money", 0),
                "check_num": u.get("check_num", ""),
            })

        # === 6. 储值卡列表 ===
        deposit_card_resp = _api_get("/admin/depositCard/list", {
            "isbrand": 0, "page": 1, "limit": 20, "store": sid,
        })
        deposit_card_list = _safe_list(deposit_card_resp)
        deposit_cards = []
        for c in deposit_card_list:
            deposit_cards.append({
                "name": c.get("name", ""),
                "price": float(c.get("price", 0)),
                "sale_num": int(c.get("sale_num", 0)),
                "status": c.get("status", 0),
            })

        # === 7. 储值卡订单 ===
        deposit_card_order_resp = _api_get("/admin/depositCard/order", {
            "isbrand": 0, "store": sid, "page": 1, "limit": 50,
        })
        dc_order_list = _safe_list(deposit_card_order_resp)
        dc_orders = []
        for o in dc_order_list[:20]:
            dc_orders.append({
                "user": o.get("user_name", ""),
                "card_name": o.get("name", ""),
                "price": float(o.get("price", 0)),
                "time": o.get("create_time", ""),  # 前端期望字段名
            })

        # === 8. 充值记录 ===
        deposit_order_resp = _api_get("/admin/deposit/list", {
            "isbrand": 0, "store": sid, "page": 1, "limit": 50,
        })
        dep_order_list = _safe_list(deposit_order_resp)
        deposit_orders = []
        for o in dep_order_list[:20]:
            deposit_orders.append({
                "user": o.get("user_name", ""),
                "amount": float(o.get("pay_price", 0)),
                "time": o.get("create_time", ""),  # 前端期望字段名
            })

        # === 9. 优惠券 ===
        coupon_resp = _api_get("/admin/coupon/list", {
            "isbrand": 0, "store": sid, "page": 1, "limit": 50,
        })
        coupon_list = _safe_list(coupon_resp)
        coupons = []
        for c in coupon_list[:20]:
            coupons.append({
                "name": c.get("name", "").strip(),
                "price": c.get("price", 0),
                "vip_price": c.get("vip_price", 0),
                "origin_price": c.get("price_origin", 0),
                "sale_num": int(c.get("count", 0)),
                "type_name": c.get("area_type_name", "") or c.get("type_name", ""),
            })

        # === 10. 美团商品 ===
        meituan_resp = _api_get("/admin/meituan/goods", {
            "isbrand": 0, "store": sid,
        })
        meituan_goods = _safe_list(meituan_resp, "goods_list")
        meituan_items = []
        for g in meituan_goods[:20]:
            meituan_items.append({
                "name": g.get("name", ""),
                "price": float(g.get("price", 0)),
                "sales": int(g.get("sales", 0)),
            })

        # === 组装最终结果（对齐前端期望的数据结构）===
        # 收入构成: revenue_today/month/year
        revenue_today = finance_data["today"]
        revenue_month = finance_data["month"]
        revenue_year = finance_data["year"]

        # 经营统计汇总: summary_today/week/month/year（合并财务+订单数据）
        def build_summary(period: str) -> dict:
            fin = finance_data.get(period, {})
            od = orders_data.get(period, {})
            return {
                "revenue": fin.get("total", 0),
                "order_count": od.get("order_count", 0),
                "user_count": od.get("user_count", 0),
                "new_user_count": od.get("new_user_count", 0),
            }

        summary_today = build_summary("today")
        summary_week = build_summary("week")
        summary_month = build_summary("month")
        summary_year = build_summary("year")

        # 环比数据: comparison
        comparison = {}
        comp_keys = {
            "yesterday": "yesterday",
            "last_week": "last_week",
            "last_month": "last_month",
            "last_year_month": "last_year_month",
            "last_year_same_day": "last_year_same_day",
            "last_year": "last_year",
        }
        for fe_key, be_key in comp_keys.items():
            fin = finance_data.get(be_key, {})
            od = orders_data.get(be_key, {})
            comparison[fe_key] = {
                "revenue": fin.get("total", 0),
                "order_count": od.get("order_count", 0),
                "user_count": od.get("user_count", 0),
                "new_user_count": od.get("new_user_count", 0),
            }

        # 包间排名: place_ranking_today/month/year
        place_ranking_today_list = place_data.get("today", [])
        place_ranking_month_list = place_data.get("month", [])
        place_ranking_year_list = place_data.get("year", [])

        # 订单统计详情: order_stats
        def build_order_stats(period: str) -> dict:
            od = orders_data.get(period, {})
            return {
                "order_count": od.get("order_count", 0),
                "user_count": od.get("user_count", 0),
                "new_user_count": od.get("new_user_count", 0),
                "rebuy_count": od.get("rebuy_count", 0),
                "first_count": od.get("first_count", 0),
                "first_price_avg": od.get("first_price_avg", 0),
                "rebuy_price_avg": od.get("rebuy_price_avg", 0),
                "first_time_avg": od.get("first_time_avg", 0),
                "rebuy_time_avg": od.get("rebuy_time_avg", 0),
            }

        order_stats = {
            "today": build_order_stats("today"),
            "week": build_order_stats("week"),
            "month": build_order_stats("month"),
            "year": build_order_stats("year"),
        }

        return {
            "status": "ok",
            "generated_at": datetime.now().isoformat(),
            # 包间实时状态
            "rooms": rooms,
            "total_rooms": len(ALL_ROOMS),
            "busy_count": len([r for r in rooms if r.get("is_busy")]),
            # 收入构成（前端: data.revenue_today.total）
            "revenue_today": revenue_today,
            "revenue_month": revenue_month,
            "revenue_year": revenue_year,
            # 经营统计汇总（前端: data.summary_today.revenue）
            "summary_today": summary_today,
            "summary_week": summary_week,
            "summary_month": summary_month,
            "summary_year": summary_year,
            # 环比数据（前端: data.comparison.yesterday.revenue）
            "comparison": comparison,
            # 包间排名（前端: data.place_ranking_today）
            "place_ranking_today": place_ranking_today_list,
            "place_ranking_month": place_ranking_month_list,
            "place_ranking_year": place_ranking_year_list,
            # 订单统计详情（前端: data.order_stats.today.order_count）
            "order_stats": order_stats,
            # 用户排行榜（前端: data.user_ranking_week/total）
            "user_ranking_week": user_ranking_week_data,
            "user_ranking_month": user_ranking_month_data,
            "user_ranking_total": user_ranking_total,
            # 储值卡/充值/优惠券
            "deposit_cards": deposit_cards,
            "deposit_card_orders": dc_orders,
            "deposit_orders": deposit_orders,
            "coupons": coupons,
            "meituan_items": meituan_items,
            # 今日实时
            "today_orders_count": today_order_count,
            "today_users_count": len(today_user_set),
            "today_new_users": today_new_user_count,
            "today_active_orders": active_orders,
        }

    except Exception as e:
        print(f"[wu_laoban_full_detail] 获取失败: {e}")
        return None


def get_place_ranking(period: str = "today") -> dict:
    """获取包间排名数据 — 使用 stats/place API"""
    try:
        sid = settings.wu_laoban_sid
        today = datetime.now().strftime("%Y%m%d")

        if period == "today":
            d1, d2 = today, today
        elif period == "week":
            d1, d2 = _date_range_week()
        elif period == "month":
            d1, d2 = _date_range_month()
        else:
            d1, d2 = _date_range_year()

        resp = _api_get("/admin/stats/place", {
            "isbrand": 0, "store": sid, "date1": d1, "date2": d2, "sids[]": sid,
        })
        ranking = _parse_place_stats(resp)

        # 补充缺失的包间（未出现在API数据中的）
        existing_names = {r["name"] for r in ranking}
        for room in ALL_ROOMS:
            if room["name"] not in existing_names:
                ranking.append({
                    "name": room["name"],
                    "type": room["type"],
                    "orders": 0,
                    "revenue": 0,
                })

        ranking.sort(key=lambda x: x["revenue"], reverse=True)
        return {"status": "ok", "period": period, "ranking": ranking}

    except Exception as e:
        return {"status": "error", "message": str(e)}
