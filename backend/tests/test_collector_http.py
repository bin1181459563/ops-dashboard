import httpx

from app.services.collectors.http_client import get_json_with_retry


class _FakeResponse:
    def __init__(self, payload=None, status_code=200):
        self._payload = payload or {"ok": True}
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://example.test")
            raise httpx.HTTPStatusError("error", request=request, response=httpx.Response(self.status_code, request=request))

    def json(self):
        return self._payload


def test_get_json_with_retry_recovers_from_timeout(monkeypatch):
    calls = {"count": 0}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers=None, params=None):
            calls["count"] += 1
            if calls["count"] == 1:
                raise httpx.TimeoutException("timeout")
            return _FakeResponse({"ok": True, "attempt": calls["count"]})

    monkeypatch.setattr("app.services.collectors.http_client.httpx.Client", FakeClient)

    payload = get_json_with_retry("https://example.test", attempts=2)

    assert payload == {"ok": True, "attempt": 2}
    assert calls["count"] == 2


def test_get_json_with_retry_does_not_retry_token_errors(monkeypatch):
    calls = {"count": 0}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url, headers=None, params=None):
            calls["count"] += 1
            return _FakeResponse(status_code=401)

    monkeypatch.setattr("app.services.collectors.http_client.httpx.Client", FakeClient)

    try:
        get_json_with_retry("https://example.test", attempts=2)
    except httpx.HTTPStatusError:
        pass

    assert calls["count"] == 1
