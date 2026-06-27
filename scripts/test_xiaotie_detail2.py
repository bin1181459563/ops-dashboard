#!/usr/bin/env python3
"""测试台球详细数据API - 修正版"""
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

start = "2026-06-01T00:00:00+08:00"
end = "2026-06-26T23:59:59+08:00"

# 1. 球桌排行 - 试date_type=1
print("=== 1. 球桌收入排行 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/table_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "1", "node_type": "Site",
        "start_date": start, "end_date": end,
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  date_type=1: {len(results)}张桌")
    
    # 试单天
    resp2 = client.get(f"{BASE_URL}/api/system/stat/dashboards/table_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "1", "node_type": "Site",
        "start_date": "2026-06-20T00:00:00+08:00",
        "end_date": "2026-06-20T23:59:59+08:00",
    })
    data2 = resp2.json()
    results2 = data2.get("Results", [])
    print(f"  单天: {len(results2)}张桌")
    if results2:
        print(f"  字段: {list(results2[0].keys())}")
        for t in results2[:3]:
            print(f"  {t}")

# 2. 会员排行 - 看完整字段
print("\n=== 2. 会员消费排行 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/member_summary_v2/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
        "order": "order_payed", "limit": "3",
    })
    data = resp.json()
    results = data.get("Results", [])
    if results:
        print(f"  字段: {list(results[0].keys())}")
        for m in results[:2]:
            print(f"  {json.dumps(m, ensure_ascii=False)[:200]}")

# 3. VIP汇总
print("\n=== 3. VIP汇总 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/vip_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "2", "node_type": "Site",
        "start_date": start, "end_date": end,
    })
    data = resp.json()
    result = data.get("Result", {})
    print(f"  {json.dumps(result, ensure_ascii=False)}")

# 4. 时段分布 - 试单天
print("\n=== 4. 时段分布 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/time_summary/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "1", "node_type": "Site",
        "start_date": "2026-06-20T00:00:00+08:00",
        "end_date": "2026-06-20T23:59:59+08:00",
    })
    data = resp.json()
    results = data.get("Results", [])
    print(f"  单天: {len(results)}个小时段")
    if results:
        print(f"  字段: {list(results[0].keys())}")
        for t in results[:3]:
            print(f"  {t}")

# 5. 评论
print("\n=== 5. 用户评论 ===")
with httpx.Client(timeout=15, verify=ssl_ctx) as client:
    resp = client.get(f"{BASE_URL}/api/system/stat/dashboards/comments/", headers=headers, params={
        "node_id": NODE_ID, "date_type": "1", "node_type": "Site",
        "start_date": "2026-06-01T00:00:00+08:00",
        "end_date": "2026-06-26T23:59:59+08:00",
        "limit": "5",
    })
    print(f"  状态码: {resp.status_code}")
    print(f"  响应: {resp.text[:300]}")
