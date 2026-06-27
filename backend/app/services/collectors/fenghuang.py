"""
凤凰云智影院数据采集器
API来源：lark-biprod.alibaba.com / lark-goodsprod.alibaba.com
"""
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings


def _now_beijing() -> datetime:
    return datetime.now(timezone(timedelta(hours=8)))


def _today_range() -> tuple[str, str]:
    """返回今天的时间范围：06:00 ~ 次日05:59"""
    now = _now_beijing()
    today = now.date()
    tomorrow = today + timedelta(days=1)
    start = f"{today.isoformat()} 06:00"
    end = f"{tomorrow.isoformat()} 05:59"
    return start, end


def _date_range(target_date: str) -> tuple[str, str]:
    """返回指定日期的营业时间范围：06:00 ~ 次日05:59"""
    d = datetime.strptime(target_date, "%Y-%m-%d").date()
    next_d = d + timedelta(days=1)
    return f"{d.isoformat()} 06:00", f"{next_d.isoformat()} 05:59"


def get_access_token() -> str:
    """获取凤凰云智access_token"""
    if settings.fenghuang_access_token:
        return settings.fenghuang_access_token.strip()
    token_file = settings.fenghuang_token_file
    if token_file.exists():
        return token_file.read_text(encoding="utf-8").strip()
    return ""


def _get_headers() -> dict:
    """获取请求头"""
    return {
        "Content-Type": "application/json;charset=UTF-8",
        "gray-lease-code": settings.fenghuang_gray_lease_code,
        "gray-user-id": settings.fenghuang_gray_user_id,
        "Origin": "https://lark.yuekeyun.com",
    }


def _bi_post(path: str, body: dict, token: str) -> dict:
    """调用BI接口（lark-biprod.alibaba.com）"""
    url = f"https://lark-biprod.alibaba.com{path}?access_token={token}"
    resp = httpx.post(url, json=body, headers=_get_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def _goods_get(path: str, params: dict, token: str) -> dict:
    """调用商品/库存接口（lark-goodsprod.alibaba.com）"""
    params["access_token"] = token
    url = f"https://lark-goodsprod.alibaba.com{path}"
    resp = httpx.get(url, params=params, headers=_get_headers(), timeout=30)
    resp.raise_for_status()
    return resp.json()


def collect_schedule_detail(token: str, begin_time: str, end_time: str) -> dict:
    """
    采集场次明细（票房、人次、场次、影片）
    返回: {showTicketNum, ticketTotalAmount, scheduleCount, films: [...]}
    """
    body = {
        "pageNo": 1,
        "pageSize": 200,  # 获取全部场次
        "nullType": ["3"],
        "beginTime": begin_time,
        "endTime": end_time,
    }
    data = _bi_post("/bi/ticket/scheduleDetail", body, token)
    
    if data.get("code") != "SUCCESS":
        raise Exception(f"场次明细API失败: {data.get('message')}")
    
    summary = data.get("data", {}).get("summary", {})
    column = summary.get("columnValueMap", {})
    
    # 解析影片列表
    films = []
    for item in data.get("data", {}).get("list", []):
        col = item.get("columnValueMap", {})
        film_name = col.get("filmName", "")
        if film_name:
            films.append({
                "film_name": film_name,
                "film_code": col.get("filmCode", ""),
                "box_office": col.get("ticketTotalAmount", 0) / 100,  # 分→元
                "audience": col.get("showTicketNum", 0),
                "screenings": col.get("scheduleCount", 0),
                "dimensional": col.get("filmDimensionalName", ""),
                "language": col.get("filmLanguageName", ""),
            })
    
    # 按票房排序
    films.sort(key=lambda x: x["box_office"], reverse=True)
    
    return {
        "show_ticket_num": int(column.get("showTicketNum", 0) or 0),
        "ticket_total_amount": round(column.get("ticketTotalAmount", 0) / 100, 2),  # 分→元
        "schedule_count": int(column.get("scheduleCount", 0) or 0),
        "average_ticket_price": round(column.get("averageTicketPrice", 0) / 100, 2),  # 分→元
        "refund_ticket_num": int(column.get("refundTicketNum", 0) or 0),
        "refund_ticket_amount": round(column.get("refundTicketAmount", 0) / 100, 2),
        "seat_num": int(column.get("seatNum", 0) or 0),
        "seat_num_rate": float(column.get("seatNumRate", 0) or 0),
        "films": films,
    }


def collect_goods_detail(token: str, begin_time: str, end_time: str) -> dict:
    """
    采集卖品销售明细
    返回: {pay_amount, sale_num, items: [...]}
    """
    body = {
        "pageNo": 1,
        "pageSize": 500,  # 获取全部卖品
        "giftCombo": True,
        "beginTime": begin_time,
        "endTime": end_time,
        "timeSegment": False,
    }
    data = _bi_post("/bi/goods/orderDetail", body, token)
    
    if data.get("code") != "SUCCESS":
        raise Exception(f"卖品明细API失败: {data.get('message')}")
    
    summary = data.get("data", {}).get("summary", {})
    column = summary.get("columnValueMap", {})
    
    # 解析卖品列表
    items = []
    for item in data.get("data", {}).get("list", []):
        col = item.get("columnValueMap", {})
        items.append({
            "item_name": col.get("itemName", ""),
            "category": col.get("categoryName", ""),
            "sale_num": int(col.get("saleNum") or 0),
            "pay_amount": round(float(col.get("payAmount") or 0) / 100, 2),  # 分→元
            "sale_time": col.get("saleTime", ""),
            "emp_name": col.get("saleEmpName", ""),
        })
    
    return {
        "pay_amount": round(float(column.get("payAmount") or 0) / 100, 2),  # 分→元
        "sale_num": int(column.get("saleNum") or 0),
        "order_count": int(column.get("goodsOrderId") or 0),
        "items": items,
    }


def collect_member_open_card(token: str, begin_date: str, end_date: str) -> dict:
    """
    采集会员开卡报表（salesReport）
    返回: {card_count, pay_amount, items: [{card_no, card_type, pay_amount, operator, time}]}
    """
    body = {
        "pageNo": 1,
        "pageSize": 500,
        "gmtCardOpen": None,
        "beginTime": begin_date,
        "endTime": end_date,
    }
    data = _bi_post("/bi/card/salesReport", body, token)
    
    if data.get("code") != "SUCCESS":
        raise Exception(f"开卡API失败: {data.get('message')}")
    
    summary = data.get("data", {}).get("summary", {})
    column = summary.get("columnValueMap", {})
    
    # 解析开卡明细
    items = []
    for item in data.get("data", {}).get("list", []):
        col = item.get("columnValueMap", {})
        items.append({
            "card_no": col.get("cardNo", ""),
            "card_type": col.get("cardTypeName", ""),
            "pay_amount": round(float(col.get("payAmt") or 0) / 100, 2),      # 售卡费（分→元）
            "recharge_amount": round(float(col.get("rechargeAmt") or 0) / 100, 2),  # 开卡充值（分→元）
            "operator": col.get("empName", ""),
            "time": col.get("saleTime", ""),
            "sale_type": col.get("saleType", ""),
            "pay_method": col.get("payMethodName", ""),
        })
    
    return {
        "card_count": int(column.get("cardCount") or 0),
        "pay_amount": round(float(column.get("payAmt") or 0) / 100, 2),  # 售卡费合计
        "items": items,
    }


def collect_member_recharge(token: str, begin_date: str, end_date: str) -> dict:
    """
    采集会员充值报表（rechargeReport）
    返回: {recharge_amount, pay_amount, items: [{card_no, card_type, amount, operator}]}
    """
    body = {
        "pageNo": 1,
        "pageSize": 500,
        "beginTime": begin_date,
        "endTime": end_date,
    }
    data = _bi_post("/bi/card/rechargeReport", body, token)
    
    if data.get("code") != "SUCCESS":
        raise Exception(f"充值API失败: {data.get('message')}")
    
    summary = data.get("data", {}).get("summary", {})
    column = summary.get("columnValueMap", {})
    
    # 解析充值明细
    items = []
    for item in data.get("data", {}).get("list", []):
        col = item.get("columnValueMap", {})
        items.append({
            "card_no": col.get("cardNo", ""),
            "card_type": col.get("cardTypeName", ""),
            "amount": round(float(col.get("rechargeAmt") or 0) / 100, 2),  # 充值金额（分→元）
            "pay_amount": round(float(col.get("payAmt") or 0) / 100, 2),  # 实付金额（分→元）
            "operator": col.get("empName", ""),
            "time": col.get("saleTime", ""),
            "pay_method": col.get("payMethodName", ""),
        })
    
    return {
        "recharge_amount": round(float(column.get("rechargeAmt") or 0) / 100, 2),  # 充值合计
        "pay_amount": round(float(column.get("payAmt") or 0) / 100, 2),            # 实付合计
        "gift_amount": round(float(column.get("giftAmt") or 0) / 100, 2),          # 赠送金额
        "items": items,
    }


def collect_inventory(token: str, depot_id: str = "12198", depot_type: str = "RACK") -> list[dict]:
    """
    采集实时库存
    返回: [{item_name, category, quantity, pos_price, cost_with_tax}]
    """
    params = {
        "status": "SELLING",
        "depotId": depot_id,
        "depotType": depot_type,
        "cinemaLinkId": settings.fenghuang_cinema_link_id,
        "pageNo": 1,
        "pageSize": 500,
    }
    data = _goods_get("/storageItem/oper/listReal", params, token)
    
    if data.get("code") != "ok":
        raise Exception(f"库存API失败: {data}")
    
    items = []
    for item in data.get("data", {}).get("data", []):
        items.append({
            "item_name": item.get("itemName", ""),
            "item_code": item.get("itemCode", ""),
            "category": item.get("firstClassName", ""),
            "quantity": float(item.get("itemQuantity", 0) or 0),
            "pos_price": round(float(item.get("posPrice", 0) or 0), 2),
            "cost_with_tax": round(float(item.get("costWithTax", 0) or 0), 2),
            "cost_no_tax": round(float(item.get("costNoTax", 0) or 0), 2),
        })
    
    return items


def _refresh_token() -> str:
    """刷新token并返回新token"""
    import subprocess
    result = subprocess.run(
        ["node", "refresh-fenghuang-token.mjs"],
        cwd="/Users/Zhuanz/.hermes/workspace",
        capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        raise Exception(f"token刷新失败: {result.stderr}")
    return get_access_token()


def collect_fenghuang_raw(target_date: str | None = None) -> dict | None:
    """
    主采集函数：采集凤凰云智全部数据
    参数:
        target_date: 指定采集日期（YYYY-MM-DD），None=今天
    返回整合后的数据字典
    """
    token = get_access_token()
    if not token:
        return None
    
    # 确定采集日期和时间范围
    now = _now_beijing()
    if target_date:
        begin_time, end_time = _date_range(target_date)
        date_str = target_date
    else:
        begin_time, end_time = _today_range()
        date_str = now.date().isoformat()
    
    def _collect_with_retry(t: str) -> dict:
        """采集，token过期时自动刷新重试一次"""
        nonlocal token
        try:
            schedule = collect_schedule_detail(t, begin_time, end_time)
            goods = collect_goods_detail(t, begin_time, end_time)
            open_card = collect_member_open_card(t, date_str, date_str)
            recharge = collect_member_recharge(t, date_str, date_str)
            inv_front = collect_inventory(t, depot_id="12198", depot_type="RACK")
            inv_warehouse = collect_inventory(t, depot_id="32170", depot_type="DEPOT")
            return {
                "schedule": schedule, "goods": goods,
                "open_card": open_card, "recharge": recharge,
                "inv_front": inv_front, "inv_warehouse": inv_warehouse,
            }
        except Exception as e:
            # 401/token过期 → 自动刷新重试
            if "401" in str(e) or "token" in str(e).lower():
                print(f"⚠️ token可能过期({e})，尝试刷新...")
                token = _refresh_token()
                t = token
                schedule = collect_schedule_detail(t, begin_time, end_time)
                goods = collect_goods_detail(t, begin_time, end_time)
                open_card = collect_member_open_card(t, date_str, date_str)
                recharge = collect_member_recharge(t, date_str, date_str)
                inv_front = collect_inventory(t, depot_id="12198", depot_type="RACK")
                inv_warehouse = collect_inventory(t, depot_id="32170", depot_type="DEPOT")
                return {
                    "schedule": schedule, "goods": goods,
                    "open_card": open_card, "recharge": recharge,
                    "inv_front": inv_front, "inv_warehouse": inv_warehouse,
                }
            raise
    
    try:
        data = _collect_with_retry(token)
        schedule = data["schedule"]
        goods = data["goods"]
        open_card = data["open_card"]
        recharge = data["recharge"]
        
        # 给库存打标签
        for item in data["inv_front"]:
            item["location"] = "front"
        for item in data["inv_warehouse"]:
            item["location"] = "warehouse"
        inventory = data["inv_front"] + data["inv_warehouse"]
        
        # 整合数据
        return {
            "summary": {
                "revenue": schedule["ticket_total_amount"] + goods["pay_amount"],
                "box_office": schedule["ticket_total_amount"],
                "concession_revenue": goods["pay_amount"],
                "customer_count": schedule["show_ticket_num"],
                "screenings": schedule["schedule_count"],
                "average_ticket_price": schedule["average_ticket_price"],
                "occupancy_rate": schedule["seat_num_rate"],
                "refund_count": schedule["refund_ticket_num"],
                "refund_amount": schedule["refund_ticket_amount"],
                "member_open_card_total": open_card["card_count"],
                "member_recharge_total": recharge["recharge_amount"],
            },
            "films": schedule["films"],
            "concession_items": goods["items"],
            "member_open_card_items": open_card["items"],
            "member_recharge_items": recharge["items"],
            "inventory_items": inventory,
            "date": date_str,
            "begin_time": begin_time,
            "end_time": end_time,
            "collected_at": now.isoformat(),
        }
    except Exception as exc:
        raise


def check_fenghuang_token() -> dict:
    """
    检测凤凰云智token是否有效
    返回: {"valid": bool, "error": str | None}
    """
    token = get_access_token()
    if not token:
        return {"valid": False, "error": "未配置token"}
    
    try:
        begin_time, end_time = _today_range()
        body = {
            "pageNo": 1,
            "pageSize": 1,
            "nullType": ["3"],
            "beginTime": begin_time,
            "endTime": end_time,
        }
        data = _bi_post("/bi/ticket/scheduleDetail", body, token)
        if data.get("code") == "SUCCESS":
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": data.get("message", "API返回异常")}
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            return {"valid": False, "error": "token已失效(401)"}
        return {"valid": False, "error": f"HTTP {e.response.status_code}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}
