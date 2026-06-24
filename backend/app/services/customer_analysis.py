"""
客户分析服务 — RFM模型 + 复购率 + 消费变化
数据来源: 無老板棋牌 + 小铁台球
"""
from __future__ import annotations

import hashlib
import time as _time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

import ssl as _ssl

import httpx

from app.core.config import settings

_SSL_CTX = _ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = _ssl.CERT_NONE

# ── 無老板 API（复用 collector 认证方式）──────────────────────

_BASE = "https://admin.5laoban.com"
_SID = settings.wu_laoban_sid
_MID = settings.wu_laoban_mid


def _wu_token(path: str, ts: int) -> str:
    raw = f"{_BASE}{path}{ts}{_BASE}"
    return hashlib.md5(raw.encode()).hexdigest()


def _wu_get(path: str, params: dict | None = None) -> dict:
    import ssl
    ts = int(_time.time() * 1000)
    token = _wu_token(path.lstrip("/"), ts)
    headers = {
        "Accept": "application/json, text/plain, */*",
        "applet-token": token,
        "mid": _MID,
        "pageId": "100192",
        "timezone-offset": str(60000 * 8),
        "trace-id": hashlib.md5(str(ts).encode()).hexdigest(),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Cookie": f"admin_token={settings.wu_laoban_admin_token}",
    }
    p = {"isbrand": 0, "store": _SID, "sids[]": _SID, "timestamp_private": ts}
    if params:
        p.update(params)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with httpx.Client(timeout=15, verify=ctx) as client:
        r = client.get(f"{_BASE}{path}", params=p, headers=headers)
        r.raise_for_status()
        return r.json()


# ── 小铁 API ───────────────────────────────────────────────

_XIRON_BASE = "https://table-api.xironiot.com"


def _xiaotie_get(endpoint: str, params: dict | None = None) -> dict:
    token_file = settings.xiaotie_token_file
    try:
        token = token_file.read_text().strip()
    except Exception:
        return {}
    headers = {
        "Authorization": token,
        "Xi-App-Id": settings.xiaotie_app_id,
        "xweb_xhr": "1",
        "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }
    url = f"{settings.xiaotie_base_url.rstrip('/')}/api/system/stat/dashboards/{endpoint}/"
    with httpx.Client(timeout=15, verify=_SSL_CTX) as client:
        r = client.get(url, params=params, headers=headers)
    return r.json() if r.status_code == 200 else {}


# ── RFM 分析 ───────────────────────────────────────────────

def _fetch_wu_orders_range(date1: str, date2: str) -> list[dict]:
    """获取無老板指定日期范围的订单列表
    ⚠️ API忽略date1/date2参数，实际返回全部订单，需客户端过滤日期
    """
    all_orders = _fetch_all_wu_orders()
    # 客户端按日期过滤（API不支持服务端过滤）
    filtered = []
    for o in all_orders:
        ct = o.get("create_time", "")[:10].replace("-", "")  # "20260621"
        if date1 <= ct <= date2:
            filtered.append(o)
    return filtered


def _fetch_all_wu_orders() -> list[dict]:
    """获取無老板全部订单列表（API固定30条/页，自动翻页，带5分钟缓存）"""
    # 内存缓存，避免同一次请求重复拉取
    now_ts = _time.time()
    if hasattr(_fetch_all_wu_orders, '_cache') and _fetch_all_wu_orders._cache:
        cached_ts, cached_data = _fetch_all_wu_orders._cache
        if now_ts - cached_ts < 300:  # 5分钟缓存
            return cached_data

    all_orders = []
    page = 1
    while page <= 200:  # 30条/页，200页=6000条上限
        resp = _wu_get("/admin/order/list", {"page": page})
        items = resp.get("result", {}).get("list", [])
        if not items:
            break
        all_orders.extend(items)
        total_pages = resp.get("result", {}).get("page_info", {}).get("total_page", 1)
        if page >= total_pages:
            break
        page += 1

    _fetch_all_wu_orders._cache = (now_ts, all_orders)
    return all_orders


def _fetch_wu_orders(days: int = 90) -> list[dict]:
    """获取無老板近N天订单列表（客户端过滤日期）"""
    today = datetime.now()
    d1 = (today - timedelta(days=days)).strftime("%Y%m%d")
    d2 = today.strftime("%Y%m%d")
    return _fetch_wu_orders_range(d1, d2)


def _fetch_wu_users() -> list[dict]:
    """获取無老板全部用户列表（API固定30条/页，需翻页）"""
    all_users = []
    page = 1
    while page <= 500:  # 30条/页，500页=15000人上限
        resp = _wu_get("/admin/user/list", {"page": page})
        items = resp.get("result", {}).get("list", [])
        if not items:
            break
        all_users.extend(items)
        total_pages = resp.get("result", {}).get("page_info", {}).get("total_page", 1)
        if page >= total_pages:
            break
        page += 1
    return all_users


def calculate_rfm_mahjong(days: int = 90) -> dict[str, Any]:
    """
    计算棋牌客户RFM模型
    返回: 分层统计 + 用户明细 + 趋势
    """
    orders = _fetch_wu_orders(days)
    if not orders:
        return {"status": "no_data", "message": "无法获取订单数据"}

    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    # 按用户聚合
    user_data: dict[str, dict] = {}
    for o in orders:
        name = o.get("user_name", "").strip()
        if not name:
            continue
        # 过滤HTML标签
        if "<img" in name:
            name = name.split("/>")[-1].strip()
        price = float(o.get("pay_price", 0) or 0)
        create_time = o.get("create_time", "")
        if not create_time:
            continue

        if name not in user_data:
            user_data[name] = {"name": name, "orders": 0, "total": 0.0, "dates": []}
        user_data[name]["orders"] += 1
        user_data[name]["total"] += price
        user_data[name]["dates"].append(create_time[:10])

    # 计算RFM
    rfm_list = []
    for name, d in user_data.items():
        dates = sorted(set(d["dates"]))
        last_date = datetime.strptime(dates[-1], "%Y-%m-%d")
        recency = (now - last_date).days
        frequency = d["orders"]
        monetary = round(d["total"], 2)

        # 分层
        if recency <= 7 and frequency >= 10 and monetary >= 500:
            tier = "高价值"
        elif recency <= 14 and frequency >= 3:
            tier = "活跃"
        elif recency <= 30 and frequency >= 2:
            tier = "沉睡"
        elif recency > 30 and frequency >= 2:
            tier = "流失风险"
        else:
            tier = "新客"

        rfm_list.append({
            "name": name,
            "recency": recency,
            "frequency": frequency,
            "monetary": monetary,
            "tier": tier,
            "last_date": dates[-1],
            "first_date": dates[0],
        })

    # 按金额降序
    rfm_list.sort(key=lambda x: -x["monetary"])

    # 分层统计
    tier_stats: dict[str, dict] = {}
    for item in rfm_list:
        t = item["tier"]
        if t not in tier_stats:
            tier_stats[t] = {"count": 0, "total_amount": 0.0, "avg_frequency": 0}
        tier_stats[t]["count"] += 1
        tier_stats[t]["total_amount"] += item["monetary"]
        tier_stats[t]["avg_frequency"] += item["frequency"]

    for t in tier_stats:
        n = tier_stats[t]["count"]
        tier_stats[t]["total_amount"] = round(tier_stats[t]["total_amount"], 2)
        tier_stats[t]["avg_frequency"] = round(tier_stats[t]["avg_frequency"] / n, 1) if n else 0

    return {
        "status": "ok",
        "platform": "mahjong",
        "period_days": days,
        "total_users": len(rfm_list),
        "total_orders": len(orders),
        "total_revenue": round(sum(o.get("pay_price", 0) or 0 for o in orders), 2),
        "tier_stats": tier_stats,
        "top_users": rfm_list[:50],
    }


def calculate_rfm_billiards() -> dict[str, Any]:
    """
    计算台球客户RFM（基于 member_summary_v2）
    数据维度有限：只有累计消费和订单数，没有逐单明细
    支持分页获取全部会员（API限制单页最多50条）
    """
    today = datetime.now().strftime("%Y-%m-%d")
    base_params = {
        "node_id": settings.xiaotie_node_id,
        "date_type": "1",
        "start_date": "2026-01-01T00:00:00+08:00",
        "end_date": f"{today}T23:59:59+08:00",
        "order": "order_payed",
        "order_direction": "desc",
        "limit": "50",
    }

    # 分页获取全部会员（Count是页面大小，不是总数，循环到空为止）
    all_members: list[dict] = []
    skip = 0
    while skip < 10000:  # 安全上限
        resp = _xiaotie_get("member_summary_v2", {**base_params, "skip": str(skip)})
        batch = resp.get("Results", [])
        if not batch:
            break
        all_members.extend(batch)
        skip += len(batch)

    if not all_members:
        return {"status": "no_data", "message": "无法获取会员数据"}

    rfm_list = []
    for m in all_members:
        social = (m.get("member") or {}).get("social_user") or {}
        name = social.get("nickname") or (m.get("member") or {}).get("remark") or "未知"
        order_count = m.get("order_count", 0)
        total_amount = m.get("order_payed", 0) / 100  # 分→元

        # 简化RFM（无逐单数据，无法算精确recency）
        if order_count >= 20 and total_amount >= 1000:
            tier = "高价值"
        elif order_count >= 10:
            tier = "活跃"
        elif order_count >= 3:
            tier = "普通"
        else:
            tier = "新客"

        rfm_list.append({
            "name": name,
            "frequency": order_count,
            "monetary": round(total_amount, 2),
            "tier": tier,
            "recency": None,  # 无数据
        })

    rfm_list.sort(key=lambda x: -x["monetary"])

    tier_stats: dict[str, dict] = {}
    for item in rfm_list:
        t = item["tier"]
        if t not in tier_stats:
            tier_stats[t] = {"count": 0, "total_amount": 0.0, "avg_frequency": 0}
        tier_stats[t]["count"] += 1
        tier_stats[t]["total_amount"] += item["monetary"]
        tier_stats[t]["avg_frequency"] += item["frequency"]

    for t in tier_stats:
        n = tier_stats[t]["count"]
        tier_stats[t]["total_amount"] = round(tier_stats[t]["total_amount"], 2)
        tier_stats[t]["avg_frequency"] = round(tier_stats[t]["avg_frequency"] / n, 1) if n else 0

    return {
        "status": "ok",
        "platform": "billiards",
        "total_users": len(rfm_list),
        "tier_stats": tier_stats,
        "top_users": rfm_list[:50],
    }


# ── 复购率分析 ─────────────────────────────────────────────

def calculate_repurchase_mahjong(months: int = 6) -> dict[str, Any]:
    """
    按月计算新客→复购转化率
    """
    orders = _fetch_wu_orders(days=months * 31)
    if not orders:
        return {"status": "no_data"}

    # 按用户+月份聚合
    user_months: dict[str, set] = defaultdict(set)
    for o in orders:
        name = o.get("user_name", "").strip()
        if "<img" in name:
            name = name.split("/>")[-1].strip()
        ct = o.get("create_time", "")
        if name and ct:
            month_key = ct[:7]  # "2026-06"
            user_months[name].add(month_key)

    # 找出每个用户的首月
    user_first_month: dict[str, str] = {}
    for name, months_set in user_months.items():
        user_first_month[name] = min(months_set)

    # 按首月分组，计算次月复购率
    monthly_cohorts: dict[str, dict] = {}
    for name, first_month in user_first_month.items():
        if first_month not in monthly_cohorts:
            monthly_cohorts[first_month] = {"new_users": 0, "repurchased_next_month": 0}
        monthly_cohorts[first_month]["new_users"] += 1

        # 计算次月是否还有消费
        first_dt = datetime.strptime(first_month + "-01", "%Y-%m-%d")
        next_month = (first_dt.replace(day=28) + timedelta(days=4)).replace(day=1)
        next_month_key = next_month.strftime("%Y-%m")
        if next_month_key in user_months[name]:
            monthly_cohorts[first_month]["repurchased_next_month"] += 1

    # 整理结果
    result = []
    for month in sorted(monthly_cohorts.keys()):
        c = monthly_cohorts[month]
        rate = round(c["repurchased_next_month"] / c["new_users"] * 100, 1) if c["new_users"] else 0
        result.append({
            "month": month,
            "new_users": c["new_users"],
            "repurchased": c["repurchased_next_month"],
            "repurchase_rate": rate,
        })

    return {
        "status": "ok",
        "platform": "mahjong",
        "cohorts": result,
    }


# ── 消费变化（增长/流失） ──────────────────────────────────

def calculate_consumption_trend_mahjong() -> dict[str, Any]:
    """
    对比本月 vs 上月的用户消费，标记增长/流失
    """
    now = datetime.now()
    this_month = now.strftime("%Y%m")
    last_month_dt = (now.replace(day=1) - timedelta(days=1))
    last_month = last_month_dt.strftime("%Y%m")

    # 获取本月和上月订单（都用翻页，避免只取30条）
    this_orders = _fetch_wu_orders(days=30)
    last_orders = _fetch_wu_orders_range(
        last_month_dt.replace(day=1).strftime("%Y%m%d"),
        last_month_dt.strftime("%Y%m%d"),
    )

    def _aggregate(orders: list) -> dict[str, dict]:
        result: dict[str, dict] = {}
        for o in orders:
            name = o.get("user_name", "").strip()
            if "<img" in name:
                name = name.split("/>")[-1].strip()
            price = float(o.get("pay_price", 0) or 0)
            if name:
                if name not in result:
                    result[name] = {"orders": 0, "amount": 0.0}
                result[name]["orders"] += 1
                result[name]["amount"] += price
        return result

    this_data = _aggregate(this_orders)
    last_data = _aggregate(last_orders)

    # 对比
    changes = []
    all_users = set(this_data.keys()) | set(last_data.keys())
    for name in all_users:
        this_amt = this_data.get(name, {}).get("amount", 0)
        last_amt = last_data.get(name, {}).get("amount", 0)
        this_cnt = this_data.get(name, {}).get("orders", 0)
        last_cnt = last_data.get(name, {}).get("orders", 0)

        if last_amt > 0 and this_amt > 0:
            pct = round((this_amt - last_amt) / last_amt * 100, 1)
            if pct > 10:
                trend = "增长"
            elif pct < -10:
                trend = "流失"
            else:
                trend = "持平"
        elif this_amt > 0 and last_amt == 0:
            trend = "新增"
            pct = 100
        elif this_amt == 0 and last_amt > 0:
            trend = "流失"
            pct = -100
        else:
            continue

        changes.append({
            "name": name,
            "this_month": round(this_amt, 2),
            "last_month": round(last_amt, 2),
            "change_pct": pct,
            "trend": trend,
            "this_orders": this_cnt,
            "last_orders": last_cnt,
        })

    # 排序：增长排前面
    changes.sort(key=lambda x: -x["change_pct"])

    # 统计
    trend_counts = defaultdict(int)
    for c in changes:
        trend_counts[c["trend"]] += 1

    return {
        "status": "ok",
        "platform": "mahjong",
        "this_month": now.strftime("%Y-%m"),
        "last_month": last_month_dt.strftime("%Y-%m"),
        "trend_summary": dict(trend_counts),
        "total_compared": len(changes),
        "details": changes[:100],
    }
