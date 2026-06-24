from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    store_id: str = "feicuicheng"
    database_path: Path = Path(__file__).resolve().parents[3] / "data" / "ops_dashboard.db"
    auto_collect_enabled: bool = False
    collect_interval_minutes: int = 5

    xiaotie_base_url: str = "https://table-api.xironiot.com"
    xiaotie_authorization: str = ""
    xiaotie_token_file: Path = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"
    xiaotie_app_id: str = "0a60f00b28c849d3ac529994f98b825f"
    xiaotie_store_id: str = "5227"
    xiaotie_node_id: str = "b553e29d-a389-45c0-b10f-8b40be2a7e2c"
    xiaotie_site_id: str = "e2a9329b-e09b-4f10-9e3d-19348184d8cf"

    qgcloud_token: str = ""
    qgcloud_token_file: Path = Path.home() / ".hermes" / "workspace" / "qgcloud-token.txt"

    wu_laoban_base_url: str = "https://admin.5laoban.com"
    wu_laoban_admin_token: str = ""
    wu_laoban_sid: str = "1238"
    wu_laoban_mid: str = "2400"

    ai_llm_base_url: str = ""
    ai_llm_api_key: str = ""
    ai_llm_model: str = "mimo-v2.5-pro"
    ai_llm_timeout_seconds: float = 30

    hermes_command: str = str(Path.home() / ".local" / "bin" / "hermes")
    hermes_model: str = "mimo-v2.5-pro"
    hermes_timeout_seconds: int = 900

    model_config = SettingsConfigDict(env_file=".env", env_prefix="OPS_")


settings = Settings()
