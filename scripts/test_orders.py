#!/usr/bin/env python3
"""测试棋牌订单接口"""
import httpx
import hashlib
import time
import json
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

BASE_URL = "https://admin.5laoban.com"
SID = os.getenv("OPS_WU_LAOBAN_SID", "1238")
MID = os.getenv("OPS_WU_LAOBAN_MID", "2400")
ADMIN_TOKEN = os.getenv("OPS_WU_LAOBAN_ADMIN_TOKEN", "")

def gen_token(path):
    ts = str(int(time.time() * 1000))
    raw = f"{BASE_URL}{path}{ts}{BASE_URL}"
    return hashlib.md5(raw.encode()).hexdigest(), ts

# 查单天
print("=== 单天订单（2026-06-20）===")
path = "/admin/stats/orders"
token, ts = gen_token(path)
headers = {
    "Cookie": f"admin_token={ADMIN_TOKEN}",
    "applet-token": token,
    "mid": MID,
    "pageId": "100192",
    "timezone-offset": "28800000",
    "trace-id": f"test-{ts}",
}
with httpx.Client(timeout=15, verify=False) as client:
    resp = client.get(f"{BASE_URL}{path}", headers=headers, params={
        "timestamp_private": ts, "isbrand": "0", "store": SID, "sids[]": SID,
        "date1": "20260620", "date2": "20260620",
    })
    data = resp.json()
    result = data.get("result", {})
    now_data = result.get("nowData", {})
    print(f"nowData: {json.dumps(now_data, ensure_ascii=False, indent=2)}")
    
    trends = result.get("trends", [])
    print(f"\ntrends数量: {len(trends)}")
    for t in trends:
        print(f"  {t.get('name')}: {len(t.get('data', []))}条")
        if t.get("data"):
            print(f"    示例: {t['data'][0]}")

# 查整月
print("\n=== 整月订单（2026-06-01 ~ 2026-06-20）===")
token, ts = gen_token(path)
headers["trace-id"] = f"test-{ts}"
with httpx.Client(timeout=15, verify=False) as client:
    resp = client.get(f"{BASE_URL}{path}", headers=headers, params={
        "timestamp_private": ts, "isbrand": "0", "store": SID, "sids[]": SID,
        "date1": "20260601", "date2": "20260620",
    })
    data = resp.json()
    result = data.get("result", {})
    now_data = result.get("nowData", {})
    print(f"nowData: {json.dumps(now_data, ensure_ascii=False, indent=2)[:500]}")
    
    trends = result.get("trends", [])
    print(f"\ntrends数量: {len(trends)}")
    for t in trends:
        name = t.get("name", "")
        data_list = t.get("data", [])
        print(f"  {name}: {len(data_list)}条")
        if data_list:
            print(f"    第一条: {data_list[0]}")
            print(f"    最后一条: {data_list[-1]}")
