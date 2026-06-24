"""
台球详情API - 全量数据：球桌状态、收入概览、每桌排行、会员TOP、时段分布、经营数据、评论/异常/投诉
"""
import ssl
from datetime import datetime, timedelta
from typing import Any

import httpx

from app.core.config import settings
from app.services.collectors.xiaotie import get_authorization

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE


def _headers(authorization: str) -> dict:
    """通用请求头"""
    return {
        "Authorization": authorization,
        "Xi-App-Id": settings.xiaotie_app_id,
        "xweb_xhr": "1",
        "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }


def _api_get(endpoint: str, params: dict, authorization: str) -> dict:
    """通用API调用"""
    url = f"{settings.xiaotie_base_url.rstrip('/')}{endpoint}"
    with httpx.Client(timeout=15, verify=_SSL_CTX) as client:
        resp = client.get(url, headers=_headers(authorization), params=params)
        resp.raise_for_status()
        return resp.json()


def _date_range_today() -> tuple[str, str]:
    """今日时间范围（ISO格式）"""
    today = datetime.now().strftime("%Y-%m-%d")
    return f"{today}T00:00:00+08:00", f"{today}T23:59:59+08:00"


def _date_range_week() -> tuple[str, str]:
    """本周时间范围（自然周：周一到今天）"""
    now = datetime.now()
    monday = now - timedelta(days=now.weekday())  # weekday(): 周一=0
    start = monday.strftime("%Y-%m-%d") + "T00:00:00+08:00"
    end = now.strftime("%Y-%m-%d") + "T23:59:59+08:00"
    return start, end


def _date_range_last_week() -> tuple[str, str]:
    """上周同期（上周一到上周同一天，自然周）"""
    now = datetime.now()
    this_monday = now - timedelta(days=now.weekday())  # 本周一
    last_monday = this_monday - timedelta(days=7)  # 上周一
    # 上周同一天（上周一 + 本周已过天数）
    days_passed = (now - this_monday).days
    last_week_same_day = last_monday + timedelta(days=days_passed)
    start = last_monday.strftime("%Y-%m-%d") + "T00:00:00+08:00"
    end = last_week_same_day.strftime("%Y-%m-%d") + "T23:59:59+08:00"
    return start, end


def _date_range_month() -> tuple[str, str]:
    """本月时间范围（自然月：1号到今天）"""
    now = datetime.now()
    start = f"{now.year}-{now.month:02d}-01T00:00:00+08:00"
    end = now.strftime("%Y-%m-%d") + "T23:59:59+08:00"
    return start, end


def _date_range_last_month() -> tuple[str, str]:
    """上月同期（上月1号到上月同一天）"""
    now = datetime.now()
    day_of_month = now.day  # 今天是本月第几天
    if now.month == 1:
        last_year, last_month = now.year - 1, 12
    else:
        last_year, last_month = now.year, now.month - 1
    start = f"{last_year}-{last_month:02d}-01T00:00:00+08:00"
    # 上月同一天（如果上月没这么多天，取月末）
    import calendar
    max_day = calendar.monthrange(last_year, last_month)[1]
    target_day = min(day_of_month, max_day)
    end = f"{last_year}-{last_month:02d}-{target_day}T23:59:59+08:00"
    return start, end


def _date_range_year() -> tuple[str, str]:
    """本年时间范围"""
    year = datetime.now().year
    return f"{year}-01-01T00:00:00+08:00", f"{year}-12-31T23:59:59+08:00"


def _date_range_yesterday() -> tuple[str, str]:
    """昨日时间范围"""
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    return f"{yesterday}T00:00:00+08:00", f"{yesterday}T23:59:59+08:00"


def _date_range_day_before_yesterday() -> tuple[str, str]:
    """前天时间范围"""
    day = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%d")
    return f"{day}T00:00:00+08:00", f"{day}T23:59:59+08:00"


def _date_range_last_month_same_day() -> tuple[str, str]:
    """上月同一天"""
    now = datetime.now()
    day_of_month = now.day
    if now.month == 1:
        last_year, last_month = now.year - 1, 12
    else:
        last_year, last_month = now.year, now.month - 1
    import calendar
    max_day = calendar.monthrange(last_year, last_month)[1]
    target_day = min(day_of_month, max_day)
    date = f"{last_year}-{last_month:02d}-{target_day}"
    return f"{date}T00:00:00+08:00", f"{date}T23:59:59+08:00"


def _date_range_last_month_same_week() -> tuple[str, str]:
    """上月同期（本周范围在上月的对应）"""
    now = datetime.now()
    weekday = now.isoweekday()
    if now.month == 1:
        last_year, last_month = now.year - 1, 12
    else:
        last_year, last_month = now.year, now.month - 1
    # 上月1号是周几
    import calendar
    first_day_weekday = calendar.monthrange(last_year, last_month)[0] + 1  # 0=周一
    # 本月第一个周一对应的上月日期
    # 简化：取上月同期的周一到同天
    last_month_first = datetime(last_year, last_month, 1)
    # 找到上月第一个周一
    days_to_monday = (7 - last_month_first.weekday()) % 7
    if days_to_monday == 0:
        days_to_monday = 7
    first_monday = last_month_first + timedelta(days=days_to_monday - 1)
    # 上月同期范围
    start = first_monday.strftime("%Y-%m-%d") + "T00:00:00+08:00"
    # 对应的结束日期
    end_date = first_monday + timedelta(days=weekday - 1)
    end = end_date.strftime("%Y-%m-%d") + "T23:59:59+08:00"
    return start, end


def _date_range_week_before_last() -> tuple[str, str]:
    """上上周同期（上上周一到上上周同一天，自然周）"""
    now = datetime.now()
    this_monday = now - timedelta(days=now.weekday())  # 本周一
    week_before_last_monday = this_monday - timedelta(days=14)  # 上上周一
    # 上上周同一天（上上周一 + 本周已过天数）
    days_passed = (now - this_monday).days
    week_before_last_same_day = week_before_last_monday + timedelta(days=days_passed)
    start = week_before_last_monday.strftime("%Y-%m-%d") + "T00:00:00+08:00"
    end = week_before_last_same_day.strftime("%Y-%m-%d") + "T23:59:59+08:00"
    return start, end


def _date_range_last_month_last_month() -> tuple[str, str]:
    """上上月（上上月1号到上上月最后一天）"""
    now = datetime.now()
    if now.month <= 2:
        year, month = now.year - 1, 12 + now.month - 2
    else:
        year, month = now.year, now.month - 2
    import calendar
    start = f"{year}-{month:02d}-01T00:00:00+08:00"
    end_day = calendar.monthrange(year, month)[1]
    end = f"{year}-{month:02d}-{end_day}T23:59:59+08:00"
    return start, end


def _date_range_last_year_same_month() -> tuple[str, str]:
    """去年同月（1号到今天）"""
    now = datetime.now()
    year = now.year - 1
    month = now.month
    import calendar
    start = f"{year}-{month:02d}-01T00:00:00+08:00"
    max_day = calendar.monthrange(year, month)[1]
    target_day = min(now.day, max_day)
    end = f"{year}-{month:02d}-{target_day}T23:59:59+08:00"
    return start, end


def _date_range_last_year_same_month_full() -> tuple[str, str]:
    """去年同月整月"""
    now = datetime.now()
    year = now.year - 1
    month = now.month
    import calendar
    start = f"{year}-{month:02d}-01T00:00:00+08:00"
    end_day = calendar.monthrange(year, month)[1]
    end = f"{year}-{month:02d}-{end_day}T23:59:59+08:00"
    return start, end


def _date_range_last_year() -> tuple[str, str]:
    """去年时间范围（1月1日到12月31日）"""
    year = datetime.now().year - 1
    return f"{year}-01-01T00:00:00+08:00", f"{year}-12-31T23:59:59+08:00"


def _date_range_last_year_to_today() -> tuple[str, str]:
    """去年同期（去年1月1日到去年今天）"""
    now = datetime.now()
    year = now.year - 1
    import calendar
    start = f"{year}-01-01T00:00:00+08:00"
    max_day = calendar.monthrange(year, now.month)[1]
    target_day = min(now.day, max_day)
    end = f"{year}-{now.month:02d}-{target_day}T23:59:59+08:00"
    return start, end


def _cents(value: Any) -> float:
    """分转元"""
    return round(float(value or 0) / 100, 2)


def _parse_members(data: dict) -> list:
    """解析会员数据为标准格式"""
    members = []
    for m in data.get("Results", []):
        member_info = m.get("member", {})
        social = member_info.get("social_user") or {}
        name = social.get("nickname") or member_info.get("remark") or "未知"
        phone = social.get("phone") or member_info.get("phone", "")
        if len(phone) == 11:
            phone = phone[:3] + "****" + phone[7:]
        members.append({
            "name": name,
            "phone": phone,
            "total_payed": _cents(m.get("order_payed", 0)),
            "order_count": m.get("order_count", 0),
            "avg_duration": round(float(m.get("avg_order_duration", 0)), 1),
            "total_hours": round(float(m.get("order_time", 0)) / 60, 1),
        })
    return members


def get_xiaotie_full_detail() -> dict | None:
    """
    获取台球全量详情数据，一次调用返回所有维度
    包含：球桌状态、收入概览(summary)、类型拆分(summary_detail)、日均(all_summary)、
          每桌排行(table_summary)、会员TOP(member_summary)、时段分布(time_summary)、
          经营数据(operate_stats/summary)、充值统计(balance_stats)、VIP汇总(vip_summary)、
          评论(comments)、桌台异常(table_exceptions)、微信支付投诉(wx_pay_complaints)
    """
    auth = get_authorization()
    if not auth:
        return None

    try:
        today_start, today_end = _date_range_today()
        month_start, month_end = _date_range_month()
        year_start, year_end = _date_range_year()
        node_id = settings.xiaotie_node_id

        # === 球桌实时状态 ===
        tables_data = _api_get("/api/system/device/tables/", {
            "expand": "Device,PayRuleGroup.PayRules",
            "node_id": node_id, "count": "true", "limit": "50",
        }, auth)
        tables = []
        for t in tables_data.get("Results", []):
            tables.append({
                "name": t.get("name", t.get("address", "未知")),
                "address": t.get("address", ""),
                "status": "使用中" if t.get("open") else "空闲",
                "open": t.get("open", False),
                "device_type": t.get("device_type_name", ""),
                "used_time": t.get("used_time", 0),
            })

        # === summary（最丰富的汇总端点）===
        # 今日
        summary_today = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": today_start, "end_date": today_end,
        }, auth).get("Result", {})
        # 本周（自然周）
        week_start, week_end = _date_range_week()
        summary_week = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": week_start, "end_date": week_end,
        }, auth).get("Result", {})
        # 本月（自然月）
        month_start, month_end = _date_range_month()
        summary_month = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})
        # 本年
        summary_year = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "3",
            "start_date": year_start, "end_date": year_end,
        }, auth).get("Result", {})

        # === 环比数据 ===
        # 昨日
        yesterday_start, yesterday_end = _date_range_yesterday()
        summary_yesterday = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": yesterday_start, "end_date": yesterday_end,
        }, auth).get("Result", {})
        # 前天
        dbf_start, dbf_end = _date_range_day_before_yesterday()
        summary_dbf = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": dbf_start, "end_date": dbf_end,
        }, auth).get("Result", {})
        # 上月同一天
        lmsd_start, lmsd_end = _date_range_last_month_same_day()
        summary_lmsd = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": lmsd_start, "end_date": lmsd_end,
        }, auth).get("Result", {})
        # 上周同期（上周一到上周同天）
        last_week_start, last_week_end = _date_range_last_week()
        summary_last_week = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": last_week_start, "end_date": last_week_end,
        }, auth).get("Result", {})
        # 上上周
        wbl_start, wbl_end = _date_range_week_before_last()
        summary_wbl = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": wbl_start, "end_date": wbl_end,
        }, auth).get("Result", {})
        # 上月同期
        lmsw_start, lmsw_end = _date_range_last_month_same_week()
        summary_lmsw = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": lmsw_start, "end_date": lmsw_end,
        }, auth).get("Result", {})
        # 上月整月
        last_month_start, last_month_end = _date_range_last_month()
        summary_last_month = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": last_month_start, "end_date": last_month_end,
        }, auth).get("Result", {})
        # 上上月
        llm_start, llm_end = _date_range_last_month_last_month()
        summary_llm = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": llm_start, "end_date": llm_end,
        }, auth).get("Result", {})
        # 去年同月（1号到今天）
        lym_start, lym_end = _date_range_last_year_same_month()
        summary_lym = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": lym_start, "end_date": lym_end,
        }, auth).get("Result", {})
        # 去年同月整月
        lymf_start, lymf_end = _date_range_last_year_same_month_full()
        summary_lymf = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": lymf_start, "end_date": lymf_end,
        }, auth).get("Result", {})
        # 去年整年
        last_year_start, last_year_end = _date_range_last_year()
        summary_last_year = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "3",
            "start_date": last_year_start, "end_date": last_year_end,
        }, auth).get("Result", {})
        # 去年同期（1月1日到去年今天）
        lytd_start, lytd_end = _date_range_last_year_to_today()
        summary_lytd = _api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": lytd_start, "end_date": lytd_end,
        }, auth).get("Result", {})

        # === new_summary_detail（按球桌类型拆分）===
        detail_month = _api_get("/api/system/stat/dashboards/new_summary_detail/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})

        # === all_summary（含日均数据）===
        all_summary_month = _api_get("/api/system/stat/dashboards/all_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})

        # === table_summary（每桌排行）===
        # 今日
        table_summary_today = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": today_start, "end_date": today_end,
        }, auth).get("Result", {})
        table_stats_today = []
        for item in table_summary_today.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_today.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_today.sort(key=lambda x: x["revenue"], reverse=True)

        # 本周（自然周）
        table_summary_week = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": week_start, "end_date": week_end,
        }, auth).get("Result", {})
        table_stats_week = []
        for item in table_summary_week.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_week.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_week.sort(key=lambda x: x["revenue"], reverse=True)

        # 本月
        table_summary_month = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})
        table_stats_month = []
        for item in table_summary_month.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_month.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_month.sort(key=lambda x: x["revenue"], reverse=True)

        # 本年
        table_summary_year = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "3",
            "start_date": year_start, "end_date": year_end,
        }, auth).get("Result", {})
        table_stats_year = []
        for item in table_summary_year.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_year.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_year.sort(key=lambda x: x["revenue"], reverse=True)

        # === member_summary_v2（会员消费/时长排行TOP50）===
        # 今日 - 按消费
        members_today = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": today_start, "end_date": today_end,
            "limit": "50", "skip": "0",
            "order": "order_payed", "order_direction": "desc",
        }, auth))
        # 今日 - 按时长
        members_today_by_hours = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": today_start, "end_date": today_end,
            "limit": "50", "skip": "0",
            "order": "order_time", "order_direction": "desc",
        }, auth))

        # 本周 - 按消费
        members_week = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": week_start, "end_date": week_end,
            "limit": "50", "skip": "0",
            "order": "order_payed", "order_direction": "desc",
        }, auth))
        # 本周 - 按时长
        members_week_by_hours = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": week_start, "end_date": week_end,
            "limit": "50", "skip": "0",
            "order": "order_time", "order_direction": "desc",
        }, auth))

        # 本月 - 按消费
        members_month = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
            "limit": "50", "skip": "0",
            "order": "order_payed", "order_direction": "desc",
        }, auth))
        # 本月 - 按时长
        members_month_by_hours = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
            "limit": "50", "skip": "0",
            "order": "order_time", "order_direction": "desc",
        }, auth))

        # 本年 - 按消费
        members_year = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "3",
            "start_date": year_start, "end_date": year_end,
            "limit": "50", "skip": "0",
            "order": "order_payed", "order_direction": "desc",
        }, auth))
        # 本年 - 按时长
        members_year_by_hours = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "3",
            "start_date": year_start, "end_date": year_end,
            "limit": "50", "skip": "0",
            "order": "order_time", "order_direction": "desc",
        }, auth))

        # 总榜 - 按消费
        members_all = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": "2020-01-01T00:00:00+08:00", "end_date": today_end,
            "limit": "50", "skip": "0",
            "order": "order_payed", "order_direction": "desc",
        }, auth))
        # 总榜 - 按时长
        members_all_by_hours = _parse_members(_api_get("/api/system/stat/dashboards/member_summary_v2/", {
            "node_id": node_id, "date_type": "1",
            "start_date": "2020-01-01T00:00:00+08:00", "end_date": today_end,
            "limit": "50", "skip": "0",
            "order": "order_time", "order_direction": "desc",
        }, auth))

        # === new_summary_detail（按球桌类型拆分）===
        detail_month = _api_get("/api/system/stat/dashboards/new_summary_detail/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})

        # === all_summary（含日均数据）===
        all_summary_month = _api_get("/api/system/stat/dashboards/all_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})

        # === table_summary（每桌排行）===
        table_summary_today = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": today_start, "end_date": today_end,
        }, auth).get("Result", {})
        table_stats_today = []
        for item in table_summary_today.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_today.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_today.sort(key=lambda x: x["revenue"], reverse=True)

        table_summary_week = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "1",
            "start_date": week_start, "end_date": week_end,
        }, auth).get("Result", {})
        table_stats_week = []
        for item in table_summary_week.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_week.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_week.sort(key=lambda x: x["revenue"], reverse=True)

        table_summary_month = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})
        table_stats_month = []
        for item in table_summary_month.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_month.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_month.sort(key=lambda x: x["revenue"], reverse=True)

        table_summary_year = _api_get("/api/system/stat/dashboards/table_summary/", {
            "node_id": node_id, "date_type": "3",
            "start_date": year_start, "end_date": year_end,
        }, auth).get("Result", {})
        table_stats_year = []
        for item in table_summary_year.get("node_table_stats", []):
            tbl = item.get("table", {})
            table_stats_year.append({
                "address": tbl.get("address", ""),
                "type": tbl.get("type", 0),
                "type_name": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
                "order_count": item.get("table_order_count", 0),
                "revenue": _cents(item.get("table_order_payed")),
                "time_min": item.get("table_order_time", 0),
            })
        table_stats_year.sort(key=lambda x: x["revenue"], reverse=True)

        # === VIP汇总 ===
        vip_data = _api_get("/api/system/stat/dashboards/vip_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})
        vip_info = {
            "vip_count": vip_data.get("vip_count", 0),
            "balance": _cents(vip_data.get("member_balance")),
            "total_payed": _cents(vip_data.get("total_payed")),
            "total_give": _cents(vip_data.get("total_give")),
        }

        # === 时段分布 ===
        time_data = _api_get("/api/system/stat/dashboards/time_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})
        hourly_distribution = []
        for hour in range(24):
            hourly_distribution.append({
                "hour": hour,
                "label": f"{hour:02d}:00",
                "orders": int(time_data.get(str(hour), 0)),
            })

        # === 经营汇总 ===
        operate_summary = _api_get("/api/system/stat/dashboards/operate_summary/", {
            "node_id": node_id, "date_type": "2",
            "start_date": month_start, "end_date": month_end,
        }, auth).get("Result", {})

        # === 充值统计 ===
        balance_data = _api_get("/api/system/stat/balance_stats/", {
            "node_id": node_id, "date_type": "2",
            "limit": "100",
            "date__gte": year_start, "date__lt": year_end,
        }, auth)
        balance_stats = []
        for b in balance_data.get("Results", []):
            balance_stats.append({
                "date": b.get("date", ""),
                "balance": _cents(b.get("balance")),
                "recharge": _cents(b.get("money")),
                "recharge_payed": _cents(b.get("payed")),
                "recharge_count": b.get("count", 0),
                "consume": _cents(b.get("consume_money")),
                "consume_count": b.get("consume_count", 0),
            })

        # === 用户评论 ===
        comments_data = _api_get("/api/system/record/comments/", {
            "node_id": node_id, "limit": "20", "ordering": "-created_at",
        }, auth)
        comments = []
        for c in comments_data.get("Results", []):
            raw_date = c.get("created_at", "")
            formatted_date = ""
            if raw_date:
                try:
                    dt = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                    formatted_date = dt.strftime("%m-%d %H:%M")
                except Exception:
                    formatted_date = raw_date[:16]
            comments.append({
                "content": c.get("content", ""),
                "score": c.get("score"),
                "level": c.get("level"),
                "created": formatted_date,
                "created_at": raw_date,
                "user": c.get("phone", "匿名"),
                "label": c.get("label", ""),
                "table": c.get("table_address", ""),
            })

        # === 桌台异常 ===
        exceptions_data = _api_get("/api/system/record/table_exceptions/", {
            "node_id": node_id, "limit": "20",
        }, auth)
        exceptions = []
        for e in exceptions_data.get("Results", []):
            exceptions.append({
                "table": e.get("table_name", ""),
                "type": e.get("exception_type", ""),
                "status": e.get("status", ""),
                "created": e.get("created", ""),
                "resolved": e.get("resolved", False),
            })

        # === 微信支付投诉 ===
        complaints_data = _api_get("/api/system/record/wx_pay_order_complain_records/", {
            "node_id": node_id, "limit": "20",
        }, auth)
        complaints = []
        for c in complaints_data.get("Results", []):
            complaints.append({
                "order_no": c.get("order_no", ""),
                "reason": c.get("reason", c.get("complaint_reason", "")),
                "status": c.get("status", ""),
                "amount": _cents(c.get("amount")),
                "created": c.get("created", ""),
            })

        # === 组装返回 ===
        return {
            # 球桌实时状态
            "tables": tables,
            "busy_count": sum(1 for t in tables if t["open"]),
            "total_count": len(tables),

            # 日期范围
            "date_ranges": {
                "today": {"start": today_start, "end": today_end},
                "week": {"start": week_start, "end": week_end},
                "month": {"start": month_start, "end": month_end},
                "year": {"start": year_start, "end": year_end},
            },

            # 收入概览（今日）
            "summary_today": {
                "order_count": summary_today.get("order_count", 0),
                "revenue": _cents(summary_today.get("order_payed")),
                "total_revenue": _cents(summary_today.get("order_money")),
                "platform_income": _cents(summary_today.get("order_money", 0)) - _cents(summary_today.get("order_payed", 0)),
                "time_min": summary_today.get("order_time", 0),
                "face_count": summary_today.get("face_count", 0),
                "new_face_count": summary_today.get("new_face_count", 0),
                "member_count": summary_today.get("member_count", 0),
            },

            # 收入概览（本周）
            "summary_week": {
                "order_count": summary_week.get("order_count", 0),
                "revenue": _cents(summary_week.get("order_payed")),
                "total_revenue": _cents(summary_week.get("order_money")),
                "platform_income": _cents(summary_week.get("order_money", 0)) - _cents(summary_week.get("order_payed", 0)),
                "time_min": summary_week.get("order_time", 0),
                "face_count": summary_week.get("face_count", 0),
                "new_face_count": summary_week.get("new_face_count", 0),
                "member_count": summary_week.get("member_count", 0),
                "coupon_orders": summary_week.get("coupon_order_count", 0),
                "lose_count": summary_week.get("lose_count", 0),
            },

            # 收入概览（本月）
            "summary_month": {
                "order_count": summary_month.get("order_count", 0),
                "revenue": _cents(summary_month.get("order_payed")),
                "total_revenue": _cents(summary_month.get("order_money")),
                "platform_income": _cents(summary_month.get("order_money", 0)) - _cents(summary_month.get("order_payed", 0)),
                "time_min": summary_month.get("order_time", 0),
                "face_count": summary_month.get("face_count", 0),
                "new_face_count": summary_month.get("new_face_count", 0),
                "member_count": summary_month.get("member_count", 0),
                "coupon_orders": summary_month.get("coupon_order_count", 0),
                "coupon_revenue": _cents(summary_month.get("coupon_order_payed")),
                "good_orders": summary_month.get("good_order_count", 0),
                "good_revenue": _cents(summary_month.get("good_order_payed")),
                "lose_count": summary_month.get("lose_count", 0),
                "black_eight_revenue": _cents(detail_month.get("black_eight_payed")),
                "room_revenue": _cents(detail_month.get("room_payed")),
                "snooker_revenue": _cents(detail_month.get("snooker_payed")),
            },

            # 收入概览（本年）
            "summary_year": {
                "order_count": summary_year.get("order_count", 0),
                "revenue": _cents(summary_year.get("order_payed")),
                "total_revenue": _cents(summary_year.get("order_money")),
                "platform_income": _cents(summary_year.get("order_money", 0)) - _cents(summary_year.get("order_payed", 0)),
                "time_min": summary_year.get("order_time", 0),
                "face_count": summary_year.get("face_count", 0),
                "new_face_count": summary_year.get("new_face_count", 0),
                "member_count": summary_year.get("member_count", 0),
            },

            # 环比数据（前端 comparison 字段）
            "comparison": {
                "yesterday": {
                    "revenue": _cents(summary_yesterday.get("order_payed")),
                    "total_revenue": _cents(summary_yesterday.get("order_money")),
                    "date_range": {"start": yesterday_start, "end": yesterday_end},
                },
                "last_month_same_day": {
                    "revenue": _cents(summary_lmsd.get("order_payed")),
                    "total_revenue": _cents(summary_lmsd.get("order_money")),
                    "date_range": {"start": lmsd_start, "end": lmsd_end},
                },
                "day_before": {
                    "revenue": _cents(summary_dbf.get("order_payed")),
                    "total_revenue": _cents(summary_dbf.get("order_money")),
                    "date_range": {"start": dbf_start, "end": dbf_end},
                },
                "last_week": {
                    "revenue": _cents(summary_last_week.get("order_payed")),
                    "total_revenue": _cents(summary_last_week.get("order_money")),
                    "date_range": {"start": last_week_start, "end": last_week_end},
                },
                "last_month_week": {
                    "revenue": _cents(summary_lmsw.get("order_payed")),
                    "total_revenue": _cents(summary_lmsw.get("order_money")),
                    "date_range": {"start": lmsw_start, "end": lmsw_end},
                },
                "week_before_last": {
                    "revenue": _cents(summary_wbl.get("order_payed")),
                    "total_revenue": _cents(summary_wbl.get("order_money")),
                    "date_range": {"start": wbl_start, "end": wbl_end},
                },
                "last_month": {
                    "revenue": _cents(summary_last_month.get("order_payed")),
                    "total_revenue": _cents(summary_last_month.get("order_money")),
                    "date_range": {"start": last_month_start, "end": last_month_end},
                },
                "last_year_month": {
                    "revenue": _cents(summary_lym.get("order_payed")),
                    "total_revenue": _cents(summary_lym.get("order_money")),
                    "date_range": {"start": lym_start, "end": lym_end},
                },
                "last_last_month": {
                    "revenue": _cents(summary_llm.get("order_payed")),
                    "total_revenue": _cents(summary_llm.get("order_money")),
                    "date_range": {"start": llm_start, "end": llm_end},
                },
                "last_year_month_full": {
                    "revenue": _cents(summary_lymf.get("order_payed")),
                    "total_revenue": _cents(summary_lymf.get("order_money")),
                    "date_range": {"start": lymf_start, "end": lymf_end},
                },
                "last_year": {
                    "revenue": _cents(summary_last_year.get("order_payed")),
                    "total_revenue": _cents(summary_last_year.get("order_money")),
                    "date_range": {"start": last_year_start, "end": last_year_end},
                },
                "last_year_to_today": {
                    "revenue": _cents(summary_lytd.get("order_payed")),
                    "total_revenue": _cents(summary_lytd.get("order_money")),
                    "date_range": {"start": lytd_start, "end": lytd_end},
                },
            },

            # 日均数据
            "daily_avg": {
                "order_count": all_summary_month.get("avg_table_order_count", 0),
                "revenue": _cents(all_summary_month.get("avg_table_order_money")),
                "time_min": all_summary_month.get("avg_table_order_time", 0),
            },

            # 每桌排行
            "table_ranking_today": table_stats_today,
            "table_ranking_week": table_stats_week,
            "table_ranking_month": table_stats_month,
            "table_ranking_year": table_stats_year,

            # 会员TOP（按消费）
            "member_top_today": members_today,
            "member_top_week": members_week,
            "member_top": members_month,
            "member_top_year": members_year,
            "member_top_all": members_all,
            # 会员TOP（按时长）
            "member_top_today_by_hours": members_today_by_hours,
            "member_top_week_by_hours": members_week_by_hours,
            "member_top_month_by_hours": members_month_by_hours,
            "member_top_year_by_hours": members_year_by_hours,
            "member_top_all_by_hours": members_all_by_hours,

            # VIP
            "vip": vip_info,

            # 时段分布
            "hourly_distribution": hourly_distribution,

            # 经营汇总
            "operate_summary": {
                "face_count": operate_summary.get("face_count", 0),
                "new_face_count": operate_summary.get("new_face_count", 0),
                "member_count": operate_summary.get("member_count", 0),
                "new_member_count": operate_summary.get("new_member_count", 0),
                "goods_revenue": _cents(operate_summary.get("goods_order_payed")),
                "lose_count": operate_summary.get("lose_count", 0),
            },

            # 充值统计
            "balance_stats": balance_stats,

            # 用户评论
            "comments": comments,

            # 桌台异常
            "table_exceptions": exceptions,

            # 微信支付投诉
            "complaints": complaints,

            # 售卖机数据
            "vending": _get_vending_data(),
        }

    except Exception as e:
        print(f"[xiaotie_full_detail] 获取失败: {e}")
        return None


def _get_vending_data() -> dict:
    """获取售卖机数据（轻购云）"""
    try:
        from app.services.collectors.qgcloud import collect_qgcloud_raw
        raw = collect_qgcloud_raw()
        if not raw:
            return {"available": False, "today_amount": 0, "month_amount": 0, "year_amount": 0}
        return {
            "available": True,
            "today_amount": raw["today"]["amount"],
            "today_count": raw["today"]["count"],
            "month_amount": raw["month"]["amount"],
            "month_count": raw["month"]["count"],
            "month_margin": raw["month"]["margin"],
            "year_amount": raw["year"]["amount"],
            "year_count": raw["year"]["count"],
            "year_margin": raw["year"]["margin"],
            "goods": raw.get("goods", []),
        }
    except Exception as e:
        print(f"[vending] 获取售卖机数据失败: {e}")
        return {"available": False, "today_amount": 0, "month_amount": 0, "year_amount": 0}
