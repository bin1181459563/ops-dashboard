#!/usr/bin/env python3
"""
棋牌订单数据补齐脚本
按天查询订单数、用户数、新客数，更新到 daily_snapshots
"""
import httpx
import hashlib
import time
import json
import sqlite3
import os
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

BASE_URL = "https://admin.5laoban.com"
SID = os.getenv("OPS_WU_LAOBAN_SID", "1238")
MID = os.getenv("OPS_WU_LAOBAN_MID", "2400")
ADMIN_TOKEN = os.getenv("OPS_WU_LAOBAN_ADMIN_TOKEN", "")
DB_PATH = Path(__file__).parent.parent / "data" / "ops_dashboard.db"

START_DATE = datetime(2025, 1, 1)
END_DATE = datetime(2026, 6, 26)


def gen_token(path):
    ts = str(int(time.time() * 1000))
    raw = f"{BASE_URL}{path}{ts}{BASE_URL}"
    return hashlib.md5(raw.encode()).hexdigest(), ts


def query_day_orders(date_str):
    """查询某天的订单数据"""
    path = "/admin/stats/orders"
    token, ts = gen_token(path)
    headers = {
        "Cookie": f"admin_token={ADMIN_TOKEN}",
        "applet-token": token,
        "mid": MID,
        "pageId": "100192",
        "timezone-offset": "28800000",
        "trace-id": f"backfill-{ts}",
    }
    
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    date_int = date_obj.strftime("%Y%m%d")
    
    with httpx.Client(timeout=15, verify=False) as client:
        resp = client.get(
            f"{BASE_URL}{path}",
            headers=headers,
            params={
                "timestamp_private": ts,
                "isbrand": "0",
                "store": SID,
                "sids[]": SID,
                "date1": date_int,
                "date2": date_int,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        now_data = result.get("nowData", {})
        
        return {
            "order_num": now_data.get("order_num", 0),
            "uid_num": now_data.get("uid_num", 0),
            "user_new": now_data.get("user_new", 0),
            "re_person_num": now_data.get("re_person_num", 0),
            "time_total": now_data.get("time_total", 0),
        }


def update_db(conn, date_str, orders_data, revenue):
    """更新数据库中的订单数和客户数"""
    order_num = orders_data["order_num"]
    uid_num = orders_data["uid_num"]
    avg_order_value = round(revenue / max(order_num, 1), 2)
    
    # 构建raw_json
    raw_json = json.dumps({
        "source": "backfill_orders",
        "orders": orders_data,
    }, ensure_ascii=False)
    
    conn.execute("""
        UPDATE daily_snapshots 
        SET orders = ?, customer_count = ?, avg_order_value = ?, raw_json = ?
        WHERE business_type = 'mahjong' AND platform = 'wu_laoban' AND date = ?
    """, (order_num, uid_num, avg_order_value, raw_json, date_str))


def main():
    if not ADMIN_TOKEN:
        print("❌ 無老板token未配置")
        return
    
    # 验证token
    print("🔍 验证token...")
    try:
        test = query_day_orders("2026-06-20")
        print(f"✅ Token有效，测试数据: 订单={test['order_num']}, 用户={test['uid_num']}")
    except Exception as e:
        print(f"❌ API异常: {e}")
        return
    
    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    
    # 查询需要补齐的日期
    cursor = conn.execute("""
        SELECT date, revenue FROM daily_snapshots 
        WHERE business_type = 'mahjong' AND platform = 'wu_laoban'
        ORDER BY date
    """)
    rows = cursor.fetchall()
    
    total = len(rows)
    success = 0
    failed = 0
    
    print(f"\n📊 开始补齐: {len(rows)}天")
    
    for i, (date_str, revenue) in enumerate(rows):
        try:
            orders_data = query_day_orders(date_str)
            update_db(conn, date_str, orders_data, revenue)
            conn.commit()
            
            order_num = orders_data["order_num"]
            uid_num = orders_data["uid_num"]
            
            if order_num > 0:
                success += 1
                print(f"  ✅ {date_str}: 订单={order_num}, 用户={uid_num}")
            else:
                print(f"  ⏭️  {date_str}: 无订单")
            
        except Exception as e:
            failed += 1
            print(f"  ❌ {date_str}: {e}")
        
        time.sleep(0.3)  # 避免限流
    
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"✅ 补齐完成!")
    print(f"  处理: {total}天")
    print(f"  有订单: {success}天")
    print(f"  失败: {failed}天")


if __name__ == "__main__":
    main()
