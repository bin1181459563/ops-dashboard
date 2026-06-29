"""
员工绩效教练。
数据来源: daily_snapshots，经 employee_performance 服务聚合。
"""
from __future__ import annotations

from typing import Any

from app.core.database import DashboardRepository
from app.services.employee_performance import get_employee_performance


def analyze_employee_performance(repository: DashboardRepository) -> dict[str, Any]:
    perf = get_employee_performance(repository)
    if perf.get("status") != "ok":
        return perf

    employees = []
    for employee in perf.get("employees", []):
        total_amount = float(employee.get("total_amount") or 0)
        package_amount = float(employee.get("package_amount") or 0)
        package_ratio = round(package_amount / total_amount * 100, 1) if total_amount else 0
        strengths = []
        weaknesses = []
        if package_ratio >= 40:
            strengths.append("套餐推荐占比较高")
        elif total_amount > 0:
            weaknesses.append("套餐推荐占比偏低")
        if float(employee.get("recharge_amount") or 0) > 0:
            strengths.append("会员充值有转化")
        if int(employee.get("open_count") or 0) > 0:
            strengths.append("会员开卡有转化")
        employees.append(
            {
                "name": employee.get("name", ""),
                "total_amount": total_amount,
                "total_count": employee.get("total_count", 0),
                "package_count": employee.get("package_count", 0),
                "package_amount": package_amount,
                "package_ratio": package_ratio,
                "activity_amount": employee.get("activity_amount", 0),
                "recharge_amount": employee.get("recharge_amount", 0),
                "open_count": employee.get("open_count", 0),
                "strengths": strengths,
                "weaknesses": weaknesses,
            }
        )

    employees.sort(key=lambda item: -item["total_amount"])
    for index, employee in enumerate(employees, start=1):
        employee["rank_by_amount"] = index

    total_amount = sum(employee["total_amount"] for employee in employees)
    total_count = sum(int(employee.get("total_count") or 0) for employee in employees)
    avg_amount = round(total_amount / len(employees), 2) if employees else 0

    return {
        "status": "ok",
        "source": "daily_snapshots",
        "cinema": "SFC上影国际影城翡翠城店",
        "employees": employees,
        "team_benchmarks": {
            "avg_amount": avg_amount,
            "avg_count": round(total_count / len(employees), 1) if employees else 0,
            "avg_package_ratio": round(
                sum(employee["package_ratio"] for employee in employees) / len(employees), 1
            ) if employees else 0,
        },
        "summary": {
            "total_employees": len(employees),
            "total_amount": round(total_amount, 2),
            "total_count": total_count,
        },
    }


def generate_coaching_suggestions(repository: DashboardRepository) -> dict[str, Any]:
    perf = analyze_employee_performance(repository)
    if perf.get("status") != "ok":
        return perf

    avg_amount = perf["team_benchmarks"]["avg_amount"]
    coaching = []
    for employee in perf.get("employees", []):
        rules = []
        if employee["total_amount"] < avg_amount * 0.7 and avg_amount > 0:
            rules.append(
                {
                    "suggestion": "整体销售能力提升",
                    "detail": f"{employee['name']} 当前销售额低于团队均值，建议安排跟班学习和每日目标复盘。",
                    "priority": "high",
                }
            )
        if employee["package_ratio"] < 30 and employee["total_amount"] > 0:
            rules.append(
                {
                    "suggestion": "套餐推荐技巧培训",
                    "detail": f"{employee['name']} 套餐占比为 {employee['package_ratio']}%，建议强化套餐话术。",
                    "priority": "medium",
                }
            )
        if rules:
            coaching.append(
                {
                    "name": employee["name"],
                    "total_amount": employee["total_amount"],
                    "package_ratio": employee["package_ratio"],
                    "strengths": employee["strengths"],
                    "weaknesses": employee["weaknesses"],
                    "coaching": rules,
                }
            )

    return {
        "status": "ok",
        "source": "daily_snapshots",
        "title": "员工绩效教练建议",
        "conclusion": f"基于数据库快照分析 {perf['summary']['total_employees']} 位员工",
        "evidence": [
            f"团队总销售额: {perf['summary']['total_amount']}元",
            f"人均销售额: {avg_amount}元",
        ],
        "confidence": 0.85,
        "coaching": coaching,
        "suggested_actions": [
            "优先跟进高优先级员工",
            "每周复盘套餐推荐话术",
            "用数据库快照持续跟踪改进结果",
        ],
    }
