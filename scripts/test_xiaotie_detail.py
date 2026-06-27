#!/usr/bin/env python3
"""测试台球详细数据API"""
import ssl
import httpx
import json
import os
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

start = "2026-06-01T00:00:00+08:00"
end = "2026-06-26T23:59:59+08:00"

# 1. 球桌排行
print("=== 1. 球桌收入排行（table_summary）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/table_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}张桌")
    for t in results[:5]:
        payed = t.get("order_payed", 0) or 0
        count = t.get("order_count", 0) or 0
        ttime = t.get("order_time", 0) or 0
        print(f"  {t.get('table_name')}: 收入={payed/100:.0f}元, 订单={count}, 时长={ttime//60}分钟")

# 2. 会员排行
print("\n=== 2. 会员消费排行（member_summary_v2）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/member_summary_v2/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
        "order": "order_payed", "limit": "10",
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}位会员")
    for m in results[:5]:
        payed = m.get("order_payed", 0) or 0
        count = m.get("order_count", 0) or 0
        nick = m.get("nickname") or m.get("user_name") or "未知"
        print(f"  {nick}: 消费={payed/100:.0f}元, 订单={count}")

# 3. VIP汇总
print("\n=== 3. VIP汇总（vip_summary）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/vip_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
    })
    data = resp.json()
    result = data.get("Result", {})
    print(f"  VIP数: {result.get('vip_count')}")
    print(f"  返回字段: {list(result.keys())}")

# 4. 时段分布
print("\n=== 4. 时段分布（time_summary）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/time_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}个小时段")
    if results:
        sorted_r = sorted(results, key=lambda x: x.get("order_count", 0) or 0, reverse=True)
        for t in sorted_r[:5]:
            count = t.get("order_count", 0) or 0
            print(f"  {t.get('time')}: 订单={count}")

# 5. 充值统计
print("\n=== 5. 充值统计（balance_stats）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    try:
        resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/balance_stats/", headers=headers, params={
            "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
            "start_date": start, "end_date": end,
        })
        text = resp.text[:200]
        print(f"  响应前200字: {text}")
    except Exception as e:
        print(f"  错误: {e}")

# 6. 用户评论
print("\n=== 6. 用户评论（comments）===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/comments/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
        "limit": "5",
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  共{len(results)}条评论")
    for c in results[:3]:
        nick = c.get("nickname") or "匿名"
        content = (c.get("content") or "")[:30]
        score = c.get("score", "-")
        print(f"  {nick}: {content}... 评分={score}")
