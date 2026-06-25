"""
收入预测服务
基于历史快照数据，用移动平均+线性回归+星期模式预测未来7天/30天收入
大盘票房数据持久化存储在 SQLite 数据库中
"""

from datetime import datetime, timedelta, timezone
from typing import Any
import math

from app.core.database import DashboardRepository

# 计算出的影院市占率缓存（重启后从数据库重新加载）
_cinema_market_share_cache: float = 0.000032


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

    # 获取真实市占率（从数据库计算）
    _real_market_share = calc_market_share_from_history(repo)

    # 从数据库获取大盘数据
    box_office_data = repo.get_box_office_dict(days=90)

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

        # 置信度（提前计算，供预测使用）
        confidence = _calc_confidence(data_count, r2)

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

            pred_entry = {
                "date": future_date.isoformat(),
                "predicted": round(pred, 1),
                "predicted_revenue": round(pred, 1),
                "weekday": ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][future_date.weekday()],
                "range_low": round(pred * 0.8, 1),
                "range_high": round(pred * 1.2, 1),
                "confidence": confidence,
                "factors": {
                    "holiday_type": "",
                    "holiday_boost": 1.0,
                    "weather_boost": 1.0,
                    "is_weekend": future_date.weekday() >= 5,
                    "is_holiday": False,
                },
            }

            # 影院业务：如果有大盘数据，计算预测人次
            if biz["type"] == "cinema":
                date_key = future_date.isoformat()
                if date_key in box_office_data:
                    box_data = box_office_data[date_key]
                    total_box = box_data.get("total_box", 0)  # 万元
                    cinema_box = total_box * _real_market_share  # 万元
                    # 计算平均票价
                    total_rev = sum(d["revenue"] for d in data if d["revenue"] > 0)
                    total_cnt = sum(d["order_count"] for d in data if d["revenue"] > 0)
                    avg_price = total_rev / total_cnt if total_cnt > 0 else 37.73
                    predicted_audience = round((cinema_box * 10000) / avg_price)
                    pred_entry["predicted_audience"] = predicted_audience
                    pred_entry["cinema_box"] = round(cinema_box, 2)

            predictions_7d.append(pred_entry)

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
            "predictions_3d": predictions_7d[:3],  # 前3天
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

    # 尝试获取XGBoost预测（如果模型已训练）
    xgboost_predictions = {}
    try:
        from app.services.xgboost_predictor import predict_with_xgboost
        for biz in businesses:
            if biz["type"] == "cinema":
                xgb_result = predict_with_xgboost(
                    repo, biz["type"], biz["platform"], biz["store_id"], 10
                )
                if xgb_result.get("status") == "ok":
                    xgboost_predictions[biz["key"]] = xgb_result.get("predictions", [])
    except Exception:
        pass  # XGBoost模型未训练时忽略

    return {
        "status": "ok",
        "generated_at": now.isoformat(),
        "forecasts": forecasts,
        "xgboost_predictions": xgboost_predictions,
        "summary": {
            "total_7d_prediction": round(total_7d, 1),
            "total_30d_prediction": round(total_30d, 1),
        },
    }


# ============================================================
# 手动输入大盘数据（持久化到数据库）
# ============================================================

def update_maoyan_boxoffice(repo: DashboardRepository, date_str: str, total_box: float, movies: list = None) -> dict:
    """
    手动更新猫眼大盘数据（持久化存储）
    date_str: 日期，如 "2026-06-25"
    total_box: 今日大盘总票房（万元）
    movies: 影片列表（可选）
    """
    result = repo.upsert_box_office(date_str, total_box, source="manual", movies=movies)
    return result


def get_maoyan_boxoffice(repo: DashboardRepository) -> dict | None:
    """获取猫眼大盘数据（从数据库读取）"""
    today = _now_beijing().date().isoformat()
    
    # 先查今天的数据
    today_data = repo.get_box_office(date=today)
    if today_data:
        row = today_data[0]
        import json
        movies = json.loads(row.get("movies_json", "[]")) if row.get("movies_json") else []
        return {
            "status": "ok",
            "date": row["date"],
            "total_box": row["total_box"],
            "movies": movies,
            "source": row.get("source", "manual"),
        }
    
    # 返回最近的数据
    all_data = repo.get_box_office(days=90)
    if all_data:
        row = all_data[-1]  # 最新的一条
        import json
        movies = json.loads(row.get("movies_json", "[]")) if row.get("movies_json") else []
        return {
            "status": "ok",
            "date": row["date"],
            "total_box": row["total_box"],
            "movies": movies,
            "source": row.get("source", "manual"),
        }
    
    return None


def calc_market_share_from_history(repo: DashboardRepository) -> float:
    """
    从历史数据计算真实市占率
    市占率 = 影院历史收入 / 大盘历史票房
    """
    global _cinema_market_share_cache
    
    # 获取影院历史收入（90天）
    cinema_data = _get_daily_revenues(repo, "cinema", "fenghuang", "cinema_feicuicheng", 90)
    
    # 从数据库获取大盘数据
    box_office_data = repo.get_box_office_dict(days=90)
    
    if not cinema_data or not box_office_data:
        return _cinema_market_share_cache or 0.000032
    
    # 匹配有大盘数据的日期
    matched_days = []
    for cinema_day in cinema_data:
        date_str = cinema_day["date"]
        if date_str in box_office_data:
            box_office = box_office_data[date_str].get("total_box", 0)
            if box_office > 0:
                matched_days.append({
                    "date": date_str,
                    "cinema_revenue": cinema_day["revenue"],
                    "box_office": box_office,
                })
    
    if not matched_days:
        return _cinema_market_share_cache or 0.000032
    
    # 计算平均市占率
    total_cinema = sum(d["cinema_revenue"] for d in matched_days)
    total_box = sum(d["box_office"] for d in matched_days)
    
    if total_box > 0:
        _cinema_market_share_cache = total_cinema / (total_box * 10000)  # box_office是万元
        # 更新数据库中所有记录的市占率
        for day in matched_days:
            day_share = day["cinema_revenue"] / (day["box_office"] * 10000) if day["box_office"] > 0 else 0
            repo.update_market_share(day["date"], day_share)
    
    return _cinema_market_share_cache


def predict_cinema_from_boxoffice(repo: DashboardRepository, boxoffice_predictions: list[dict]) -> list[dict]:
    """
    根据大盘票房预测影院收入和人次
    boxoffice_predictions: [{"date": "2026-06-26", "total_box": 15000}, ...]
    """
    # 获取影院历史数据
    cinema_data = _get_daily_revenues(repo, "cinema", "fenghuang", "cinema_feicuicheng", 90)
    
    if not cinema_data:
        return []
    
    # 计算历史人均消费（票房/人次）
    total_revenue = sum(d["revenue"] for d in cinema_data)
    total_orders = sum(d["order_count"] for d in cinema_data)
    avg_ticket_price = total_revenue / total_orders if total_orders > 0 else 40  # 默认40元/人
    
    # 计算影院市占率
    market_share = calc_market_share_from_history(repo)
    
    # 预测未来几天
    predictions = []
    for pred in boxoffice_predictions:
        date_str = pred["date"]
        total_box = pred["total_box"]  # 万元
        
        # 影院票房 = 大盘票房 × 市占率
        cinema_box = total_box * market_share  # 万元
        
        # 影院人次 = 影院票房 / 平均票价
        # 注意：avg_ticket_price 是元，cinema_box 是万元
        cinema_audience = (cinema_box * 10000) / avg_ticket_price
        
        predictions.append({
            "date": date_str,
            "predicted_box": round(cinema_box, 2),
            "predicted_audience": round(cinema_audience),
            "avg_ticket_price": round(avg_ticket_price, 2),
        })
    
    return predictions


def batch_import_boxoffice(repo: DashboardRepository, data: list[dict]) -> dict:
    """
    批量导入大盘票房数据
    data: [{"date": "2026-06-01", "total_box": 15000}, ...]
    """
    imported = 0
    for item in data:
        date = item.get("date")
        total_box = item.get("total_box", 0)
        if date and total_box > 0:
            repo.upsert_box_office(date, total_box, source="batch_import")
            imported += 1
    
    # 重新计算市占率
    market_share = calc_market_share_from_history(repo)
    
    return {
        "status": "ok",
        "imported": imported,
        "market_share": round(market_share * 100, 4),  # 转为百分比
        "market_share_raw": market_share,
    }
