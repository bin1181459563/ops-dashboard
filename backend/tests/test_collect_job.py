from app.core.database import DashboardRepository
from app.services.collectors.xiaotie import mock_xiaotie_raw
from app.services.collectors.wu_laoban import mock_wu_laoban_raw
from app.tasks.collect_job import CollectionJob


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

    assert len(result["platform_results"]) == 3
    xiaotie = next(item for item in result["platform_results"] if item["platform"] == "xiaotie")
    wu_laoban = next(item for item in result["platform_results"] if item["platform"] == "wu_laoban")
    qgcloud = next(item for item in result["platform_results"] if item["platform"] == "qgcloud")

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
