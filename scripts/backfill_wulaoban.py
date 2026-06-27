#!/usr/bin/env python3
"""
無老板棋牌历史数据回灌脚本
按月查询 2025-01-01 到 2026-06-26 的数据，存入 daily_snapshots
nowList 返回每天明细，18次API调用搞定
"""
import sys
import time
import json
import sqlite3
import hashlib
import httpx
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import os

# 加载环境变量
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

# 配置
BASE_URL = "https://admin.5laoban.com"
SID = os.getenv("OPS_WU_LAOBAN_SID", "1238")
MID = os.getenv("OPS_WU_LAOBAN_MID", "2400")
ADMIN_TOKEN = os.getenv("OPS_WU_LAOBAN_ADMIN_TOKEN", "")
DB_PATH = Path(__file__).parent.parent / "data" / "ops_dashboard.db"

START_DATE = datetime(2025, 1, 1)
END_DATE = datetime(2026, 6, 26)


def gen_applet_token(path):
    ts = str(int(time.time() * 1000))
    raw = f"{BASE_URL}{path}{ts}{BASE_URL}"
    return hashlib.md5(raw.encode()).hexdigest(), ts


def make_headers(path):
    token, ts = gen_applet_token(path)
    return {
        "Cookie": f"admin_token={ADMIN_TOKEN}",
        "applet-token": token,
        "mid": MID,
        "pageId": "100192",
        "timezone-offset": "28800000",
        "trace-id": f"backfill-{ts}",
    }, ts


def query_month_finance(year, month):
    """查询某月财务数据（含每天明细）"""
    path = "/admin/stats/finance"
    headers, ts = make_headers(path)
    
    # 计算月份范围
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, month + 1, 1) - timedelta(days=1)
    
    # 不超过END_DATE
    if end > END_DATE:
        end = END_DATE
    
    with httpx.Client(timeout=15, verify=False) as client:
        resp = client.get(
            f"{BASE_URL}{path}",
            headers=headers,
            params={
                "timestamp_private": ts,
                "isbrand": "0",
                "store": SID,
                "sids[]": SID,
                "date1": start.strftime("%Y%m%d"),
                "date2": end.strftime("%Y%m%d"),
            },
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        
        # nowList 含每天明细
        now_list = result.get("nowList", [])
        now_data = result.get("nowData", {})
        
        return {
            "daily_list": now_list,  # [{date: 20260601, amount: "274.5"}, ...]
            "summary": now_data,
        }


def query_month_orders(year, month):
    """查询某月订单统计"""
    path = "/admin/stats/orders"
    headers, ts = make_headers(path)
    
    start = datetime(year, month, 1)
    if month == 12:
        end = datetime(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = datetime(year, month + 1, 1) - timedelta(days=1)
    
    if end > END_DATE:
        end = END_DATE
    
    with httpx.Client(timeout=15, verify=False) as client:
        resp = client.get(
            f"{BASE_URL}{path}",
            headers=headers,
            params={
                "timestamp_private": ts,
                "isbrand": "0",
                "store": SID,
                "sids[]": SID,
                "date1": start.strftime("%Y%m%d"),
                "date2": end.strftime("%Y%m%d"),
            },
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        
        return {
            "order_num": result.get("order_num", 0),
            "uid_num": result.get("uid_num", 0),
            "user_new": result.get("user_new", 0),
            "re_person_num": result.get("re_person_num", 0),
        }


def save_to_db(conn, date_str, revenue, orders, customer_count, raw):
    """保存到 daily_snapshots"""
    avg_order_value = round(revenue / max(orders, 1), 2)
    
    raw_json = json.dumps({
        "source": "backfill",
        "finance": raw,
    }, ensure_ascii=False)
    
    conn.execute("""
        INSERT INTO daily_snapshots (business_type, platform, store_id, date, revenue, orders, usage_rate, customer_count, avg_order_value, raw_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_type, platform, store_id, date) DO UPDATE SET
            revenue = excluded.revenue,
            orders = excluded.orders,
            customer_count = excluded.customer_count,
            avg_order_value = excluded.avg_order_value,
            raw_json = excluded.raw_json
    """, (
        "mahjong", "wu_laoban", "feicuicheng", date_str,
        revenue, orders, 0, customer_count, avg_order_value,
        raw_json, datetime.now().isoformat()
    ))


def main():
    if not ADMIN_TOKEN:
        print("❌ 無老板token未配置，请检查 backend/.env")
        sys.exit(1)
    
    # 验证token
    print("🔍 验证無老板token...")
    try:
        test = query_month_finance(2026, 6)
        if not test["daily_list"]:
            print("❌ 无数据返回，token可能失效")
            sys.exit(1)
        print(f"✅ Token有效，6月数据: {len(test['daily_list'])}天")
    except Exception as e:
        print(f"❌ API异常: {e}")
        sys.exit(1)
    
    # 连接数据库
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_snapshots_unique 
        ON daily_snapshots(business_type, platform, store_id, date)
    """)
    conn.commit()
    
    # 按月回灌
    total_days = 0
    success = 0
    failed = 0
    
    current = START_DATE
    while current <= END_DATE:
        year = current.year
        month = current.month
        month_label = f"{year}-{month:02d}"
        
        print(f"\n📅 处理 {month_label}...")
        
        try:
            # 查询财务数据（含每天收入）
            finance = query_month_finance(year, month)
            
            # 查询订单统计（月度汇总，用于按天分摊）
            orders_data = query_month_orders(year, month)
            month_orders = orders_data.get("order_num", 0)
            month_customers = orders_data.get("uid_num", 0)
            
            daily_list = finance["daily_list"]
            if not daily_list:
                print(f"  ⏭️  {month_label}: 无数据")
                current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
                continue
            
            # 按天保存
            month_revenue_sum = sum(float(d.get("amount", 0)) for d in daily_list)
            
            for day_data in daily_list:
                date_int = day_data.get("date", 0)
                amount = float(day_data.get("amount", 0))
                
                date_str = f"{str(date_int)[:4]}-{str(date_int)[4:6]}-{str(date_int)[6:8]}"
                
                # 按收入比例分摊订单数和客户数
                if month_revenue_sum > 0:
                    ratio = amount / month_revenue_sum
                    day_orders = max(1, round(month_orders * ratio)) if amount > 0 else 0
                    day_customers = max(1, round(month_customers * ratio)) if amount > 0 else 0
                else:
                    day_orders = 0
                    day_customers = 0
                
                save_to_db(conn, date_str, amount, day_orders, day_customers, day_data)
                total_days += 1
                
                if amount > 0:
                    success += 1
                    print(f"  ✅ {date_str}: 收入=¥{amount:.2f}, 订单≈{day_orders}")
                else:
                    print(f"  ⏭️  {date_str}: 无数据")
            
            conn.commit()
            
        except Exception as e:
            failed += 1
            print(f"  ❌ {month_label}: {e}")
        
        # 下个月
        if month == 12:
            current = datetime(year + 1, 1, 1)
        else:
            current = datetime(year, month + 1, 1)
        
        time.sleep(0.5)  # 避免限流
    
    conn.close()
    
    print(f"\n{'='*50}")
    print(f"✅ 回灌完成!")
    print(f"  处理天数: {total_days}")
    print(f"  有数据: {success}天")
    print(f"  失败: {failed}月")


if __name__ == "__main__":
    main()
