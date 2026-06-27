#!/usr/bin/env python3
"""查看台球详细数据完整内容"""
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

def get(path, params):
    with httpx.Client(timeout=15, verify=ssl_ctx) as client:
        resp = client.get(f"{BASE_URL}{path}", headers=headers, params=params)
        return resp.json()

# 1. 球桌排行 - 完整数据
print("=" * 60)
print("1. 球桌收入排行（2026年6月）")
print("=" * 60)
data = get("/api/system/stat/dashboards/table_summary/", {
    "node_id": NODE_ID, "date_type": "2",
    "start_date": month_start, "end_date": month_end,
})
result = data.get("Result", {})
table_stats = result.get("node_table_stats", [])
print(f"共 {len(table_stats)} 张桌\n")
for item in table_stats:
    tbl = item.get("table", {})
    name = tbl.get("address", "未知")
    tbl_type = {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他")
    count = item.get("table_order_count", 0)
    payed = (item.get("table_order_payed", 0) or 0) / 100
    ttime = (item.get("table_order_time", 0) or 0) // 60
    print(f"  {name} ({tbl_type}): {count}单, ¥{payed:.0f}, {ttime}分钟")

# 2. 会员排行 - 完整数据
print("\n" + "=" * 60)
print("2. 会员消费排行TOP10（2026年6月）")
print("=" * 60)
data = get("/api/system/stat/dashboards/member_summary_v2/", {
    "node_id": NODE_ID, "date_type": "2",
    "start_date": month_start, "end_date": month_end,
    "limit": "10", "order": "order_payed", "order_direction": "desc",
})
results = data.get("Results", [])
print(f"共 {len(results)} 位会员\n")
for i, m in enumerate(results, 1):
    member = m.get("member", {})
    nick = member.get("nickname") or member.get("name") or f"用户{i}"
    phone = member.get("phone", "")
    count = m.get("order_count", 0)
    payed = (m.get("order_payed", 0) or 0) / 100
    ttime = (m.get("order_time", 0) or 0) // 60
    avg_duration = m.get("avg_order_duration", 0)
    print(f"  {i}. {nick} ({phone}): {count}单, ¥{payed:.0f}, {ttime}分钟, 平均{avg_duration}分钟/单")

# 3. VIP汇总
print("\n" + "=" * 60)
print("3. VIP汇总（2026年6月）")
print("=" * 60)
data = get("/api/system/stat/dashboards/vip_summary/", {
    "node_id": NODE_ID, "date_type": "2",
    "start_date": month_start, "end_date": month_end,
})
result = data.get("Result", {})
print(f"  VIP会员数: {result.get('vip_count')}人")
print(f"  会员余额: ¥{result.get('member_balance', 0)/100:.0f}")
print(f"  总充值: ¥{result.get('total_payed', 0)/100:.0f}")
print(f"  总赠送: ¥{result.get('total_give', 0)/100:.0f}")

# 4. 时段分布
print("\n" + "=" * 60)
print("4. 时段分布（2026年6月）")
print("=" * 60)
data = get("/api/system/stat/dashboards/time_summary/", {
    "node_id": NODE_ID, "date_type": "2",
    "start_date": month_start, "end_date": month_end,
})
result = data.get("Result", {})
print("小时 | 订单数 | 柱状图")
print("-" * 40)
for h in range(24):
    count = int(result.get(str(h), 0))
    bar = "█" * (count // 200)
    print(f"  {h:02d} | {count:5d} | {bar}")

# 5. 充值统计
print("\n" + "=" * 60)
print("5. 充值统计（2026年1-6月）")
print("=" * 60)
year_start = "2026-01-01T00:00:00+08:00"
year_end = "2026-06-26T23:59:59+08:00"
data = get("/api/system/stat/balance_stats/", {
    "node_id": NODE_ID, "date_type": "2",
    "limit": "100",
    "date__gte": year_start, "date__lt": year_end,
})
results = data.get("Results", [])
print(f"{'月份':12} | {'余额':8} | {'充值':8} | {'消费':8}")
print("-" * 50)
for b in results:
    date = (b.get("date") or "")[:10]
    balance = (b.get("balance", 0) or 0) / 100
    recharge = (b.get("money", 0) or 0) / 100
    consume = (b.get("consume_money", 0) or 0) / 100
    print(f"{date:12} | ¥{balance:6.0f} | ¥{recharge:6.0f} | ¥{consume:6.0f}")

# 6. 用户评论
print("\n" + "=" * 60)
print("6. 用户评论（最新10条）")
print("=" * 60)
data = get("/api/system/record/comments/", {
    "node_id": NODE_ID, "limit": "10", "ordering": "-created_at",
})
results = data.get("Results", [])
for c in results:
    content = c.get("content", "")
    score = c.get("score", "-")
    level = c.get("level", "-")
    created = (c.get("created_at") or "")[:16]
    table_name = c.get("table_name", "")
    print(f"  [{created}] 桌号={table_name}, 评分={score}, 等级={level}")
    print(f"    内容: {content}")
