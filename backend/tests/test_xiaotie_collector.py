from pathlib import Path

from app.services.collectors import xiaotie


def test_xiaotie_reads_authorization_from_token_file(tmp_path, monkeypatch):
    token_file = tmp_path / "xiaotie-token.txt"
    token_file.write_text("Motern abc.def.jwt", encoding="utf-8")
    monkeypatch.setattr(xiaotie.settings, "xiaotie_authorization", "")
    monkeypatch.setattr(xiaotie.settings, "xiaotie_token_file", token_file)

    assert xiaotie.get_authorization() == "Motern abc.def.jwt"


def test_xiaotie_api_payload_maps_to_raw_metric(monkeypatch):
    def fake_api_get(endpoint, params, authorization):
        if endpoint == xiaotie.ENDPOINTS["summary"]:
            return {"Result": {"order_count": 9, "order_payed": 123400}}
        if endpoint == xiaotie.ENDPOINTS["tables"]:
            return {"Results": [{"open": True}, {"open": False}, {"open": True}], "Count": 3}
        raise AssertionError(f"unexpected endpoint {endpoint}")

    monkeypatch.setattr(xiaotie, "_api_get", fake_api_get)

    raw = xiaotie._collect_from_api("Motern test")

    assert raw["source"] == "api"
    assert raw["summary"]["order_count"] == 9
    assert raw["summary"]["total_amount"] == 1234
    assert raw["tables"] == {"total": 3, "busy": 2}


def test_xiaotie_returns_none_when_authorization_missing(monkeypatch):
    monkeypatch.setattr(xiaotie.settings, "xiaotie_authorization", "")
    monkeypatch.setattr(xiaotie.settings, "xiaotie_token_file", Path("/not/found/token.txt"))

    assert xiaotie.collect_xiaotie_raw() is None
