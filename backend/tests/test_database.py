from datetime import datetime, timedelta, timezone

from app.core.database import DashboardRepository
from app.models.schemas import UnifiedMetric


def test_database_initializes_required_tables(tmp_path):
    db_path = tmp_path / "ops_dashboard.db"
    repo = DashboardRepository(db_path)

    repo.initialize()

    table_names = repo.table_names()
    assert {"revenue", "orders", "usage", "alerts", "sync_logs", "daily_snapshots", "collection_backfills"}.issubset(table_names)


def test_repository_persists_and_reads_latest_metrics(tmp_path):
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    metric = UnifiedMetric(
        platform="xiaotie",
        store_id="feicuicheng",
        revenue=1200,
        orders=20,
        usage_rate=0.5,
        time=datetime(2026, 6, 18, 7, 0, tzinfo=timezone.utc),
        source="api",
    )

    repo.save_metric(metric)

    latest_revenue = repo.latest_revenue()
    latest_orders = repo.latest_orders()
    latest_usage = repo.latest_usage()
    assert latest_revenue[0]["platform"] == "xiaotie"
    assert latest_revenue[0]["revenue"] == 1200
    assert latest_orders[0]["orders"] == 20
    assert latest_usage[0]["usage_rate"] == 0.5


def test_repository_writes_sync_logs_and_daily_snapshot(tmp_path):
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    metric = UnifiedMetric(
        platform="wu_laoban",
        store_id="feicuicheng",
        revenue=216,
        orders=6,
        usage_rate=0.5,
        time=datetime(2026, 6, 18, 7, 0, tzinfo=timezone.utc),
        source="api",
    )

    repo.save_sync_log(
        platform="wu_laoban",
        store_id="feicuicheng",
        status="success",
        message="正常",
        started_at=metric.time,
        finished_at=metric.time,
        duration_ms=12,
        records_count=1,
    )
    repo.upsert_daily_snapshot("mahjong", metric, raw={"overview": {"paid_amount": 216}})
    repo.upsert_daily_snapshot("mahjong", metric.model_copy(update={"orders": 7}), raw={"overview": {"orders": 7}})

    logs = repo.latest_sync_logs(platform="wu_laoban")
    snapshots = repo.latest_daily_snapshots()

    assert logs[0]["status"] == "success"
    assert logs[0]["records_count"] == 1
    assert len(snapshots) == 1
    assert snapshots[0]["business_type"] == "mahjong"
    assert snapshots[0]["orders"] == 7


def test_repository_persists_collection_runs(tmp_path):
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    platform_results = [
        {
            "platform": "xiaotie",
            "business_type": "billiards",
            "status": "success",
            "message": "正常",
            "duration_ms": 123,
            "retried": False,
            "retry_count": 0,
            "records_count": 1,
        }
    ]

    repo.save_collection_run(
        status="completed",
        source="api",
        metrics_count=1,
        excluded_count=0,
        platform_results=platform_results,
    )

    runs = repo.latest_collection_runs()

    assert runs[0]["status"] == "completed"
    assert runs[0]["source"] == "api"
    assert runs[0]["metrics_count"] == 1
    assert runs[0]["excluded_count"] == 0
    assert runs[0]["platform_results"][0]["platform"] == "xiaotie"
    assert runs[0]["platform_results"][0]["duration_ms"] == 123


def test_repository_tracks_collection_backfill_lifecycle(tmp_path):
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    now = datetime(2026, 6, 29, 9, 0, tzinfo=timezone.utc)

    repo.enqueue_collection_backfill(
        platform="fenghuang",
        business_type="cinema",
        store_id="cinema_feicuicheng",
        target_date="2026-06-28",
        message="首次采集失败",
        next_retry_at=now,
    )
    repo.enqueue_collection_backfill(
        platform="fenghuang",
        business_type="cinema",
        store_id="cinema_feicuicheng",
        target_date="2026-06-28",
        message="重复入队只更新原因",
        next_retry_at=now,
    )

    due = repo.due_collection_backfills(platform="fenghuang", now=now)

    assert len(due) == 1
    assert due[0]["target_date"] == "2026-06-28"
    assert due[0]["message"] == "重复入队只更新原因"
    assert due[0]["attempts"] == 0

    retry_at = now + timedelta(hours=1)
    repo.mark_collection_backfill_failed(
        due[0]["id"],
        message="补采仍失败",
        now=now,
        next_retry_at=retry_at,
        max_attempts=3,
    )

    assert repo.due_collection_backfills(platform="fenghuang", now=now) == []
    due_later = repo.due_collection_backfills(platform="fenghuang", now=retry_at)
    assert due_later[0]["attempts"] == 1
    assert due_later[0]["status"] == "pending"

    repo.mark_collection_backfill_succeeded(due_later[0]["id"], now=retry_at)

    assert repo.due_collection_backfills(platform="fenghuang", now=retry_at + timedelta(hours=1)) == []


def test_repository_marks_backfill_dead_after_max_attempts(tmp_path):
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    now = datetime(2026, 6, 29, 9, 0, tzinfo=timezone.utc)

    repo.enqueue_collection_backfill(
        platform="fenghuang",
        business_type="cinema",
        store_id="cinema_feicuicheng",
        target_date="2026-06-28",
        message="失败",
        next_retry_at=now,
    )
    due = repo.due_collection_backfills(platform="fenghuang", now=now)

    repo.mark_collection_backfill_failed(
        due[0]["id"],
        message="达到上限",
        now=now,
        next_retry_at=now + timedelta(hours=1),
        max_attempts=1,
    )

    assert repo.due_collection_backfills(platform="fenghuang", now=now + timedelta(hours=2)) == []
