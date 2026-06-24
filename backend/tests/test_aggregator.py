from datetime import datetime, timezone

from app.services.aggregator import aggregate_xiaotie, aggregate_wu_laoban


def test_aggregate_xiaotie_raw_data_to_unified_model():
    raw = {
        "source": "api",
        "summary": {"total_amount": 1280.5, "order_count": 32},
        "tables": {"total": 13, "busy": 8},
        "time": "2026-06-18T07:00:00+00:00",
    }

    metric = aggregate_xiaotie(raw)

    assert metric.platform == "xiaotie"
    assert metric.store_id == "feicuicheng"
    assert metric.revenue == 1280.5
    assert metric.orders == 32
    assert metric.usage_rate == 0.6154
    assert metric.time.isoformat() == "2026-06-18T15:00:00+08:00"
    assert metric.source == "api"


def test_aggregate_wu_laoban_raw_data_to_unified_model():
    raw = {
        "source": "mock",
        "overview": {"paid_amount": 860, "orders": 18},
        "rooms": {"total": 10, "occupied": 6},
        "time": datetime(2026, 6, 18, 7, 5, tzinfo=timezone.utc).isoformat(),
    }

    metric = aggregate_wu_laoban(raw)

    assert metric.platform == "wu_laoban"
    assert metric.store_id == "feicuicheng"
    assert metric.revenue == 860
    assert metric.orders == 18
    assert metric.usage_rate == 0.6
    assert metric.source == "mock"
