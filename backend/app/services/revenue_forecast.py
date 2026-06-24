"""
收入预测服务
基于历史快照数据，用移动平均+线性回归+星期模式预测未来7天/30天收入
"""

from datetime import datetime, timedelta, timezone
from typing import Any
import math

from app.core.database import DashboardRepository


def _now_beijing() -> datetime:
    return datetime.now(timezone(timedelta(hours=8)))


def _get_daily_revenues(
    repo: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
    days: int = 60,
) -> list[dict]:
    """获取每日收入数据，返回 [{date, revenue, order_count}]"""
    snapshots = repo.daily_snapshots_for(business_type, platform, store_id, days)
    result = []
    for snap in snapshots:
        raw = snap.get("raw_json") or {}
        if isinstance(raw, str):
            import json
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}

        date_str = snap.get("date", "")
        revenue = 0
        order_count = 0

        if business_type == "billiards":
            summary = raw.get("summary", {})
            revenue = float(summary.get("total_amount", 0) or 0)
            order_count = int(summary.get("order_count", 0) or 0)
        elif business_type == "mahjong":
            overview = raw.get("overview", {})
            revenue = float(overview.get("paid_amount", 0) or 0)
            order_count = int(overview.get("orders", 0) or 0)
        elif business_type == "cinema":
            summary = raw.get("summary", {})
            revenue = float(summary.get("revenue", 0) or 0)
            order_count = int(summary.get("customer_count", 0) or 0)

        if date_str:
            result.append({
                "date": date_str,
                "revenue": revenue,
                "order_count": order_count,
            })

    # 按日期排序
    result.sort(key=lambda x: x["date"])
    return result


def _moving_average(data: list[float], window: int = 7) -> float:
    """计算最近N天的移动平均"""
    if not data:
        return 0
    recent = data[-window:]
    return sum(recent) / len(recent)


def _linear_regression(data: list[float]) -> tuple[float, float]:
    """简单线性回归，返回 (slope, intercept)。x=0,1,2,...n-1"""
    n = len(data)
    if n < 2:
        return 0, data[0] if data else 0

    x_mean = (n - 1) / 2
    y_mean = sum(data) / n

    numerator = sum((i - x_mean) * (y - y_mean) for i, y in enumerate(data))
    denominator = sum((i - x_mean) ** 2 for i in range(n))

    if denominator == 0:
        return 0, y_mean

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return slope, intercept


def _weekday_averages(data: list[dict]) -> dict[int, float]:
    """按星期几分组计算平均收入"""
    by_weekday: dict[int, list[float]] = {i: [] for i in range(7)}
    for item in data:
        dt = datetime.fromisoformat(item["date"])
        wd = dt.weekday()  # 0=周一
        by_weekday[wd].append(item["revenue"])

    result = {}
    for wd in range(7):
        vals = by_weekday[wd]
        result[wd] = sum(vals) / len(vals) if vals else 0
    return result


def _calc_confidence(data_count: int, r_squared: float) -> str:
    """根据数据量和拟合度判断置信度"""
    if data_count < 7:
        return "low"
    if data_count < 14:
        return "medium" if r_squared > 0.3 else "low"
    if r_squared > 0.6:
        return "high"
    if r_squared > 0.3:
        return "medium"
    return "low"


def _r_squared(data: list[float], slope: float, intercept: float) -> float:
    """计算R²决定系数"""
    if len(data) < 2:
        return 0
    y_mean = sum(data) / len(data)
    ss_tot = sum((y - y_mean) ** 2 for y in data)
    if ss_tot == 0:
        return 0
    ss_res = sum((y - (slope * i + intercept)) ** 2 for i, y in enumerate(data))
    return max(0, 1 - ss_res / ss_tot)


def forecast_revenue(repo: DashboardRepository) -> dict[str, Any]:
    """生成三个业务的收入预测"""
    now = _now_beijing()
    today_str = now.date().isoformat()

    businesses = [
        {"name": "台球", "key": "billiards", "type": "billiards", "platform": "xiaotie", "store_id": "feicuicheng"},
        {"name": "棋牌", "key": "mahjong", "type": "mahjong", "platform": "wu_laoban", "store_id": "feicuicheng"},
        {"name": "影院", "key": "cinema", "type": "cinema", "platform": "fenghuang", "store_id": "cinema_feicuicheng"},
    ]

    forecasts = []
    total_confidence = "low"

    for biz in businesses:
        data = _get_daily_revenues(repo, biz["type"], biz["platform"], biz["store_id"], 60)
        if not data:
            forecasts.append({
                "business": biz["name"],
                "key": biz["key"],
                "status": "no_data",
                "message": "暂无历史数据",
            })
            continue

        revenues = [d["revenue"] for d in data]
        data_count = len(revenues)

        # 移动平均
        ma7 = _moving_average(revenues, 7)
        ma3 = _moving_average(revenues, 3)

        # 线性回归
        slope, intercept = _linear_regression(revenues)
        r2 = _r_squared(revenues, slope, intercept)

        # 星期模式
        weekday_avg = _weekday_averages(data)

        # 预测未来7天
        predictions_7d = []
        for i in range(1, 8):
            future_date = now.date() + timedelta(days=i)
            day_idx = data_count + i - 1  # 回归中的x
            lr_pred = max(0, slope * day_idx + intercept)
            wd_pred = weekday_avg.get(future_date.weekday(), 0)

            # 加权: 回归40% + 移动平均30% + 星期模式30%
            if data_count >= 14:
                pred = lr_pred * 0.4 + ma7 * 0.3 + wd_pred * 0.3
            elif data_count >= 7:
                pred = ma7 * 0.5 + wd_pred * 0.5
            else:
                pred = ma3 * 0.6 + wd_pred * 0.4

            predictions_7d.append({
                "date": future_date.isoformat(),
                "predicted_revenue": round(pred, 1),
                "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][future_date.weekday()],
            })

        # 预测未来30天
        predictions_30d_total = 0
        for i in range(1, 31):
            future_date = now.date() + timedelta(days=i)
            day_idx = data_count + i - 1
            lr_pred = max(0, slope * day_idx + intercept)
            wd_pred = weekday_avg.get(future_date.weekday(), 0)

            if data_count >= 14:
                pred = lr_pred * 0.4 + ma7 * 0.3 + wd_pred * 0.3
            elif data_count >= 7:
                pred = ma7 * 0.5 + wd_pred * 0.5
            else:
                pred = ma3 * 0.6 + wd_pred * 0.4

            predictions_30d_total += pred

        # 置信度
        confidence = _calc_confidence(data_count, r2)

        # 趋势方向
        if slope > 0.5:
            trend = "up"
            trend_label = "上升"
        elif slope < -0.5:
            trend = "down"
            trend_label = "下降"
        else:
            trend = "stable"
            trend_label = "平稳"

        # 最近7天日均
        recent_7d_avg = ma7
        recent_3d_avg = ma3

        # 总收入统计
        total_revenue = sum(revenues)
        avg_daily = total_revenue / data_count if data_count > 0 else 0

        # 最大/最小日
        max_day = max(data, key=lambda x: x["revenue"])
        min_day = min((d for d in data if d["revenue"] > 0), key=lambda x: x["revenue"]) if any(d["revenue"] > 0 for d in data) else data[0]

        forecasts.append({
            "business": biz["name"],
            "key": biz["key"],
            "status": "ok",
            "data_days": data_count,
            "total_revenue": round(total_revenue, 1),
            "avg_daily_revenue": round(avg_daily, 1),
            "recent_7d_avg": round(recent_7d_avg, 1),
            "recent_3d_avg": round(recent_3d_avg, 1),
            "max_day": {"date": max_day["date"], "revenue": round(max_day["revenue"], 1)},
            "min_day": {"date": min_day["date"], "revenue": round(min_day["revenue"], 1)},
            "trend": trend,
            "trend_label": trend_label,
            "slope": round(slope, 2),
            "r_squared": round(r2, 3),
            "confidence": confidence,
            "predictions_7d": predictions_7d,
            "predictions_30d_total": round(predictions_30d_total, 1),
            "weekday_averages": {
                day_name: round(weekday_avg.get(i, 0), 1)
                for i, day_name in enumerate(["周一", "周二", "周三", "周四", "周五", "周六", "周日"])
            },
        })

    # 三个业务合计预测
    total_7d = sum(
        sum(p["predicted_revenue"] for p in f.get("predictions_7d", []))
        for f in forecasts if f.get("status") == "ok"
    )
    total_30d = sum(f.get("predictions_30d_total", 0) for f in forecasts if f.get("status") == "ok")

    return {
        "status": "ok",
        "generated_at": now.isoformat(),
        "forecasts": forecasts,
        "summary": {
            "total_7d_prediction": round(total_7d, 1),
            "total_30d_prediction": round(total_30d, 1),
        },
    }
