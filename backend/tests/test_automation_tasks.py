from fastapi.testclient import TestClient

from app.main import create_app


def test_create_automation_task_records_queued_task(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    executed = []

    monkeypatch.setattr("app.api.routes.automation.execute_automation_task", lambda repository, task_id: executed.append(task_id))

    response = client.post(
        "/api/automation/tasks",
        json={"task_type": "alert_followup", "title": "处理小铁 token 失效", "venue": "台球"},
    )

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["status"] == "queued"
    assert body["task_type"] == "alert_followup"
    assert body["title"] == "处理小铁 token 失效"
    assert "Hermes" in body["prompt"]
    assert executed == [body["id"]]


def test_execute_automation_task_marks_success(tmp_path, monkeypatch):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    repository = app.state.repository
    task = repository.create_automation_task(
        task_type="weekly_report",
        title="生成本周经营日报",
        venue="全场馆",
        prompt="生成周报",
    )
    monkeypatch.setattr(
        "app.services.hermes_automation.run_hermes_prompt",
        lambda prompt: {"status": "success", "result": "周报已生成", "session_id": "sess_123"},
    )

    from app.services.hermes_automation import execute_automation_task

    execute_automation_task(repository, task["id"])

    saved = repository.automation_task_by_id(task["id"])
    assert saved["status"] == "success"
    assert saved["result"] == "周报已生成"
    assert saved["hermes_session_id"] == "sess_123"


def test_list_automation_tasks_returns_latest_first(tmp_path):
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)
    app.state.repository.create_automation_task("a", "早任务", "全场馆", "A")
    app.state.repository.create_automation_task("b", "晚任务", "全场馆", "B")

    response = client.get("/api/automation/tasks")

    assert response.status_code == 200
    tasks = response.json()["data"]["tasks"]
    assert [task["title"] for task in tasks[:2]] == ["晚任务", "早任务"]
