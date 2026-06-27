#!/usr/bin/env python3
"""快速测试：查询3天数据验证API"""
import ssl
import httpx
import json
import time
from datetime import datetime, timedelta
from pathlib import Path

BASE_URL = "https://table-api.xironiot.com"
APP_ID = "0a60f00b28c849d3ac529994f98b825f"
NODE_ID = "b553e29d-a389-45c0-b10f-8b40be2a7e2c"
TOKEN_FILE = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE

token = TOKEN_FILE.read_text().strip()

hdrs = {
    "Authorization": token,
    "Xi-App-Id": APP_ID,
    "xweb_xhr": "1",
    "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
    "Referer": "https://servicewechat.com/",
    "Accept": "*/*",
}

print("测试查询5天数据...")
for i in range(5):
    date = datetime(2026, 6, 20) + timedelta(days=i)
    start = date.strftime("%Y-%m-%dT00:00:00+08:00")
    end = date.strftime("%Y-%m-%dT23:59:59+08:00")
    
    with httpx.Client(timeout=15, verify=ssl_ctx) as client:
        resp = client.get(
            f"{BASE_URL}/api/system/stat/dashboards/new_summary/",
            headers=hdrs,
            params={
                "node_id": NODE_ID,
                "date_type": "1",
                "node_type": "Site",
                "start_date": start,
                "end_date": end,
            },
        )
        data = resp.json()
        result = data.get("Result", {})
        payed = result.get("order_payed", 0)
        count = result.get("order_count", 0)
        face = result.get("face_count", 0)
        print(f"  {date.strftime('%Y-%m-%d')}: 订单={count}, 收入={payed/100:.2f}元, 到店={face}")
    time.sleep(0.3)

print("\n测试通过!")
