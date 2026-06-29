from datetime import date

from fastapi.testclient import TestClient

from app.main import create_app
from app.models.schemas import UnifiedMetric


def _upload_csv(client: TestClient, content: str, filename: str = "fenghuang.csv"):
    return client.post(
        "/api/cinema/import-excel",
        files={"file": (filename, content.encode("utf-8-sig"), "text/csv")},
    )


def _batch_upload(client: TestClient, files: list[tuple[str, str, str]]):
    return client.post(
        "/api/cinema/import-batch",
        files=[
            ("files", (filename, content.encode("utf-8-sig"), content_type))
            for filename, content, content_type in files
        ],
    )


def test_cinema_csv_import_writes_snapshot_and_sync_log(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "日期,票房收入,观影人次,场次数,上座率,卖品收入,影片名称,影片票房,影片人次",
            "2026-06-20,1200,80,12,45%,300,哪吒,700,45",
            "2026-06-20,1200,80,12,45%,300,流浪地球,500,35",
        ]
    )

    response = _upload_csv(client, csv_content)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["missing_fields"] == []
    assert body["snapshot"]["date"] == "2026-06-20"
    assert body["snapshot"]["revenue"] == 1500
    assert body["snapshot"]["avg_order_value"] == 18.75
    assert body["films"][0]["film_name"] == "哪吒"

    snapshots = app.state.repository.latest_daily_snapshots(limit=5)
    cinema_snapshot = snapshots[0]
    assert cinema_snapshot["business_type"] == "cinema"
    assert cinema_snapshot["platform"] == "fenghuang"
    assert cinema_snapshot["store_id"] == "cinema_feicuicheng"
    assert cinema_snapshot["customer_count"] == 80

    logs = app.state.repository.latest_sync_logs(platform="fenghuang")
    assert logs[0]["business_type"] == "cinema"
    assert logs[0]["file_name"] == "fenghuang.csv"
    assert logs[0]["status"] == "success"


def test_cinema_import_reports_missing_fields_without_failing(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "日期,票房收入,观影人次",
            "2026-06-20,1200,80",
        ]
    )

    response = _upload_csv(client, csv_content, "partial.csv")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "场次数" in body["missing_fields"]
    assert "上座率" in body["missing_fields"]
    assert body["snapshot"]["orders"] == 0


def test_cinema_import_filters_to_feicuicheng_and_accepts_real_report_headers(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
            "2026-06-20,成都上影国际影城创意山店,42,48,0.009256,1425,70",
            "2026-06-20,SFC上影国际影城翡翠城店,68,260,18.5%,7800,1260",
        ]
    )

    response = _upload_csv(client, csv_content, "影院营运综合报表2026-06-01至2026-06-21.csv")

    assert response.status_code == 200
    body = response.json()
    assert body["snapshot"]["revenue"] == 9060
    assert body["snapshot"]["box_office"] == 7800
    assert body["snapshot"]["concession_revenue"] == 1260
    assert body["snapshot"]["customer_count"] == 260
    assert body["snapshot"]["orders"] == 68
    assert body["snapshot"]["usage_rate"] == 0.185


def test_cinema_film_ranking_without_daily_date_uses_filename_end_date(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "影院名称,影片名称,票房（元）,人次,场次",
            "SFC上影国际影城翡翠城店,给阿嬷的情书,5774.5,210,75",
            "成都上影国际影城创意山店,给阿嬷的情书,4923.3,182,79",
            "SFC上影国际影城翡翠城店,火遮眼,4679,155,50",
        ]
    )

    response = _upload_csv(client, csv_content, "影片成绩排名表2026-06-01至2026-06-20.csv")

    assert response.status_code == 200
    body = response.json()
    assert body["snapshot"]["date"] == "2026-06-20"
    assert body["snapshot"]["box_office"] == 10453.5
    assert body["snapshot"]["customer_count"] == 365
    assert body["snapshot"]["orders"] == 125
    assert body["report_type"] == "film_ranking"
    assert body["missing_fields"] == []
    assert [film["film_name"] for film in body["films"]] == ["给阿嬷的情书", "火遮眼"]


def test_cinema_film_ranking_import_merges_with_existing_daily_snapshot(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    _upload_csv(
        client,
        "\n".join(
            [
                "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
                "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
            ]
        ),
        "影院营运综合报表2026-06-01至2026-06-20.csv",
    )
    _upload_csv(
        client,
        "\n".join(
            [
                "影院名称,影片名称,票房（元）,人次,场次",
                "SFC上影国际影城翡翠城店,给阿嬷的情书,5774.5,210,75",
                "SFC上影国际影城翡翠城店,火遮眼,4679,155,50",
            ]
        ),
        "影片成绩排名表2026-06-01至2026-06-20.csv",
    )

    overview = client.get("/api/cinema/overview?date=2026-06-20").json()
    detail = client.get("/api/cinema/detail?date=2026-06-20").json()

    assert overview["revenue"] == 1966.1
    assert overview["box_office"] == 1910
    assert overview["customer_count"] == 63
    assert detail["film_box_office_ranking"][0]["film_name"] == "给阿嬷的情书"
    assert detail["film_attendance_ranking"][0]["film_attendance"] == 210
    assert "影片名称" not in detail["missing_fields"]


def test_cinema_reimporting_film_ranking_does_not_overwrite_operations(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    operations_csv = "\n".join(
        [
            "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
            "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
        ]
    )
    film_csv = "\n".join(
        [
            "影院名称,影片名称,票房（元）,人次,场次",
            "SFC上影国际影城翡翠城店,给阿嬷的情书,5774.5,210,75",
        ]
    )

    _upload_csv(client, operations_csv, "影院营运综合报表2026-06-01至2026-06-20.csv")
    _upload_csv(client, film_csv, "影片成绩排名表2026-06-01至2026-06-20.csv")
    _upload_csv(client, film_csv, "影片成绩排名表2026-06-01至2026-06-20.csv")

    overview = client.get("/api/cinema/overview?date=2026-06-20").json()
    detail = client.get("/api/cinema/detail?date=2026-06-20").json()

    assert overview["revenue"] == 1966.1
    assert overview["customer_count"] == 63
    assert detail["film_box_office_ranking"][0]["film_name"] == "给阿嬷的情书"


def test_cinema_import_failure_is_logged(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    response = client.post(
        "/api/cinema/import-excel",
        files={"file": ("broken.txt", b"not a spreadsheet", "text/plain")},
    )

    assert response.status_code == 400
    assert "仅支持" in response.json()["detail"]
    logs = app.state.repository.latest_sync_logs(platform="fenghuang")
    assert logs[0]["status"] == "failed"
    assert logs[0]["business_type"] == "cinema"
    assert "仅支持" in logs[0]["message"]


def test_cinema_overview_detail_and_data_source_status(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    not_imported = client.get("/api/cinema/overview").json()
    assert not_imported["status"] == "not_imported"
    assert not_imported["data_source"] == "database"
    assert not_imported["message"] == "暂无影院数据库快照"

    _upload_csv(
        client,
        "\n".join(
            [
                "日期,票房收入,观影人次,场次数,上座率,卖品收入,影片名称,影片票房,影片人次",
                "2026-06-20,1200,80,12,45%,300,哪吒,700,45",
                "2026-06-20,1200,80,12,45%,300,流浪地球,500,35",
            ]
        ),
    )

    overview = client.get("/api/cinema/overview").json()
    detail = client.get("/api/cinema/detail").json()
    data_sources = client.get("/api/data-sources/status").json()["data"]["platforms"]
    report = client.get("/api/ai/daily-report").json()["data"]["report"]

    assert overview["status"] == "ok"
    assert overview["data_source"] == "database"
    assert overview["box_office"] == 1200
    assert overview["concession_revenue"] == 300
    assert overview["revenue"] == 1500
    assert overview["screenings"] == 12
    assert overview["occupancy_rate"] == 0.45
    assert overview["last_import_time"]

    assert detail["status"] == "ok"
    assert detail["today"]["revenue"] == 1500
    assert detail["box_office_trend_7d"][0]["box_office"] == 1200
    assert detail["box_office_trend_7d"][0]["screenings"] == 12
    assert detail["box_office_trend_7d"][0]["occupancy_rate"] == 0.45
    assert detail["film_box_office_ranking"][0]["film_name"] == "哪吒"
    assert detail["film_attendance_ranking"][0]["film_name"] == "哪吒"
    assert detail["recent_imports"][0]["status"] == "success"

    cinema_status = next(item for item in data_sources if item["platform"] == "fenghuang")
    assert cinema_status["status"] == "ok"
    assert cinema_status["data_source"] == "database"
    assert cinema_status["message"] == "已从数据库读取凤凰云智经营数据"
    assert "影院：收入 ¥1500" in report
    assert "影院 未接入" not in report


def test_cinema_detail_accepts_legacy_film_metric_fields(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=1500,
            orders=2,
            usage_rate=0.2,
            time=date.fromisoformat("2026-06-20"),
        ),
        raw={
            "summary": {
                "box_office": 1200,
                "concession_revenue": 300,
                "customer_count": 80,
                "screenings": 2,
                "occupancy_rate": 0.2,
            },
            "films": [
                {"film_name": "哪吒", "box_office": 700, "audience": 45},
                {"film_name": "流浪地球", "box_office": 500, "audience": 35},
            ],
        },
        customer_count=80,
        avg_order_value=15,
    )

    response = client.get("/api/cinema/detail?date=2026-06-20")

    assert response.status_code == 200
    body = response.json()
    assert body["film_box_office_ranking"][0]["film_name"] == "哪吒"
    assert body["film_box_office_ranking"][0]["film_box_office"] == 700
    assert body["film_attendance_ranking"][0]["film_attendance"] == 45


def test_cinema_detail_aggregates_film_ranking_by_film_name(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=1500,
            orders=3,
            usage_rate=0.2,
            time=date.fromisoformat("2026-06-20"),
        ),
        raw={
            "summary": {
                "box_office": 1200,
                "concession_revenue": 300,
                "customer_count": 80,
                "screenings": 3,
                "occupancy_rate": 0.2,
            },
            "films": [
                {"film_name": "玩具总动员5", "box_office": 390, "audience": 13},
                {"film_name": "玩具总动员5", "box_office": 362, "audience": 12},
                {"film_name": "三国第一部：争洛阳", "box_office": 512, "audience": 17},
            ],
        },
        customer_count=80,
        avg_order_value=15,
    )

    response = client.get("/api/cinema/detail?date=2026-06-20")

    assert response.status_code == 200
    body = response.json()
    box_ranking = body["film_box_office_ranking"]
    attendance_ranking = body["film_attendance_ranking"]
    assert [item["film_name"] for item in box_ranking] == ["玩具总动员5", "三国第一部：争洛阳"]
    assert box_ranking[0]["film_box_office"] == 752
    assert attendance_ranking[0]["film_name"] == "玩具总动员5"
    assert attendance_ranking[0]["film_attendance"] == 25


def test_member_analysis_reads_daily_snapshots_and_reports_missing_member_consumption(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=1000,
            orders=10,
            usage_rate=0.1,
            time=date.fromisoformat("2026-06-20"),
        ),
        raw={
            "summary": {"member_consume": 0},
            "member_recharge_items": [
                {"card_no": "20001", "card_type": "储值卡", "amount": 400, "operator": "刘柯鑫"}
            ],
            "member_open_card_items": [
                {"card_no": "20001", "card_type": "储值卡", "pay_amount": 10, "recharge_amount": 400, "operator": "刘柯鑫"}
            ],
        },
        customer_count=10,
        avg_order_value=100,
    )

    response = client.get("/api/cinema/member-analysis?days=30")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["source"] == "daily_snapshots"
    assert body["summary"]["total_members"] == 1
    assert body["summary"]["total_recharge_amount"] == 400
    assert body["summary"]["open_card_count"] == 1
    assert "会员消费明细缺失" in body["data_gaps"]


def test_concession_recommendations_read_daily_snapshots(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=500,
            orders=10,
            usage_rate=0.1,
            time=date.fromisoformat("2026-06-20"),
        ),
        raw={
            "concession_items": [
                {"item_name": "单人套餐", "category": "卖品套餐", "quantity": 2, "revenue": 84, "operator": "刘柯鑫"},
                {"item_name": "85oz爆米花", "category": "爆米花", "quantity": 3, "revenue": 126, "operator": "刘柯鑫"},
                {"item_name": "可乐", "category": "饮料", "quantity": 3, "revenue": 45, "operator": "刘柯鑫"},
            ],
        },
        customer_count=10,
        avg_order_value=50,
    )

    response = client.get("/api/concession/recommendations")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["source"] == "daily_snapshots"
    assert body["summary"]["total_items"] == 8
    assert body["category_breakdown"][0]["category"] == "爆米花"


def test_concession_detail_accepts_database_sale_alias_fields(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=1500,
            orders=10,
            usage_rate=0.1,
            time=date.fromisoformat("2026-06-28"),
        ),
        raw={
            "summary": {"concession_revenue": 119},
            "concession_items": [
                {"item_name": "单人套餐", "category": "卖品套餐", "sale_num": 2, "pay_amount": 84, "emp_name": "刘柯鑫"},
                {"item_name": "35暑期套餐", "category": "活动", "sale_num": 1, "pay_amount": 35, "emp_name": "刘柯鑫"},
            ],
        },
        customer_count=10,
        avg_order_value=150,
    )

    response = client.get("/api/cinema/concession?date=2026-06-28&days=1")

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_revenue"] == 119
    assert body["summary"]["total_quantity"] == 3
    assert body["categories"][0]["category"] == "卖品套餐"
    assert body["categories"][0]["revenue"] == 84
    assert body["items"][0]["item_name"] == "单人套餐"
    assert body["items"][0]["quantity"] == 2


def test_employee_performance_accepts_database_sale_alias_fields(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    repo = app.state.repository
    repo.upsert_daily_snapshot(
        "cinema",
        UnifiedMetric(
            platform="fenghuang",
            store_id="cinema_feicuicheng",
            revenue=1500,
            orders=10,
            usage_rate=0.1,
            time=date.fromisoformat("2026-06-28"),
        ),
        raw={
            "concession_items": [
                {"item_name": "单人套餐", "category": "卖品套餐", "sale_num": 2, "pay_amount": 84, "emp_name": "刘柯鑫"},
                {"item_name": "35暑期套餐", "category": "活动", "sale_num": 1, "pay_amount": 35, "emp_name": "刘柯鑫"},
            ],
            "member_recharge_items": [
                {"operator": "刘柯鑫", "pay_amount": 200},
            ],
            "member_open_card_items": [
                {"operator": "刘柯鑫", "pay_amount": 10, "recharge_amount": 400},
            ],
        },
        customer_count=10,
        avg_order_value=150,
    )

    response = client.get("/api/cinema/employee-performance?start_date=2026-06-28&end_date=2026-06-28")

    assert response.status_code == 200
    body = response.json()
    employee = next(item for item in body["employees"] if item["name"] == "刘柯鑫")
    assert employee["package_count"] == 2
    assert employee["package_amount"] == 84
    assert employee["activity_count"] == 1
    assert employee["activity_amount"] == 35
    assert employee["recharge_amount"] == 200
    assert employee["open_count"] == 1


def test_concession_detail_preserves_rows_when_one_order_has_mixed_categories(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "销售日期,影院,订单号,卖品大类,一级分类,卖品名称,销售数量,支付金额（元）,销售员",
            "2026-06-20,SFC上影国际影城翡翠城店,ORD-1,顽小游,娱乐,游戏币,1,100,刘柯鑫",
            "2026-06-20,SFC上影国际影城翡翠城店,ORD-1,卖品套餐,饮食,单人套餐,1,42,刘柯鑫",
        ]
    )

    response = _upload_csv(client, csv_content, "卖品销售明细2026-06-20.csv")

    assert response.status_code == 200
    detail = client.get("/api/cinema/concession?date=2026-06-20&days=1").json()
    assert detail["summary"]["total_revenue"] == 42
    assert detail["summary"]["total_quantity"] == 1
    assert detail["categories"] == [{"category": "卖品套餐", "quantity": 1, "revenue": 42.0, "items": 1}]
    assert detail["items"][0]["item_name"] == "单人套餐"


def test_main_overview_counts_imported_cinema_revenue(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    monkeypatch.setattr("app.api.routes.overview.check_wu_laoban_token", lambda: {"valid": False, "error": "未配置"})
    monkeypatch.setattr("app.api.routes.overview.check_xiaotie_token", lambda: {"valid": False, "error": "token已失效"})

    before = client.get("/api/overview").json()["data"]
    assert before["cinema"]["status"] == "not_imported"
    assert before["total_revenue"] == 0

    _upload_csv(
        client,
        "\n".join(
            [
                "日期,票房收入,观影人次,场次数,上座率,卖品收入",
                "2026-06-20,1200,80,12,45%,300",
            ]
        ),
    )

    after = client.get("/api/overview").json()["data"]
    assert after["cinema"]["status"] == "ok"
    assert after["cinema"]["revenue"] == 1500
    assert after["total_revenue"] == 1500
    assert "cinema" in after["included_platforms"]


def test_cinema_overview_ignores_future_dates_from_export_range(tmp_path, monkeypatch):
    class BusinessDate(date):
        @classmethod
        def today(cls):
            return cls(2026, 6, 20)

    monkeypatch.setattr("app.services.cinema_excel.date", BusinessDate)
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    _upload_csv(
        client,
        "\n".join(
            [
                "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
                "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1600,366.1",
                "2026-06-21,SFC上影国际影城翡翠城店,45,10,0.31%,296.5,0",
            ]
        ),
        "影院营运综合报表2026-06-01至2026-06-21.csv",
    )

    overview = client.get("/api/cinema/overview").json()
    dashboard = client.get("/api/overview").json()["data"]

    assert overview["date"] == "2026-06-20"
    assert overview["revenue"] == 1966.1
    assert dashboard["cinema"]["date"] == "2026-06-20"


def test_cinema_overview_and_detail_support_selected_business_date(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    _upload_csv(
        client,
        "\n".join(
            [
                "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
                "2026-06-17,SFC上影国际影城翡翠城店,49,47,1.37%,1413,210",
                "2026-06-18,SFC上影国际影城翡翠城店,48,49,1.46%,1473,740",
                "2026-06-19,SFC上影国际影城翡翠城店,56,322,8.22%,9855,2643.1",
                "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
            ]
        ),
        "影院营运综合报表2026-06-17至2026-06-20.csv",
    )

    overview = client.get("/api/cinema/overview?date=2026-06-19").json()
    detail = client.get("/api/cinema/detail?date=2026-06-19&days=3").json()

    assert overview["status"] == "ok"
    assert overview["date"] == "2026-06-19"
    assert overview["revenue"] == 12498.1
    assert overview["box_office"] == 9855
    assert overview["concession_revenue"] == 2643.1

    assert detail["status"] == "ok"
    assert detail["today"]["date"] == "2026-06-19"
    assert [item["date"] for item in detail["box_office_trend_30d"]] == ["2026-06-17", "2026-06-18", "2026-06-19"]
    assert detail["box_office_trend_7d"][-1]["date"] == "2026-06-19"


def test_cinema_selected_date_without_snapshot_returns_no_data(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    _upload_csv(
        client,
        "\n".join(
            [
                "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
                "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
            ]
        ),
    )

    overview = client.get("/api/cinema/overview?date=2026-06-18").json()
    detail = client.get("/api/cinema/detail?date=2026-06-18").json()

    assert overview["status"] == "no_data"
    assert overview["date"] == "2026-06-18"
    assert overview["message"] == "所选日期暂无影院数据"
    assert detail["status"] == "no_data"
    assert detail["message"] == "所选日期暂无影院数据"


def test_cinema_batch_import_sorts_reports_and_preserves_operations_summary(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    operations_csv = "\n".join(
        [
            "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
            "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
        ]
    )
    film_csv = "\n".join(
        [
            "影院名称,影片名称,票房（元）,人次,场次",
            "SFC上影国际影城翡翠城店,给阿嬷的情书,5774.5,210,75",
            "SFC上影国际影城翡翠城店,火遮眼,4679,155,50",
        ]
    )
    concession_csv = "\n".join(
        [
            "销售日期,影院,卖品大类,一级分类,卖品名称,销售数量,支付金额（元）",
            "2026-06-20,SFC上影国际影城翡翠城店,活动,套餐,30暑期套餐,6,180",
        ]
    )
    member_csv = "\n".join(
        [
            "消费时间,影院,会员ID,商品类型,商品名称,卡消费金额（元）",
            "2026-06-20,SFC上影国际影城翡翠城店,1003315000101006,影票,电影票,38",
        ]
    )

    response = _batch_upload(
        client,
        [
            ("会员卡消费明细2026-06-20.csv", member_csv, "text/csv"),
            ("卖品销售明细2026-06-20.csv", concession_csv, "text/csv"),
            ("影片成绩排名表2026-06-01至2026-06-20.csv", film_csv, "text/csv"),
            ("影院营运综合报表2026-06-01至2026-06-20.csv", operations_csv, "text/csv"),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["success_count"] == 4
    assert body["failed_count"] == 0
    assert [item["report_type"] for item in body["results"]] == [
        "operations",
        "film_ranking",
        "concession_detail",
        "member_detail",
    ]

    overview = client.get("/api/cinema/overview?date=2026-06-20").json()
    detail = client.get("/api/cinema/detail?date=2026-06-20").json()
    concession = client.get("/api/cinema/concession?date=2026-06-20").json()
    member = client.get("/api/cinema/member?date=2026-06-20").json()

    assert overview["revenue"] == 2090
    assert overview["box_office"] == 1910
    assert overview["customer_count"] == 63
    assert detail["film_box_office_ranking"][0]["film_name"] == "给阿嬷的情书"
    assert concession["summary"]["total_revenue"] == 180
    assert member["summary"]["total_amount"] == 38

    logs = app.state.repository.latest_sync_logs(platform="fenghuang", limit=4)
    assert [log["status"] for log in logs] == ["success", "success", "success", "success"]


def test_cinema_batch_import_reports_partial_failure_and_imports_valid_files(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    operations_csv = "\n".join(
        [
            "营业日期,影院,场次数,观影总人数,上座率%,票房总收入,卖品总收入",
            "2026-06-20,SFC上影国际影城翡翠城店,45,63,1.96%,1910,56.1",
        ]
    )

    response = client.post(
        "/api/cinema/import-batch",
        files=[
            ("files", ("broken.txt", b"not a spreadsheet", "text/plain")),
            ("files", ("影院营运综合报表2026-06-01至2026-06-20.csv", operations_csv.encode("utf-8-sig"), "text/csv")),
        ],
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "partial"
    assert body["success_count"] == 1
    assert body["failed_count"] == 1
    assert body["results"][0]["status"] == "ok"
    assert body["results"][1]["status"] == "failed"
    assert "仅支持" in body["results"][1]["error"]

    overview = client.get("/api/cinema/overview?date=2026-06-20").json()
    assert overview["status"] == "ok"
    assert overview["revenue"] == 1966.1

    logs = app.state.repository.latest_sync_logs(platform="fenghuang", limit=2)
    assert sorted(log["status"] for log in logs) == ["failed", "success"]


def test_cinema_batch_import_all_failures_returns_400_and_logs_files(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    response = client.post(
        "/api/cinema/import-batch",
        files=[
            ("files", ("broken.txt", b"not a spreadsheet", "text/plain")),
            ("files", ("empty.csv", "只有一列表头\n没有日期".encode("utf-8-sig"), "text/csv")),
        ],
    )

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["status"] == "failed"
    assert detail["success_count"] == 0
    assert detail["failed_count"] == 2
    assert all(item["status"] == "failed" for item in detail["results"])

    logs = app.state.repository.latest_sync_logs(platform="fenghuang", limit=2)
    assert [log["status"] for log in logs] == ["failed", "failed"]
