"""
会员消费分析服务
数据来源: 凤凰云智 会员卡消费明细查询 Excel
过滤条件: 仅翡翠城店（SFC上影国际影城翡翠城店）
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import openpyxl

DATA_DIR = Path.home() / ".hermes" / "workspace" / "cinema-data"
CINEMA_NAME = "SFC上影国际影城翡翠城店"

# 娱乐项目排除
_EXCLUDED_KEYWORDS = {"顽小游", "小铁台球", "顽麻社", "轰趴"}


def _find_latest_file() -> Path | None:
    """查找最新的会员卡消费明细文件"""
    files = sorted(
        DATA_DIR.glob("会员卡消费明细查询2026-*.xlsx"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    return files[0] if files else None


def _parse_sheet(path: Path) -> list[dict]:
    """解析Excel，返回行字典列表"""
    wb = openpyxl.load_workbook(path, data_only=True, read_only=False)
    ws = wb.active
    rows = list(ws.iter_rows(min_row=5, values_only=True))
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


def _is_excluded(item_name: str) -> bool:
    """判断是否为娱乐项目"""
    for kw in _EXCLUDED_KEYWORDS:
        if kw in item_name:
            return True
    return False


def get_member_analysis(days: int = 30) -> dict[str, Any]:
    """获取会员消费分析数据"""
    path = _find_latest_file()
    if not path:
        return {"status": "no_data", "message": "未找到会员卡消费明细报表"}

    rows = _parse_sheet(path)
    if not rows:
        return {"status": "no_data", "message": "报表数据为空"}

    # 按会员聚合数据
    members: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "member_id": "",
        "card_type": "",
        "total_amount": 0.0,
        "total_count": 0,
        "ticket_amount": 0.0,
        "ticket_count": 0,
        "concession_amount": 0.0,
        "concession_count": 0,
        "first_time": None,
        "last_time": None,
        "channels": set(),
        "products": defaultdict(float),
    })

    for r in rows:
        # 过滤翡翠城店
        cinema = str(r.get("消费影院", "")).strip()
        if CINEMA_NAME not in cinema:
            continue

        member_id = str(r.get("会员ID", "")).strip()
        if not member_id or member_id == "None":
            continue

        # 解析时间
        time_str = str(r.get("消费时间", "")).strip()
        try:
            consume_time = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
        except (ValueError, TypeError):
            continue

        # 获取金额
        amount = float(r.get("卡消费金额（元）", 0) or 0)
        if amount <= 0:
            continue

        # 排除娱乐项目
        product_name = str(r.get("商品名称", "")).strip()
        if _is_excluded(product_name):
            continue

        # 商品类型
        product_type = str(r.get("商品类型", "")).strip()
        channel = str(r.get("消费渠道", "")).strip()

        # 更新会员数据
        m = members[member_id]
        m["member_id"] = member_id
        m["card_type"] = str(r.get("卡类型", "")).strip()
        m["total_amount"] += amount
        m["total_count"] += 1
        m["channels"].add(channel)
        m["products"][product_name] += amount

        if product_type == "影票":
            m["ticket_amount"] += amount
            m["ticket_count"] += 1
        elif product_type == "卖品":
            m["concession_amount"] += amount
            m["concession_count"] += 1

        if m["first_time"] is None or consume_time < m["first_time"]:
            m["first_time"] = consume_time
        if m["last_time"] is None or consume_time > m["last_time"]:
            m["last_time"] = consume_time

    # 转换为列表并排序
    member_list = []
    for m in members.values():
        avg_amount = m["total_amount"] / m["total_count"] if m["total_count"] > 0 else 0
        member_list.append({
            "member_id": m["member_id"],
            "card_type": m["card_type"],
            "total_amount": round(m["total_amount"], 2),
            "total_count": m["total_count"],
            "avg_amount": round(avg_amount, 2),
            "ticket_amount": round(m["ticket_amount"], 2),
            "ticket_count": m["ticket_count"],
            "concession_amount": round(m["concession_amount"], 2),
            "concession_count": m["concession_count"],
            "first_time": m["first_time"].isoformat() if m["first_time"] else None,
            "last_time": m["last_time"].isoformat() if m["last_time"] else None,
            "channels": list(m["channels"]),
            "top_products": sorted(
                [{"name": k, "amount": round(v, 2)} for k, v in m["products"].items()],
                key=lambda x: -x["amount"]
            )[:5],
        })

    member_list.sort(key=lambda x: -x["total_amount"])

    # 统计汇总
    total_members = len(member_list)
    total_amount = sum(m["total_amount"] for m in member_list)
    total_count = sum(m["total_count"] for m in member_list)

    # 消费频次分布
    freq_dist = {"1次": 0, "2-3次": 0, "4-5次": 0, "6-10次": 0, "10次以上": 0}
    for m in member_list:
        c = m["total_count"]
        if c == 1:
            freq_dist["1次"] += 1
        elif c <= 3:
            freq_dist["2-3次"] += 1
        elif c <= 5:
            freq_dist["4-5次"] += 1
        elif c <= 10:
            freq_dist["6-10次"] += 1
        else:
            freq_dist["10次以上"] += 1

    # 客单价分布
    avg_dist = {"0-20元": 0, "20-50元": 0, "50-100元": 0, "100-200元": 0, "200元以上": 0}
    for m in member_list:
        a = m["avg_amount"]
        if a < 20:
            avg_dist["0-20元"] += 1
        elif a < 50:
            avg_dist["20-50元"] += 1
        elif a < 100:
            avg_dist["50-100元"] += 1
        elif a < 200:
            avg_dist["100-200元"] += 1
        else:
            avg_dist["200元以上"] += 1

    # 渠道统计
    channel_stats: dict[str, int] = defaultdict(int)
    for m in member_list:
        for ch in m["channels"]:
            channel_stats[ch] += 1

    return {
        "status": "ok",
        "source": path.name,
        "summary": {
            "total_members": total_members,
            "total_amount": round(total_amount, 2),
            "total_count": total_count,
            "avg_per_member": round(total_amount / total_members, 2) if total_members > 0 else 0,
            "avg_per_visit": round(total_amount / total_count, 2) if total_count > 0 else 0,
        },
        "frequency_distribution": freq_dist,
        "avg_amount_distribution": avg_dist,
        "channel_stats": dict(channel_stats),
        "top_members": member_list[:20],
        "all_members": member_list,
    }
