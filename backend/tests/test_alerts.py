from datetime import datetime, timezone

from app.models.schemas import UnifiedMetric
from app.services.alerts import evaluate_alerts


def make_metric(platform: str, revenue: float, usage_rate: float) -> UnifiedMetric:
    return UnifiedMetric(
        platform=platform,
        store_id="feicuicheng",
        revenue=revenue,
        orders=10,
        usage_rate=usage_rate,
        time=datetime(2026, 6, 18, 7, 0, tzinfo=timezone.utc),
        source="api",
    )


def test_alerts_detect_low_usage_revenue_drop_and_usage_drop(monkeypatch):
    class ClosingTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 6, 18, 23, 0, tzinfo=tz)

    monkeypatch.setattr("app.services.alerts.datetime", ClosingTime)
    previous = make_metric("xiaotie", revenue=1000, usage_rate=0.8)
    current = make_metric("xiaotie", revenue=500, usage_rate=0.1)

    alerts = evaluate_alerts(current, previous)
    alert_types = {alert.alert_type for alert in alerts}

    assert alert_types == {"usage_low", "usage_drop", "revenue_drop"}
    assert all(alert.platform == "xiaotie" for alert in alerts)
    assert all(alert.store_id == "feicuicheng" for alert in alerts)
