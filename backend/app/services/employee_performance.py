"""
员工绩效分析 — 从 daily_snapshots 数据库读取
数据来源: daily_snapshots.raw_json 中的 concession_items / member_recharge_items / member_open_card_items
过滤条件: 仅翡翠城店（SFC上影国际影城翡翠城店）
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from app.core.database import DashboardRepository

BUSINESS_TYPE = "cinema"
PLATFORM = "fenghuang"
STORE_ID = "cinema_feicuicheng"

# 卖品套餐细分品类（按卖品名称匹配）
PACKAGE_TYPES = ["单人餐", "双人餐", "三人餐", "儿童套餐", "会员套餐", "单点餐"]
PACKAGE_KEYWORDS = {
    "单人餐": ["单人"],
    "双人餐": ["双人"],
    "三人餐": ["三人"],
    "儿童套餐": ["儿童"],
    "会员套餐": ["会员套餐"],
    "单点餐": ["单点"],
}


def _classify_package(product_name: str) -> str:
    """根据卖品名称归类套餐类型"""
    for type_name, keywords in PACKAGE_KEYWORDS.items():
        for kw in keywords:
            if kw in product_name:
                return type_name
    return "其他套餐"


def _parse_raw_json(raw_json: Any) -> dict:
    """解析 raw_json 字段"""
    if isinstance(raw_json, dict):
        return raw_json
    if isinstance(raw_json, str):
        try:
            return json.loads(raw_json)
        except (json.JSONDecodeError, TypeError):
            return {}
    return {}


def _is_in_date_range(date_str: str, start_date: str | None = None, end_date: str | None = None) -> bool:
    """检查日期是否在指定范围内"""
    if not start_date and not end_date:
        return True
    if not date_str or date_str == "None":
        return False
    try:
        date_str = str(date_str).strip()[:10]
        sale_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        if start_date:
            start = datetime.strptime(start_date, "%Y-%m-%d").date()
            if sale_date < start:
                return False
        if end_date:
            end = datetime.strptime(end_date, "%Y-%m-%d").date()
            if sale_date > end:
                return False
        return True
    except (ValueError, TypeError):
        return False


def get_employee_performance(repo: DashboardRepository, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """汇总员工绩效（卖品套餐分品类 + 活动 + 充值 + 开卡）
    数据来源: daily_snapshots 数据库
    """
    # 查询所有影院快照（最多365天）
    days = 365
    if start_date and end_date:
        d1 = datetime.strptime(start_date, "%Y-%m-%d").date()
        d2 = datetime.strptime(end_date, "%Y-%m-%d").date()
        days = (d2 - d1).days + 1
    snapshots = repo.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days, start_date=start_date)

    # 员工聚合数据
    employee_data: dict[str, dict] = defaultdict(lambda: {
        "packages": defaultdict(lambda: {"count": 0, "amount": 0.0}),
        "activity": {"count": 0, "amount": 0.0},
        "recharge_count": 0,
        "recharge_amount": 0.0,
        "open_count": 0,
        "dates": set(),
    })

    # 班次观影人次
    shift_data: dict[str, dict[str, int]] = defaultdict(lambda: {"morning": 0, "evening": 0})

    for snap in snapshots:
        raw = _parse_raw_json(snap.get("raw_json"))
        snap_date = snap.get("date", "")

        # 日期范围过滤
        if not _is_in_date_range(snap_date, start_date, end_date):
            continue

        # === 卖品数据（concession_items）===
        for item in raw.get("concession_items") or []:
            operator = str(item.get("operator", "")).strip()
            if not operator or operator in ("None", "--"):
                continue

            cat = str(item.get("category", "")).strip()
            item_name = str(item.get("item_name", "")).strip()
            quantity = float(item.get("quantity", 0) or 0)
            revenue = float(item.get("revenue", 0) or 0)

            # 记录工作日期
            if snap_date:
                employee_data[operator]["dates"].add(snap_date)

            if cat == "卖品套餐":
                pkg_type = _classify_package(item_name)
                employee_data[operator]["packages"][pkg_type]["count"] += quantity
                employee_data[operator]["packages"][pkg_type]["amount"] += revenue
            elif cat == "活动":
                employee_data[operator]["activity"]["count"] += quantity
                employee_data[operator]["activity"]["amount"] += revenue

        # === 会员充值数据（member_recharge_items）===
        for item in raw.get("member_recharge_items") or []:
            operator = str(item.get("operator", "")).strip()
            if not operator or operator in ("None", "--"):
                continue
            amount = float(item.get("amount", 0) or 0)
            if amount > 0:
                employee_data[operator]["recharge_count"] += 1
                employee_data[operator]["recharge_amount"] += amount

        # === 会员开卡数据（member_open_card_items）===
        for item in raw.get("member_open_card_items") or []:
            operator = str(item.get("operator", "")).strip()
            if not operator or operator in ("None", "--"):
                continue
            amount = float(item.get("amount", 0) or 0)
            if amount > 0:
                employee_data[operator]["open_count"] += 1

        # === 场次观影人次（rows 中的 film_attendance）===
        report_type = raw.get("report_type", "")
        if report_type == "screening_detail":
            for row in raw.get("rows") or []:
                show_date = str(row.get("date", "")).strip()
                attendance = int(float(row.get("film_attendance", 0) or 0))
                # 默认按日期累计到早班（后续可优化）
                if show_date and attendance > 0:
                    shift_data[show_date]["morning"] += attendance

    # 整理结果
    employees = []
    for name, data in employee_data.items():
        # 套餐细分
        package_detail = {}
        package_total_count = 0
        package_total_amount = 0.0
        for pkg_type in PACKAGE_TYPES:
            d = data["packages"].get(pkg_type, {"count": 0, "amount": 0.0})
            package_detail[pkg_type] = {
                "count": int(d["count"]),
                "amount": round(d["amount"], 2),
            }
            package_total_count += int(d["count"])
            package_total_amount += d["amount"]
        # 可能有未归类的"其他套餐"
        for pkg_type, d in data["packages"].items():
            if pkg_type not in PACKAGE_TYPES:
                if "其他套餐" not in package_detail:
                    package_detail["其他套餐"] = {"count": 0, "amount": 0.0}
                package_detail["其他套餐"]["count"] += int(d["count"])
                package_detail["其他套餐"]["amount"] += d["amount"]
                package_total_count += int(d["count"])
                package_total_amount += d["amount"]

        activity = data["activity"]
        total_amount = round(package_total_amount + activity["amount"] + data["recharge_amount"], 2)

        if total_amount > 0 or package_total_count > 0 or activity["count"] > 0 or data["recharge_count"] > 0 or data["open_count"] > 0:
            employees.append({
                "name": name,
                "package_detail": package_detail,
                "package_count": int(package_total_count),
                "package_amount": round(package_total_amount, 2),
                "activity_count": int(activity["count"]),
                "activity_amount": round(activity["amount"], 2),
                "shift": "morning",  # 简化处理
                "work_days": len(data["dates"]),
                "sale_dates": sorted(data["dates"]),
                "recharge_count": data["recharge_count"],
                "recharge_amount": round(data["recharge_amount"], 2),
                "open_count": data["open_count"],
            })

    employees.sort(key=lambda x: -(x["package_amount"] + x["activity_amount"] + x["recharge_amount"]))

    # 计算合计和人均效率
    for e in employees:
        e["total_amount"] = round(
            e["package_amount"] + e["activity_amount"] + e["recharge_amount"], 2
        )
        e["total_count"] = (
            e["package_count"] + e["activity_count"] +
            e["recharge_count"] + e["open_count"]
        )

        # 计算班次观影人次（简化：按工作日累加）
        sale_dates = set(e.get("sale_dates", []))
        total_shift_attendance = 0
        for date_str in sale_dates:
            total_shift_attendance += shift_data.get(date_str, {}).get("morning", 0)

        # 人均效率（卖品+活动销售额 / 观影人次）
        sales_amount = e["package_amount"] + e["activity_amount"]
        if total_shift_attendance > 0 and sales_amount > 0:
            e["shift_attendance"] = total_shift_attendance
            e["efficiency"] = round(sales_amount / total_shift_attendance, 2)
        else:
            e["shift_attendance"] = 0
            e["efficiency"] = 0

    employees.sort(key=lambda x: -x["total_amount"])

    # 收集所有出现过的套餐类型
    used_types = set()
    for e in employees:
        used_types.update(e["package_detail"].keys())

    # 班次观影人次汇总
    morning_total = sum(a.get("morning", 0) for a in shift_data.values())
    evening_total = sum(a.get("evening", 0) for a in shift_data.values())

    return {
        "status": "ok",
        "cinema": "SFC上影国际影城翡翠城店",
        "employees": employees,
        "package_types": [t for t in PACKAGE_TYPES if t in used_types] + (["其他套餐"] if "其他套餐" in used_types else []),
        "sources": {
            "concession": "daily_snapshots",
            "recharge": "daily_snapshots",
            "open_card": "daily_snapshots",
            "shift_attendance": "daily_snapshots",
        },
        "shift_summary": {
            "morning_total": morning_total,
            "evening_total": evening_total,
            "total": morning_total + evening_total,
        },
        "summary": {
            "total_employees": len(employees),
            "package_total": round(sum(e["package_amount"] for e in employees), 2),
            "activity_total": round(sum(e["activity_amount"] for e in employees), 2),
            "recharge_total": round(sum(e["recharge_amount"] for e in employees), 2),
            "open_card_count": sum(e["open_count"] for e in employees),
            "grand_total": round(sum(e["total_amount"] for e in employees), 2),
        },
    }
