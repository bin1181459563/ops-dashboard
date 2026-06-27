#!/usr/bin/env python3
"""测试台球详细数据API - 使用正确端点"""
import ssl
import httpx
import json
from pathlib import Path

BASE_URL = "https://table-api.xironiot.com"
APP_ID = "0a60f00b28c849d3ac529994f98b825f"
NODE_ID = "b553e29d-a389-45c0-b10f-8b40be2a7e2c"

token_file = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"
token = token_file.read_text().strip()

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

headers = {
    "Authorization": token,
    "Xi-App-Id": APP_ID,
    "xweb_xhr": "1",
    "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
    "Referer": "https://servicewechat.com/",
    "Accept": "*/*",
}

month_start = "2026-06-01T00:00:00+08:00"
month_end = "2026-06-26T23:59:59+08:00"

# 1. 球桌排行 (node_table_stats)
print("=== 1. 球桌收入排行 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/table_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2",
        "start_date": month_start, "end_date": month_end,
    })
    data = resp.json()
    result = data.get("Result", {})
    table_stats = result.get("node_table_stats", [])
    print(f"  共{len(table_stats)}张桌")
    for item in table_stats[:5]:
        tbl = item.get("table", {})
        name = tbl.get("address", "未知")
        count = item.get("table_order_count", 0)
        payed = item.get("table_order_payed", 0) or 0
        ttime = item.get("table_order_time", 0) or 0
        print(f"  {name}: 订单={count}, 收入={payed/100:.0f}元, 时长={ttime//60}分钟")

# 2. 会员排行
print("\n=== 2. 会员消费排行TOP5 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/member_summary_v2/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2",
        "start_date": month_start, "end_date": month_end,
        "limit": "5", "order": "order_payed", "order_direction": "desc",
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}位会员")
    for m in results:
        member = m.get("member", {})
        nick = member.get("nickname") or member.get("name") or "未知"
        count = m.get("order_count", 0)
        payed = m.get("order_payed", 0) or 0
        ttime = m.get("order_time", 0) or 0
        print(f"  {nick}: 订单={count}, 消费={payed/100:.0f}元, 时长={ttime//60}分钟")

# 3. VIP汇总
print("\n=== 3. VIP汇总 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/vip_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2",
        "start_date": month_start, "end_date": month_end,
    })
    data = resp.json()
    result = data.get("Result", {})
    print(f"  VIP数: {result.get('vip_count')}")
    print(f"  会员余额: {result.get('member_balance', 0)/100:.0f}元")
    print(f"  总充值: {result.get('total_payed', 0)/100:.0f}元")
    print(f"  总赠送: {result.get('total_give', 0)/100:.0f}元")

# 4. 时段分布
print("\n=== 4. 时段分布（本月）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/time_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2",
        "start_date": month_start, "end_date": month_end,
    })
    data = resp.json()
    result = data.get("Result", {})
    # 按订单数排序
    hours = []
    for h in range(24):
        count = int(result.get(str(h), 0))
        hours.append({"hour": h, "orders": count})
    hours.sort(key=lambda x: x["orders"], reverse=True)
    print(f"  高峰时段TOP5:")
    for h in hours[:5]:
        print(f"    {h['hour']:02d}:00 - 订单={h['orders']}")

# 5. 充值统计
print("\n=== 5. 充值统计（本年）===")
year_start = "2026-01-01T00:00:00+08:00"
year_end = "2026-06-26T23:59:59+08:00"
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/balance_stats/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2",
        "limit": "100",
        "date__gte": year_start, "date__lt": year_end,
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}个月")
    for b in results:
        date = b.get("date", "")
        balance = (b.get("balance", 0) or 0) / 100
        recharge = (b.get("money", 0) or 0) / 100
        consume = (b.get("consume_money", 0) or 0) / 100
        print(f"  {date}: 余额={balance:.0f}元, 充值={recharge:.0f}元, 消费={consume:.0f}元")

# 6. 用户评论
print("\n=== 6. 用户评论（最新5条）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/record/comments/", headers=headers, params={
        "node_id": NODE_ID, "limit": "5", "ordering": "-created_at",
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}条评论")
    for c in results:
        content = (c.get("content") or "")[:30]
        score = c.get("score", "-")
        created = (c.get("created_at") or "")[:16]
        print(f"  [{created}] 评分={score}: {content}")
