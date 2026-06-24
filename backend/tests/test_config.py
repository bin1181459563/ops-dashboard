from app.core.config import settings


def test_default_database_path_lives_inside_ops_dashboard_data_dir():
    assert settings.database_path.as_posix().endswith("/ops-dashboard/data/ops_dashboard.db")
