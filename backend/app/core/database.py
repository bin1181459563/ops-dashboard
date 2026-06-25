import sqlite3
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.schemas import AlertRecord, UnifiedMetric


class DashboardRepository:
    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path or settings.database_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS revenue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    revenue REAL NOT NULL,
                    time TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'api'
                );
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    orders INTEGER NOT NULL,
                    time TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'api'
                );
                CREATE TABLE IF NOT EXISTS usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    usage_rate REAL NOT NULL,
                    time TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'api'
                );
                CREATE TABLE IF NOT EXISTS alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    alert_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    level TEXT NOT NULL,
                    time TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sync_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    platform TEXT NOT NULL,
                    business_type TEXT,
                    store_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT,
                    file_name TEXT,
                    started_at TEXT NOT NULL,
                    finished_at TEXT,
                    duration_ms INTEGER,
                    records_count INTEGER DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS collection_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    status TEXT NOT NULL,
                    source TEXT NOT NULL,
                    metrics_count INTEGER DEFAULT 0,
                    excluded_count INTEGER DEFAULT 0,
                    platform_results_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS daily_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    business_type TEXT NOT NULL,
                    platform TEXT,
                    store_id TEXT NOT NULL,
                    date TEXT NOT NULL,
                    revenue REAL DEFAULT 0,
                    orders INTEGER DEFAULT 0,
                    usage_rate REAL DEFAULT 0,
                    customer_count INTEGER DEFAULT 0,
                    avg_order_value REAL DEFAULT 0,
                    raw_json TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_snapshots_unique
                ON daily_snapshots (business_type, platform, store_id, date);
                CREATE TABLE IF NOT EXISTS automation_tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    venue TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result TEXT,
                    error TEXT,
                    hermes_session_id TEXT,
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    duration_ms INTEGER
                );
                CREATE TABLE IF NOT EXISTS data_sources (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_name TEXT NOT NULL,
                    business_type TEXT NOT NULL,
                    platform TEXT,
                    store_id TEXT,
                    last_updated TEXT,
                    freshness TEXT NOT NULL DEFAULT 'fresh',
                    status TEXT NOT NULL DEFAULT 'normal',
                    data_range TEXT,
                    missing_fields TEXT,
                    warning TEXT,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_data_sources_unique
                ON data_sources (business_type, source_name);
                CREATE TABLE IF NOT EXISTS ai_insights (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    insight_type TEXT NOT NULL,
                    business_type TEXT,
                    title TEXT NOT NULL,
                    conclusion TEXT,
                    evidence TEXT,
                    confidence REAL,
                    data_range TEXT,
                    suggested_actions TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ai_insights_type_created
                ON ai_insights (insight_type, created_at);
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_type TEXT,
                    target_id TEXT,
                    business_type TEXT,
                    status TEXT NOT NULL DEFAULT 'success',
                    request_payload TEXT,
                    result_summary TEXT,
                    error_message TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
                ON audit_logs (actor, created_at);
                CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
                ON audit_logs (action, created_at);
                CREATE TABLE IF NOT EXISTS box_office (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    total_box REAL NOT NULL,
                    market_share REAL,
                    source TEXT NOT NULL DEFAULT 'manual',
                    movies_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_box_office_date
                ON box_office (date);
                """
            )
            self._ensure_column(conn, "sync_logs", "business_type", "TEXT")
            self._ensure_column(conn, "sync_logs", "file_name", "TEXT")

    def table_names(self) -> set[str]:
        with self.connect() as conn:
            rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
        return {row["name"] for row in rows}

    def _ensure_column(self, conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def save_metric(self, metric: UnifiedMetric) -> None:
        metric_time = metric.time.isoformat()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO revenue (platform, store_id, revenue, time, source) VALUES (?, ?, ?, ?, ?)",
                (metric.platform, metric.store_id, metric.revenue, metric_time, metric.source),
            )
            conn.execute(
                "INSERT INTO orders (platform, store_id, orders, time, source) VALUES (?, ?, ?, ?, ?)",
                (metric.platform, metric.store_id, metric.orders, metric_time, metric.source),
            )
            conn.execute(
                "INSERT INTO usage (platform, store_id, usage_rate, time, source) VALUES (?, ?, ?, ?, ?)",
                (metric.platform, metric.store_id, metric.usage_rate, metric_time, metric.source),
            )

    def save_alerts(self, alerts: list[AlertRecord]) -> None:
        if not alerts:
            return
        with self.connect() as conn:
            for alert in alerts:
                alert_time = alert.time.isoformat()
                # 去重：同平台+同类型+同消息 在最近1小时内不重复插入
                existing = conn.execute(
                    "SELECT 1 FROM alerts WHERE platform=? AND alert_type=? AND message=? AND time > datetime('now', '-1 hour') LIMIT 1",
                    (alert.platform, alert.alert_type, alert.message),
                ).fetchone()
                if not existing:
                    conn.execute(
                        "INSERT INTO alerts (platform, store_id, alert_type, message, level, time) VALUES (?, ?, ?, ?, ?, ?)",
                        (alert.platform, alert.store_id, alert.alert_type, alert.message, alert.level, alert_time),
                    )

    def save_sync_log(
        self,
        platform: str,
        store_id: str,
        status: str,
        message: str | None = None,
        business_type: str | None = None,
        file_name: str | None = None,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        duration_ms: int | None = None,
        records_count: int = 0,
    ) -> None:
        started = started_at or datetime.now().astimezone()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO sync_logs
                    (platform, business_type, store_id, status, message, file_name, started_at, finished_at, duration_ms, records_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    platform,
                    business_type,
                    store_id,
                    status,
                    message,
                    file_name,
                    started.isoformat(),
                    finished_at.isoformat() if finished_at else None,
                    duration_ms,
                    records_count,
                ),
            )

    def latest_sync_logs(self, platform: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        if platform:
            query = """
                SELECT platform, business_type, store_id, status, message, file_name, started_at, finished_at, duration_ms, records_count
                FROM sync_logs
                WHERE platform = ?
                ORDER BY started_at DESC, id DESC
                LIMIT ?
            """
            with self.connect() as conn:
                rows = conn.execute(query, (platform, limit)).fetchall()
        else:
            query = """
                SELECT platform, business_type, store_id, status, message, file_name, started_at, finished_at, duration_ms, records_count
                FROM sync_logs
                ORDER BY started_at DESC, id DESC
                LIMIT ?
            """
            with self.connect() as conn:
                rows = conn.execute(query, (limit,)).fetchall()
        return [dict(row) for row in rows]

    def latest_sync_log_for_platform(self, platform: str) -> dict[str, Any] | None:
        rows = self.latest_sync_logs(platform=platform, limit=1)
        return rows[0] if rows else None

    def save_collection_run(
        self,
        *,
        status: str,
        source: str,
        metrics_count: int,
        excluded_count: int,
        platform_results: list[dict[str, Any]],
    ) -> None:
        created_at = datetime.now().astimezone().isoformat()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO collection_runs
                    (status, source, metrics_count, excluded_count, platform_results_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    status,
                    source,
                    metrics_count,
                    excluded_count,
                    json.dumps(platform_results, ensure_ascii=False),
                    created_at,
                ),
            )

    def latest_collection_runs(self, limit: int = 10) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, status, source, metrics_count, excluded_count, platform_results_json, created_at
                FROM collection_runs
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        runs = []
        for row in rows:
            item = dict(row)
            try:
                item["platform_results"] = json.loads(item.pop("platform_results_json") or "[]")
            except json.JSONDecodeError:
                item["platform_results"] = []
            runs.append(item)
        return runs

    def last_successful_sync_time(self, platform: str) -> str | None:
        query = """
            SELECT finished_at, started_at
            FROM sync_logs
            WHERE platform = ? AND status = 'success'
            ORDER BY started_at DESC, id DESC
            LIMIT 1
        """
        with self.connect() as conn:
            row = conn.execute(query, (platform,)).fetchone()
        if row is None:
            return None
        return row["finished_at"] or row["started_at"]

    def upsert_daily_snapshot(
        self,
        business_type: str,
        metric: UnifiedMetric,
        raw: dict[str, Any] | None = None,
        customer_count: int = 0,
        avg_order_value: float | None = None,
    ) -> None:
        snapshot_date = metric.time.date().isoformat()
        avg_order_value = (
            avg_order_value
            if avg_order_value is not None
            else round(metric.revenue / metric.orders, 2) if metric.orders else 0
        )
        created_at = datetime.now().astimezone().isoformat()
        raw_json = json.dumps(raw or {}, ensure_ascii=False)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO daily_snapshots
                    (business_type, platform, store_id, date, revenue, orders, usage_rate,
                     customer_count, avg_order_value, raw_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_type, platform, store_id, date)
                DO UPDATE SET
                    revenue = excluded.revenue,
                    orders = excluded.orders,
                    usage_rate = excluded.usage_rate,
                    avg_order_value = excluded.avg_order_value,
                    raw_json = excluded.raw_json,
                    customer_count = excluded.customer_count,
                    created_at = excluded.created_at
                """,
                (
                    business_type,
                    metric.platform,
                    metric.store_id,
                    snapshot_date,
                    metric.revenue,
                    metric.orders,
                    metric.usage_rate,
                    customer_count,
                    avg_order_value,
                    raw_json,
                    created_at,
                ),
            )

    def upsert_daily_snapshot_values(
        self,
        business_type: str,
        platform: str,
        store_id: str,
        date: str,
        revenue: float,
        orders: int,
        usage_rate: float,
        customer_count: int,
        avg_order_value: float,
        raw: dict[str, Any] | None = None,
    ) -> None:
        created_at = datetime.now().astimezone().isoformat()
        raw_json = json.dumps(raw or {}, ensure_ascii=False)
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO daily_snapshots
                    (business_type, platform, store_id, date, revenue, orders, usage_rate,
                     customer_count, avg_order_value, raw_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_type, platform, store_id, date)
                DO UPDATE SET
                    revenue = excluded.revenue,
                    orders = excluded.orders,
                    usage_rate = excluded.usage_rate,
                    customer_count = excluded.customer_count,
                    avg_order_value = excluded.avg_order_value,
                    raw_json = excluded.raw_json,
                    created_at = excluded.created_at
                """,
                (
                    business_type,
                    platform,
                    store_id,
                    date,
                    revenue,
                    orders,
                    usage_rate,
                    customer_count,
                    avg_order_value,
                    raw_json,
                    created_at,
                ),
            )

    def latest_daily_snapshot_for(
        self,
        business_type: str,
        platform: str,
        store_id: str,
        max_date: str | None = None,
    ) -> dict[str, Any] | None:
        date_filter = "AND date <= ?" if max_date else ""
        query = f"""
            SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                   customer_count, avg_order_value, raw_json, created_at
            FROM daily_snapshots
            WHERE business_type = ? AND platform = ? AND store_id = ?
            {date_filter}
            ORDER BY date DESC, created_at DESC, id DESC
            LIMIT 1
        """
        with self.connect() as conn:
            params = (business_type, platform, store_id, max_date) if max_date else (business_type, platform, store_id)
            row = conn.execute(query, params).fetchone()
        return dict(row) if row else None

    def daily_snapshot_for_date(
        self,
        business_type: str,
        platform: str,
        store_id: str,
        date: str,
    ) -> dict[str, Any] | None:
        query = """
            SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                   customer_count, avg_order_value, raw_json, created_at
            FROM daily_snapshots
            WHERE business_type = ? AND platform = ? AND store_id = ? AND date = ?
            ORDER BY created_at DESC, id DESC
            LIMIT 1
        """
        with self.connect() as conn:
            row = conn.execute(query, (business_type, platform, store_id, date)).fetchone()
        return dict(row) if row else None

    def daily_snapshots_for(
        self,
        business_type: str,
        platform: str,
        store_id: str,
        days: int,
        max_date: str | None = None,
        start_date: str | None = None,
    ) -> list[dict[str, Any]]:
        # 如果指定了 start_date，使用日期范围查询
        if start_date:
            end_date = max_date or datetime.now().date().isoformat()
            query = """
                SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                       customer_count, avg_order_value, raw_json, created_at
                FROM daily_snapshots
                WHERE business_type = ? AND platform = ? AND store_id = ? AND date >= ? AND date <= ?
                ORDER BY date ASC
            """
            with self.connect() as conn:
                rows = conn.execute(query, (business_type, platform, store_id, start_date, end_date)).fetchall()
            return [dict(row) for row in rows]
        # 否则使用 days 参数（从 max_date 往前推）
        end_date = datetime.fromisoformat(max_date).date() if max_date else datetime.now().date()
        cutoff = (end_date - timedelta(days=days - 1)).isoformat()
        query = """
            SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                   customer_count, avg_order_value, raw_json, created_at
            FROM daily_snapshots
            WHERE business_type = ? AND platform = ? AND store_id = ? AND date >= ? AND date <= ?
            ORDER BY date ASC
        """
        with self.connect() as conn:
            rows = conn.execute(query, (business_type, platform, store_id, cutoff, end_date.isoformat())).fetchall()
        return [dict(row) for row in rows]

    def latest_daily_snapshots(self, date: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        if date:
            query = """
                SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                       customer_count, avg_order_value, raw_json, created_at
                FROM daily_snapshots
                WHERE date = ?
                ORDER BY created_at DESC, id DESC
                LIMIT ?
            """
            with self.connect() as conn:
                rows = conn.execute(query, (date, limit)).fetchall()
        else:
            query = """
                SELECT business_type, platform, store_id, date, revenue, orders, usage_rate,
                       customer_count, avg_order_value, raw_json, created_at
                FROM daily_snapshots
                ORDER BY date DESC, created_at DESC, id DESC
                LIMIT ?
            """
            with self.connect() as conn:
                rows = conn.execute(query, (limit,)).fetchall()
        return [dict(row) for row in rows]

    # ============================================================
    # Box Office 大盘票房数据（持久化存储）
    # ============================================================

    def upsert_box_office(self, date: str, total_box: float, market_share: float = None, source: str = "manual", movies: list = None) -> dict:
        """插入或更新大盘票房数据"""
        import json
        now = datetime.now().isoformat()
        movies_json = json.dumps(movies, ensure_ascii=False) if movies else None
        with self.connect() as conn:
            conn.execute("""
                INSERT INTO box_office (date, total_box, market_share, source, movies_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    total_box = excluded.total_box,
                    market_share = COALESCE(excluded.market_share, box_office.market_share),
                    source = excluded.source,
                    movies_json = COALESCE(excluded.movies_json, box_office.movies_json),
                    updated_at = excluded.updated_at
            """, (date, total_box, market_share, source, movies_json, now, now))
        return {"status": "ok", "date": date, "total_box": total_box}

    def get_box_office(self, date: str = None, days: int = 90) -> list[dict]:
        """获取大盘票房数据"""
        with self.connect() as conn:
            if date:
                row = conn.execute("SELECT * FROM box_office WHERE date = ?", (date,)).fetchone()
                return [dict(row)] if row else []
            else:
                cutoff = (datetime.now().date() - timedelta(days=days)).isoformat()
                rows = conn.execute("SELECT * FROM box_office WHERE date >= ? ORDER BY date ASC", (cutoff,)).fetchall()
                return [dict(row) for row in rows]

    def get_box_office_dict(self, days: int = 90) -> dict[str, dict]:
        """获取大盘票房数据，返回 {date: {total_box, ...}} 格式"""
        data = self.get_box_office(days=days)
        result = {}
        for row in data:
            import json
            movies = json.loads(row.get("movies_json", "[]")) if row.get("movies_json") else []
            result[row["date"]] = {
                "total_box": row["total_box"],
                "market_share": row.get("market_share"),
                "source": row.get("source", "manual"),
                "movies": movies
            }
        return result

    def update_market_share(self, date: str, market_share: float) -> None:
        """更新某天的市占率"""
        with self.connect() as conn:
            conn.execute("UPDATE box_office SET market_share = ?, updated_at = ? WHERE date = ?",
                        (market_share, datetime.now().isoformat(), date))

    def latest_metric_for_platform(self, platform: str) -> UnifiedMetric | None:
        query = """
            SELECT r.platform, r.store_id, r.revenue, o.orders, u.usage_rate, r.time, r.source
            FROM revenue r
            JOIN orders o ON o.platform = r.platform AND o.store_id = r.store_id AND o.time = r.time
            JOIN usage u ON u.platform = r.platform AND u.store_id = r.store_id AND u.time = r.time
            WHERE r.platform = ?
            ORDER BY r.time DESC, r.id DESC
            LIMIT 1
        """
        with self.connect() as conn:
            row = conn.execute(query, (platform,)).fetchone()
        if row is None:
            return None
        return UnifiedMetric(**dict(row))

    def previous_metric_for_platform(self, platform: str) -> UnifiedMetric | None:
        query = """
            SELECT r.platform, r.store_id, r.revenue, o.orders, u.usage_rate, r.time, r.source
            FROM revenue r
            JOIN orders o ON o.platform = r.platform AND o.store_id = r.store_id AND o.time = r.time
            JOIN usage u ON u.platform = r.platform AND u.store_id = r.store_id AND u.time = r.time
            WHERE r.platform = ?
            ORDER BY r.time DESC, r.id DESC
            LIMIT 1 OFFSET 1
        """
        with self.connect() as conn:
            row = conn.execute(query, (platform,)).fetchone()
        if row is None:
            return None
        return UnifiedMetric(**dict(row))

    def latest_revenue(self, limit: int = 20, today_only: bool = False) -> list[dict[str, Any]]:
        if today_only:
            today = datetime.now().date().isoformat()
            with self.connect() as conn:
                rows = conn.execute(
                    "SELECT platform, store_id, revenue, time, source FROM revenue WHERE time LIKE ? ORDER BY time DESC, id DESC LIMIT ?",
                    (f"{today}%", limit),
                ).fetchall()
            return [dict(row) for row in rows]
        return self._read("SELECT platform, store_id, revenue, time, source FROM revenue ORDER BY time DESC, id DESC LIMIT ?", limit)

    def latest_orders(self, limit: int = 20, today_only: bool = False) -> list[dict[str, Any]]:
        if today_only:
            today = datetime.now().date().isoformat()
            with self.connect() as conn:
                rows = conn.execute(
                    "SELECT platform, store_id, orders, time, source FROM orders WHERE time LIKE ? ORDER BY time DESC, id DESC LIMIT ?",
                    (f"{today}%", limit),
                ).fetchall()
            return [dict(row) for row in rows]
        return self._read("SELECT platform, store_id, orders, time, source FROM orders ORDER BY time DESC, id DESC LIMIT ?", limit)

    def latest_usage(self, limit: int = 20, today_only: bool = False) -> list[dict[str, Any]]:
        if today_only:
            today = datetime.now().date().isoformat()
            with self.connect() as conn:
                rows = conn.execute(
                    "SELECT platform, store_id, usage_rate, time, source FROM usage WHERE time LIKE ? ORDER BY time DESC, id DESC LIMIT ?",
                    (f"{today}%", limit),
                ).fetchall()
            return [dict(row) for row in rows]
        return self._read("SELECT platform, store_id, usage_rate, time, source FROM usage ORDER BY time DESC, id DESC LIMIT ?", limit)

    def latest_alerts(self, limit: int = 20, today_only: bool = False) -> list[dict[str, Any]]:
        if today_only:
            today = datetime.now().date().isoformat()
            with self.connect() as conn:
                rows = conn.execute(
                    "SELECT platform, store_id, alert_type, message, level, time FROM alerts WHERE time LIKE ? ORDER BY time DESC, id DESC LIMIT ?",
                    (f"{today}%", limit),
                ).fetchall()
            return [dict(row) for row in rows]
        return self._read(
            "SELECT platform, store_id, alert_type, message, level, time FROM alerts ORDER BY time DESC, id DESC LIMIT ?",
            limit,
        )

    def create_automation_task(self, task_type: str, title: str, venue: str, prompt: str) -> dict[str, Any]:
        created_at = datetime.now().astimezone().isoformat()
        with self.connect() as conn:
            cursor = conn.execute(
                """
                INSERT INTO automation_tasks (task_type, title, venue, prompt, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (task_type, title, venue, prompt, "queued", created_at),
            )
            task_id = cursor.lastrowid
        return self.automation_task_by_id(task_id) or {}

    def automation_task_by_id(self, task_id: int) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT id, task_type, title, venue, prompt, status, result, error, hermes_session_id,
                       created_at, started_at, finished_at, duration_ms
                FROM automation_tasks
                WHERE id = ?
                """,
                (task_id,),
            ).fetchone()
        return dict(row) if row else None

    def latest_automation_tasks(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, task_type, title, venue, prompt, status, result, error, hermes_session_id,
                       created_at, started_at, finished_at, duration_ms
                FROM automation_tasks
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def update_automation_task(
        self,
        task_id: int,
        status: str,
        result: str | None = None,
        error: str | None = None,
        hermes_session_id: str | None = None,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        duration_ms: int | None = None,
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE automation_tasks
                SET status = ?,
                    result = COALESCE(?, result),
                    error = ?,
                    hermes_session_id = COALESCE(?, hermes_session_id),
                    started_at = COALESCE(?, started_at),
                    finished_at = COALESCE(?, finished_at),
                    duration_ms = COALESCE(?, duration_ms)
                WHERE id = ?
                """,
                (
                    status,
                    result,
                    error,
                    hermes_session_id,
                    started_at.isoformat() if started_at else None,
                    finished_at.isoformat() if finished_at else None,
                    duration_ms,
                    task_id,
                ),
            )

    def get_revenue_trend(self, platform: str, days: int = 7) -> list[dict[str, Any]]:
        """获取指定平台最近N天的收入趋势（按天聚合）"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query = """
            SELECT 
                DATE(time) as date,
                MAX(revenue) as revenue
            FROM revenue
            WHERE platform = ? AND time >= ?
            GROUP BY DATE(time)
            ORDER BY date
        """
        with self.connect() as conn:
            rows = conn.execute(query, (platform, cutoff)).fetchall()
        return [dict(row) for row in rows]

    def get_orders_trend(self, platform: str, days: int = 7) -> list[dict[str, Any]]:
        """获取指定平台最近N天的订单趋势（按天聚合）"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query = """
            SELECT 
                DATE(time) as date,
                MAX(orders) as orders
            FROM orders
            WHERE platform = ? AND time >= ?
            GROUP BY DATE(time)
            ORDER BY date
        """
        with self.connect() as conn:
            rows = conn.execute(query, (platform, cutoff)).fetchall()
        return [dict(row) for row in rows]

    def get_hourly_revenue(self, platform: str, date: str = None) -> list[dict[str, Any]]:
        """获取指定平台某天的每小时收入"""
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        query = """
            SELECT 
                strftime('%H', time) as hour,
                MAX(revenue) as revenue
            FROM revenue
            WHERE platform = ? AND DATE(time) = ?
            GROUP BY strftime('%H', time)
            ORDER BY hour
        """
        with self.connect() as conn:
            rows = conn.execute(query, (platform, date)).fetchall()
        return [dict(row) for row in rows]

    def get_hourly_revenue_all(self, platform: str, days: int = 7) -> list[dict[str, Any]]:
        """获取指定平台最近N天的每小时收入（用于趋势图）"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query = """
            SELECT 
                DATE(time) || ' ' || strftime('%H', time) || ':00' as date,
                MAX(revenue) as value
            FROM revenue
            WHERE platform = ? AND time >= ?
            GROUP BY DATE(time), strftime('%H', time)
            ORDER BY date
        """
        with self.connect() as conn:
            rows = conn.execute(query, (platform, cutoff)).fetchall()
        return [dict(row) for row in rows]

    def get_hourly_orders_all(self, platform: str, days: int = 7) -> list[dict[str, Any]]:
        """获取指定平台最近N天的每小时订单（用于趋势图）"""
        cutoff = (datetime.now() - timedelta(days=days)).isoformat()
        query = """
            SELECT 
                DATE(time) || ' ' || strftime('%H', time) || ':00' as date,
                MAX(orders) as value
            FROM orders
            WHERE platform = ? AND time >= ?
            GROUP BY DATE(time), strftime('%H', time)
            ORDER BY date
        """
        with self.connect() as conn:
            rows = conn.execute(query, (platform, cutoff)).fetchall()
        return [dict(row) for row in rows]

    # ── 利润/毛利 + 库存/损耗 ──────────────────────────────────────

    def initialize_finance_tables(self) -> None:
        """初始化利润毛利和库存相关表"""
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS cinema_profit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_batch TEXT NOT NULL,
                    date_range TEXT NOT NULL,
                    item_code TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    product_type TEXT,
                    category TEXT,
                    sub_category TEXT,
                    unit TEXT,
                    sales_quantity REAL DEFAULT 0,
                    sales_amount REAL DEFAULT 0,
                    return_quantity REAL DEFAULT 0,
                    return_amount REAL DEFAULT 0,
                    net_quantity REAL DEFAULT 0,
                    net_amount REAL DEFAULT 0,
                    avg_price REAL DEFAULT 0,
                    cost_amount REAL DEFAULT 0,
                    avg_cost_price REAL DEFAULT 0,
                    profit_amount REAL DEFAULT 0,
                    profit_rate REAL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cinema_profit_batch
                ON cinema_profit (import_batch);
                CREATE INDEX IF NOT EXISTS idx_cinema_profit_date
                ON cinema_profit (date_range);

                CREATE TABLE IF NOT EXISTS cinema_inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_batch TEXT NOT NULL,
                    item_code TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    category TEXT,
                    stock_quantity REAL DEFAULT 0,
                    stock_cost REAL DEFAULT 0,
                    pos_price REAL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cinema_inventory_batch
                ON cinema_inventory (import_batch);

                CREATE TABLE IF NOT EXISTS cinema_inventory_movement (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_batch TEXT NOT NULL,
                    date_range TEXT NOT NULL,
                    item_code TEXT NOT NULL,
                    item_name TEXT NOT NULL,
                    category TEXT,
                    sub_category TEXT,
                    unit TEXT,
                    opening_qty REAL DEFAULT 0,
                    opening_amount REAL DEFAULT 0,
                    purchase_qty REAL DEFAULT 0,
                    purchase_amount REAL DEFAULT 0,
                    return_qty REAL DEFAULT 0,
                    return_amount REAL DEFAULT 0,
                    transfer_in_qty REAL DEFAULT 0,
                    transfer_in_amount REAL DEFAULT 0,
                    transfer_out_qty REAL DEFAULT 0,
                    outbound_qty REAL DEFAULT 0,
                    outbound_amount REAL DEFAULT 0,
                    loss_qty REAL DEFAULT 0,
                    loss_amount REAL DEFAULT 0,
                    sales_qty REAL DEFAULT 0,
                    sales_cost REAL DEFAULT 0,
                    inventory_profit_qty REAL DEFAULT 0,
                    inventory_profit_amount REAL DEFAULT 0,
                    closing_qty REAL DEFAULT 0,
                    closing_amount REAL DEFAULT 0,
                    loss_diff_pct REAL DEFAULT 0,
                    avg_cost REAL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cinema_inv_mov_batch
                ON cinema_inventory_movement (import_batch);
                """
            )

    def save_cinema_profit_batch(self, batch_id: str, date_range: str, items: list[dict[str, Any]]) -> int:
        """保存利润毛利批量数据，先清除同批次旧数据"""
        created_at = datetime.now().astimezone().isoformat()
        with self.connect() as conn:
            conn.execute("DELETE FROM cinema_profit WHERE import_batch = ?", (batch_id,))
            for item in items:
                conn.execute(
                    """
                    INSERT INTO cinema_profit
                        (import_batch, date_range, item_code, item_name, product_type,
                         category, sub_category, unit, sales_quantity, sales_amount,
                         return_quantity, return_amount, net_quantity, net_amount,
                         avg_price, cost_amount, avg_cost_price, profit_amount, profit_rate, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (batch_id, date_range, item["item_code"], item["item_name"],
                     item.get("product_type"), item.get("category"), item.get("sub_category"),
                     item.get("unit"), item.get("sales_quantity", 0), item.get("sales_amount", 0),
                     item.get("return_quantity", 0), item.get("return_amount", 0),
                     item.get("net_quantity", 0), item.get("net_amount", 0),
                     item.get("avg_price", 0), item.get("cost_amount", 0),
                     item.get("avg_cost_price", 0), item.get("profit_amount", 0),
                     item.get("profit_rate", 0), created_at),
                )
        return len(items)

    def save_cinema_inventory_batch(self, batch_id: str, items: list[dict[str, Any]]) -> int:
        """保存实时库存批量数据"""
        created_at = datetime.now().astimezone().isoformat()
        with self.connect() as conn:
            conn.execute("DELETE FROM cinema_inventory WHERE import_batch = ?", (batch_id,))
            for item in items:
                conn.execute(
                    """
                    INSERT INTO cinema_inventory
                        (import_batch, item_code, item_name, category,
                         stock_quantity, stock_cost, pos_price, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (batch_id, item["item_code"], item["item_name"],
                     item.get("category"), item.get("stock_quantity", 0),
                     item.get("stock_cost", 0), item.get("pos_price", 0), created_at),
                )
        return len(items)

    def save_cinema_movement_batch(self, batch_id: str, date_range: str, items: list[dict[str, Any]]) -> int:
        """保存进销存批量数据"""
        created_at = datetime.now().astimezone().isoformat()
        with self.connect() as conn:
            conn.execute("DELETE FROM cinema_inventory_movement WHERE import_batch = ?", (batch_id,))
            for item in items:
                conn.execute(
                    """
                    INSERT INTO cinema_inventory_movement
                        (import_batch, date_range, item_code, item_name, category, sub_category, unit,
                         opening_qty, opening_amount, purchase_qty, purchase_amount,
                         return_qty, return_amount, transfer_in_qty, transfer_in_amount,
                         transfer_out_qty, outbound_qty, outbound_amount,
                         loss_qty, loss_amount, sales_qty, sales_cost,
                         inventory_profit_qty, inventory_profit_amount,
                         closing_qty, closing_amount, loss_diff_pct, avg_cost, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (batch_id, date_range, item["item_code"], item["item_name"],
                     item.get("category"), item.get("sub_category"), item.get("unit"),
                     item.get("opening_qty", 0), item.get("opening_amount", 0),
                     item.get("purchase_qty", 0), item.get("purchase_amount", 0),
                     item.get("return_qty", 0), item.get("return_amount", 0),
                     item.get("transfer_in_qty", 0), item.get("transfer_in_amount", 0),
                     item.get("transfer_out_qty", 0),
                     item.get("outbound_qty", 0), item.get("outbound_amount", 0),
                     item.get("loss_qty", 0), item.get("loss_amount", 0),
                     item.get("sales_qty", 0), item.get("sales_cost", 0),
                     item.get("inventory_profit_qty", 0), item.get("inventory_profit_amount", 0),
                     item.get("closing_qty", 0), item.get("closing_amount", 0),
                     item.get("loss_diff_pct", 0), item.get("avg_cost", 0), created_at),
                )
        return len(items)

    def get_cinema_profit_summary(self) -> dict[str, Any] | None:
        """获取最新一次利润毛利导入的汇总"""
        with self.connect() as conn:
            row = conn.execute(
                "SELECT import_batch, date_range FROM cinema_profit ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            batch = row["import_batch"]
            date_range = row["date_range"]
            rows = conn.execute(
                "SELECT * FROM cinema_profit WHERE import_batch = ?", (batch,)
            ).fetchall()
        items = [dict(r) for r in rows]
        return {"batch_id": batch, "date_range": date_range, "items": items}

    def get_cinema_profit_by_batch(self, batch_id: str) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM cinema_profit WHERE import_batch = ? ORDER BY profit_amount DESC",
                (batch_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def get_cinema_profit_batches(self) -> list[dict[str, Any]]:
        """获取所有利润导入批次列表"""
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT import_batch, date_range, COUNT(*) as item_count,
                       SUM(net_amount) as total_revenue, SUM(profit_amount) as total_profit,
                       MAX(created_at) as imported_at
                FROM cinema_profit
                GROUP BY import_batch
                ORDER BY imported_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def get_cinema_inventory_summary(self) -> dict[str, Any] | None:
        """获取最新一次实时库存导入"""
        with self.connect() as conn:
            row = conn.execute(
                "SELECT import_batch FROM cinema_inventory ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            batch = row["import_batch"]
            rows = conn.execute(
                "SELECT * FROM cinema_inventory WHERE import_batch = ?", (batch,)
            ).fetchall()
        items = [dict(r) for r in rows]
        return {"batch_id": batch, "items": items}

    def get_cinema_inventory_batches(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT import_batch, COUNT(*) as item_count,
                       SUM(stock_quantity) as total_stock, SUM(stock_cost) as total_cost,
                       MAX(created_at) as imported_at
                FROM cinema_inventory
                GROUP BY import_batch
                ORDER BY imported_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def get_cinema_movement_summary(self) -> dict[str, Any] | None:
        """获取最新一次进销存导入"""
        with self.connect() as conn:
            row = conn.execute(
                "SELECT import_batch, date_range FROM cinema_inventory_movement ORDER BY id DESC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            batch = row["import_batch"]
            date_range = row["date_range"]
            rows = conn.execute(
                "SELECT * FROM cinema_inventory_movement WHERE import_batch = ?", (batch,)
            ).fetchall()
        items = [dict(r) for r in rows]
        return {"batch_id": batch, "date_range": date_range, "items": items}

    def get_cinema_movement_batches(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT import_batch, date_range, COUNT(*) as item_count,
                       SUM(loss_amount) as total_loss, SUM(sales_qty) as total_sales_qty,
                       MAX(created_at) as imported_at
                FROM cinema_inventory_movement
                GROUP BY import_batch
                ORDER BY imported_at DESC
                """
            ).fetchall()
        return [dict(r) for r in rows]

    def _read(self, query: str, limit: int) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(query, (limit,)).fetchall()
        return [dict(row) for row in rows]
