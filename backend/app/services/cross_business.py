"""
多业务联动分析服务
分析台球+棋牌+影院的经营数据，生成交叉营销建议
"""

from datetime import datetime, timedelta, timezone
from typing import Any
import json

from app.core.database import DashboardRepository
from app.services.cinema_excel import _filtered_concession_revenue


def _now_beijing() -> datetime:
    return datetime.now(timezone(timedelta(hours=8)))


def _get_biz_data(repo: DashboardRepository, days: int = 30) -> dict[str, list[dict]]:
    """获取三个业务的近期数据"""
    result = {}

    # 台球
    billiards_snaps = repo.daily_snapshots_for("billiards", "xiaotie", "feicuicheng", days)
    billiards_data = []
    for snap in billiards_snaps:
        raw = snap.get("raw_json") or {}
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        summary = raw.get("summary", {})
        billiards_data.append({
            "date": snap.get("date", ""),
            "revenue": float(summary.get("total_amount", 0) or 0),
            "orders": int(summary.get("order_count", 0) or 0),
        })
    result["billiards"] = sorted(billiards_data, key=lambda x: x["date"])

    # 棋牌
    mahjong_snaps = repo.daily_snapshots_for("mahjong", "wu_laoban", "feicuicheng", days)
    mahjong_data = []
    for snap in mahjong_snaps:
        raw = snap.get("raw_json") or {}
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        overview = raw.get("overview", {})
        mahjong_data.append({
            "date": snap.get("date", ""),
            "revenue": float(overview.get("paid_amount", 0) or 0),
            "orders": int(overview.get("orders", 0) or 0),
        })
    result["mahjong"] = sorted(mahjong_data, key=lambda x: x["date"])

    # 影院
    cinema_snaps = repo.daily_snapshots_for("cinema", "fenghuang", "cinema_feicuicheng", days)
    cinema_data = []
    for snap in cinema_snaps:
        raw = snap.get("raw_json") or {}
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        summary = raw.get("summary", {})
        cinema_data.append({
            "date": snap.get("date", ""),
            "revenue": float(summary.get("revenue", 0) or 0),
            "orders": int(summary.get("customer_count", 0) or 0),
            "box_office": float(summary.get("box_office", 0) or 0),
            "concession": round(_filtered_concession_revenue(raw), 2),
        })
    result["cinema"] = sorted(cinema_data, key=lambda x: x["date"])

    return result


def _weekday_pattern(data: list[dict]) -> dict[int, dict]:
    """分析星期几的经营模式"""
    by_wd: dict[int, list[float]] = {i: [] for i in range(7)}
    for item in data:
        if item["revenue"] <= 0:
            continue
        dt = datetime.fromisoformat(item["date"])
        by_wd[dt.weekday()].append(item["revenue"])

    result = {}
    for wd in range(7):
        vals = by_wd[wd]
        if vals:
            result[wd] = {
                "avg_revenue": round(sum(vals) / len(vals), 1),
                "count": len(vals),
                "max": round(max(vals), 1),
                "min": round(min(vals), 1),
            }
    return result


def _find_peak_offpeak(weekday_pattern: dict[int, dict]) -> tuple[list[str], list[str]]:
    """找出高峰日和低谷日"""
    if not weekday_pattern:
        return [], []

    day_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    avgs = [(wd, p["avg_revenue"]) for wd, p in weekday_pattern.items()]
    if not avgs:
        return [], []

    avg_all = sum(v for _, v in avgs) / len(avgs)
    peaks = [day_names[wd] for wd, v in avgs if v > avg_all * 1.2]
    offpeaks = [day_names[wd] for wd, v in avgs if v < avg_all * 0.8]

    return peaks, offpeaks


def _generate_suggestions(
    biz_data: dict[str, list[dict]],
    weekday_patterns: dict[str, dict[int, dict]],
) -> list[dict]:
    """根据数据模式生成联动营销建议"""
    suggestions = []
    now = _now_beijing()
    day_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

    # 计算各业务近期平均
    biz_avg = {}
    for biz_name, data in biz_data.items():
        recent = [d for d in data if d["revenue"] > 0]
        if recent:
            biz_avg[biz_name] = {
                "avg_revenue": sum(d["revenue"] for d in recent) / len(recent),
                "avg_orders": sum(d["orders"] for d in recent) / len(recent),
                "total_revenue": sum(d["revenue"] for d in recent),
            }

    # 分析各业务高峰/低谷
    biz_peak_offpeak = {}
    for biz_name, pattern in weekday_patterns.items():
        peaks, offpeaks = _find_peak_offpeak(pattern)
        biz_peak_offpeak[biz_name] = {"peaks": peaks, "offpeaks": offpeaks}

    # 建议1: 影院高峰带动台球低谷
    cinema_info = biz_peak_offpeak.get("cinema", {})
    billiards_info = biz_peak_offpeak.get("billiards", {})
    if cinema_info.get("peaks") and billiards_info.get("offpeaks"):
        cinema_peak_str = "、".join(cinema_info["peaks"])
        billiards_off_str = "、".join(billiards_info["offpeaks"])
        suggestions.append({
            "id": "cinema_to_billiards",
            "priority": "high",
            "category": "跨业态引流",
            "title": f"影院高峰日（{cinema_peak_str}）带动台球消费",
            "description": f"影院在{cinema_peak_str}客流最高，可推出\"观影+台球\"套餐，将观影客户引流到台球区。",
            "action": f"推出\"看完电影打台球\"优惠：凭当日电影票根享台球{billiards_off_str}时段8折",
            "expected_impact": "预计台球低谷日收入提升15-25%",
            "data_basis": f"影院高峰日均收入¥{biz_avg.get('cinema',{}).get('avg_revenue',0):.0f}，台球低谷日需补充客流",
        })

    # 建议2: 棋牌+台球联合套餐
    mahjong_info = biz_peak_offpeak.get("mahjong", {})
    if biz_avg.get("mahjong") and biz_avg.get("billiards"):
        suggestions.append({
            "id": "mahjong_billiards_combo",
            "priority": "high",
            "category": "联合套餐",
            "title": "棋牌+台球联合消费套餐",
            "description": "棋牌客户多为小团体消费（2-6人），可搭配台球作为等候/续摊活动。",
            "action": "推出\"棋牌+台球\"组合券：棋牌消费满2小时赠台球30分钟体验券",
            "expected_impact": "预计带动台球新增订单5-10单/日",
            "data_basis": f"棋牌日均收入¥{biz_avg['mahjong']['avg_revenue']:.0f}，台球日均收入¥{biz_avg['billiards']['avg_revenue']:.0f}",
        })

    # 建议3: 影院卖品联动
    cinema_recent = [d for d in biz_data.get("cinema", []) if d.get("concession", 0) > 0]
    if cinema_recent:
        avg_concession = sum(d["concession"] for d in cinema_recent) / len(cinema_recent)
        avg_box = sum(d["box_office"] for d in cinema_recent) / len(cinema_recent)
        concession_ratio = avg_concession / avg_box * 100 if avg_box > 0 else 0

        if concession_ratio < 30:
            suggestions.append({
                "id": "cinema_concession_boost",
                "priority": "medium",
                "category": "卖品提升",
                "title": f"影院卖品转化率偏低（{concession_ratio:.0f}%）",
                "description": "卖品收入占票房比例低于行业均值（40-50%），有提升空间。",
                "action": "推出\"台球/棋牌客户观影送爆米花\"活动，同时提升卖品收入和观影体验",
                "expected_impact": f"卖品收入提升20%，预计日增¥{avg_concession * 0.2:.0f}",
                "data_basis": f"日均票房¥{avg_box:.0f}，日均卖品¥{avg_concession:.0f}，占比{concession_ratio:.0f}%",
            })

    # 建议4: 会员卡跨业态通用
    if biz_avg.get("billiards") and biz_avg.get("mahjong"):
        suggestions.append({
            "id": "cross_membership",
            "priority": "medium",
            "category": "会员体系",
            "title": "翡翠城通用会员卡",
            "description": "台球和棋牌各自有会员体系，可打通为\"翡翠城通用会员\"，充值余额三业态通用。",
            "action": "推出翡翠城储值卡：充500送80，台球/棋牌/影院卖品通用",
            "expected_impact": "提升客户粘性和复购率，预计开卡率提升30%",
            "data_basis": f"台球+棋牌合计日均收入¥{(biz_avg.get('billiards',{}).get('avg_revenue',0) + biz_avg.get('mahjong',{}).get('avg_revenue',0)):.0f}",
        })

    # 建议5: 工作日/周末差异化营销
    weekday_revenues = {}
    weekend_revenues = {}
    for biz_name, data in biz_data.items():
        wd_rev = []
        we_rev = []
        for item in data:
            if item["revenue"] <= 0:
                continue
            dt = datetime.fromisoformat(item["date"])
            if dt.weekday() < 5:
                wd_rev.append(item["revenue"])
            else:
                we_rev.append(item["revenue"])
        if wd_rev:
            weekday_revenues[biz_name] = sum(wd_rev) / len(wd_rev)
        if we_rev:
            weekend_revenues[biz_name] = sum(we_rev) / len(we_rev)

    if weekday_revenues and weekend_revenues:
        # 找出工作日最弱的业务
        weakest_weekday = min(weekday_revenues, key=lambda k: weekday_revenues[k])
        biz_labels = {"billiards": "台球", "mahjong": "棋牌", "cinema": "影院"}

        suggestions.append({
            "id": "weekday_boost",
            "priority": "medium",
            "category": "时段营销",
            "title": f"工作日{biz_labels.get(weakest_weekday, weakest_weekday)}客流不足",
            "description": f"工作日{biz_labels.get(weakest_weekday, weakest_weekday)}日均收入仅¥{weekday_revenues[weakest_weekday]:.0f}，有提升空间。",
            "action": f"推出\"工作日特惠\"：周一至周五{biz_labels.get(weakest_weekday, weakest_weekday)}消费享8折，搭配其他业态赠券",
            "expected_impact": f"工作日收入提升20-30%",
            "data_basis": f"工作日日均¥{weekday_revenues.get(weakest_weekday,0):.0f} vs 周末日均¥{weekend_revenues.get(weakest_weekday,0):.0f}",
        })

    # 建议6: 低谷日互相导流
    for biz_name, offpeak_data in biz_peak_offpeak.items():
        if not offpeak_data.get("offpeaks"):
            continue
        # 找其他业务中高峰日与这个业务低谷日重叠的
        for other_biz, other_data in biz_peak_offpeak.items():
            if other_biz == biz_name:
                continue
            overlap = set(offpeak_data["offpeaks"]) & set(other_data.get("peaks", []))
            if overlap:
                biz_labels = {"billiards": "台球", "mahjong": "棋牌", "cinema": "影院"}
                overlap_str = "、".join(overlap)
                suggestions.append({
                    "id": f"cross_peak_{biz_name}_{other_biz}",
                    "priority": "low",
                    "category": "交叉导流",
                    "title": f"{overlap_str}: {biz_labels[other_biz]}高峰 + {biz_labels[biz_name]}低谷",
                    "description": f"{overlap_str}是{biz_labels[other_biz]}的高峰日但{biz_labels[biz_name]}客流较低，可利用{biz_labels[other_biz]}客流导流。",
                    "action": f"{biz_labels[other_biz]}客户消费后推送{biz_labels[biz_name]}优惠券，限时当日使用",
                    "expected_impact": f"提升{biz_labels[biz_name]}在{overlap_str}的收入",
                    "data_basis": f"{biz_labels[other_biz]}在{overlap_str}日均收入较高",
                })
                break  # 每个业务只找一个最佳配对

    # 去重（按id）
    seen = set()
    unique_suggestions = []
    for s in suggestions:
        if s["id"] not in seen:
            seen.add(s["id"])
            unique_suggestions.append(s)

    return unique_suggestions


def analyze_cross_business(repo: DashboardRepository) -> dict[str, Any]:
    """多业务联动分析主入口"""
    now = _now_beijing()

    biz_data = _get_biz_data(repo, 30)

    # 各业务星期模式
    weekday_patterns = {}
    for biz_name, data in biz_data.items():
        weekday_patterns[biz_name] = _weekday_pattern(data)

    # 生成建议
    suggestions = _generate_suggestions(biz_data, weekday_patterns)

    # 各业务摘要
    biz_summary = {}
    biz_labels = {"billiards": "台球", "mahjong": "棋牌", "cinema": "影院"}
    for biz_name, data in biz_data.items():
        recent = [d for d in data if d["revenue"] > 0]
        if recent:
            total = sum(d["revenue"] for d in recent)
            avg = total / len(recent)
            biz_summary[biz_name] = {
                "name": biz_labels.get(biz_name, biz_name),
                "data_days": len(recent),
                "total_revenue": round(total, 1),
                "avg_daily": round(avg, 1),
                "peak_days": biz_peak_offpeak_str(biz_name, weekday_patterns),
            }
        else:
            biz_summary[biz_name] = {
                "name": biz_labels.get(biz_name, biz_name),
                "data_days": 0,
                "status": "no_data",
            }

    # 合计
    total_all = sum(s.get("total_revenue", 0) for s in biz_summary.values())

    return {
        "status": "ok",
        "generated_at": now.isoformat(),
        "summary": biz_summary,
        "total_revenue_30d": round(total_all, 1),
        "weekday_patterns": {
            biz_name: {
                day_name: {"avg_revenue": round(pattern.get(i, {}).get("avg_revenue", 0), 1)}
                for i, day_name in enumerate(["周一", "周二", "周三", "周四", "周五", "周六", "周日"])
                if i in pattern
            }
            for biz_name, pattern in weekday_patterns.items()
        },
        "suggestions": suggestions,
    }


def biz_peak_offpeak_str(biz_name: str, weekday_patterns: dict) -> dict:
    """获取高峰/低谷日描述"""
    pattern = weekday_patterns.get(biz_name, {})
    peaks, offpeaks = _find_peak_offpeak(pattern)
    return {
        "peaks": peaks,
        "offpeaks": offpeaks,
    }
