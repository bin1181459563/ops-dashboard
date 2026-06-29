import pytest

from app.core.database import DashboardRepository
from app.services.collectors.xiaotie import mock_xiaotie_raw
from app.services.collectors.wu_laoban import mock_wu_laoban_raw
from app.tasks.collect_job import CollectionJob, _validate_fenghuang_snapshot


@pytest.fixture(autouse=True)
def skip_fenghuang_collection_by_default(monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: None)


def test_collection_job_writes_metric_rows_and_alerts(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", mock_xiaotie_raw)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", mock_wu_laoban_raw)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_once()

    assert result["status"] == "completed"
    assert result["source"] == "mock"
    assert len(repo.latest_revenue()) == 2
    assert len(repo.latest_orders()) == 2
    assert len(repo.latest_usage()) == 2
    assert isinstance(repo.latest_alerts(), list)


def test_collection_job_skips_platform_when_collector_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_once()

    assert result["status"] == "completed"
    assert result["source"] == "none"
    assert result["metrics"] == []
    assert repo.latest_revenue() == []


def test_collection_job_keeps_wu_laoban_when_xiaotie_token_fails(tmp_path, monkeypatch):
    def raise_token_error():
        raise PermissionError("小铁 token 已失效")

    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", raise_token_error)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", mock_wu_laoban_raw)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_once()

    assert result["status"] == "completed"
    assert result["metrics"][0]["platform"] == "wu_laoban"
    assert result["excluded_platforms"][0]["platform"] == "xiaotie"
    assert result["excluded_platforms"][0]["status"] == "token_invalid"
    assert repo.latest_revenue()[0]["platform"] == "wu_laoban"
    assert repo.latest_sync_logs(platform="xiaotie")[0]["status"] == "token_invalid"
    assert repo.latest_alerts()[0]["alert_type"] == "token_invalid"


def test_collection_job_returns_platform_results_with_retry_details(tmp_path, monkeypatch):
    def fake_xiaotie():
        return mock_xiaotie_raw()

    fake_xiaotie.last_meta = {"retried": True, "retry_count": 1}

    def fake_wu_laoban():
        return mock_wu_laoban_raw()

    fake_wu_laoban.last_meta = {"retried": False, "retry_count": 0}

    def fake_qgcloud():
        return None

    fake_qgcloud.last_meta = {"retried": False, "retry_count": 0}

    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", fake_xiaotie)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", fake_wu_laoban)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", fake_qgcloud)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_once()

    assert len(result["platform_results"]) == 4
    xiaotie = next(item for item in result["platform_results"] if item["platform"] == "xiaotie")
    wu_laoban = next(item for item in result["platform_results"] if item["platform"] == "wu_laoban")
    qgcloud = next(item for item in result["platform_results"] if item["platform"] == "qgcloud")
    fenghuang = next(item for item in result["platform_results"] if item["platform"] == "fenghuang")

    assert xiaotie["status"] == "success"
    assert xiaotie["retried"] is True
    assert xiaotie["retry_count"] == 1
    assert xiaotie["records_count"] == 1
    assert isinstance(xiaotie["duration_ms"], int)

    assert wu_laoban["status"] == "success"
    assert wu_laoban["retried"] is False
    assert wu_laoban["retry_count"] == 0

    assert qgcloud["status"] == "skipped"
    assert qgcloud["retried"] is False
    assert qgcloud["retry_count"] == 0

    assert fenghuang["status"] == "skipped"
    assert fenghuang["message"] == "凤凰云智未配置token"


def test_collection_job_records_business_type_in_sync_logs(tmp_path, monkeypatch):
    def raise_token_error():
        raise PermissionError("小铁 token 已失效")

    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", raise_token_error)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", mock_wu_laoban_raw)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    job.run_once()

    logs = {item["platform"]: item for item in repo.latest_sync_logs(limit=10)}
    assert logs["xiaotie"]["business_type"] == "billiards"
    assert logs["wu_laoban"]["business_type"] == "mahjong"
    assert logs["qgcloud"]["business_type"] == "vending"


def test_fenghuang_yesterday_collection_passes_target_date(tmp_path, monkeypatch):
    captured = {}

    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: "token")

    def fake_collect_fenghuang_raw(target_date=None):
        captured["target_date"] = target_date
        return {
            "summary": {
                "revenue": 142,
                "box_office": 100,
                "concession_revenue": 42,
                "customer_count": 5,
                "screenings": 2,
                "occupancy_rate": 0.1,
            },
            "films": [],
            "concession_items": [],
            "member_open_card_items": [],
            "member_recharge_items": [],
            "inventory_items": [],
            "date": target_date,
        }

    monkeypatch.setattr("app.tasks.collect_job.collect_fenghuang_raw", fake_collect_fenghuang_raw)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_yesterday()

    assert result["status"] == "completed"
    assert captured["target_date"] == result["date"]


def test_fenghuang_yesterday_failure_enqueues_backfill(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: "token")
    monkeypatch.setattr("app.tasks.collect_job.collect_fenghuang_raw", lambda target_date=None: (_ for _ in ()).throw(RuntimeError("接口超时")))
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job.run_yesterday()

    queued = repo.due_collection_backfills(platform="fenghuang")
    assert result["status"] == "completed"
    assert queued[0]["target_date"] == result["date"]
    assert queued[0]["message"] == "接口超时"


def test_fenghuang_due_backfills_run_before_yesterday(tmp_path, monkeypatch):
    calls = []

    monkeypatch.setattr("app.tasks.collect_job.collect_xiaotie_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_wu_laoban_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.collect_qgcloud_raw", lambda: None)
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: "token")

    def fake_collect_fenghuang_raw(target_date=None):
        calls.append(target_date)
        return {
            "summary": {
                "revenue": 142,
                "box_office": 100,
                "concession_revenue": 42,
                "customer_count": 5,
                "screenings": 2,
                "occupancy_rate": 0.1,
            },
            "films": [{"film_name": "哪吒", "box_office": 100}],
            "concession_items": [{"item_name": "单人套餐", "pay_amount": 42}],
            "member_items": [],
            "member_open_card_items": [],
            "member_recharge_items": [],
            "inventory_items": [],
            "date": target_date,
        }

    monkeypatch.setattr("app.tasks.collect_job.collect_fenghuang_raw", fake_collect_fenghuang_raw)
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    repo.enqueue_collection_backfill(
        platform="fenghuang",
        business_type="cinema",
        store_id="cinema_feicuicheng",
        target_date="2026-06-20",
        message="昨天失败",
    )
    job = CollectionJob(repository=repo)

    result = job.run_yesterday()

    assert calls[0] == "2026-06-20"
    assert calls[1] == result["date"]
    assert repo.due_collection_backfills(platform="fenghuang") == []


def test_fenghuang_collection_preserves_existing_member_consumption(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: "token")
    monkeypatch.setattr(
        "app.tasks.collect_job.collect_fenghuang_raw",
        lambda target_date=None: {
            "summary": {
                "revenue": 142,
                "box_office": 100,
                "concession_revenue": 42,
                "customer_count": 5,
                "screenings": 2,
                "occupancy_rate": 0.1,
            },
            "films": [{"film_name": "哪吒", "box_office": 100, "audience": 5}],
            "concession_items": [{"item_name": "单人套餐", "category": "卖品套餐", "sale_num": 1, "pay_amount": 42}],
            "member_open_card_items": [],
            "member_recharge_items": [],
            "inventory_items": [],
            "date": "2026-06-20",
        },
    )
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    repo.upsert_daily_snapshot_values(
        business_type="cinema",
        platform="fenghuang",
        store_id="cinema_feicuicheng",
        date="2026-06-20",
        revenue=20,
        orders=0,
        usage_rate=0,
        customer_count=0,
        avg_order_value=0,
        raw={
            "summary": {"member_consume": 20},
            "member_items": [{"member_id": "1001", "amount": 20, "product_type": "影票"}],
        },
    )
    job = CollectionJob(repository=repo)

    job._collect_fenghuang("2026-06-20")

    snapshot = repo.daily_snapshot_for_date("cinema", "fenghuang", "cinema_feicuicheng", "2026-06-20")
    import json

    raw = json.loads(snapshot["raw_json"])
    assert raw["summary"]["member_consume"] == 20
    assert raw["member_items"] == [{"member_id": "1001", "amount": 20, "product_type": "影票"}]
    assert raw["concession_items"][0]["item_name"] == "单人套餐"


def test_validate_fenghuang_snapshot_accepts_matching_detail_totals():
    validation = _validate_fenghuang_snapshot(
        {
            "summary": {
                "box_office": 100,
                "concession_revenue": 42,
                "member_consume": 20,
                "member_recharge_total": 88,
            },
            "films": [{"film_name": "哪吒", "box_office": 100}],
            "concession_items": [{"item_name": "套餐", "pay_amount": 42}],
            "member_items": [{"member_id": "1001", "amount": 20}],
            "member_recharge_items": [{"card_no": "NO1", "amount": 88}],
        }
    )

    assert validation == {"status": "ok", "issues": []}


def test_fenghuang_collection_warns_when_summary_and_detail_totals_mismatch(tmp_path, monkeypatch):
    monkeypatch.setattr("app.tasks.collect_job.get_access_token", lambda: "token")
    monkeypatch.setattr(
        "app.tasks.collect_job.collect_fenghuang_raw",
        lambda target_date=None: {
            "summary": {
                "revenue": 142,
                "box_office": 100,
                "concession_revenue": 42,
                "member_consume": 20,
                "customer_count": 5,
                "screenings": 2,
                "occupancy_rate": 0.1,
            },
            "films": [{"film_name": "哪吒", "box_office": 100}],
            "concession_items": [{"item_name": "单人套餐", "pay_amount": 42}],
            "member_items": [{"member_id": "1001", "amount": 10}],
            "member_open_card_items": [],
            "member_recharge_items": [],
            "inventory_items": [],
            "date": "2026-06-20",
        },
    )
    repo = DashboardRepository(tmp_path / "ops_dashboard.db")
    repo.initialize()
    job = CollectionJob(repository=repo)

    result = job._collect_fenghuang("2026-06-20")

    snapshot = repo.daily_snapshot_for_date("cinema", "fenghuang", "cinema_feicuicheng", "2026-06-20")
    import json

    raw = json.loads(snapshot["raw_json"])
    latest_log = repo.latest_sync_logs(platform="fenghuang")[0]
    alert = repo.latest_alerts()[0]

    assert result["platform_result"]["status"] == "success_with_warnings"
    assert raw["validation"]["status"] == "warning"
    assert raw["validation"]["issues"][0]["field"] == "member_consume"
    assert latest_log["status"] == "success_with_warnings"
    assert "member_consume" in latest_log["message"]
    assert alert["alert_type"] == "data_validation"
