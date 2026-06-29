"""
卖品组合推荐。
数据来源: daily_snapshots.raw_json 中的 concession_items。
"""
from __future__ import annotations

import json
from collections import defaultdict
from itertools import combinations
from typing import Any

from app.core.database import DashboardRepository

BUSINESS_TYPE = "cinema"
PLATFORM = "fenghuang"
STORE_ID = "cinema_feicuicheng"


def analyze_concession_combinations(repository: DashboardRepository, days: int = 30) -> dict[str, Any]:
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days)
    if not snapshots:
        return {"status": "no_data", "source": "daily_snapshots", "message": "暂无影院数据库快照"}

    category_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "amount": 0.0, "items": defaultdict(lambda: {"count": 0, "amount": 0.0})}
    )
    item_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "amount": 0.0, "category": "未分类"})
    order_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    hour_stats: dict[str, dict[str, Any]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    rows_count = 0

    for snapshot in snapshots:
        raw = _parse_raw(snapshot.get("raw_json"))
        snapshot_date = str(snapshot.get("date") or "")
        for item in raw.get("concession_items") or []:
            name = _text(item.get("item_name") or item.get("product_name") or item.get("concession_item_name"))
            if not name:
                continue
            category = _text(item.get("category") or item.get("concession_category")) or "未分类"
            quantity = _number(item.get("quantity", item.get("sale_num", item.get("concession_quantity", 0))))
            amount = _number(item.get("revenue", item.get("pay_amount", item.get("concession_payment", 0))))
            sale_time = _text(item.get("sale_time") or item.get("time") or item.get("consume_time"))
            operator = _text(item.get("operator") or item.get("emp_name") or item.get("seller"))
            if quantity <= 0 and amount <= 0:
                continue

            rows_count += 1
            count = int(quantity) if quantity > 0 else 1
            category_stats[category]["count"] += count
            category_stats[category]["amount"] += amount
            category_stats[category]["items"][name]["count"] += count
            category_stats[category]["items"][name]["amount"] += amount
            item_stats[name]["count"] += count
            item_stats[name]["amount"] += amount
            item_stats[name]["category"] = category

            hour = _hour_label(sale_time)
            if hour:
                hour_stats[hour]["count"] += count
                hour_stats[hour]["amount"] += amount

            group_key = f"{snapshot_date}:{operator or 'unknown'}:{sale_time[:5] if sale_time else 'all'}"
            order_groups[group_key].append({"product": name, "amount": amount, "quantity": count})

    if rows_count == 0:
        return {"status": "no_data", "source": "daily_snapshots", "message": "暂无数据库卖品明细"}

    category_details = _category_details(category_stats)
    hot_combinations = _hot_combinations(order_groups)
    hour_distribution = [
        {"hour": hour, "count": int(stats["count"]), "amount": round(stats["amount"], 2)}
        for hour, stats in sorted(hour_stats.items())
    ]
    total_amount = sum(item["amount"] for item in category_details)
    total_count = sum(item["count"] for item in category_details)
    avg_hour_amount = sum(item["amount"] for item in hour_distribution) / len(hour_distribution) if hour_distribution else 0
    peak_hours = [item["hour"] for item in hour_distribution if avg_hour_amount and item["amount"] > avg_hour_amount * 1.5]
    low_hours = [item["hour"] for item in hour_distribution if avg_hour_amount and 0 < item["amount"] < avg_hour_amount * 0.5]

    return {
        "status": "ok",
        "source": "daily_snapshots",
        "category_details": category_details,
        "hot_combinations": hot_combinations,
        "hour_distribution": hour_distribution,
        "peak_hours": peak_hours,
        "low_hours": low_hours,
        "summary": {
            "total_categories": len(category_details),
            "total_items": int(total_count),
            "total_sku": len(item_stats),
            "total_amount": round(total_amount, 2),
            "avg_daily_revenue": round(total_amount / len(snapshots), 2) if snapshots else 0,
        },
    }


def generate_concession_suggestions(repository: DashboardRepository, days: int = 30) -> dict[str, Any]:
    analysis = analyze_concession_combinations(repository, days)
    if analysis["status"] != "ok":
        return analysis

    categories = analysis["category_details"]
    hot_combinations = analysis["hot_combinations"]
    total_amount = analysis["summary"]["total_amount"]
    suggestions: list[dict[str, Any]] = []
    combos: list[dict[str, Any]] = []
    pricing_suggestions: list[dict[str, Any]] = []

    if hot_combinations:
        top_combo = hot_combinations[0]
        combo_price = round(top_combo["avg_amount"] * 0.9, 2)
        combos.append(
            {
                "name": " + ".join(top_combo["items"]),
                "items": top_combo["items"],
                "price": combo_price,
                "expected_revenue": round(combo_price * max(top_combo["count"], 1), 2),
                "reason": f"该组合在数据库快照中共同出现 {top_combo['count']} 次",
            }
        )
        suggestions.append(
            {
                "category": "套餐组合",
                "title": "把高频组合做成套餐",
                "detail": f"{' + '.join(top_combo['items'])} 共同出现 {top_combo['count']} 次",
                "suggestion": f"建议设置组合套餐价 {combo_price:.0f} 元，作为前台优先推荐项",
                "priority": "high",
            }
        )

    if categories:
        top_category = categories[0]
        share = top_category["amount"] / total_amount * 100 if total_amount else 0
        suggestions.append(
            {
                "category": "品类优化",
                "title": f"{top_category['category']} 是当前核心品类",
                "detail": f"贡献 {top_category['amount']} 元，占比 {share:.1f}%",
                "suggestion": f"保持 {top_category['category']} 库存和陈列优先级",
                "priority": "medium",
            }
        )
        for item in top_category["top_items"][:3]:
            current_price = item["amount"] / max(item["count"], 1)
            pricing_suggestions.append(
                {
                    "item": item["name"],
                    "current_price": round(current_price, 2),
                    "suggested_price": round(current_price, 2),
                    "reason": "数据库显示该商品为高贡献商品，暂不建议降价",
                }
            )

    return {
        "status": "ok",
        "source": "daily_snapshots",
        "title": "卖品组合推荐建议",
        "conclusion": f"基于数据库快照分析 {analysis['summary']['total_categories']} 个品类、{analysis['summary']['total_sku']} 个 SKU",
        "evidence": [
            f"卖品销售额: {total_amount}元",
            f"卖品数量: {analysis['summary']['total_items']}",
            f"热销组合数: {len(hot_combinations)}",
        ],
        "confidence": 0.82,
        "summary": {
            "total_sku": analysis["summary"]["total_sku"],
            "hot_count": len(hot_combinations),
            "cold_count": len([item for item in categories if total_amount and item["amount"] < total_amount * 0.05]),
            "avg_daily_revenue": analysis["summary"]["avg_daily_revenue"],
            "total_items": analysis["summary"]["total_items"],
        },
        "suggestions": sorted(suggestions, key=lambda item: {"high": 0, "medium": 1, "low": 2}.get(item["priority"], 9)),
        "suggested_actions": [item["suggestion"] for item in suggestions],
        "category_breakdown": [
            {"category": item["category"], "amount": item["amount"], "count": item["count"]}
            for item in categories
        ],
        "hot_combinations": hot_combinations,
        "combos": combos,
        "pricing_suggestions": pricing_suggestions,
        "hour_distribution": analysis["hour_distribution"],
    }


def _category_details(category_stats: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    details = []
    for category, stats in category_stats.items():
        top_items = [
            {"name": name, "count": int(data["count"]), "amount": round(data["amount"], 2)}
            for name, data in stats["items"].items()
        ]
        top_items.sort(key=lambda item: -item["amount"])
        details.append(
            {
                "category": category,
                "total_count": int(stats["count"]),
                "count": int(stats["count"]),
                "total_amount": round(stats["amount"], 2),
                "amount": round(stats["amount"], 2),
                "top_items": top_items[:10],
            }
        )
    details.sort(key=lambda item: -item["amount"])
    return details


def _hot_combinations(order_groups: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    combo_count: dict[tuple[str, ...], int] = defaultdict(int)
    combo_amount: dict[tuple[str, ...], float] = defaultdict(float)
    for items in order_groups.values():
        names = sorted({item["product"] for item in items if item.get("product")})
        if len(names) < 2:
            continue
        amount = sum(_number(item.get("amount")) for item in items)
        for combo in combinations(names, 2):
            combo_count[combo] += 1
            combo_amount[combo] += amount
    combos = []
    for combo, count in sorted(combo_count.items(), key=lambda item: (-item[1], item[0]))[:10]:
        total = combo_amount[combo]
        combos.append(
            {
                "items": list(combo),
                "count": count,
                "total_amount": round(total, 2),
                "avg_amount": round(total / count, 2) if count else 0,
            }
        )
    return combos


def _parse_raw(raw_json: Any) -> dict[str, Any]:
    if isinstance(raw_json, dict):
        return raw_json
    if isinstance(raw_json, str):
        try:
            return json.loads(raw_json)
        except json.JSONDecodeError:
            return {}
    return {}


def _hour_label(value: str) -> str:
    value = _text(value)
    if len(value) >= 2 and value[:2].isdigit():
        return f"{value[:2]}:00"
    if len(value) >= 13 and value[11:13].isdigit():
        return f"{value[11:13]}:00"
    return ""


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
