from datetime import datetime

from app.models.schemas import AlertRecord, UnifiedMetric


def evaluate_alerts(current: UnifiedMetric, previous: UnifiedMetric | None = None) -> list[AlertRecord]:
    alerts: list[AlertRecord] = []

    # 只在晚间（23:00-23:59）触发日环比预警，避免白天数据不完整时误报
    now = datetime.now()
    is晚间 = now.hour == 23

    if current.usage_rate < 0.15:
        alerts.append(
            AlertRecord(
                platform=current.platform,
                store_id=current.store_id,
                alert_type="usage_low",
                message=f"{_platform_name(current.platform)}当前利用率低于15%",
                level="warning",
                time=current.time,
            )
        )

    # 只在晚间23点触发环比预警（全天数据完整时才有对比价值）
    if not is晚间:
        return alerts

    if previous and previous.usage_rate > 0:
        usage_drop = (previous.usage_rate - current.usage_rate) / previous.usage_rate
        if usage_drop > 0.3:
            alerts.append(
                AlertRecord(
                    platform=current.platform,
                    store_id=current.store_id,
                    alert_type="usage_drop",
                    message=f"{_platform_name(current.platform)}利用率较上一轮下降超过30%",
                    level="critical",
                    time=current.time,
                )
            )

    if previous and previous.revenue > 0:
        revenue_drop = (previous.revenue - current.revenue) / previous.revenue
        if revenue_drop > 0.4:
            alerts.append(
                AlertRecord(
                    platform=current.platform,
                    store_id=current.store_id,
                    alert_type="revenue_drop",
                    message=f"{_platform_name(current.platform)}收入较上一轮下降超过40%",
                    level="critical",
                    time=current.time,
                )
            )

    return alerts


def _platform_name(platform: str) -> str:
    return {"xiaotie": "台球", "wu_laoban": "棋牌"}.get(platform, platform)
