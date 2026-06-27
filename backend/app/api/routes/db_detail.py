"""
数据库详情API — 从 daily_snapshots + xiaotie_* 表读取，秒开
前端首页优先调这些端点，秒渲染；手动刷新才调实时API
"""
from datetime import date, datetime
from fastapi import APIRouter, Request

router = APIRouter()


def _today_str() -> str:
    return date.today().isoformat()


def _month_start() -> str:
    d = date.today()
    return d.replace(day=1).isoformat()


def _year_start() -> str:
    d = date.today()
    return d.replace(month=1, day=1).isoformat()


def _aggregate_snapshots(snapshots: list[dict]) -> dict:
    """聚合 daily_snapshots 为 summary 格式"""
    revenue = sum(s.get("revenue", 0) or 0 for s in snapshots)
    orders = sum(s.get("orders", 0) or 0 for s in snapshots)
    customers = sum(s.get("customer_count", 0) or 0 for s in snapshots)
    return {
        "revenue": round(revenue, 2),
        "order_count": int(orders),
        "face_count": int(customers),
        "member_count": 0,
    }


@router.get("/db/xiaotie")
def db_xiaotie_detail(request: Request) -> dict:
    """
    台球数据库详情 — 从 daily_snapshots + xiaotie_monthly 读取
    返回格式与 /api/detail/xiaotie 兼容，但不含实时球桌状态
    """
    repo = request.app.state.repository
    today = _today_str()
    month_start = _month_start()
    year_start = _year_start()

    # 昨日数据
    from datetime import timedelta
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    yesterday_snaps = repo.daily_snapshots_for(
        "billiards", "xiaotie", "feicuicheng", days=1, max_date=yesterday
    )
    # 今日数据
    today_snaps = repo.daily_snapshots_for(
        "billiards", "xiaotie", "feicuicheng", days=1, max_date=today
    )
    # 本周数据（自然周：周一到今天）
    now = datetime.now()
    monday = now.replace(hour=0, minute=0, second=0, microsecond=0)
    from datetime import timedelta
    monday = monday - timedelta(days=monday.weekday())
    week_start = monday.date().isoformat()
    week_snaps = repo.daily_snapshots_for(
        "billiards", "xiaotie", "feicuicheng", days=7, max_date=today, start_date=week_start
    )
    # 本月数据
    month_snaps = repo.daily_snapshots_for(
        "billiards", "xiaotie", "feicuicheng", days=31, max_date=today, start_date=month_start
    )
    # 本年数据
    year_snaps = repo.daily_snapshots_for(
        "billiards", "xiaotie", "feicuicheng", days=366, max_date=today, start_date=year_start
    )

    summary_today = _aggregate_snapshots(today_snaps) if today_snaps else {"revenue": 0, "order_count": 0, "face_count": 0, "member_count": 0}
    summary_yesterday = _aggregate_snapshots(yesterday_snaps) if yesterday_snaps else {"revenue": 0, "order_count": 0, "face_count": 0, "member_count": 0}
    summary_week = _aggregate_snapshots(week_snaps)
    summary_month = _aggregate_snapshots(month_snaps)
    summary_year = _aggregate_snapshots(year_snaps)

    # 从 xiaotie_monthly 获取最新月度详细数据
    conn = repo.connect()
    try:
        # 最新月度汇总
        monthly_row = conn.execute(
            "SELECT * FROM xiaotie_monthly ORDER BY month DESC LIMIT 1"
        ).fetchone()
        monthly = dict(monthly_row) if monthly_row else {}

        # 球桌排行（最新月）
        latest_month = monthly.get("month", "")
        table_rows = conn.execute(
            "SELECT * FROM xiaotie_table_ranking WHERE month = ? ORDER BY rank",
            (latest_month,)
        ).fetchall() if latest_month else []
        table_ranking = [dict(r) for r in table_rows]

        # 会员排行（最新月）
        member_rows = conn.execute(
            "SELECT * FROM xiaotie_member_ranking WHERE month = ? ORDER BY rank LIMIT 50",
            (latest_month,)
        ).fetchall() if latest_month else []
        member_top = [dict(r) for r in member_rows]

        # 时段分布
        hourly_json = monthly.get("hourly_json", "[]")
        import json
        hourly_data = json.loads(hourly_json) if hourly_json else []

        # 充值统计
        balance_rows = conn.execute(
            "SELECT * FROM xiaotie_balance_stats ORDER BY month DESC LIMIT 12"
        ).fetchall()
        balance_stats = [dict(r) for r in balance_rows]

        # 评论
        comment_rows = conn.execute(
            "SELECT * FROM xiaotie_comments ORDER BY created_at DESC LIMIT 20"
        ).fetchall()
        comments = [dict(r) for r in comment_rows]
    finally:
        conn.close()

    return {
        "source": "database",
        "summary_today": summary_today,
        "summary_yesterday": summary_yesterday,
        "summary_week": summary_week,
        "summary_month": summary_month,
        "summary_year": summary_year,
        "busy_count": 0,   # 实时数据，DB无法提供
        "total_count": 0,  # 实时数据，DB无法提供
        "monthly_detail": monthly,
        "table_ranking": table_ranking,
        "member_top_month": member_top,
        "hourly_distribution": [{"label": f"{h['hour']}时", "orders": h["orders"]} for h in hourly_data],
        "balance_stats": balance_stats,
        "comments": comments,
        "vip_summary": {
            "vip_count": monthly.get("vip_count", 0),
            "member_balance": monthly.get("vip_balance", 0),
            "total_payed": monthly.get("vip_payed", 0),
            "total_give": monthly.get("vip_give", 0),
        },
        "operate_summary": {
            "face_count": monthly.get("face_count", 0),
            "new_face_count": monthly.get("new_face", 0),
            "member_count": monthly.get("member_count", 0),
            "new_member_count": monthly.get("new_member", 0),
        },
    }


@router.get("/db/wu_laoban")
def db_wu_laoban_detail(request: Request) -> dict:
    """
    棋牌数据库详情 — 从 daily_snapshots 读取
    返回格式与 /api/detail/wu_laoban 兼容，但不含实时包间状态
    """
    repo = request.app.state.repository
    today = _today_str()
    month_start = _month_start()
    year_start = _year_start()

    # 昨日数据
    from datetime import timedelta
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    yesterday_snaps = repo.daily_snapshots_for(
        "mahjong", "wu_laoban", "feicuicheng", days=1, max_date=yesterday
    )
    # 今日/本周/本月/本年数据
    today_snaps = repo.daily_snapshots_for(
        "mahjong", "wu_laoban", "feicuicheng", days=1, max_date=today
    )
    now = datetime.now()
    from datetime import timedelta
    monday = now.replace(hour=0, minute=0, second=0, microsecond=0)
    monday = monday - timedelta(days=monday.weekday())
    week_start = monday.date().isoformat()
    week_snaps = repo.daily_snapshots_for(
        "mahjong", "wu_laoban", "feicuicheng", days=7, max_date=today, start_date=week_start
    )
    month_snaps = repo.daily_snapshots_for(
        "mahjong", "wu_laoban", "feicuicheng", days=31, max_date=today, start_date=month_start
    )
    year_snaps = repo.daily_snapshots_for(
        "mahjong", "wu_laoban", "feicuicheng", days=366, max_date=today, start_date=year_start
    )

    def _to_summary(snaps):
        agg = _aggregate_snapshots(snaps)
        return {
            "revenue": agg["revenue"],
            "order_count": agg["order_count"],
            "user_count": agg["face_count"],
            "new_user_count": 0,
        }

    return {
        "source": "database",
        "summary_today": _to_summary(today_snaps) if today_snaps else {"revenue": 0, "order_count": 0, "user_count": 0, "new_user_count": 0},
        "summary_yesterday": _to_summary(yesterday_snaps) if yesterday_snaps else {"revenue": 0, "order_count": 0, "user_count": 0, "new_user_count": 0},
        "summary_week": _to_summary(week_snaps),
        "summary_month": _to_summary(month_snaps),
        "summary_year": _to_summary(year_snaps),
        "active_orders": 0,   # 实时数据，DB无法提供
        "total_rooms": 0,     # 实时数据，DB无法提供
        "rooms": [],
        # 兼容字段，详情页需要但首页不需要
        "revenue_today": {"total": 0},
        "revenue_month": {"total": 0},
        "revenue_year": {"total": 0},
        "comparison": {},
        "place_ranking_today": [],
        "place_ranking_month": [],
        "place_ranking_year": [],
        "order_stats": {},
        "user_ranking_week": [],
        "user_ranking_month": [],
        "user_ranking_total": [],
    }
