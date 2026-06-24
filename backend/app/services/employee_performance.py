"""
员工绩效分析 — 卖品套餐（分品类） + 活动套餐 + 会员充值 + 会员开卡
数据来源: 凤凰云智 Excel 报表
过滤条件: 仅翡翠城店（SFC上影国际影城翡翠城店）
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

import openpyxl

DATA_DIR = Path.home() / ".hermes" / "workspace" / "cinema-data"

# 翡翠城店名称（用于过滤）
CINEMA_NAME = "SFC上影国际影城翡翠城店"

# 卖品套餐细分品类（按卖品名称匹配）
PACKAGE_TYPES = ["单人餐", "双人餐", "三人餐", "儿童套餐", "会员套餐", "单点餐"]
# 匹配规则：品名包含关键词即归类
PACKAGE_KEYWORDS = {
    "单人餐": ["单人"],
    "双人餐": ["双人"],
    "三人餐": ["三人"],
    "儿童套餐": ["儿童"],
    "会员套餐": ["会员套餐"],
    "单点餐": ["单点"],
}


def _find_latest_file(keyword: str) -> Path | None:
    """查找最新的匹配文件"""
    files = sorted(
        DATA_DIR.glob(f"*{keyword}*2026*.xlsx"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def _is_in_date_range(date_str: str, start_date: str | None = None, end_date: str | None = None) -> bool:
    """检查日期是否在指定日期范围内"""
    if not start_date and not end_date:
        return True
    if not date_str or date_str == "None":
        return False
    try:
        from datetime import datetime
        # 解析日期（支持多种格式）
        date_str = str(date_str).strip()
        if len(date_str) >= 10:
            date_str = date_str[:10]  # 取前10位 YYYY-MM-DD
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


def _parse_sheet(path: Path, header_row: int = 5) -> list[dict]:
    """解析Excel，返回行字典列表"""
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
        # 跳过汇总行
        first = str(row[0]) if row[0] else ""
        if first.startswith("合计") or first.startswith("总计"):
            continue
        record = {}
        for i, val in enumerate(row):
            if i < len(headers):
                record[headers[i]] = val
        result.append(record)
    return result


def _classify_package(product_name: str) -> str:
    """根据卖品名称归类套餐类型"""
    for type_name, keywords in PACKAGE_KEYWORDS.items():
        for kw in keywords:
            if kw in product_name:
                return type_name
    return "其他套餐"


def _parse_time(time_str: str) -> tuple[int, int] | None:
    """解析时间字符串，返回 (小时, 分钟)"""
    if not time_str or time_str == "None":
        return None
    try:
        parts = str(time_str).split(":")
        if len(parts) >= 2:
            return int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        pass
    return None


def get_shift_attendance() -> dict[str, Any]:
    """从场次放映表统计每天早班/晚班的观影人次
    早班：9:00-16:30，晚班：16:30-00:00
    返回：{date: {"morning": 人次, "evening": 人次}}
    """
    path = _find_latest_file("场次放映明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到场次放映明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    # 按日期和班次统计观影人次
    shift_data: dict[str, dict[str, int]] = defaultdict(lambda: {"morning": 0, "evening": 0})

    for r in rows:
        # 过滤翡翠城店
        cinema = str(r.get("影院", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        # 获取放映日期和时间
        show_date = str(r.get("放映日期", "")).strip()
        show_time = str(r.get("放映时间", "")).strip()
        attendance = int(float(r.get("观影总人次", 0) or 0))

        if not show_date or show_date == "None":
            continue

        # 解析时间，判断班次
        time_parts = _parse_time(show_time)
        if time_parts:
            hour, minute = time_parts
            # 早班：9:00-16:30，晚班：16:30-00:00
            if hour < 9:
                # 凌晨场次算晚班（前一天的晚班延续）
                shift_data[show_date]["evening"] += attendance
            elif hour < 16 or (hour == 16 and minute < 30):
                shift_data[show_date]["morning"] += attendance
            else:
                shift_data[show_date]["evening"] += attendance
        else:
            # 无法解析时间，默认算早班
            shift_data[show_date]["morning"] += attendance

    return {
        "status": "ok",
        "source": path.name,
        "shift_data": dict(shift_data),
    }


def analyze_concession_packages(start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """分析卖品套餐+活动套餐的员工绩效（仅翡翠城店）
    start_date: 开始日期 YYYY-MM-DD
    end_date: 结束日期 YYYY-MM-DD
    """
    path = _find_latest_file("卖品销售明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到卖品销售明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    # 按员工聚合 — 卖品套餐细分 + 活动套餐 + 按天班次记录
    employee_data: dict[str, dict] = defaultdict(lambda: {
        "packages": defaultdict(lambda: {"count": 0, "amount": 0.0}),
        "activity": {"count": 0, "amount": 0.0},
        "daily_shifts": {},  # {date: "morning"/"evening"} 每天的班次
        "dates": set(),  # 工作日期集合
    })

    for r in rows:
        # 过滤翡翠城店
        cinema = str(r.get("影院名称", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        emp = str(r.get("销售员", "")).strip()
        if not emp or emp in ("None", "--"):
            continue

        sale_date = str(r.get("销售日期", "")).strip()
        # 日期范围过滤
        if not _is_in_date_range(sale_date, start_date, end_date):
            continue

        cat = str(r.get("卖品大类", "")).strip()
        product_name = str(r.get("卖品名称", "")).strip()
        amount = float(r.get("支付金额（元）", 0) or 0)
        quantity = float(r.get("销售数量", 0) or 0)
        sale_time = str(r.get("销售时间", "")).strip()

        # 记录工作日期
        if sale_date and sale_date != "None":
            employee_data[emp]["dates"].add(sale_date)

            # 根据销售时间判断当天班次（一个员工一天只有一个班次）
            time_parts = _parse_time(sale_time)
            if time_parts:
                hour, minute = time_parts
                if hour < 9:
                    # 凌晨场次算晚班（前一天的晚班延续）
                    employee_data[emp]["daily_shifts"][sale_date] = "evening"
                elif hour < 16 or (hour == 16 and minute < 30):
                    employee_data[emp]["daily_shifts"][sale_date] = "morning"
                else:
                    employee_data[emp]["daily_shifts"][sale_date] = "evening"

        if cat == "卖品套餐":
            # 细分品类
            pkg_type = _classify_package(product_name)
            employee_data[emp]["packages"][pkg_type]["count"] += quantity
            employee_data[emp]["packages"][pkg_type]["amount"] += amount
        elif cat == "活动":
            employee_data[emp]["activity"]["count"] += quantity
            employee_data[emp]["activity"]["amount"] += amount

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
        total_amount = package_total_amount + activity["amount"]

        # 主要班次（用于显示参考，取出现次数多的）
        daily_shifts = data["daily_shifts"]
        morning_count = sum(1 for s in daily_shifts.values() if s == "morning")
        evening_count = sum(1 for s in daily_shifts.values() if s == "evening")
        shift = "morning" if morning_count >= evening_count else "evening"

        if total_amount > 0 or package_total_count > 0 or activity["count"] > 0:
            employees.append({
                "name": name,
                # 套餐细分
                "package_detail": package_detail,
                "package_count": int(package_total_count),
                "package_amount": round(package_total_amount, 2),
                # 活动套餐
                "activity_count": int(activity["count"]),
                "activity_amount": round(activity["amount"], 2),
                # 班次信息
                "shift": shift,  # 主要班次（参考用）
                "work_days": len(data["dates"]),
                "sale_dates": sorted(data["dates"]),  # 实际工作日期列表
                "daily_shifts": daily_shifts,  # 每天的班次 {date: "morning"/"evening"}
                # 合计
                "total_count": int(package_total_count + activity["count"]),
                "total_amount": round(total_amount, 2),
            })

    employees.sort(key=lambda x: -x["total_amount"])

    # 收集所有出现过的套餐类型（用于前端动态列）
    used_types = set()
    for e in employees:
        used_types.update(e["package_detail"].keys())

    return {
        "status": "ok",
        "source": path.name,
        "category": "concession",
        "employees": employees,
        "package_types": [t for t in PACKAGE_TYPES if t in used_types] +
                         (["其他套餐"] if "其他套餐" in used_types else []),
        "summary": {
            "total_employees": len(employees),
            "total_count": sum(e["total_count"] for e in employees),
            "total_amount": round(sum(e["total_amount"] for e in employees), 2),
        },
    }


def analyze_member_recharge(start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """分析会员充值的员工绩效（仅翡翠城店）
    start_date: 开始日期 YYYY-MM-DD
    end_date: 结束日期 YYYY-MM-DD
    """
    path = _find_latest_file("会员卡充值明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到会员卡充值明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    employee_data: dict[str, dict] = defaultdict(lambda: {"count": 0, "amount": 0.0})

    for r in rows:
        # 过滤翡翠城店 — 充值表 Col3 = 充值/续费影院
        cinema = str(r.get("充值/续费影院", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        emp = str(r.get("操作员", "")).strip()
        if not emp or emp in ("None", "--"):
            continue

        # 日期范围过滤（充值表的日期字段是"充值/续费日期"）
        date_str = str(r.get("充值/续费日期", "") or r.get("充值时间", "") or r.get("操作时间", "") or r.get("日期", "")).strip()
        if not _is_in_date_range(date_str, start_date, end_date):
            continue

        amount = float(r.get("支付金额", 0) or 0)
        if amount > 0:
            employee_data[emp]["count"] += 1
            employee_data[emp]["amount"] += amount

    employees = []
    for name, data in employee_data.items():
        employees.append({
            "name": name,
            "recharge_count": data["count"],
            "recharge_amount": round(data["amount"], 2),
        })

    employees.sort(key=lambda x: -x["recharge_amount"])

    return {
        "status": "ok",
        "source": path.name,
        "category": "recharge",
        "employees": employees,
        "summary": {
            "total_employees": len(employees),
            "total_count": sum(e["recharge_count"] for e in employees),
            "total_amount": round(sum(e["recharge_amount"] for e in employees), 2),
        },
    }


def analyze_member_open_card(start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """分析会员开卡的员工绩效（仅翡翠城店，只显示数量）
    start_date: 开始日期 YYYY-MM-DD
    end_date: 结束日期 YYYY-MM-DD
    """
    path = _find_latest_file("会员卡开卡明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到会员卡开卡明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    employee_data: dict[str, int] = defaultdict(int)

    for r in rows:
        # 过滤翡翠城店 — 开卡表 Col4 = 发卡影院
        cinema = str(r.get("发卡影院", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        emp = str(r.get("操作员", "")).strip()
        if not emp or emp in ("None", "--"):
            continue

        # 日期范围过滤（开卡表的日期字段是"开卡日期"或"发卡日期"）
        date_str = str(r.get("开卡日期", "") or r.get("发卡日期", "") or r.get("开卡时间", "") or r.get("操作时间", "") or r.get("日期", "")).strip()
        if not _is_in_date_range(date_str, start_date, end_date):
            continue

        employee_data[emp] += 1

    employees = []
    for name, count in employee_data.items():
        employees.append({
            "name": name,
            "open_count": count,
        })

    employees.sort(key=lambda x: -x["open_count"])

    return {
        "status": "ok",
        "source": path.name,
        "category": "open_card",
        "employees": employees,
        "summary": {
            "total_employees": len(employees),
            "total_count": sum(e["open_count"] for e in employees),
        },
    }


def get_employee_performance(start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    """汇总员工绩效（卖品套餐分品类 + 活动 + 充值 + 开卡）
    接待人次按天判断班次：员工每天对应班次的观影人次累加
    start_date: 开始日期 YYYY-MM-DD，None表示不限制
    end_date: 结束日期 YYYY-MM-DD，None表示不限制
    """
    concession = analyze_concession_packages(start_date, end_date)
    recharge = analyze_member_recharge(start_date, end_date)
    open_card = analyze_member_open_card(start_date, end_date)

    # 获取班次观影人次 {date: {"morning": 人次, "evening": 人次}}
    shift_attendance = get_shift_attendance()
    shift_data = shift_attendance.get("shift_data", {}) if shift_attendance.get("status") == "ok" else {}

    # 合并所有员工
    all_employees: dict[str, dict] = {}

    if concession["status"] == "ok":
        for e in concession["employees"]:
            name = e["name"]
            all_employees[name] = {
                "name": name,
                "package_detail": e["package_detail"],
                "package_count": e["package_count"],
                "package_amount": e["package_amount"],
                "activity_count": e["activity_count"],
                "activity_amount": e["activity_amount"],
                "shift": e.get("shift", "morning"),
                "work_days": e.get("work_days", 0),
                "sale_dates": e.get("sale_dates", []),
                "daily_shifts": e.get("daily_shifts", {}),  # {date: "morning"/"evening"}
                "recharge_count": 0,
                "recharge_amount": 0,
                "open_count": 0,
            }

    if recharge["status"] == "ok":
        for e in recharge["employees"]:
            name = e["name"]
            if name not in all_employees:
                all_employees[name] = {
                    "name": name,
                    "package_detail": {},
                    "package_count": 0, "package_amount": 0,
                    "activity_count": 0, "activity_amount": 0,
                    "shift": "morning", "work_days": 0,
                    "sale_dates": [], "daily_shifts": {},
                    "recharge_count": 0, "recharge_amount": 0,
                    "open_count": 0,
                }
            all_employees[name]["recharge_count"] = e["recharge_count"]
            all_employees[name]["recharge_amount"] = e["recharge_amount"]

    if open_card["status"] == "ok":
        for e in open_card["employees"]:
            name = e["name"]
            if name not in all_employees:
                all_employees[name] = {
                    "name": name,
                    "package_detail": {},
                    "package_count": 0, "package_amount": 0,
                    "activity_count": 0, "activity_amount": 0,
                    "shift": "morning", "work_days": 0,
                    "sale_dates": [], "daily_shifts": {},
                    "recharge_count": 0, "recharge_amount": 0,
                    "open_count": 0,
                }
            all_employees[name]["open_count"] = e["open_count"]

    # 计算合计和人均效率
    employees = []
    for e in all_employees.values():
        e["total_amount"] = round(
            e["package_amount"] + e["activity_amount"] + e["recharge_amount"], 2
        )
        e["total_count"] = (
            e["package_count"] + e["activity_count"] +
            e["recharge_count"] + e["open_count"]
        )

        # 按天判断班次，累加每天对应班次的观影人次
        daily_shifts = e.get("daily_shifts", {})
        sale_dates = set(e.get("sale_dates", []))
        total_shift_attendance = 0
        for date_str in sale_dates:
            # 该员工当天的班次
            emp_shift = daily_shifts.get(date_str, "morning")
            # 该天该班次的观影人次
            day_attendance = shift_data.get(date_str, {})
            total_shift_attendance += day_attendance.get(emp_shift, 0)

        # 计算人均效率（卖品+活动销售额 / 观影人次，不含充值）
        sales_amount = e["package_amount"] + e["activity_amount"]
        if total_shift_attendance > 0 and sales_amount > 0:
            e["shift_attendance"] = total_shift_attendance
            e["efficiency"] = round(sales_amount / total_shift_attendance, 2)
        else:
            e["shift_attendance"] = 0
            e["efficiency"] = 0

        # 删除 daily_shifts（不暴露给前端，数据量大）
        del e["daily_shifts"]
        employees.append(e)

    employees.sort(key=lambda x: -x["total_amount"])

    # 计算班次观影人次汇总
    morning_total = sum(a.get("morning", 0) for a in shift_data.values())
    evening_total = sum(a.get("evening", 0) for a in shift_data.values())

    return {
        "status": "ok",
        "cinema": CINEMA_NAME,
        "employees": employees,
        "package_types": concession.get("package_types", []),
        "sources": {
            "concession": concession.get("source", ""),
            "recharge": recharge.get("source", ""),
            "open_card": open_card.get("source", ""),
            "shift_attendance": shift_attendance.get("source", ""),
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
