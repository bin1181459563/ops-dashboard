from fastapi.testclient import TestClient

from app.main import create_app
from app.api.routes.overview import _latest_platform_metrics
from app.models.schemas import UnifiedMetric


def test_api_endpoints_return_unified_envelope(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    collect_response = client.post("/api/collect/run")
    assert collect_response.status_code == 200
    assert collect_response.json()["data"]["status"] == "completed"

    for path in [
        "/api/overview",
        "/api/revenue/realtime",
        "/api/orders/realtime",
        "/api/usage/realtime",
        "/api/alerts",
    ]:
        response = client.get(path)
        assert response.status_code == 200
        body = response.json()
        assert set(body.keys()) == {"data", "time", "source"}


def test_scheduler_is_disabled_by_default(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=True)

    assert app.state.scheduler is None


def test_overview_contains_cinema_not_imported_state(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    client.post("/api/collect/run")
    overview = client.get("/api/overview").json()["data"]

    assert overview["cinema"]["status"] == "not_imported"
    assert overview["cinema"]["data_source"] == "excel"
    assert overview["cinema"]["message"] == "请先上传凤凰云智 Excel 报表"


def test_empty_overview_returns_no_platform_metrics(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    overview = client.get("/api/overview").json()

    assert overview["source"] == "none"
    assert overview["data"]["total_revenue"] == 0
    assert overview["data"]["platforms"] == {}


def test_overview_reports_included_and_excluded_platforms(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.save_metric(UnifiedMetric(platform="wu_laoban", revenue=216, orders=6, usage_rate=0.5, source="api"))
    repo.save_sync_log(
        platform="xiaotie",
        store_id="feicuicheng",
        status="token_invalid",
        message="小铁 token 已失效，请重新抓取",
    )
    monkeypatch.setattr("app.api.routes.overview.check_wu_laoban_token", lambda: {"valid": True, "error": None})
    monkeypatch.setattr("app.api.routes.overview.check_xiaotie_token", lambda: {"valid": False, "error": "token已失效"})

    overview = client.get("/api/overview").json()["data"]

    assert overview["total_revenue"] == 216
    assert overview["total_orders"] == 6
    assert overview["included_platforms"] == ["wu_laoban"]
    assert "xiaotie" in overview["excluded_platforms"]
    assert "cinema" in overview["excluded_platforms"]
    assert overview["source_status"]["xiaotie"]["status"] == "token_invalid"


def test_data_sources_status_sync_logs_and_ai_report_endpoints(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    app.state.repository.save_metric(UnifiedMetric(platform="wu_laoban", revenue=216, orders=6, usage_rate=0.5, source="api"))
    app.state.repository.save_sync_log(platform="wu_laoban", store_id="feicuicheng", status="success", message="正常")
    monkeypatch.setattr("app.api.routes.data_sources.check_wu_laoban_token", lambda: {"valid": True, "error": None})
    monkeypatch.setattr("app.api.routes.data_sources.check_xiaotie_token", lambda: {"valid": False, "error": "token已失效"})

    status = client.get("/api/data-sources/status").json()["data"]
    logs = client.get("/api/sync/logs?platform=wu_laoban").json()["data"]
    report = client.get("/api/ai/daily-report").json()["data"]

    assert [item["platform"] for item in status["platforms"]] == ["wu_laoban", "xiaotie", "fenghuang"]
    assert status["platforms"][1]["status"] == "token_invalid"
    assert logs[0]["platform"] == "wu_laoban"
    assert "今日总览" in report["report"]
    assert "棋牌" in report["report"]


def test_collect_history_endpoint_returns_recent_runs(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    collect_response = client.post("/api/collect/run")
    history_response = client.get("/api/collect/history")

    assert collect_response.status_code == 200
    assert history_response.status_code == 200
    runs = history_response.json()["data"]
    assert runs[0]["status"] == "completed"
    assert len(runs[0]["platform_results"]) == 3


def test_order_snapshots_endpoint_returns_recent_business_events(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    monkeypatch.setattr(
        "app.api.routes.realtime.collect_order_snapshots",
        lambda limit=12: [
            {
                "platform": "xiaotie",
                "business_type": "billiards",
                "title": "A03 开台",
                "amount": 37.9,
                "status": "进行中",
                "time": "2026-06-20T05:25:28+08:00",
                "source": "api",
                "detail": "团购券开台",
            }
        ],
    )

    response = client.get("/api/orders/snapshots")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "api"
    assert body["data"][0]["platform"] == "xiaotie"
    assert body["data"][0]["title"] == "A03 开台"


def test_overview_platform_merge_keeps_newest_row_for_each_platform():
    revenue_rows = [
        {"platform": "xiaotie", "store_id": "feicuicheng", "revenue": 346.94, "time": "2026-06-18T10:40:05+00:00", "source": "api"},
        {"platform": "xiaotie", "store_id": "feicuicheng", "revenue": 1388, "time": "2026-06-18T08:42:24+00:00", "source": "mock"},
    ]
    order_rows = [
        {"platform": "xiaotie", "store_id": "feicuicheng", "orders": 52, "time": "2026-06-18T10:40:05+00:00", "source": "api"},
        {"platform": "xiaotie", "store_id": "feicuicheng", "orders": 34, "time": "2026-06-18T08:42:24+00:00", "source": "mock"},
    ]
    usage_rows = [
        {"platform": "xiaotie", "store_id": "feicuicheng", "usage_rate": 0.1538, "time": "2026-06-18T10:40:05+00:00", "source": "api"},
        {"platform": "xiaotie", "store_id": "feicuicheng", "usage_rate": 0.6154, "time": "2026-06-18T08:42:24+00:00", "source": "mock"},
    ]

    platforms = _latest_platform_metrics(revenue_rows, order_rows, usage_rows)

    assert platforms["xiaotie"]["revenue"] == 346.94
    assert platforms["xiaotie"]["orders"] == 52
    assert platforms["xiaotie"]["usage_rate"] == 0.1538
    assert platforms["xiaotie"]["source"] == "api"
