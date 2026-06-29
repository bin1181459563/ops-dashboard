"""
会员消费分析服务。
数据来源: daily_snapshots.raw_json 中的会员消费、充值、开卡明细。
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from typing import Any

from app.core.database import DashboardRepository

BUSINESS_TYPE = "cinema"
PLATFORM = "fenghuang"
STORE_ID = "cinema_feicuicheng"


def get_member_analysis(repository: DashboardRepository, days: int = 30) -> dict[str, Any]:
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days)
    if not snapshots:
        return _empty_response("暂无影院数据库快照")

    members: dict[str, dict[str, Any]] = defaultdict(_member_bucket)
    channel_stats: dict[str, int] = defaultdict(int)
    member_consumption_rows = 0
    recharge_rows = 0
    open_card_rows = 0
    member_consumption_days = 0
    recharge_days = 0
    open_card_days = 0

    for snapshot in snapshots:
        raw = _parse_raw(snapshot.get("raw_json"))
        snapshot_date = snapshot.get("date")
        member_items = raw.get("member_items") or []
        recharge_items = raw.get("member_recharge_items") or []
        open_card_items = raw.get("member_open_card_items") or []
        if member_items:
            member_consumption_days += 1
        if recharge_items:
            recharge_days += 1
        if open_card_items:
            open_card_days += 1

        for item in member_items:
            member_id = _member_id(item)
            if not member_id:
                continue
            amount = _number(item.get("amount", item.get("pay_amount", item.get("card_consume_amount", 0))))
            if amount <= 0:
                continue
            product_type = _text(item.get("product_type", item.get("type", "未知")))
            product_name = _text(item.get("product_name", item.get("item_name", "未知商品")))
            channel = _text(item.get("channel", item.get("consume_channel", item.get("pay_method", ""))))
            consume_time = _text(item.get("time", item.get("consume_time", snapshot_date or "")))

            member_consumption_rows += 1
            member = members[member_id]
            member["member_id"] = member_id
            member["card_type"] = _text(item.get("card_type", member.get("card_type", "")))
            member["total_amount"] += amount
            member["total_count"] += 1
            member["channels"].add(channel or "未知")
            member["products"][product_name] += amount
            _touch_time(member, consume_time)

            if "影票" in product_type:
                member["ticket_amount"] += amount
                member["ticket_count"] += 1
            elif "卖品" in product_type:
                member["concession_amount"] += amount
                member["concession_count"] += 1

        for item in recharge_items:
            member_id = _member_id(item)
            if not member_id:
                continue
            amount = _number(item.get("amount", item.get("pay_amount", 0)))
            member = members[member_id]
            member["member_id"] = member_id
            member["card_type"] = _text(item.get("card_type", member.get("card_type", "")))
            member["recharge_amount"] += amount
            member["recharge_count"] += 1 if amount > 0 else 0
            recharge_rows += 1

        for item in open_card_items:
            member_id = _member_id(item)
            if not member_id:
                continue
            member = members[member_id]
            member["member_id"] = member_id
            member["card_type"] = _text(item.get("card_type", member.get("card_type", "")))
            member["open_card_count"] += 1
            member["open_card_amount"] += _number(item.get("pay_amount", item.get("amount", 0)))
            open_card_rows += 1

    member_list = [_public_member(member) for member in members.values() if member.get("member_id")]
    member_list.sort(key=lambda item: (-item["total_amount"], -item.get("recharge_amount", 0), item["member_id"]))

    for member in member_list:
        for channel in member.get("channels", []):
            channel_stats[channel or "未知"] += 1

    total_members = len(member_list)
    total_amount = sum(item["total_amount"] for item in member_list)
    total_count = sum(item["total_count"] for item in member_list)
    total_recharge_amount = sum(item.get("recharge_amount", 0) for item in member_list)
    open_card_count = sum(item.get("open_card_count", 0) for item in member_list)

    data_gaps = []
    if member_consumption_rows == 0:
        data_gaps.append("会员消费明细缺失")
    elif member_consumption_days < max(2, len(snapshots) * 0.2):
        data_gaps.append(f"会员消费明细覆盖不足（{member_consumption_days}/{len(snapshots)}天）")
    if recharge_rows == 0:
        data_gaps.append("会员充值明细缺失")
    if open_card_rows == 0:
        data_gaps.append("会员开卡明细缺失")

    return {
        "status": "ok",
        "source": "daily_snapshots",
        "data_gaps": data_gaps,
        "data_coverage": {
            "snapshot_days": len(snapshots),
            "member_consumption_days": member_consumption_days,
            "member_recharge_days": recharge_days,
            "member_open_card_days": open_card_days,
            "member_consumption_rows": member_consumption_rows,
            "member_recharge_rows": recharge_rows,
            "member_open_card_rows": open_card_rows,
        },
        "summary": {
            "total_members": total_members,
            "total_amount": round(total_amount, 2),
            "total_count": total_count,
            "avg_per_member": round(total_amount / total_members, 2) if total_members else 0,
            "avg_per_visit": round(total_amount / total_count, 2) if total_count else 0,
            "total_recharge_amount": round(total_recharge_amount, 2),
            "open_card_count": open_card_count,
        },
        "frequency_distribution": _frequency_distribution(member_list),
        "avg_amount_distribution": _avg_amount_distribution(member_list),
        "channel_stats": dict(channel_stats),
        "top_members": member_list[:20],
        "all_members": member_list,
    }


def _empty_response(message: str) -> dict[str, Any]:
    return {
        "status": "no_data",
        "source": "daily_snapshots",
        "message": message,
        "data_gaps": ["影院数据库快照缺失"],
        "summary": {
            "total_members": 0,
            "total_amount": 0,
            "total_count": 0,
            "avg_per_member": 0,
            "avg_per_visit": 0,
            "total_recharge_amount": 0,
            "open_card_count": 0,
        },
        "frequency_distribution": _frequency_distribution([]),
        "avg_amount_distribution": _avg_amount_distribution([]),
        "channel_stats": {},
        "top_members": [],
        "all_members": [],
    }


def _member_bucket() -> dict[str, Any]:
    return {
        "member_id": "",
        "card_type": "",
        "total_amount": 0.0,
        "total_count": 0,
        "ticket_amount": 0.0,
        "ticket_count": 0,
        "concession_amount": 0.0,
        "concession_count": 0,
        "recharge_amount": 0.0,
        "recharge_count": 0,
        "open_card_amount": 0.0,
        "open_card_count": 0,
        "first_time": None,
        "last_time": None,
        "channels": set(),
        "products": defaultdict(float),
    }


def _public_member(member: dict[str, Any]) -> dict[str, Any]:
    total_count = int(member["total_count"])
    total_amount = float(member["total_amount"])
    return {
        "member_id": member["member_id"],
        "card_type": member["card_type"] or "未知",
        "total_amount": round(total_amount, 2),
        "total_count": total_count,
        "avg_amount": round(total_amount / total_count, 2) if total_count else 0,
        "ticket_amount": round(member["ticket_amount"], 2),
        "ticket_count": int(member["ticket_count"]),
        "concession_amount": round(member["concession_amount"], 2),
        "concession_count": int(member["concession_count"]),
        "recharge_amount": round(member["recharge_amount"], 2),
        "recharge_count": int(member["recharge_count"]),
        "open_card_amount": round(member["open_card_amount"], 2),
        "open_card_count": int(member["open_card_count"]),
        "first_time": member["first_time"].isoformat() if member["first_time"] else None,
        "last_time": member["last_time"].isoformat() if member["last_time"] else None,
        "channels": sorted(member["channels"]),
        "top_products": sorted(
            [{"name": name, "amount": round(amount, 2)} for name, amount in member["products"].items()],
            key=lambda item: -item["amount"],
        )[:5],
    }


def _frequency_distribution(members: list[dict[str, Any]]) -> dict[str, int]:
    distribution = {"1次": 0, "2-3次": 0, "4-5次": 0, "6-10次": 0, "10次以上": 0}
    for member in members:
        count = int(member.get("total_count") or 0)
        if count <= 0:
            continue
        if count == 1:
            distribution["1次"] += 1
        elif count <= 3:
            distribution["2-3次"] += 1
        elif count <= 5:
            distribution["4-5次"] += 1
        elif count <= 10:
            distribution["6-10次"] += 1
        else:
            distribution["10次以上"] += 1
    return distribution


def _avg_amount_distribution(members: list[dict[str, Any]]) -> dict[str, int]:
    distribution = {"0-20元": 0, "20-50元": 0, "50-100元": 0, "100-200元": 0, "200元以上": 0}
    for member in members:
        amount = float(member.get("avg_amount") or 0)
        if amount <= 0:
            continue
        if amount < 20:
            distribution["0-20元"] += 1
        elif amount < 50:
            distribution["20-50元"] += 1
        elif amount < 100:
            distribution["50-100元"] += 1
        elif amount < 200:
            distribution["100-200元"] += 1
        else:
            distribution["200元以上"] += 1
    return distribution


def _parse_raw(raw_json: Any) -> dict[str, Any]:
    if isinstance(raw_json, dict):
        return raw_json
    if isinstance(raw_json, str):
        try:
            return json.loads(raw_json)
        except json.JSONDecodeError:
            return {}
    return {}


def _member_id(item: dict[str, Any]) -> str:
    return _text(
        item.get("member_id")
        or item.get("card_no")
        or item.get("card_number")
        or item.get("card_no_masked")
    )


def _touch_time(member: dict[str, Any], value: str) -> None:
    parsed = _parse_time(value)
    if parsed is None:
        return
    if member["first_time"] is None or parsed < member["first_time"]:
        member["first_time"] = parsed
    if member["last_time"] is None or parsed > member["last_time"]:
        member["last_time"] = parsed


def _parse_time(value: str) -> datetime | None:
    value = _text(value)
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value[:19] if "%H" in fmt else value[:10], fmt)
        except ValueError:
            continue
    return None


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
