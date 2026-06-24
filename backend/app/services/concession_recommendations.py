"""
卖品组合推荐 — 分析卖品搭配并生成套餐优化建议
数据来源: 凤凰云智 Excel 卖品销售明细
"""
from __future__ import annotations

from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any

import openpyxl

DATA_DIR = Path.home() / ".hermes" / "workspace" / "cinema-data"
CINEMA_NAME = "SFC上影国际影城翡翠城店"


def _find_latest_file(keyword: str) -> Path | None:
    files = sorted(
        DATA_DIR.glob(f"*{keyword}*2026*.xlsx"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def _parse_sheet(path: Path, header_row: int = 5) -> list[dict]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=header_row, values_only=True))
    wb.close()
    if not rows:
        return []
    headers = [str(h).strip() if h else f"col_{i}" for i, h in enumerate(rows[0])]
    result = []
    for row in rows[1:]:
        if not row or not row[0]:
            continue
        first = str(row[0]) if row[0] else ""
        if first.startswith("合计") or first.startswith("总计"):
            continue
        record = {}
        for i, val in enumerate(row):
            if i < len(headers):
                record[headers[i]] = val
        result.append(record)
    return result


def analyze_concession_combinations() -> dict[str, Any]:
    """
    分析卖品组合
    - 从卖品销售明细中分析品类搭配
    - 识别热销组合和冷门组合
    - 分析时段分布
    """
    path = _find_latest_file("卖品销售明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到卖品销售明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    # 按品类聚合
    category_stats: dict[str, dict] = defaultdict(lambda: {
        "count": 0, "amount": 0.0, "items": defaultdict(lambda: {"count": 0, "amount": 0.0}),
    })

    # 按订单（同时间+同销售员）聚合，用于分析组合
    order_groups: dict[str, list[dict]] = defaultdict(list)

    # 按时段统计
    hour_stats: dict[str, dict] = defaultdict(lambda: {"count": 0, "amount": 0.0})

    for r in rows:
        cinema = str(r.get("影院名称", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        cat = str(r.get("卖品大类", "")).strip()
        sub_cat = str(r.get("一级分类", "")).strip()
        product_name = str(r.get("卖品名称", "")).strip()
        amount = float(r.get("支付金额（元）", 0) or 0)
        quantity = int(float(r.get("销售数量", 0) or 0))
        sale_time = str(r.get("销售时间", "") or r.get("消费时间", "") or "").strip()
        seller = str(r.get("销售员", "")).strip()

        if not product_name:
            continue

        # 品类统计
        cat_key = cat if cat else "未分类"
        category_stats[cat_key]["count"] += quantity
        category_stats[cat_key]["amount"] += amount
        category_stats[cat_key]["items"][product_name]["count"] += quantity
        category_stats[cat_key]["items"][product_name]["amount"] += amount

        # 时段统计
        if sale_time and len(sale_time) >= 2:
            hour = sale_time[:2] if sale_time[1].isdigit() else ""
            if hour:
                hour_stats[f"{hour}:00"]["count"] += quantity
                hour_stats[f"{hour}:00"]["amount"] += amount

        # 组合分析（同销售员+相近时间的订单视为同一笔）
        if seller and seller not in ("None", "--"):
            order_key = f"{seller}_{sale_time[:13] if sale_time else ''}"
            order_groups[order_key].append({
                "product": product_name,
                "category": cat,
                "amount": amount,
                "quantity": quantity,
            })

    # 分析组合
    combo_counter: dict[tuple, int] = defaultdict(int)
    combo_amount: dict[tuple, float] = defaultdict(float)

    for order_key, items in order_groups.items():
        products = list(set(item["product"] for item in items))
        if len(products) >= 2:
            # 生成2-item和3-item组合
            for r in range(2, min(4, len(products) + 1)):
                for combo in combinations(sorted(products), r):
                    combo_counter[combo] += 1
                    combo_amount[combo] += sum(item["amount"] for item in items)

    # 排序组合
    hot_combos = sorted(combo_counter.items(), key=lambda x: -x[1])[:10]
    hot_combos_list = [
        {
            "items": list(combo),
            "count": count,
            "total_amount": round(combo_amount[combo], 2),
            "avg_amount": round(combo_amount[combo] / count, 2) if count else 0,
        }
        for combo, count in hot_combos
        if count >= 2  # 至少出现2次
    ]

    # 品类明细
    category_details = []
    for cat, stats in category_stats.items():
        items_list = [
            {"name": name, "count": data["count"], "amount": round(data["amount"], 2)}
            for name, data in stats["items"].items()
        ]
        items_list.sort(key=lambda x: -x["amount"])
        category_details.append({
            "category": cat,
            "total_count": stats["count"],
            "total_amount": round(stats["amount"], 2),
            "top_items": items_list[:10],
        })
    category_details.sort(key=lambda x: -x["total_amount"])

    # 时段分布
    hour_distribution = []
    for hour, stats in sorted(hour_stats.items()):
        hour_distribution.append({
            "hour": hour,
            "count": stats["count"],
            "amount": round(stats["amount"], 2),
        })

    # 时段高峰识别
    if hour_distribution:
        avg_hourly_amount = sum(h["amount"] for h in hour_distribution) / len(hour_distribution)
        peak_hours = [h["hour"] for h in hour_distribution if h["amount"] > avg_hourly_amount * 1.5]
        low_hours = [h["hour"] for h in hour_distribution if h["amount"] < avg_hourly_amount * 0.5 and h["amount"] > 0]
    else:
        peak_hours = []
        low_hours = []

    total_amount = sum(s["amount"] for s in category_stats.values())
    total_count = sum(s["count"] for s in category_stats.values())

    return {
        "status": "ok",
        "source": path.name,
        "cinema": CINEMA_NAME,
        "category_details": category_details,
        "hot_combinations": hot_combos_list,
        "hour_distribution": hour_distribution,
        "peak_hours": peak_hours,
        "low_hours": low_hours,
        "summary": {
            "total_categories": len(category_details),
            "total_items": sum(len(c["top_items"]) for c in category_details),
            "total_count": total_count,
            "total_amount": round(total_amount, 2),
        },
    }


def generate_concession_suggestions() -> dict[str, Any]:
    """
    生成卖品建议
    - 推荐套餐组合
    - 优化定价策略
    """
    analysis = analyze_concession_combinations()
    if analysis["status"] != "ok":
        return analysis

    suggestions: list[dict[str, Any]] = []
    categories = analysis.get("category_details", [])
    hot_combos = analysis.get("hot_combinations", [])
    peak_hours = analysis.get("peak_hours", [])
    low_hours = analysis.get("low_hours", [])
    total_amount = analysis["summary"]["total_amount"]

    # 1. 热销组合推荐
    if hot_combos:
        top_combo = hot_combos[0]
        suggestions.append({
            "category": "套餐组合",
            "title": "热销组合推荐为正式套餐",
            "detail": f"最热销组合：{' + '.join(top_combo['items'])}，已出现{top_combo['count']}次",
            "suggestion": f"建议将'{' + '.join(top_combo['items'])}'设为正式套餐，定价{top_combo['avg_amount']*0.85:.0f}元（比单买优惠15%）",
            "priority": "high",
            "potential_impact": f"预计可提升套餐转化率20%+",
        })

    # 2. 品类优化
    if categories:
        top_cat = categories[0]
        suggestions.append({
            "category": "品类优化",
            "title": f"核心品类：{top_cat['category']}",
            "detail": f"{top_cat['category']}贡献{top_cat['total_amount']}元，占比{top_cat['total_amount']/total_amount*100:.1f}%",
            "suggestion": f"建议保持{top_cat['category']}的充足库存，并开发该品类下的新品",
            "priority": "medium",
        })

        if len(categories) > 1:
            low_cats = [c for c in categories if c["total_amount"] < total_amount * 0.05]
            if low_cats:
                names = "、".join(c["category"] for c in low_cats)
                suggestions.append({
                    "category": "品类优化",
                    "title": f"低效品类优化：{names}",
                    "detail": f"{names}合计占比不足5%",
                    "suggestion": "建议评估是否继续销售低效品类，或通过捆绑销售提升其销量",
                    "priority": "low",
                })

    # 3. 时段策略
    if peak_hours:
        suggestions.append({
            "category": "时段策略",
            "title": "高峰时段卖品策略",
            "detail": f"卖品销售高峰：{'、'.join(peak_hours)}",
            "suggestion": "建议在高峰时段增加卖品库存和人手，提前备货减少等待时间",
            "priority": "high",
        })

    if low_hours:
        suggestions.append({
            "category": "时段策略",
            "title": "低峰时段促销建议",
            "detail": f"卖品销售低谷：{'、'.join(low_hours)}",
            "suggestion": "建议在低峰时段推出限时折扣或特价套餐，提升卖品渗透率",
            "priority": "medium",
        })

    # 4. 套餐设计建议
    if categories and len(categories) >= 2:
        top_items_by_cat = {}
        for cat in categories[:3]:
            if cat["top_items"]:
                top_items_by_cat[cat["category"]] = cat["top_items"][0]

        if len(top_items_by_cat) >= 2:
            combo_items = list(top_items_by_cat.values())
            combo_names = " + ".join(item["name"] for item in combo_items[:2])
            combo_price = sum(item["amount"] / max(item["count"], 1) for item in combo_items[:2])
            suggestions.append({
                "category": "套餐设计",
                "title": "跨品类套餐建议",
                "detail": f"建议组合不同品类的热销品：{combo_names}",
                "suggestion": f"设计跨品类套餐，定价{combo_price*0.8:.0f}元（比单买优惠20%），提升客单价",
                "priority": "medium",
            })

    # 5. 定价策略
    if categories:
        top_items = []
        for cat in categories[:3]:
            for item in cat["top_items"][:3]:
                avg_price = item["amount"] / max(item["count"], 1)
                top_items.append({"name": item["name"], "avg_price": avg_price})

        if top_items:
            suggestions.append({
                "category": "定价策略",
                "title": "价格带分析",
                "detail": f"热销品均价区间：{min(i['avg_price'] for i in top_items):.0f}-{max(i['avg_price'] for i in top_items):.0f}元",
                "suggestion": "建议套餐定价集中在20-40元区间，这是顾客最容易接受的价格带",
                "priority": "medium",
            })

    # 排序
    priority_map = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: priority_map.get(x["priority"], 9))

    return {
        "status": "ok",
        "title": "卖品组合推荐建议",
        "conclusion": f"分析{analysis['summary']['total_categories']}个品类、{analysis['summary']['total_items']}种商品，生成{len(suggestions)}条优化建议",
        "evidence": [
            f"卖品总销售额: {total_amount}元",
            f"品类数量: {analysis['summary']['total_categories']}",
            f"热销组合数: {len(hot_combos)}",
            f"销售高峰时段: {'、'.join(peak_hours) if peak_hours else '无明显高峰'}",
            f"销售低谷时段: {'、'.join(low_hours) if low_hours else '无明显低谷'}",
        ],
        "confidence": 0.80,
        "suggestions": suggestions,
        "suggested_actions": [s["suggestion"] for s in suggestions[:5]],
        "hot_combinations": hot_combos,
        "category_breakdown": [
            {"category": c["category"], "amount": c["total_amount"], "count": c["total_count"]}
            for c in categories
        ],
        "hour_distribution": analysis.get("hour_distribution", []),
    }
