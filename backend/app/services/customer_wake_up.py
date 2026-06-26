"""
客户分析服务
识别优质客户、正常客户、沉睡客户
"""
from datetime import datetime, timedelta, timezone
from typing import Any
import time as _time
import ssl
import json as _json
import pathlib as _pathlib

import httpx

from app.core.config import settings

# ── 配置 ─────────────────────────────────────────────────────

# 客户分类阈值
VIP_THRESHOLD = 1000          # 优质客户：历史消费≥1000元
VIP_HOURS = 50                # 优质客户：消费时长≥50小时
NORMAL_THRESHOLD = 100        # 正常客户：历史消费≥100元
NORMAL_HOURS = 10             # 正常客户：消费时长≥10小时
DORMANT_THRESHOLD_DAYS = 30   # 沉睡：超过30天未消费

_SSL_CTX = httpx.create_ssl_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

# ── 缓存目录 ─────────────────────────────────────────────────
_CACHE_DIR = _pathlib.Path("/tmp/ops_dashboard_cache")
_CACHE_FILE = _CACHE_DIR / "xiaotie_last_consume.json"
_WU_CACHE_FILE = _CACHE_DIR / "wu_orders_180d.json"


# ── 無老板 API ───────────────────────────────────────────────

# 复用 wu_laoban collector 的 API 函数
from app.services.collectors.wu_laoban import _api_get as _wu_api_get
from app.services.detail_xiaotie import _api_get as _xiaotie_order_get
from app.services.collectors.xiaotie import get_authorization as _get_xiaotie_auth


def _fetch_all_wu_orders(days: int = 180) -> list[dict]:
    """获取無老板近N天订单（带文件缓存，24小时刷新一次）"""
    # 检查文件缓存
    if _WU_CACHE_FILE.exists():
        try:
            data = _json.loads(_WU_CACHE_FILE.read_text(encoding="utf-8"))
            cache_time = datetime.fromisoformat(data.get("updated_at", ""))
            if (datetime.now() - cache_time).total_seconds() < 86400:  # 24小时
                return data.get("orders", [])
        except Exception:
            pass

    cutoff = ""
    if days > 0:
        cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    all_orders = []
    page = 1
    while page <= 200:
        resp = _wu_api_get("/admin/order/list", {"page": page})
        result = resp.get("result", {})
        # result 可能是列表或字典
        if isinstance(result, list):
            items = result
        elif isinstance(result, dict):
            items = result.get("list", [])
        else:
            items = []

        if not items:
            break
        all_orders.extend(items)
        if cutoff:
            last_date = items[-1].get("create_time", "")[:10]
            if last_date and last_date < cutoff:
                break

        # 获取总页数
        if isinstance(result, dict):
            total_pages = result.get("page_info", {}).get("total_page", 1)
        else:
            total_pages = 1

        if page >= total_pages:
            break
        page += 1

    # 保存到文件缓存
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _WU_CACHE_FILE.write_text(
        _json.dumps({
            "orders": all_orders,
            "updated_at": datetime.now().isoformat(),
        }, ensure_ascii=False),
        encoding="utf-8",
    )

    return all_orders


# ── 小铁 API ─────────────────────────────────────────────────

_XIRON_BASE = "https://table-api.xironiot.com"


def _xiaotie_get(endpoint: str, params: dict | None = None) -> dict:
    """调用小铁 API"""
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
    url = f"{_XIRON_BASE}/api/system/stat/dashboards/{endpoint}/"
    with httpx.Client(timeout=15, verify=_SSL_CTX) as client:
        r = client.get(url, params=params, headers=headers)
    return r.json() if r.status_code == 200 else {}


def _fetch_xiaotie_members() -> list[dict]:
    """获取小铁全部会员数据"""
    cache_key = "_cache_members"
    now_ts = _time.time()
    cached = getattr(_fetch_xiaotie_members, cache_key, None)
    if cached:
        cached_ts, cached_data = cached
        if now_ts - cached_ts < 300:
            return cached_data

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
    all_members: list[dict] = []
    skip = 0
    while skip < 10000:
        resp = _xiaotie_get("member_summary_v2", {**base_params, "skip": str(skip)})
        batch = resp.get("Results", [])
        if not batch:
            break
        all_members.extend(batch)
        skip += len(batch)

    setattr(_fetch_xiaotie_members, cache_key, (now_ts, all_members))
    return all_members


# ── 台球最后消费日期查询（带缓存）─────────────────────────────


def _load_consume_cache() -> dict[str, str]:
    """加载本地缓存的最后消费日期映射"""
    if not _CACHE_FILE.exists():
        return {}
    try:
        data = _json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        return data.get("consume_map", {})
    except Exception:
        return {}


def _save_consume_cache(consume_map: dict[str, str], last_order_time: str) -> None:
    """保存最后消费日期映射到本地缓存"""
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _CACHE_FILE.write_text(
        _json.dumps({
            "consume_map": consume_map,
            "last_order_time": last_order_time,
            "updated_at": datetime.now().isoformat(),
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _get_cache_last_time() -> str:
    """获取缓存中最后一条订单的时间"""
    if not _CACHE_FILE.exists():
        return ""
    try:
        data = _json.loads(_CACHE_FILE.read_text(encoding="utf-8"))
        return data.get("last_order_time", "")
    except Exception:
        return ""


def _fetch_xiaotie_last_consume_map() -> dict[str, str]:
    """
    从订单接口批量拉取最近订单，建立 nickname → 最后消费日期 映射
    带缓存：首次全量拉取，后续只拉增量
    """
    auth = _get_xiaotie_auth()
    if not auth:
        return _load_consume_cache()

    now = datetime.now()
    cached_map = _load_consume_cache()
    cache_last_time = _get_cache_last_time()

    # 确定拉取起点：有缓存则从缓存最后时间开始，否则拉180天
    if cache_last_time:
        # 从缓存最后时间的前一天开始，确保不遗漏
        try:
            cache_dt = datetime.fromisoformat(cache_last_time)
            cutoff = (cache_dt - timedelta(days=1)).strftime("%Y-%m-%dT00:00:00+08:00")
        except ValueError:
            cutoff = (now - timedelta(days=180)).strftime("%Y-%m-%dT00:00:00+08:00")
    else:
        cutoff = (now - timedelta(days=180)).strftime("%Y-%m-%dT00:00:00+08:00")

    today_end = now.strftime("%Y-%m-%dT23:59:59+08:00")

    # 拉取增量订单
    new_consume: dict[str, str] = {}
    latest_time = cache_last_time
    skip = 0
    batch_size = 50

    while skip < 5000:
        try:
            resp = _xiaotie_order_get(
                "/api/system/order/table_orders/",
                {
                    "expand": "Member.SocialUser",
                    "limit": str(batch_size),
                    "skip": str(skip),
                    "node_id": settings.xiaotie_node_id,
                    "created_at__gte": cutoff,
                    "created_at__lt": today_end,
                    "order": "created_at desc",
                },
                auth,
            )
        except Exception:
            break

        results = resp.get("Results", [])
        if not results:
            break

        for order in results:
            member = order.get("member") or {}
            social = member.get("social_user") or {}
            nickname = social.get("nickname") or member.get("remark") or ""
            if not nickname:
                info = order.get("info") or {}
                nickname = info.get("user_nickname") or ""
            if not nickname:
                continue

            created_at = order.get("created_at", "")
            if created_at:
                date_str = created_at[:10]
                # 更新新数据映射
                if nickname not in new_consume or date_str > new_consume[nickname]:
                    new_consume[nickname] = date_str
                # 记录最新订单时间
                if not latest_time or created_at > latest_time:
                    latest_time = created_at

        if len(results) < batch_size:
            break
        skip += len(results)

    # 合并：新数据覆盖旧数据（新日期一定更新）
    merged_map = {**cached_map, **new_consume}

    # 保存缓存
    if new_consume:
        _save_consume_cache(merged_map, latest_time or now.isoformat())

    return merged_map


# ── 客户分析主函数 ────────────────────────────────────────────

def analyze_customers() -> dict[str, Any]:
    """
    分析所有客户，分为优质/正常/沉睡三类
    返回结构化的客户分析报告
    """
    now = datetime.now()
    customers: list[dict[str, Any]] = []

    # ── 棋牌客户分析 ──
    try:
        mahjong_orders = _fetch_all_wu_orders(days=180)  # 拉取近180天数据
        mahjong_users: dict[str, dict] = {}

        for o in mahjong_orders:
            name = o.get("user_name", "").strip()
            if not name or "<img" in name:
                if "<img" in name:
                    name = name.split("/>")[-1].strip()
                if not name:
                    continue

            price = float(o.get("pay_price", 0) or 0)
            create_time = o.get("create_time", "")
            if not create_time:
                continue

            # 计算消费时长（小时）
            start_time = o.get("start_time", 0)
            end_time = o.get("end_time", 0)
            hours = 0
            if start_time and end_time and end_time > start_time:
                hours = round((end_time - start_time) / 3600, 1)  # 秒→小时

            dt_str = create_time[:10]
            if name not in mahjong_users:
                mahjong_users[name] = {
                    "name": name,
                    "orders": 0,
                    "total": 0.0,
                    "hours": 0.0,
                    "dates": [],
                }
            mahjong_users[name]["orders"] += 1
            mahjong_users[name]["total"] += price
            mahjong_users[name]["hours"] += hours
            mahjong_users[name]["dates"].append(dt_str)

        for name, d in mahjong_users.items():
            dates = sorted(set(d["dates"]))
            last_date = datetime.strptime(dates[-1], "%Y-%m-%d")
            days_since = (now - last_date).days
            total = round(d["total"], 2)
            order_hours = round(d["hours"], 1)
            order_count = d["orders"]

            # 按订单数+时长分类（消费金额不准，用订单数更准确）
            if days_since > DORMANT_THRESHOLD_DAYS and order_count >= 3:
                category = "dormant"
                category_label = "沉睡"
            elif order_count >= 30 and order_hours >= 50:
                category = "vip"
                category_label = "优质"
            elif order_count >= 10 and order_hours >= 10:
                category = "normal"
                category_label = "正常"
            elif order_count <= 3:
                category = "new"
                category_label = "新客"
            else:
                category = "low"
                category_label = "低频"

            customers.append({
                "name": name,
                "platform": "棋牌",
                "platform_key": "mahjong",
                "last_consume_date": dates[-1],
                "total_amount": total,
                "order_count": d["orders"],
                "order_hours": order_hours,
                "days_since_last": days_since,
                "category": category,
                "category_label": category_label,
            })

    except Exception as e:
        print(f"棋牌客户分析失败: {e}")

    # ── 台球客户分析 ──
    try:
        members = _fetch_xiaotie_members()
        # 获取台球客户最后消费日期映射
        last_consume_map = _fetch_xiaotie_last_consume_map()

        for m in members:
            social = (m.get("member") or {}).get("social_user") or {}
            name = social.get("nickname") or (m.get("member") or {}).get("remark") or "未知"
            order_count = m.get("order_count", 0)
            total_amount = round(m.get("order_payed", 0) / 100, 2)  # 分→元
            order_time_minutes = m.get("order_time", 0)
            order_hours = round(order_time_minutes / 60, 1)  # 分钟→小时

            # 从订单映射获取最后消费日期
            last_date = last_consume_map.get(name, "")
            days_since = 0
            if last_date:
                try:
                    last_dt = datetime.strptime(last_date, "%Y-%m-%d")
                    days_since = (now - last_dt).days
                except ValueError:
                    pass

            # 按订单数+时长分类（优先检查沉睡）
            if days_since > DORMANT_THRESHOLD_DAYS and order_count >= 3:
                category = "dormant"
                category_label = "沉睡"
            elif order_count >= 30 and order_hours >= 50:
                category = "vip"
                category_label = "优质"
            elif order_count >= 10 and order_hours >= 10:
                category = "normal"
                category_label = "正常"
            elif order_count <= 3:
                category = "new"
                category_label = "新客"
            else:
                category = "low"
                category_label = "低频"

            customers.append({
                "name": name,
                "platform": "台球",
                "platform_key": "billiards",
                "last_consume_date": last_date or "-",
                "total_amount": total_amount,
                "order_count": order_count,
                "order_hours": order_hours,
                "days_since_last": days_since,
                "category": category,
                "category_label": category_label,
            })

    except Exception as e:
        print(f"台球客户分析失败: {e}")

    # ── 统计汇总 ──
    vip_customers = [c for c in customers if c["category"] == "vip"]
    normal_customers = [c for c in customers if c["category"] == "normal"]
    dormant_customers = [c for c in customers if c["category"] == "dormant"]
    new_customers = [c for c in customers if c["category"] == "new"]
    low_customers = [c for c in customers if c["category"] == "low"]

    # 按消费时长排序（赠送金额和美团购买不计入消费金额，用时长更准确）
    vip_customers.sort(key=lambda x: -(x.get("order_hours") or 0))
    normal_customers.sort(key=lambda x: -(x.get("order_hours") or 0))
    dormant_customers.sort(key=lambda x: x["days_since_last"])

    return {
        "status": "ok",
        "summary": {
            "total_customers": len(customers),
            "vip_count": len(vip_customers),
            "normal_count": len(normal_customers),
            "dormant_count": len(dormant_customers),
            "new_count": len(new_customers),
            "low_count": len(low_customers),
            "vip_total_amount": round(sum(c["total_amount"] for c in vip_customers), 2),
            "dormant_total_amount": round(sum(c["total_amount"] for c in dormant_customers), 2),
        },
        "vip_customers": vip_customers[:100],  # 最多返回100个
        "normal_customers": normal_customers[:100],
        "dormant_customers": dormant_customers[:100],
        # 分别返回台球和棋牌的所有客户（按消费时长排序）
        "all_customers": (
            sorted([c for c in customers if c["platform_key"] == "billiards"], key=lambda x: -(x.get("order_hours") or 0)) +
            sorted([c for c in customers if c["platform_key"] == "mahjong"], key=lambda x: -(x.get("order_hours") or 0))
        ),
    }
