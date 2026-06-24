"""
审计日志服务
记录和查询系统操作日志，支持按多种条件筛选和分页
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from app.core.config import settings
from app.core.database import DashboardRepository


def _now_beijing() -> datetime:
    """获取当前北京时间 (UTC+8)"""
    return datetime.now(timezone(timedelta(hours=8)))


def _ensure_audit_logs_table(repository: DashboardRepository) -> None:
    """确保audit_logs表存在"""
    with repository.connect() as conn:
        conn.execute(
            """
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
            )
            """
        )
        # 创建常用查询索引
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_business_type ON audit_logs (business_type)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs (status)"
        )


def log_operation(
    repository: DashboardRepository,
    actor: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    business_type: str | None = None,
    status: str = "success",
    request_payload: dict[str, Any] | None = None,
    result_summary: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    """
    记录操作日志

    参数:
        repository: 数据库仓库实例
        actor: 操作者 (user/admin/system/api等)
        action: 操作类型 (login/data_sync/data_query/export_report等)
        target_type: 操作目标类型 (data_source/snapshot/report等)
        target_id: 操作目标ID
        business_type: 业务类型 (cinema/billiards/mahjong)
        status: 操作状态 (success/failed/pending)
        request_payload: 请求参数 (自动序列化为JSON)
        result_summary: 结果摘要
        error_message: 错误信息

    返回: 创建的审计日志记录
    """
    import json

    _ensure_audit_logs_table(repository)

    created_at = _now_beijing().isoformat()
    payload_json = json.dumps(request_payload, ensure_ascii=False) if request_payload else None

    with repository.connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO audit_logs (
                actor, action, target_type, target_id, business_type,
                status, request_payload, result_summary, error_message, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                actor,
                action,
                target_type,
                target_id,
                business_type,
                status,
                payload_json,
                result_summary,
                error_message,
                created_at,
            ),
        )
        log_id = cursor.lastrowid

    return {
        "id": log_id,
        "actor": actor,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "business_type": business_type,
        "status": status,
        "request_payload": request_payload,
        "result_summary": result_summary,
        "error_message": error_message,
        "created_at": created_at,
    }


def get_logs(
    repository: DashboardRepository,
    actor: str | None = None,
    action: str | None = None,
    business_type: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    """
    查询审计日志

    参数:
        repository: 数据库仓库实例
        actor: 按操作者筛选
        action: 按操作类型筛选
        business_type: 按业务类型筛选
        status: 按状态筛选
        page: 页码 (从1开始)
        page_size: 每页数量

    返回: 包含日志列表、分页信息的字典
    """
    import json

    _ensure_audit_logs_table(repository)

    # 构建查询条件
    conditions = []
    params = []

    if actor:
        conditions.append("actor = ?")
        params.append(actor)
    if action:
        conditions.append("action = ?")
        params.append(action)
    if business_type:
        conditions.append("business_type = ?")
        params.append(business_type)
    if status:
        conditions.append("status = ?")
        params.append(status)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    # 查询总数
    count_query = f"SELECT COUNT(*) as total FROM audit_logs WHERE {where_clause}"
    with repository.connect() as conn:
        row = conn.execute(count_query, params).fetchone()
        total = row["total"] if row else 0

    # 分页查询
    offset = (page - 1) * page_size
    query = f"""
        SELECT id, actor, action, target_type, target_id, business_type,
               status, request_payload, result_summary, error_message, created_at
        FROM audit_logs
        WHERE {where_clause}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
    """
    params.extend([page_size, offset])

    with repository.connect() as conn:
        rows = conn.execute(query, params).fetchall()

    logs = []
    for row in rows:
        log_entry = dict(row)
        # 反序列化request_payload
        if log_entry.get("request_payload"):
            try:
                log_entry["request_payload"] = json.loads(log_entry["request_payload"])
            except json.JSONDecodeError:
                pass
        logs.append(log_entry)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    return {
        "logs": logs,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


def get_log_stats(
    repository: DashboardRepository,
    days: int = 7,
) -> dict[str, Any]:
    """
    日志统计

    参数:
        repository: 数据库仓库实例
        days: 统计最近N天的数据 (默认7天)

    返回: 按action/status/business_type分组的统计信息
    """
    _ensure_audit_logs_table(repository)

    cutoff = (_now_beijing() - timedelta(days=days)).isoformat()

    stats = {}

    # 按action分组统计
    action_query = """
        SELECT action, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= ?
        GROUP BY action
        ORDER BY count DESC
    """
    with repository.connect() as conn:
        rows = conn.execute(action_query, (cutoff,)).fetchall()
    stats["by_action"] = [{"action": row["action"], "count": row["count"]} for row in rows]

    # 按status分组统计
    status_query = """
        SELECT status, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= ?
        GROUP BY status
        ORDER BY count DESC
    """
    with repository.connect() as conn:
        rows = conn.execute(status_query, (cutoff,)).fetchall()
    stats["by_status"] = [{"status": row["status"], "count": row["count"]} for row in rows]

    # 按business_type分组统计
    biz_query = """
        SELECT business_type, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= ? AND business_type IS NOT NULL
        GROUP BY business_type
        ORDER BY count DESC
    """
    with repository.connect() as conn:
        rows = conn.execute(biz_query, (cutoff,)).fetchall()
    stats["by_business_type"] = [{"business_type": row["business_type"], "count": row["count"]} for row in rows]

    # 按actor分组统计（Top 10活跃操作者）
    actor_query = """
        SELECT actor, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= ?
        GROUP BY actor
        ORDER BY count DESC
        LIMIT 10
    """
    with repository.connect() as conn:
        rows = conn.execute(actor_query, (cutoff,)).fetchall()
    stats["by_actor"] = [{"actor": row["actor"], "count": row["count"]} for row in rows]

    # 每日操作数量趋势
    daily_query = """
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM audit_logs
        WHERE created_at >= ?
        GROUP BY DATE(created_at)
        ORDER BY date
    """
    with repository.connect() as conn:
        rows = conn.execute(daily_query, (cutoff,)).fetchall()
    stats["daily_trend"] = [{"date": row["date"], "count": row["count"]} for row in rows]

    # 总数
    total_query = "SELECT COUNT(*) as total FROM audit_logs WHERE created_at >= ?"
    with repository.connect() as conn:
        row = conn.execute(total_query, (cutoff,)).fetchone()
    stats["total"] = row["total"] if row else 0
    stats["days"] = days

    return stats


def log_data_sync(
    repository: DashboardRepository,
    platform: str,
    business_type: str,
    status: str,
    message: str | None = None,
    records_count: int = 0,
) -> dict[str, Any]:
    """快捷方法：记录数据同步操作"""
    return log_operation(
        repository=repository,
        actor="system",
        action="data_sync",
        target_type="data_source",
        target_id=platform,
        business_type=business_type,
        status=status,
        result_summary=f"同步{records_count}条记录" if status == "success" else None,
        error_message=message if status != "success" else None,
    )


def log_user_action(
    repository: DashboardRepository,
    actor: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    business_type: str | None = None,
    request_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """快捷方法：记录用户操作"""
    return log_operation(
        repository=repository,
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        business_type=business_type,
        status="success",
        request_payload=request_payload,
    )


def log_error(
    repository: DashboardRepository,
    actor: str,
    action: str,
    error_message: str,
    target_type: str | None = None,
    target_id: str | None = None,
    business_type: str | None = None,
    request_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """快捷方法：记录错误操作"""
    return log_operation(
        repository=repository,
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        business_type=business_type,
        status="failed",
        request_payload=request_payload,
        error_message=error_message,
    )
