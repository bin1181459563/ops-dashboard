"""
AI洞察服务
- 异常预警：比较今日vs昨日vs上周同日的营收/订单/客流
- 经营日报：汇总今日各业务营收/订单/客流，计算环比变化
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.database import DashboardRepository


def _now_beijing() -> datetime:
    """获取当前北京时间 (UTC+8)"""
    return datetime.now(timezone(timedelta(hours=8)))


def _today_str() -> str:
    return _now_beijing().date().isoformat()


def _yesterday_str() -> str:
    return (_now_beijing().date() - timedelta(days=1)).isoformat()


def _last_week_same_day_str() -> str:
    return (_now_beijing().date() - timedelta(days=7)).isoformat()


def _safe_ratio(current: float, previous: float) -> float | None:
    """安全计算变化率，返回百分比"""
    if previous is None or previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def _format_ratio(ratio: float | None) -> str:
    """格式化变化率为字符串"""
    if ratio is None:
        return "N/A"
    if ratio > 0:
        return f"+{ratio}%"
    return f"{ratio}%"


def _get_business_snapshots(
    repository: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
) -> dict[str, Any] | None:
    """获取指定业务最新一天的快照数据"""
    snapshot = repository.daily_snapshot_for_date(
        business_type=business_type,
        platform=platform,
        store_id=store_id,
        date=_today_str(),
    )
    if snapshot:
        return snapshot
    # fallback到最新快照
    latest = repository.latest_daily_snapshot_for(business_type, platform, store_id)
    return latest


def _get_biz_snap_by_date(
    repository: DashboardRepository,
    business_type: str,
    platform: str,
    store_id: str,
    date: str,
) -> dict[str, Any] | None:
    """获取指定业务在指定日期的快照数据"""
    snapshot = repository.daily_snapshot_for_date(
        business_type=business_type,
        platform=platform,
        store_id=store_id,
        date=date,
    )
    return snapshot


def _detect_anomaly(
    current: float,
    yesterday: float | None,
    last_week: float | None,
    metric_name: str,
    threshold_drop: float = -20.0,
    threshold_surge: float = 50.0,
) -> dict[str, Any] | None:
    """
    检测异常
    - 异常下降: > threshold_drop (默认-20%)
    - 异常增长: > threshold_surge (默认+50%)
    返回异常信息或None
    """
    anomalies = []

    # 与昨日对比
    if yesterday is not None and yesterday > 0:
        change = _safe_ratio(current, yesterday)
        if change is not None and change <= threshold_drop:
            anomalies.append({
                "type": "drop",
                "compare_to": "yesterday",
                "change": change,
                "description": f"{metric_name}较昨日下降{abs(change):.1f}%",
            })
        elif change is not None and change >= threshold_surge:
            anomalies.append({
                "type": "surge",
                "compare_to": "yesterday",
                "change": change,
                "description": f"{metric_name}较昨日增长{change:.1f}%",
            })

    # 与上周同日对比
    if last_week is not None and last_week > 0:
        change = _safe_ratio(current, last_week)
        if change is not None and change <= threshold_drop:
            anomalies.append({
                "type": "drop",
                "compare_to": "last_week",
                "change": change,
                "description": f"{metric_name}较上周同日下降{abs(change):.1f}%",
            })
        elif change is not None and change >= threshold_surge:
            anomalies.append({
                "type": "surge",
                "compare_to": "last_week",
                "change": change,
                "description": f"{metric_name}较上周同日增长{change:.1f}%",
            })

    return anomalies if anomalies else None


def analyze_anomalies(repository: DashboardRepository) -> dict[str, Any]:
    """
    分析异常预警
    比较今日vs昨日vs上周同日的营收/订单/客流
    检查影院上座率、台球桌台利用率、棋牌包间使用率
    返回结构化的预警列表
    """
    # 只在晚间23点触发日环比预警，避免白天数据不完整时误报
    now = datetime.now()
    if now.hour != 23:
        return {
            "has_anomalies": False,
            "anomaly_count": 0,
            "warnings": [],
            "generated_at": now.isoformat(),
            "note": "日环比预警仅在23:00触发",
        }

    today = _today_str()
    yesterday = _yesterday_str()
    last_week = _last_week_same_day_str()

    warnings: list[dict[str, Any]] = []

    # 定义要检查的业务列表
    businesses = [
        {"business_type": "cinema", "platform": "fenghuang", "store_id": "cinema_feicuicheng", "name": "影院", "venue": "凤凰云智"},
        {"business_type": "billiards", "platform": "xiaotie", "store_id": "feicuicheng", "name": "台球", "venue": "小铁"},
        {"business_type": "mahjong", "platform": "wu_laoban", "store_id": "feicuicheng", "name": "棋牌", "venue": "無老板"},
    ]

    for biz in businesses:
        biz_type = biz["business_type"]
        platform = biz["platform"]
        store_id = biz["store_id"]
        name = biz["name"]
        venue = biz["venue"]

        today_snap = _get_biz_snap_by_date(repository, biz_type, platform, store_id, today)
        yesterday_snap = _get_biz_snap_by_date(repository, biz_type, platform, store_id, yesterday)
        last_week_snap = _get_biz_snap_by_date(repository, biz_type, platform, store_id, last_week)

        if not today_snap:
            # 今日无数据，跳过对比
            continue

        today_revenue = today_snap.get("revenue", 0) or 0
        today_orders = today_snap.get("orders", 0) or 0
        today_customers = today_snap.get("customer_count", 0) or 0
        today_usage = today_snap.get("usage_rate", 0) or 0

        yesterday_revenue = yesterday_snap.get("revenue", 0) if yesterday_snap else None
        yesterday_orders = yesterday_snap.get("orders", 0) if yesterday_snap else None
        yesterday_customers = yesterday_snap.get("customer_count", 0) if yesterday_snap else None
        yesterday_usage = yesterday_snap.get("usage_rate", 0) if yesterday_snap else None

        last_week_revenue = last_week_snap.get("revenue", 0) if last_week_snap else None
        last_week_orders = last_week_snap.get("orders", 0) if last_week_snap else None
        last_week_customers = last_week_snap.get("customer_count", 0) if last_week_snap else None

        # 检测营收异常
        revenue_anomalies = _detect_anomaly(today_revenue, yesterday_revenue, last_week_revenue, f"{name}营收")
        if revenue_anomalies:
            for anomaly in revenue_anomalies:
                warnings.append(_build_warning(
                    title=f"{venue}{name}{anomaly['description']}",
                    conclusion=f"{name}今日营收¥{today_revenue:.0f}，{anomaly['description']}",
                    evidence=[
                        f"今日营收: ¥{today_revenue:.2f}",
                        f"昨日营收: ¥{yesterday_revenue:.2f}" if yesterday_revenue is not None else "昨日营收: 无数据",
                        f"上周同日营收: ¥{last_week_revenue:.2f}" if last_week_revenue is not None else "上周同日营收: 无数据",
                        f"变化幅度: {anomaly['change']:.1f}%",
                    ],
                    confidence=0.85 if anomaly["compare_to"] == "yesterday" else 0.75,
                    suggested_actions=[
                        f"检查{name}业务今日是否有异常情况",
                        "查看订单明细确认是否有大额退款或取消",
                        "联系门店确认运营状态",
                    ],
                    business_type=biz_type,
                    anomaly_type=anomaly["type"],
                ))

        # 检测订单异常
        orders_anomalies = _detect_anomaly(float(today_orders), float(yesterday_orders) if yesterday_orders is not None else None, float(last_week_orders) if last_week_orders is not None else None, f"{name}订单数")
        if orders_anomalies:
            for anomaly in orders_anomalies:
                warnings.append(_build_warning(
                    title=f"{venue}{name}{anomaly['description']}",
                    conclusion=f"{name}今日订单{today_orders}单，{anomaly['description']}",
                    evidence=[
                        f"今日订单: {today_orders}单",
                        f"昨日订单: {yesterday_orders}单" if yesterday_orders is not None else "昨日订单: 无数据",
                        f"上周同日订单: {last_week_orders}单" if last_week_orders is not None else "上周同日订单: 无数据",
                        f"变化幅度: {anomaly['change']:.1f}%",
                    ],
                    confidence=0.80,
                    suggested_actions=[
                        f"检查{name}订单来源和渠道",
                        "确认是否有促销活动影响",
                        "检查系统是否有故障导致订单丢失",
                    ],
                    business_type=biz_type,
                    anomaly_type=anomaly["type"],
                ))

        # 检测客流异常
        if today_customers > 0 or (yesterday_customers is not None and yesterday_customers > 0):
            customers_anomalies = _detect_anomaly(float(today_customers), float(yesterday_customers) if yesterday_customers is not None else None, float(last_week_customers) if last_week_customers is not None else None, f"{name}客流量")
            if customers_anomalies:
                for anomaly in customers_anomalies:
                    warnings.append(_build_warning(
                        title=f"{venue}{name}{anomaly['description']}",
                        conclusion=f"{name}今日客流{today_customers}人，{anomaly['description']}",
                        evidence=[
                            f"今日客流: {today_customers}人",
                            f"昨日客流: {yesterday_customers}人" if yesterday_customers is not None else "昨日客流: 无数据",
                            f"上周同日客流: {last_week_customers}人" if last_week_customers is not None else "上周同日客流: 无数据",
                            f"变化幅度: {anomaly['change']:.1f}%",
                        ],
                        confidence=0.75,
                        suggested_actions=[
                            f"分析{name}客流来源渠道",
                            "检查是否有天气、节假日等外部因素影响",
                            "评估营销活动效果",
                        ],
                        business_type=biz_type,
                        anomaly_type=anomaly["type"],
                    ))

        # 检测使用率异常
        if today_usage > 0:
            usage_label = _get_usage_label(biz_type)
            # 使用率过低 (<30%)
            if today_usage < 0.30 and (yesterday_usage is None or yesterday_usage >= 0.30):
                warnings.append(_build_warning(
                    title=f"{venue}{name}{usage_label}偏低",
                    conclusion=f"{name}今日{usage_label}仅{today_usage * 100:.1f}%，低于正常水平",
                    evidence=[
                        f"今日{usage_label}: {today_usage * 100:.1f}%",
                        f"昨日{usage_label}: {yesterday_usage * 100:.1f}%" if yesterday_usage is not None else f"昨日{usage_label}: 无数据",
                        "预警阈值: <30%",
                    ],
                    confidence=0.70,
                    suggested_actions=[
                        f"检查{name}是否有设备故障或维护",
                        "确认是否有预约系统问题",
                        "分析时间段分布，找出低谷时段",
                    ],
                    business_type=biz_type,
                    anomaly_type="low_usage",
                ))
            # 使用率异常下降 (>20%下降)
            elif yesterday_usage is not None and yesterday_usage > 0:
                usage_change = _safe_ratio(today_usage, yesterday_usage)
                if usage_change is not None and usage_change <= -20:
                    warnings.append(_build_warning(
                        title=f"{venue}{name}{usage_label}大幅下降",
                        conclusion=f"{name}今日{usage_label}较昨日下降{abs(usage_change):.1f}%",
                        evidence=[
                            f"今日{usage_label}: {today_usage * 100:.1f}%",
                            f"昨日{usage_label}: {yesterday_usage * 100:.1f}%",
                            f"下降幅度: {abs(usage_change):.1f}%",
                        ],
                        confidence=0.80,
                        suggested_actions=[
                            f"检查{name}设备运行状态",
                            "确认是否有预订取消潮",
                            "联系门店确认现场情况",
                        ],
                        business_type=biz_type,
                        anomaly_type="usage_drop",
                    ))

    # 按置信度排序
    warnings.sort(key=lambda w: w.get("confidence", 0), reverse=True)

    return {
        "has_anomalies": len(warnings) > 0,
        "anomaly_count": len(warnings),
        "warnings": warnings,
        "analyzed_at": _now_beijing().isoformat(),
    }


def _get_usage_label(business_type: str) -> str:
    """获取不同业务类型的使用率标签"""
    labels = {
        "cinema": "上座率",
        "billiards": "桌台利用率",
        "mahjong": "包间使用率",
    }
    return labels.get(business_type, "使用率")


def _build_warning(
    title: str,
    conclusion: str,
    evidence: list[str],
    confidence: float,
    suggested_actions: list[str],
    business_type: str,
    anomaly_type: str,
) -> dict[str, Any]:
    """构建结构化预警信息"""
    return {
        "title": title,
        "conclusion": conclusion,
        "evidence": evidence,
        "confidence": confidence,
        "suggested_actions": suggested_actions,
        "business_type": business_type,
        "anomaly_type": anomaly_type,
    }


def generate_daily_report(repository: DashboardRepository) -> dict[str, Any]:
    """
    生成经营日报
    汇总今日各业务营收/订单/客流，计算环比变化
    识别表现最好和最差的业务，生成AI建议
    """
    today = _today_str()
    yesterday = _yesterday_str()

    businesses = [
        {"business_type": "cinema", "platform": "fenghuang", "store_id": "cinema_feicuicheng", "name": "影院", "venue": "凤凰云智"},
        {"business_type": "billiards", "platform": "xiaotie", "store_id": "feicuicheng", "name": "台球", "venue": "小铁"},
        {"business_type": "mahjong", "platform": "wu_laoban", "store_id": "feicuicheng", "name": "棋牌", "venue": "無老板"},
    ]

    report_items = []
    total_revenue = 0.0
    total_orders = 0
    total_customers = 0

    for biz in businesses:
        biz_type = biz["business_type"]
        platform = biz["platform"]
        store_id = biz["store_id"]
        name = biz["name"]
        venue = biz["venue"]

        today_snap = _get_biz_snap_by_date(repository, biz_type, platform, store_id, today)
        yesterday_snap = _get_biz_snap_by_date(repository, biz_type, platform, store_id, yesterday)

        today_revenue = today_snap.get("revenue", 0) or 0 if today_snap else 0
        today_orders = today_snap.get("orders", 0) or 0 if today_snap else 0
        today_customers = today_snap.get("customer_count", 0) or 0 if today_snap else 0
        today_usage = today_snap.get("usage_rate", 0) or 0 if today_snap else 0
        today_avg_order = today_snap.get("avg_order_value", 0) or 0 if today_snap else 0

        yesterday_revenue = yesterday_snap.get("revenue", 0) or 0 if yesterday_snap else 0
        yesterday_orders = yesterday_snap.get("orders", 0) or 0 if yesterday_snap else 0
        yesterday_customers = yesterday_snap.get("customer_count", 0) or 0 if yesterday_snap else 0

        revenue_change = _safe_ratio(today_revenue, yesterday_revenue)
        orders_change = _safe_ratio(float(today_orders), float(yesterday_orders))
        customers_change = _safe_ratio(float(today_customers), float(yesterday_customers))

        total_revenue += today_revenue
        total_orders += today_orders
        total_customers += today_customers

        report_items.append({
            "business_type": biz_type,
            "platform": platform,
            "name": name,
            "venue": venue,
            "today": {
                "revenue": today_revenue,
                "orders": today_orders,
                "customer_count": today_customers,
                "usage_rate": today_usage,
                "avg_order_value": today_avg_order,
            },
            "yesterday": {
                "revenue": yesterday_revenue,
                "orders": yesterday_orders,
                "customer_count": yesterday_customers,
            },
            "changes": {
                "revenue": _format_ratio(revenue_change),
                "revenue_change": revenue_change,
                "orders": _format_ratio(orders_change),
                "orders_change": orders_change,
                "customers": _format_ratio(customers_change),
                "customers_change": customers_change,
            },
        })

    # 识别表现最好和最差的业务（按营收变化率）
    valid_items = [item for item in report_items if item["changes"]["revenue_change"] is not None]

    best_business = None
    worst_business = None

    if valid_items:
        best_item = max(valid_items, key=lambda x: x["changes"]["revenue_change"])
        worst_item = min(valid_items, key=lambda x: x["changes"]["revenue_change"])

        # 只有正增长才算最好
        if best_item["changes"]["revenue_change"] > 0:
            best_business = {
                "name": best_item["name"],
                "venue": best_item["venue"],
                "revenue": best_item["today"]["revenue"],
                "change": _format_ratio(best_item["changes"]["revenue_change"]),
            }

        # 只有负增长才算最差
        if worst_item["changes"]["revenue_change"] < 0:
            worst_business = {
                "name": worst_item["name"],
                "venue": worst_item["venue"],
                "revenue": worst_item["today"]["revenue"],
                "change": _format_ratio(worst_item["changes"]["revenue_change"]),
            }

    # 生成AI建议
    suggestions = _generate_suggestions(report_items, best_business, worst_business)

    return {
        "report_date": today,
        "generated_at": _now_beijing().isoformat(),
        "summary": {
            "total_revenue": total_revenue,
            "total_orders": total_orders,
            "total_customers": total_customers,
        },
        "businesses": report_items,
        "highlights": {
            "best_business": best_business,
            "worst_business": worst_business,
        },
        "suggestions": suggestions,
    }


def _generate_suggestions(
    report_items: list[dict[str, Any]],
    best: dict[str, Any] | None,
    worst: dict[str, Any] | None,
) -> list[str]:
    """根据数据生成AI建议"""
    suggestions = []

    # 基于最佳业务的建议
    if best:
        suggestions.append(f"{best['venue']}{best['name']}表现亮眼，营收环比增长{best['change']}，建议分析其成功因素并推广到其他业务。")

    # 基于最差业务的建议
    if worst:
        suggestions.append(f"{worst['venue']}{worst['name']}营收环比下降{worst['change']}，建议重点关注并排查原因。")

    # 基于整体数据的建议
    revenue_data = [item for item in report_items if item["today"]["revenue"] > 0]
    if len(revenue_data) == 0:
        suggestions.append("今日各业务暂无营收数据，请检查数据采集是否正常。")

    # 基于使用率的建议
    for item in report_items:
        usage = item["today"]["usage_rate"]
        if usage > 0 and usage < 0.30:
            usage_label = _get_usage_label(item["business_type"])
            suggestions.append(f"{item['venue']}{item['name']}{usage_label}仅{usage * 100:.1f}%，建议优化排班或推出促销活动提升利用率。")
        elif usage > 0.85:
            usage_label = _get_usage_label(item["business_type"])
            suggestions.append(f"{item['venue']}{item['name']}{usage_label}高达{usage * 100:.1f}%，建议考虑扩容或调整定价策略。")

    # 基于客单价的建议
    for item in report_items:
        if item["today"]["avg_order_value"] > 0 and item["today"]["orders"] > 0:
            if item["today"]["avg_order_value"] < 50:
                suggestions.append(f"{item['venue']}{item['name']}客单价¥{item['today']['avg_order_value']:.0f}偏低，建议推出套餐或增值服务提升客单价。")

    if not suggestions:
        suggestions.append("今日各业务运营正常，建议持续关注数据变化趋势。")

    return suggestions


def _extract_revenue_from_snap(raw: dict, biz_type: str) -> tuple[float, int, int]:
    """从快照raw_json中提取(revenue, orders, customers)"""
    if isinstance(raw, str):
        import json as _json
        try:
            raw = _json.loads(raw)
        except Exception:
            raw = {}

    if biz_type == "billiards":
        s = raw.get("summary", {})
        return float(s.get("total_amount", 0) or 0), int(s.get("order_count", 0) or 0), 0
    elif biz_type == "mahjong":
        ov = raw.get("overview", {})
        return float(ov.get("paid_amount", 0) or 0), int(ov.get("orders", 0) or 0), 0
    elif biz_type == "cinema":
        s = raw.get("summary", {})
        return (
            float(s.get("revenue", 0) or 0),
            0,
            int(s.get("customer_count", 0) or 0),
        )
    return 0, 0, 0


def _generate_period_report(
    repository: DashboardRepository,
    period_days: int,
    period_label: str,
) -> dict[str, Any]:
    """
    通用期间报告生成（周报/月报）
    聚合期间内每天的数据，与上一个同期对比
    """
    now = _now_beijing()
    today = now.date()

    businesses = [
        {"business_type": "cinema", "platform": "fenghuang", "store_id": "cinema_feicuicheng", "name": "影院", "venue": "凤凰云智"},
        {"business_type": "billiards", "platform": "xiaotie", "store_id": "feicuicheng", "name": "台球", "venue": "小铁"},
        {"business_type": "mahjong", "platform": "wu_laoban", "store_id": "feicuicheng", "name": "棋牌", "venue": "無老板"},
    ]

    report_items = []
    total_revenue = 0.0
    total_orders = 0
    total_customers = 0

    for biz in businesses:
        # 获取本期间快照
        snaps = repository.daily_snapshots_for(
            biz["business_type"], biz["platform"], biz["store_id"], period_days
        )

        # 获取上一期间快照
        prev_snaps = repository.daily_snapshots_for(
            biz["business_type"], biz["platform"], biz["store_id"], period_days * 2
        )
        # 过滤出上一期间（排除本期间的）
        this_dates = {s.get("date") for s in snaps}
        prev_only = [s for s in prev_snaps if s.get("date") not in this_dates]

        # 聚合本期间
        period_revenue = 0.0
        period_orders = 0
        period_customers = 0
        daily_data = []

        for snap in snaps:
            raw = snap.get("raw_json") or {}
            rev, orders, custs = _extract_revenue_from_snap(raw, biz["business_type"])
            period_revenue += rev
            period_orders += orders
            period_customers += custs
            daily_data.append({
                "date": snap.get("date", ""),
                "revenue": round(rev, 1),
                "orders": orders,
                "customers": custs,
            })

        # 聚合上一期间
        prev_revenue = 0.0
        prev_orders = 0
        prev_customers = 0
        for snap in prev_only:
            raw = snap.get("raw_json") or {}
            rev, orders, custs = _extract_revenue_from_snap(raw, biz["business_type"])
            prev_revenue += rev
            prev_orders += orders
            prev_customers += custs

        # 环比
        rev_change = _safe_ratio(period_revenue, prev_revenue)
        orders_change = _safe_ratio(float(period_orders), float(prev_orders))
        custs_change = _safe_ratio(float(period_customers), float(prev_customers))

        # 日均
        data_days = len(snaps) or 1
        avg_daily_rev = period_revenue / data_days

        # 最高/最低日
        best_day = max(daily_data, key=lambda d: d["revenue"]) if daily_data else None
        worst_day = min((d for d in daily_data if d["revenue"] > 0), key=lambda d: d["revenue"]) if daily_data else None

        total_revenue += period_revenue
        total_orders += period_orders
        total_customers += period_customers

        report_items.append({
            "business_type": biz["business_type"],
            "name": biz["name"],
            "venue": biz["venue"],
            "period": {
                "days": len(snaps),
                "revenue": round(period_revenue, 1),
                "orders": period_orders,
                "customers": period_customers,
                "avg_daily_revenue": round(avg_daily_rev, 1),
            },
            "previous_period": {
                "days": len(prev_only),
                "revenue": round(prev_revenue, 1),
                "orders": prev_orders,
                "customers": prev_customers,
            },
            "changes": {
                "revenue": _format_ratio(rev_change),
                "revenue_change": rev_change,
                "orders": _format_ratio(orders_change),
                "orders_change": orders_change,
                "customers": _format_ratio(custs_change),
                "customers_change": custs_change,
            },
            "best_day": best_day,
            "worst_day": worst_day,
            "daily_data": sorted(daily_data, key=lambda d: d["date"]),
        })

    # 排名
    ranked = sorted(report_items, key=lambda x: x["period"]["revenue"], reverse=True)

    # 生成建议
    suggestions = _generate_period_suggestions(report_items, period_label)

    return {
        "report_type": period_label,
        "generated_at": now.isoformat(),
        "period_days": period_days,
        "summary": {
            "total_revenue": round(total_revenue, 1),
            "total_orders": total_orders,
            "total_customers": total_customers,
            "avg_daily_revenue": round(total_revenue / max(period_days, 1), 1),
        },
        "businesses": report_items,
        "ranking": [{"rank": i + 1, "name": r["name"], "revenue": r["period"]["revenue"]} for i, r in enumerate(ranked)],
        "suggestions": suggestions,
    }


def _generate_period_suggestions(report_items: list, period_label: str) -> list[str]:
    """为周报/月报生成建议"""
    suggestions = []

    valid = [item for item in report_items if item["changes"]["revenue_change"] is not None]

    if valid:
        best = max(valid, key=lambda x: x["changes"]["revenue_change"])
        worst = min(valid, key=lambda x: x["changes"]["revenue_change"])

        if best["changes"]["revenue_change"] > 0:
            suggestions.append(
                f"{best['venue']}{best['name']}{period_label}表现最佳，"
                f"营收环比增长{best['changes']['revenue']}，"
                f"建议分析成功因素并推广。"
            )

        if worst["changes"]["revenue_change"] < 0:
            suggestions.append(
                f"{worst['venue']}{worst['name']}{period_label}营收环比下降{worst['changes']['revenue']}，"
                f"建议重点排查原因并制定改善计划。"
            )

    # 日均收入建议
    for item in report_items:
        avg = item["period"]["avg_daily_revenue"]
        if avg > 0 and avg < 200:
            suggestions.append(
                f"{item['venue']}{item['name']}{period_label}日均收入仅¥{avg:.0f}，"
                f"建议推出促销活动提升客流。"
            )

    if not suggestions:
        suggestions.append(f"{period_label}各业务运营正常，建议持续关注数据变化趋势。")

    return suggestions


def generate_weekly_report(repository: DashboardRepository) -> dict[str, Any]:
    """生成本周经营周报"""
    return _generate_period_report(repository, 7, "周报")


def generate_monthly_report(repository: DashboardRepository) -> dict[str, Any]:
    """生成本月经营月报"""
    now = _now_beijing()
    days_in_month = now.date().day  # 本月到今天为止的天数
    return _generate_period_report(repository, days_in_month, "月报")
