"""
员工绩效AI教练 — 分析员工业绩并生成个性化培训建议
数据来源: 凤凰云智 Excel 卖品销售明细
"""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Any

import openpyxl

DATA_DIR = Path.home() / ".hermes" / "workspace" / "cinema-data"
CINEMA_NAME = "SFC上影国际影城翡翠城店"

# 主管/管理人员不计入统计分析
EXCLUDED_EMPLOYEES = {"杨高峰", "谢显彬", "张莎", "刘馨悦"}

# 套餐品类关键词
PACKAGE_KEYWORDS = {
    "单人餐": ["单人"],
    "双人餐": ["双人"],
    "三人餐": ["三人"],
    "儿童套餐": ["儿童"],
    "会员套餐": ["会员套餐"],
    "单点餐": ["单点"],
}


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


def _classify_package(product_name: str) -> str:
    for type_name, keywords in PACKAGE_KEYWORDS.items():
        for kw in keywords:
            if kw in product_name:
                return type_name
    return "其他"


def analyze_employee_performance() -> dict[str, Any]:
    """
    分析员工业绩
    - 从卖品销售明细中提取员工数据
    - 分析每个员工的强项和弱项
    - 计算各项指标排名
    """
    path = _find_latest_file("卖品销售明细查询")
    if not path:
        return {"status": "no_data", "message": "未找到卖品销售明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    # 按员工聚合多维度数据
    employee_data: dict[str, dict] = defaultdict(lambda: {
        "packages": defaultdict(lambda: {"count": 0, "amount": 0.0}),
        "activity": {"count": 0, "amount": 0.0},
        "single_items": {"count": 0, "amount": 0.0},
        "total": {"count": 0, "amount": 0.0},
        "transactions": 0,
    })

    for r in rows:
        cinema = str(r.get("影院名称", "")).strip()
        if CINEMA_NAME not in cinema:
            continue
        emp = str(r.get("销售员", "")).strip()
        if not emp or emp in ("None", "--") or emp in EXCLUDED_EMPLOYEES:
            continue

        cat = str(r.get("卖品大类", "")).strip()
        product_name = str(r.get("卖品名称", "")).strip()
        amount = float(r.get("支付金额（元）", 0) or 0)
        quantity = float(r.get("销售数量", 0) or 0)

        d = employee_data[emp]
        d["total"]["count"] += quantity
        d["total"]["amount"] += amount
        d["transactions"] += 1

        if cat == "卖品套餐":
            pkg_type = _classify_package(product_name)
            d["packages"][pkg_type]["count"] += quantity
            d["packages"][pkg_type]["amount"] += amount
        elif cat == "活动":
            d["activity"]["count"] += quantity
            d["activity"]["amount"] += amount
        else:
            d["single_items"]["count"] += quantity
            d["single_items"]["amount"] += amount

    if not employee_data:
        return {"status": "no_data", "message": "未找到翡翠城店员工数据"}

    # 计算团队平均值
    n = len(employee_data)
    team_avg_amount = sum(d["total"]["amount"] for d in employee_data.values()) / n
    team_avg_count = sum(d["total"]["count"] for d in employee_data.values()) / n
    team_avg_pkg_ratio = 0
    for d in employee_data.values():
        if d["total"]["amount"] > 0:
            pkg_amount = sum(v["amount"] for v in d["packages"].values())
            team_avg_pkg_ratio += pkg_amount / d["total"]["amount"]
    team_avg_pkg_ratio = team_avg_pkg_ratio / n if n else 0

    # 生成员工分析
    employees = []
    for name, d in employee_data.items():
        total_amount = d["total"]["amount"]
        total_count = int(d["total"]["count"])
        pkg_amount = sum(v["amount"] for v in d["packages"].values())
        pkg_count = sum(int(v["count"]) for v in d["packages"].values())
        activity_amount = d["activity"]["amount"]
        single_amount = d["single_items"]["amount"]

        pkg_ratio = (pkg_amount / total_amount * 100) if total_amount > 0 else 0
        avg_per_transaction = (total_amount / d["transactions"]) if d["transactions"] > 0 else 0

        # 判断强项和弱项
        strengths = []
        weaknesses = []

        if total_amount >= team_avg_amount * 1.2:
            strengths.append("总销售额领先")
        elif total_amount < team_avg_amount * 0.8:
            weaknesses.append("总销售额偏低")

        if pkg_ratio >= team_avg_pkg_ratio * 100 * 1.15:
            strengths.append("套餐转化率高")
        elif pkg_ratio < team_avg_pkg_ratio * 100 * 0.85 and total_amount > 0:
            weaknesses.append("套餐转化率偏低，建议多推套餐")

        if activity_amount > 0:
            strengths.append("活动套餐有销售")
        if single_amount > total_amount * 0.5 and total_amount > 0:
            weaknesses.append("单点占比过高，套餐推荐不足")

        if avg_per_transaction >= team_avg_amount / max(d["transactions"], 1) * 1.2:
            strengths.append("客单价高")

        employees.append({
            "name": name,
            "total_count": total_count,
            "total_amount": round(total_amount, 2),
            "package_count": pkg_count,
            "package_amount": round(pkg_amount, 2),
            "package_ratio": round(pkg_ratio, 1),
            "activity_amount": round(activity_amount, 2),
            "single_amount": round(single_amount, 2),
            "transactions": d["transactions"],
            "avg_per_transaction": round(avg_per_transaction, 2),
            "strengths": strengths,
            "weaknesses": weaknesses,
        })

    employees.sort(key=lambda x: -x["total_amount"])

    # 计算排名
    for i, e in enumerate(employees):
        e["rank_by_amount"] = i + 1

    sorted_by_ratio = sorted(employees, key=lambda x: -x["package_ratio"])
    for i, e in enumerate(sorted_by_ratio):
        e["rank_by_pkg_ratio"] = i + 1

    return {
        "status": "ok",
        "source": path.name,
        "cinema": CINEMA_NAME,
        "employees": employees,
        "team_benchmarks": {
            "avg_amount": round(team_avg_amount, 2),
            "avg_count": round(team_avg_count, 1),
            "avg_package_ratio": round(team_avg_pkg_ratio * 100, 1),
        },
        "summary": {
            "total_employees": len(employees),
            "total_amount": round(sum(e["total_amount"] for e in employees), 2),
            "total_count": sum(e["total_count"] for e in employees),
        },
    }


# ── 培训建议规则引擎 ─────────────────────────────────────────────

COACHING_RULES = [
    {
        "condition": lambda e, avg: e["package_ratio"] < avg["avg_package_ratio"] * 85 and e["total_amount"] > 0,
        "suggestion": "套餐推荐技巧培训",
        "detail": "{name}的套餐转化率({pkg_ratio}%)低于团队均值({avg_ratio}%)，建议：\n"
                  "1. 学习'一句话推荐话术'：'现在买套餐比单点划算XX元'\n"
                  "2. 每单必推套餐，先推双人餐再推单人餐\n"
                  "3. 观察销冠同事的推荐流程",
        "priority": "high",
    },
    {
        "condition": lambda e, avg: e["total_amount"] < avg["avg_amount"] * 0.7,
        "suggestion": "整体销售能力提升",
        "detail": "{name}的总销售额({total_amount}元)明显低于团队均值({avg_amount}元)，建议：\n"
                  "1. 加强卖品知识培训，熟悉所有品类和价格\n"
                  "2. 安排跟随销冠学习一周\n"
                  "3. 每日设定小目标，逐步提升",
        "priority": "high",
    },
    {
        "condition": lambda e, avg: e["single_amount"] > e["total_amount"] * 0.5 and e["total_amount"] > 0,
        "suggestion": "减少单点、提升套餐占比",
        "detail": "{name}的单点金额占比过高，建议：\n"
                  "1. 主动询问顾客人数，匹配对应套餐\n"
                  "2. 强调套餐性价比优势\n"
                  "3. 使用'升单'技巧：单人餐→双人餐只需加XX元",
        "priority": "medium",
    },
    {
        "condition": lambda e, avg: e["activity_amount"] == 0 and e["total_amount"] > 0,
        "suggestion": "活动套餐推广培训",
        "detail": "{name}未销售任何活动套餐，建议：\n"
                  "1. 熟悉当前活动套餐内容和优惠力度\n"
                  "2. 对价格敏感的顾客优先推荐活动套餐\n"
                  "3. 在客流低峰期重点推广活动产品",
        "priority": "medium",
    },
    {
        "condition": lambda e, avg: e["total_amount"] >= avg["avg_amount"] * 1.3,
        "suggestion": "分享成功经验",
        "detail": "{name}的业绩表现优秀（{total_amount}元，超均值{pct}%），建议：\n"
                  "1. 在团队会议上分享推荐技巧\n"
                  "2. 担任新员工导师\n"
                  "3. 挑战更高目标，尝试带动团队整体提升",
        "priority": "low",
    },
]


def generate_coaching_suggestions() -> dict[str, Any]:
    """
    生成培训建议
    - 根据员工表现给出具体建议
    - 推荐提升方向
    """
    perf = analyze_employee_performance()
    if perf["status"] != "ok":
        return perf

    benchmarks = perf["team_benchmarks"]
    coaching_list: list[dict[str, Any]] = []

    for emp in perf["employees"]:
        matched_rules = []
        for rule in COACHING_RULES:
            if rule["condition"](emp, benchmarks):
                pct = round((emp["total_amount"] - benchmarks["avg_amount"]) / benchmarks["avg_amount"] * 100, 1) if benchmarks["avg_amount"] > 0 else 0
                detail = rule["detail"].format(
                    name=emp["name"],
                    pkg_ratio=emp["package_ratio"],
                    avg_ratio=benchmarks["avg_package_ratio"],
                    total_amount=emp["total_amount"],
                    avg_amount=benchmarks["avg_amount"],
                    pct=abs(pct),
                )
                matched_rules.append({
                    "suggestion": rule["suggestion"],
                    "detail": detail,
                    "priority": rule["priority"],
                })

        if matched_rules:
            # 取最高优先级
            priority_map = {"high": 0, "medium": 1, "low": 2}
            matched_rules.sort(key=lambda x: priority_map.get(x["priority"], 9))
            coaching_list.append({
                "name": emp["name"],
                "total_amount": emp["total_amount"],
                "package_ratio": emp["package_ratio"],
                "strengths": emp["strengths"],
                "weaknesses": emp["weaknesses"],
                "coaching": matched_rules,
            })

    # 按建议优先级排序
    priority_map = {"high": 0, "medium": 1, "low": 2}
    coaching_list.sort(key=lambda x: priority_map.get(x["coaching"][0]["priority"], 9) if x["coaching"] else 9)

    high_count = sum(1 for c in coaching_list for r in c["coaching"] if r["priority"] == "high")
    medium_count = sum(1 for c in coaching_list for r in c["coaching"] if r["priority"] == "medium")

    return {
        "status": "ok",
        "title": "员工绩效AI教练建议",
        "conclusion": f"共分析{perf['summary']['total_employees']}位员工，生成{len(coaching_list)}份个性化培训建议",
        "evidence": [
            f"团队总销售额: {perf['summary']['total_amount']}元",
            f"人均销售额: {benchmarks['avg_amount']}元",
            f"团队平均套餐转化率: {benchmarks['avg_package_ratio']}%",
            f"需重点培训: {high_count}项",
            f"一般提升: {medium_count}项",
        ],
        "confidence": 0.85,
        "coaching": coaching_list,
        "suggested_actions": [
            f"优先安排{high_count}项高优先级培训",
            "每周安排一次团队分享会，由业绩优秀的同事分享经验",
            "为每位员工制定月度提升目标，跟踪进展",
            "建议引入'师徒制'，老带新提升整体水平",
        ],
    }
