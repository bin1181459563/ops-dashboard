"""
影院卖品详情API
"""
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query, Request

from app.services.cinema_excel import BUSINESS_TYPE, PLATFORM, STORE_ID, _filtered_concession_revenue, _load_raw

router = APIRouter()

# 娱乐项目排除列表（顽小游/小铁台球/顽麻社/娱乐）
_EXCLUDED_CATEGORIES = {"顽小游", "小铁台球", "顽麻社", "娱乐"}

def _is_entertainment(item: dict) -> bool:
    """判断商品是否属于娱乐项目"""
    cat = _item_category(item)
    name = _item_name(item)
    if cat in _EXCLUDED_CATEGORIES:
        return True
    for kw in ("顽小游", "小铁台球", "顽麻社"):
        if kw in name:
            return True
    return False


def _item_name(item: dict) -> str:
    return str(item.get("item_name") or item.get("product_name") or item.get("concession_item_name") or "未知").strip()


def _item_category(item: dict) -> str:
    return str(item.get("category") or item.get("concession_category") or "未知").strip()


def _item_quantity(item: dict) -> float:
    return _number(item.get("quantity", item.get("sale_num", item.get("concession_quantity", 0))))


def _item_revenue(item: dict) -> float:
    return _number(item.get("revenue", item.get("pay_amount", item.get("concession_payment", 0))))


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


@router.get("/cinema/concession")
def get_concession_detail(
    request: Request,
    date: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=366),
    start_date: str | None = Query(default=None),
    category: str | None = Query(default=None),
) -> dict:
    """获取卖品详情，支持按日期范围和类别筛选"""
    from datetime import date as date_cls
    repository = request.app.state.repository
    target_date = date or date_cls.today().isoformat()

    # 获取日期范围内的快照（支持 start_date 或 days 两种模式）
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days, max_date=target_date, start_date=start_date)
    if not snapshots:
        return {"status": "no_data", "message": "暂无卖品数据"}
    
    # 汇总所有卖品明细
    all_items: list[dict[str, Any]] = []
    daily_summary: list[dict[str, Any]] = []
    summary_total = 0.0  # 从summary.concession_revenue汇总（准确值）

    for snapshot in snapshots:
        raw = _load_raw(snapshot)
        items = raw.get("concession_items") or []
        summary = raw.get("summary", {})

        # 累加汇总卖品收入（已排除娱乐项）
        summary_total += _filtered_concession_revenue(raw)

        # 按类别筛选
        if category:
            items = [item for item in items if item.get("category") == category]

        # 排除娱乐项目
        items = [item for item in items if not _is_entertainment(item)]

        all_items.extend(items)
        daily_summary.append({
            "date": snapshot["date"],
            "revenue": _filtered_concession_revenue(raw),
            "items_count": len(items),
        })
    
    # 按类别汇总
    category_stats: dict[str, dict[str, Any]] = {}
    for item in all_items:
        cat = _item_category(item)
        if cat not in category_stats:
            category_stats[cat] = {"category": cat, "quantity": 0, "revenue": 0, "items": 0}
        category_stats[cat]["quantity"] += _item_quantity(item)
        category_stats[cat]["revenue"] += _item_revenue(item)
        category_stats[cat]["items"] += 1
    
    # 按品名汇总
    item_stats: dict[str, dict[str, Any]] = {}
    for item in all_items:
        name = _item_name(item)
        if name not in item_stats:
            item_stats[name] = {
                "item_name": name,
                "category": _item_category(item),
                "quantity": 0,
                "revenue": 0,
            }
        item_stats[name]["quantity"] += _item_quantity(item)
        item_stats[name]["revenue"] += _item_revenue(item)
    
    # 排序
    category_list = sorted(category_stats.values(), key=lambda x: -x["revenue"])
    item_list = sorted(item_stats.values(), key=lambda x: -x["revenue"])

    # 总计：优先用summary汇总（准确），fallback到明细求和
    items_revenue = sum(cat["revenue"] for cat in category_list)
    total_revenue = summary_total if summary_total > 0 else items_revenue
    total_quantity = sum(cat["quantity"] for cat in category_list)
    
    return {
        "status": "ok",
        "date_range": {
            "start": snapshots[-1]["date"] if snapshots else None,
            "end": snapshots[0]["date"] if snapshots else None,
            "days": len(snapshots),
        },
        "summary": {
            "total_revenue": total_revenue,
            "total_quantity": total_quantity,
            "avg_daily_revenue": round(total_revenue / len(snapshots), 2) if snapshots else 0,
        },
        "categories": category_list,
        "items": item_list[:50],  # TOP50
        "daily_trend": daily_summary,
        "filter": {
            "category": category,
        },
    }


@router.get("/cinema/concession/categories")
def get_concession_categories(request: Request) -> dict:
    """获取所有卖品类别列表"""
    repository = request.app.state.repository
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, 90)
    
    categories = set()
    for snapshot in snapshots:
        raw = _load_raw(snapshot)
        items = raw.get("concession_items") or []
        for item in items:
            cat = item.get("category")
            if cat and not _is_entertainment(item):
                categories.add(cat)
    
    return {
        "status": "ok",
        "categories": sorted(categories),
    }


@router.get("/cinema/member")
def get_member_detail(
    request: Request,
    date: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=90),
    category: str | None = Query(default=None),
) -> dict:
    """获取会员消费详情，支持按日期范围和商品类型筛选"""
    from datetime import date as date_cls
    repository = request.app.state.repository
    target_date = date or date_cls.today().isoformat()

    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, days, max_date=target_date)
    if not snapshots:
        return {"status": "no_data", "message": "暂无会员消费数据"}

    all_items: list[dict] = []
    daily_summary: list[dict] = []

    for snapshot in snapshots:
        raw = _load_raw(snapshot)
        items = raw.get("member_items") or []
        summary = raw.get("summary", {})

        if category:
            items = [item for item in items if item.get("product_type") == category]

        all_items.extend(items)
        daily_summary.append({
            "date": snapshot["date"],
            "revenue": summary.get("member_consume", 0),
            "items_count": len(items),
        })

    # 按商品类型汇总
    category_stats: dict[str, dict] = {}
    for item in all_items:
        cat = item.get("product_type", "未知")
        if cat not in category_stats:
            category_stats[cat] = {"category": cat, "amount": 0, "items": 0}
        category_stats[cat]["amount"] += item.get("amount", 0)
        category_stats[cat]["items"] += 1

    # 按商品名汇总
    product_stats: dict[str, dict] = {}
    for item in all_items:
        name = item.get("product_name", "未知")
        if name not in product_stats:
            product_stats[name] = {
                "product_name": name,
                "product_type": item.get("product_type", "未知"),
                "amount": 0,
                "count": 0,
            }
        product_stats[name]["amount"] += item.get("amount", 0)
        product_stats[name]["count"] += 1

    category_list = sorted(category_stats.values(), key=lambda x: -x["amount"])
    product_list = sorted(product_stats.values(), key=lambda x: -x["amount"])

    total_amount = sum(cat["amount"] for cat in category_list)

    return {
        "status": "ok",
        "date_range": {
            "start": snapshots[-1]["date"] if snapshots else None,
            "end": snapshots[0]["date"] if snapshots else None,
            "days": len(snapshots),
        },
        "summary": {
            "total_amount": total_amount,
            "avg_daily_amount": round(total_amount / len(snapshots), 2) if snapshots else 0,
        },
        "categories": category_list,
        "items": product_list[:50],
        "daily_trend": daily_summary,
        "filter": {"category": category},
    }


@router.get("/cinema/member/categories")
def get_member_categories(request: Request) -> dict:
    """获取所有会员消费商品类型列表"""
    repository = request.app.state.repository
    snapshots = repository.daily_snapshots_for(BUSINESS_TYPE, PLATFORM, STORE_ID, 90)

    categories = set()
    for snapshot in snapshots:
        raw = _load_raw(snapshot)
        items = raw.get("member_items") or []
        for item in items:
            cat = item.get("product_type")
            if cat:
                categories.add(cat)

    return {
        "status": "ok",
        "categories": sorted(categories),
    }
