from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import create_app
from app.models.schemas import UnifiedMetric
from app.services import llm_client


def test_ai_chat_returns_setup_message_when_llm_is_not_configured(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ai_llm_base_url", "")
    monkeypatch.setattr(settings, "ai_llm_api_key", "")
    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    client = TestClient(app)

    response = client.post("/api/ai/chat", json={"question": "今天收入怎么样？"})

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["source"] == "not_configured"
    assert "大模型接口还没有配置完整" in body["answer"]


def test_ai_chat_uses_openai_compatible_chat_completions(tmp_path, monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "今天收入最高的是棋牌，建议关注晚高峰。"}}]}

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(settings, "ai_llm_base_url", "https://token-plan-cn.xiaomimimo.com/v1")
    monkeypatch.setattr(settings, "ai_llm_api_key", "test-key")
    monkeypatch.setattr(settings, "ai_llm_model", "mimo-v2.5-pro")
    monkeypatch.setattr(llm_client.httpx, "Client", FakeClient)

    app = create_app(db_path=tmp_path / "ops_dashboard.db", start_scheduler=False)
    app.state.repository.save_metric(UnifiedMetric(platform="wu_laoban", revenue=216, orders=6, usage_rate=0.5, source="api"))
    client = TestClient(app)

    response = client.post("/api/ai/chat", json={"question": "哪个业务收入最高？"})

    assert response.status_code == 200
    body = response.json()["data"]
    assert body["source"] == "llm"
    assert body["model"] == "mimo-v2.5-pro"
    assert "棋牌" in body["answer"]
    assert captured["url"] == "https://token-plan-cn.xiaomimimo.com/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert captured["json"]["model"] == "mimo-v2.5-pro"
    assert captured["json"]["stream"] is False
    assert captured["json"]["messages"][0]["role"] == "system"
    assert "哪个业务收入最高？" in captured["json"]["messages"][1]["content"]
