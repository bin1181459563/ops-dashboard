"""
影院排片经营建议 — 分析场次表现并生成排片优化建议
数据来源: daily_snapshots表（凤凰云智Excel导入）
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

PLATFORM = "fenghuang"
BUSINESS_TYPE = "cinema"
STORE_ID = "cinema_feicuicheng"
STORE_NAME = "SFC上影国际影城翡翠城店"

from app.services.cinema_excel import _filtered_concession_revenue


def _load_raw(snapshot: dict) -> dict:
    """从snapshot中解析raw字段"""
    raw = snapshot.get("raw")
    if isinstance(raw, str):
        import json
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return {}
    return raw if isinstance(raw, dict) else {}


def analyze_screening_performance(repository, days: int = 30) -> dict[str, Any]:
    """
    分析场次表现
    - 从场次放映明细中分析每个时段的上座率
    - 识别高上座率和低上座率的时段
    - 分析影厅利用率
    """
    today = date.today().isoformat()
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days)

    if not snapshots:
        return {
            "status": "no_data",
            "message": "暂无影院数据，请先上传凤凰云智Excel报表",
        }

    # 按日期汇总
    daily_data: list[dict[str, Any]] = []
    total_box_office = 0.0
    total_concession = 0.0
    total_customers = 0
    total_screenings = 0

    for s in snapshots:
        raw = _load_raw(s)
        summary = raw.get("summary", {})
        films = raw.get("films", [])

        box_office = summary.get("box_office", 0)
        concession = _filtered_concession_revenue(raw)
        customers = s.get("customer_count", 0) or 0
        screenings = s.get("orders", 0) or 0
        occupancy = s.get("usage_rate", 0) or 0

        total_box_office += box_office
        total_concession += concession
        total_customers += customers
        total_screenings += screenings

        # 影片明细
        film_details = []
        for f in films:
            film_details.append({
                "name": f.get("film_name", ""),
                "box_office": f.get("film_box_office", 0),
                "attendance": f.get("film_attendance", 0),
            })

        daily_data.append({
            "date": s["date"],
            "box_office": round(box_office, 2),
            "concession_revenue": round(concession, 2),
            "customer_count": customers,
            "screenings": screenings,
            "occupancy_rate": round(occupancy, 1),
            "films": sorted(film_details, key=lambda x: -(x.get("box_office", 0) or 0)),
        })

    daily_data.sort(key=lambda x: x["date"])

    # 分析每日趋势
    avg_daily_box = total_box_office / len(daily_data) if daily_data else 0
    avg_daily_customers = total_customers / len(daily_data) if daily_data else 0
    avg_daily_screenings = total_screenings / len(daily_data) if daily_data else 0
    avg_occupancy = sum(d["occupancy_rate"] for d in daily_data) / len(daily_data) if daily_data else 0

    # 识别高/低表现日
    high_days = [d for d in daily_data if d["box_office"] > avg_daily_box * 1.3]
    low_days = [d for d in daily_data if d["box_office"] < avg_daily_box * 0.7 and d["box_office"] > 0]

    # 星期几分析
    weekday_data: dict[str, dict] = defaultdict(lambda: {
        "count": 0, "total_box": 0.0, "total_customers": 0, "total_screenings": 0,
    })
    weekday_names = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    for d in daily_data:
        dt = datetime.strptime(d["date"], "%Y-%m-%d")
        wd = weekday_names[dt.weekday()]
        weekday_data[wd]["count"] += 1
        weekday_data[wd]["total_box"] += d["box_office"]
        weekday_data[wd]["total_customers"] += d["customer_count"]
        weekday_data[wd]["total_screenings"] += d["screenings"]

    weekday_analysis = []
    for wd in weekday_names:
        if wd in weekday_data and weekday_data[wd]["count"] > 0:
            wd_data = weekday_data[wd]
            weekday_analysis.append({
                "weekday": wd,
                "avg_box_office": round(wd_data["total_box"] / wd_data["count"], 2),
                "avg_customers": round(wd_data["total_customers"] / wd_data["count"], 0),
                "avg_screenings": round(wd_data["total_screenings"] / wd_data["count"], 0),
                "sample_days": wd_data["count"],
            })

    # 影片表现汇总
    film_stats: dict[str, dict] = defaultdict(lambda: {"total_box": 0, "total_attendance": 0, "days": 0})
    for d in daily_data:
        for f in d.get("films", []):
            name = f.get("name", "")
            if not name:
                continue
            film_stats[name]["total_box"] += f.get("box_office", 0) or 0
            film_stats[name]["total_attendance"] += f.get("attendance", 0) or 0
            film_stats[name]["days"] += 1

    film_ranking = [
        {
            "name": name,
            "total_box_office": round(stats["total_box"], 2),
            "total_attendance": stats["total_attendance"],
            "days_shown": stats["days"],
            "avg_daily_box": round(stats["total_box"] / stats["days"], 2) if stats["days"] else 0,
        }
        for name, stats in film_stats.items()
    ]
    film_ranking.sort(key=lambda x: -x["total_box_office"])

    return {
        "status": "ok",
        "period": f"{daily_data[0]['date']}~{daily_data[-1]['date']}" if daily_data else "",
        "days": len(daily_data),
        "daily_data": daily_data,
        "weekday_analysis": weekday_analysis,
        "film_ranking": film_ranking,
        "averages": {
            "avg_daily_box_office": round(avg_daily_box, 2),
            "avg_daily_customers": round(avg_daily_customers, 0),
            "avg_daily_screenings": round(avg_daily_screenings, 0),
            "avg_occupancy_rate": round(avg_occupancy, 1),
        },
        "high_performance_days": len(high_days),
        "low_performance_days": len(low_days),
        "summary": {
            "total_box_office": round(total_box_office, 2),
            "total_concession": round(total_concession, 2),
            "total_customers": total_customers,
            "total_screenings": total_screenings,
        },
    }


def generate_screening_suggestions(repository, days: int = 30) -> dict[str, Any]:
    """
    生成排片建议
    - 推荐增加或减少场次
    - 优化时段安排
    """
    analysis = analyze_screening_performance(repository, days)
    if analysis["status"] != "ok":
        return analysis

    suggestions: list[dict[str, Any]] = []
    weekday_analysis = analysis.get("weekday_analysis", [])
    film_ranking = analysis.get("film_ranking", [])
    averages = analysis.get("averages", {})

    # 1. 周末vs工作日排片建议
    weekend_days = [d for d in weekday_analysis if d["weekday"] in ("周六", "周日")]
    weekday_days = [d for d in weekday_analysis if d["weekday"] not in ("周六", "周日")]

    if weekend_days and weekday_days:
        avg_weekend_box = sum(d["avg_box_office"] for d in weekend_days) / len(weekend_days)
        avg_weekday_box = sum(d["avg_box_office"] for d in weekday_days) / len(weekday_days)

        if avg_weekend_box > avg_weekday_box * 1.5:
            suggestions.append({
                "category": "时段优化",
                "title": "周末排片密度建议增加",
                "detail": f"周末平均票房({avg_weekend_box}元)是工作日({avg_weekday_box}元)的{avg_weekend_box/avg_weekday_box:.1f}倍",
                "suggestion": "建议周末增加2-3个黄金时段场次，特别是下午和晚间时段",
                "priority": "high",
            })

    # 2. 工作日优化
    if weekday_days:
        low_weekdays = [d for d in weekday_days if d["avg_box_office"] < averages.get("avg_daily_box_office", 0) * 0.6]
        if low_weekdays:
            names = "、".join(d["weekday"] for d in low_weekdays)
            suggestions.append({
                "category": "时段优化",
                "title": f"低效工作日优化：{names}",
                "detail": f"{names}平均票房明显低于其他工作日",
                "suggestion": "建议减少低效日场次，集中资源在高效时段；可考虑推出工作日特价场吸引客流",
                "priority": "medium",
            })

    # 3. 影片排片建议
    if film_ranking:
        top_films = film_ranking[:3]
        bottom_films = [f for f in film_ranking if f["avg_daily_box"] < averages.get("avg_daily_box_office", 0) * 0.3]

        if top_films:
            names = "、".join(f["name"] for f in top_films)
            suggestions.append({
                "category": "影片排片",
                "title": "热门影片排片建议",
                "detail": f"票房TOP3：{names}",
                "suggestion": "建议将热门影片安排在黄金时段（14:00-16:00, 19:00-21:00），并增加排片场次",
                "priority": "high",
            })

        if bottom_films:
            suggestions.append({
                "category": "影片排片",
                "title": "冷门影片调整建议",
                "detail": f"有{len(bottom_films)}部影片日均票房偏低",
                "suggestion": "建议减少冷门影片场次，或调整到非黄金时段；考虑提前下映表现不佳的影片",
                "priority": "medium",
            })

    # 4. 上座率优化
    avg_occupancy = averages.get("avg_occupancy_rate", 0)
    if avg_occupancy < 30:
        suggestions.append({
            "category": "上座率",
            "title": "上座率偏低需优化",
            "detail": f"平均上座率仅{avg_occupancy}%",
            "suggestion": "建议：1)减少总场次、提高单场上座率 2)推出特价场活动 3)优化排片时段避开低客流时段",
            "priority": "high",
        })
    elif avg_occupancy > 60:
        suggestions.append({
            "category": "上座率",
            "title": "上座率良好，可适当扩容",
            "detail": f"平均上座率{avg_occupancy}%，表现优秀",
            "suggestion": "建议：1)高峰时段可增加场次 2)考虑提升票价 3)增加卖品推荐提升客单价",
            "priority": "low",
        })

    # 5. 卖品联动
    total_box = analysis["summary"]["total_box_office"]
    total_concession = analysis["summary"]["total_concession"]
    if total_box > 0:
        concession_ratio = total_concession / total_box * 100
        if concession_ratio < 10:
            suggestions.append({
                "category": "卖品联动",
                "title": "卖品渗透率偏低",
                "detail": f"卖品收入仅占票房的{concession_ratio:.1f}%",
                "suggestion": "建议在排片时预留卖品推广时段，热门场次前增加卖品推荐；推出观影套餐（票+卖品）",
                "priority": "medium",
            })

    # 排序
    priority_map = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: priority_map.get(x["priority"], 9))

    return {
        "status": "ok",
        "title": "影院排片经营建议",
        "conclusion": f"分析{analysis['days']}天数据，生成{len(suggestions)}条排片优化建议",
        "evidence": [
            f"分析周期: {analysis['period']}",
            f"总票房: {analysis['summary']['total_box_office']}元",
            f"总观影人次: {analysis['summary']['total_customers']}",
            f"日均票房: {averages.get('avg_daily_box_office', 0)}元",
            f"平均上座率: {averages.get('avg_occupancy_rate', 0)}%",
            f"高表现天数: {analysis['high_performance_days']}天",
            f"低表现天数: {analysis['low_performance_days']}天",
        ],
        "confidence": 0.78,
        "suggestions": suggestions,
        "suggested_actions": [s["suggestion"] for s in suggestions[:5]],
        "weekday_analysis": weekday_analysis,
        "film_ranking": film_ranking[:10],
    }
