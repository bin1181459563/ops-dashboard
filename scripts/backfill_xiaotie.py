#!/usr/bin/env python3
"""
小铁台球历史数据回灌脚本
按天查询 2025-01-01 到 2026-06-26 的数据，存入 daily_snapshots
"""
import ssl
import sys
import time
import json
import sqlite3
import httpx
from datetime import datetime, timedelta
from pathlib import Path

# 配置
BASE_URL = "https://table-api.xironiot.com"
APP_ID = "0a60f00b28c849d3ac529994f98b825f"
NODE_ID = "b553e29d-a389-45c0-b10f-8b40be2a7e2c"
TOKEN_FILE = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"
DB_PATH = Path(__file__).parent.parent / "data" / "ops_dashboard.db"

START_DATE = datetime(2025, 1, 1)
END_DATE = datetime(2026, 6, 26)

# SSL上下文
ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def get_token():
    if not TOKEN_FILE.exists():
        print(f"❌ Token文件不存在: {TOKEN_FILE}")
        sys.exit(1)
    return TOKEN_FILE.read_text().strip()


def headers(token):
    return {
        "Authorization": token,
        "Xi-App-Id": APP_ID,
        "xweb_xhr": "1",
        "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }


def query_day(token, date):
    """查询某天的数据"""
    start = date.strftime("%Y-%m-%dT00:00:00+08:00")
    end = date.strftime("%Y-%m-%dT23:59:59+08:00")
    
    with httpx.Client(timeout=15, verify=ssl_ctx) as client:
        # 查询汇总数据
        resp = client.get(
            f"{BASE_URL}/api/system/stat/dashboards/new_summary/",
            headers=headers(token),
            params={
                "node_id": NODE_ID,
                "date_type": "1",
                "node_type": "Site",
                "start_date": start,
                "end_date": end,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("Result", {})
        
        # 查询桌台状态（计算使用率）
        resp2 = client.get(
            f"{BASE_URL}/api/system/device/tables/",
            headers=headers(token),
            params={
                "expand": "Device,PayRuleGroup.PayRules",
                "node_id": NODE_ID,
                "count": "true",
                "limit": "50",
            },
        )
        tables_data = resp2.json()
        tables = tables_data.get("Results", [])
        total_tables = int(tables_data.get("Count") or len(tables) or 13)
        busy_tables = sum(1 for t in tables if t.get("open"))
        
        return {
            "order_count": result.get("order_count", 0),
            "order_payed": result.get("order_payed", 0),  # 分
            "order_money": result.get("order_money", 0),   # 分
            "face_count": result.get("face_count", 0),
            "new_face_count": result.get("new_face_count", 0),
            "order_member_count": result.get("order_member_count", 0),
            "total_tables": total_tables,
            "busy_tables": busy_tables,
            "raw": result,
        }


def save_to_db(conn, date, data):
    """保存到 daily_snapshots"""
    date_str = date.strftime("%Y-%m-%d")
    revenue = round(data["order_payed"] / 100, 2)  # 分转元
    orders = data["order_count"]
    customer_count = data["face_count"]
    usage_rate = round(data["busy_tables"] / max(data["total_tables"], 1), 4)
    avg_order_value = round(revenue / max(orders, 1), 2)
    
    raw_json = json.dumps({
        "source": "backfill",
        "summary": data["raw"],
        "tables": {
            "total": data["total_tables"],
            "busy": data["busy_tables"],
        },
        "customer": {
            "face_count": data["face_count"],
            "new_face_count": data["new_face_count"],
            "member_count": data["order_member_count"],
        },
    }, ensure_ascii=False)
    
    conn.execute("""
        INSERT INTO daily_snapshots (business_type, platform, store_id, date, revenue, orders, usage_rate, customer_count, avg_order_value, raw_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_type, platform, store_id, date) DO UPDATE SET
            revenue = excluded.revenue,
            orders = excluded.orders,
            usage_rate = excluded.usage_rate,
            customer_count = excluded.customer_count,
            avg_order_value = excluded.avg_order_value,
            raw_json = excluded.raw_json
    """, (
        "billiards", "xiaotie", "feicuicheng", date_str,
        revenue, orders, usage_rate, customer_count, avg_order_value,
        raw_json, datetime.now().isoformat()
    ))


def main():
    token = get_token()
    
    # 验证token
    print("🔍 验证小铁token...")
    try:
        test_data = query_day(token, datetime(2026, 6, 20))
        print(f"✅ Token有效，测试数据: 订单={test_data['order_count']}, 收入={test_data['order_payed']/100:.2f}元")
    except Exception as e:
        print(f"❌ Token无效或API异常: {e}")
        sys.exit(1)
    
    # 计算天数
    total_days = (END_DATE - START_DATE).days + 1
    print(f"\n📊 开始回灌: {START_DATE.strftime('%Y-%m-%d')} ~ {END_DATE.strftime('%Y-%m-%d')} ({total_days}天)")
    
    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    
    # 确保表有唯一约束
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_snapshots_unique 
        ON daily_snapshots(business_type, platform, store_id, date)
    """)
    conn.commit()
    
    # 开始回灌
    success = 0
    failed = 0
    skipped = 0
    current = START_DATE
    
    while current <= END_DATE:
        date_str = current.strftime("%Y-%m-%d")
        try:
            data = query_day(token, current)
            
            # 跳过无数据的天（订单为0且收入为0可能是休息日，但也记录）
            save_to_db(conn, current, data)
            conn.commit()
            
            revenue = data["order_payed"] / 100
            if data["order_count"] > 0:
                success += 1
                print(f"  ✅ {date_str}: 订单={data['order_count']}, 收入=¥{revenue:.2f}")
            else:
                skipped += 1
                print(f"  ⏭️  {date_str}: 无数据（休息日？）")
            
        except Exception as e:
            failed += 1
            print(f"  ❌ {date_str}: {e}")
        
        current += timedelta(days=1)
        time.sleep(0.3)  # 避免限流
    
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"✅ 回灌完成!")
    print(f"  成功: {success}天")
    print(f"  无数据: {skipped}天")
    print(f"  失败: {failed}天")
    print(f"  总计: {total_days}天")


if __name__ == "__main__":
    main()
