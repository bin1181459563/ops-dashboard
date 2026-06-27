#!/usr/bin/env python3
"""
台球月度详细数据回灌脚本
存储：球桌排行、会员排行、VIP汇总、时段分布、充值统计、评论、经营汇总
时间范围：2025年1月 ~ 2026年6月
"""
import ssl
import httpx
import json
import sqlite3
import time
from datetime import datetime
from pathlib import Path

BASE_URL = "https://table-api.xironiot.com"
APP_ID = "0a60f00b28c849d3ac529994f98b825f"
NODE_ID = "b553e29d-a389-45c0-b10f-8b40be2a7e2c"
TOKEN_FILE = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"
DB_PATH = Path(__file__).parent.parent / "data" / "ops_dashboard.db"

ssl_ctx = ssl.create_default_context()
ssl_ctx.check_hostname = False
ssl_ctx.verify_mode = ssl.CERT_NONE


def get_token():
    return TOKEN_FILE.read_text().strip()


def make_headers(token):
    return {
        "Authorization": token,
        "Xi-App-Id": APP_ID,
        "xweb_xhr": "1",
        "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
        "Referer": "https://servicewechat.com/",
        "Accept": "*/*",
    }


def api_get(path, params, token):
    with httpx.Client(timeout=15, verify=ssl_ctx) as client:
        resp = client.get(f"{BASE_URL}{path}", headers=make_headers(token), params=params)
        resp.raise_for_status()
        return resp.json()


def cents(v):
    return round((v or 0) / 100, 2)


def query_month(token, year, month):
    """查询某月的所有详细数据"""
    start = f"{year}-{month:02d}-01T00:00:00+08:00"
    if month == 12:
        end_dt = datetime(year + 1, 1, 1)
    else:
        end_dt = datetime(year, month + 1, 1)
    end_dt = end_dt.replace(hour=23, minute=59, second=59)
    end = end_dt.strftime("%Y-%m-%dT%H:%M:%S+08:00")
    
    params_base = {"node_id": NODE_ID, "date_type": "2", "start_date": start, "end_date": end}
    result = {}
    
    # 1. 球桌排行
    data = api_get("/api/system/stat/dashboards/table_summary/", params_base, token)
    table_stats = []
    for item in data.get("Result", {}).get("node_table_stats", []):
        tbl = item.get("table", {})
        table_stats.append({
            "name": tbl.get("address", ""),
            "type": {1: "中式八球", 4: "包间"}.get(tbl.get("type"), "其他"),
            "orders": item.get("table_order_count", 0),
            "revenue": cents(item.get("table_order_payed")),
            "time_min": item.get("table_order_time", 0),
        })
    table_stats.sort(key=lambda x: x["revenue"], reverse=True)
    result["tables"] = table_stats
    
    # 2. 会员排行TOP50（按时长）
    data = api_get("/api/system/stat/dashboards/member_summary_v2/", {
        **params_base, "limit": "50", "order": "order_time", "order_direction": "desc",
    }, token)
    members = []
    for m in data.get("Results", []):
        member = m.get("member", {})
        social = member.get("social_user") or {}
        members.append({
            "name": social.get("nickname") or member.get("remark") or "未知",
            "phone": social.get("phone") or member.get("phone", ""),
            "orders": m.get("order_count", 0),
            "time_min": m.get("order_time", 0) or 0,
            "avg_time": m.get("avg_order_duration", 0) or 0,
            "revenue": cents(m.get("order_payed")),
        })
    result["members"] = members
    
    # 3. VIP汇总
    data = api_get("/api/system/stat/dashboards/vip_summary/", params_base, token)
    vip = data.get("Result", {})
    result["vip"] = {
        "count": vip.get("vip_count", 0),
        "balance": cents(vip.get("member_balance")),
        "total_payed": cents(vip.get("total_payed")),
        "total_give": cents(vip.get("total_give")),
    }
    
    # 4. 时段分布
    data = api_get("/api/system/stat/dashboards/time_summary/", params_base, token)
    time_data = data.get("Result", {})
    hourly = []
    for h in range(24):
        hourly.append({"hour": h, "orders": int(time_data.get(str(h), 0))})
    result["hourly"] = hourly
    
    # 5. 经营汇总
    data = api_get("/api/system/stat/dashboards/operate_summary/", params_base, token)
    ops = data.get("Result", {})
    result["operate"] = {
        "face_count": ops.get("face_count", 0),
        "new_face_count": ops.get("new_face_count", 0),
        "member_count": ops.get("member_count", 0),
        "new_member_count": ops.get("new_member_count", 0),
        "vip_count": ops.get("vip_count", 0),
    }
    
    # 6. 总汇总
    data = api_get("/api/system/stat/dashboards/new_summary/", params_base, token)
    summary = data.get("Result", {})
    result["summary"] = {
        "order_count": summary.get("order_count", 0),
        "order_payed": cents(summary.get("order_payed")),
        "face_count": summary.get("face_count", 0),
    }
    
    return result


def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS xiaotie_monthly (
            month TEXT PRIMARY KEY,
            total_orders INTEGER DEFAULT 0,
            total_revenue REAL DEFAULT 0,
            face_count INTEGER DEFAULT 0,
            new_face INTEGER DEFAULT 0,
            member_count INTEGER DEFAULT 0,
            new_member INTEGER DEFAULT 0,
            vip_count INTEGER DEFAULT 0,
            vip_balance REAL DEFAULT 0,
            vip_payed REAL DEFAULT 0,
            vip_give REAL DEFAULT 0,
            hourly_json TEXT,
            created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS xiaotie_table_ranking (
            month TEXT, rank INTEGER, table_name TEXT, table_type TEXT,
            orders INTEGER DEFAULT 0, revenue REAL DEFAULT 0, time_min INTEGER DEFAULT 0,
            PRIMARY KEY (month, rank)
        );
        CREATE TABLE IF NOT EXISTS xiaotie_member_ranking (
            month TEXT, rank INTEGER, nickname TEXT, phone TEXT,
            orders INTEGER DEFAULT 0, time_min INTEGER DEFAULT 0, avg_time REAL DEFAULT 0, revenue REAL DEFAULT 0,
            PRIMARY KEY (month, rank)
        );
        CREATE TABLE IF NOT EXISTS xiaotie_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, score TEXT, level TEXT, created_at TEXT, table_name TEXT
        );
        CREATE TABLE IF NOT EXISTS xiaotie_balance_stats (
            month TEXT PRIMARY KEY, balance REAL DEFAULT 0, recharge REAL DEFAULT 0,
            recharge_payed REAL DEFAULT 0, consume REAL DEFAULT 0
        );
    """)
    conn.commit()


def save_month(conn, year, month, data):
    month_str = f"{year}-{month:02d}"
    conn.execute("""
        INSERT OR REPLACE INTO xiaotie_monthly 
        (month, total_orders, total_revenue, face_count, new_face, member_count, 
         new_member, vip_count, vip_balance, vip_payed, vip_give, hourly_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        month_str, data["summary"]["order_count"], data["summary"]["order_payed"],
        data["operate"]["face_count"], data["operate"]["new_face_count"],
        data["operate"]["member_count"], data["operate"]["new_member_count"],
        data["vip"]["count"], data["vip"]["balance"], data["vip"]["total_payed"], data["vip"]["total_give"],
        json.dumps(data["hourly"]), datetime.now().isoformat(),
    ))
    for rank, t in enumerate(data["tables"], 1):
        conn.execute("INSERT OR REPLACE INTO xiaotie_table_ranking VALUES (?,?,?,?,?,?,?)",
                     (month_str, rank, t["name"], t["type"], t["orders"], t["revenue"], t["time_min"]))
    for rank, m in enumerate(data["members"], 1):
        conn.execute("INSERT OR REPLACE INTO xiaotie_member_ranking VALUES (?,?,?,?,?,?,?,?)",
                     (month_str, rank, m["name"], m["phone"], m["orders"], m["time_min"], m["avg_time"], m["revenue"]))
    conn.commit()


def main():
    token = get_token()
    print("🔍 验证token...")
    try:
        api_get("/api/system/stat/dashboards/new_summary/", {
            "node_id": NODE_ID, "date_type": "1",
            "start_date": "2026-06-20T00:00:00+08:00",
            "end_date": "2026-06-20T23:59:59+08:00",
        }, token)
        print("✅ Token有效")
    except Exception as e:
        print(f"❌ Token无效: {e}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    create_tables(conn)
    
    print("\n📊 开始回灌台球月度数据（2025-01 ~ 2026-06）")
    success = 0
    failed = 0
    
    for year in [2025, 2026]:
        end_month = 6 if year == 2026 else 12
        for month in range(1, end_month + 1):
            try:
                data = query_month(token, year, month)
                save_month(conn, year, month, data)
                success += 1
                print(f"  ✅ {year}-{month:02d}: {data['summary']['order_count']}单, ¥{data['summary']['order_payed']:.0f}, {data['operate']['face_count']}人")
            except Exception as e:
                failed += 1
                print(f"  ❌ {year}-{month:02d}: {e}")
            time.sleep(0.5)
    
    # 评论
    print("\n📝 查询用户评论...")
    try:
        data = api_get("/api/system/record/comments/", {"node_id": NODE_ID, "limit": "20", "ordering": "-created_at"}, token)
        for c in data.get("Results", []):
            conn.execute("INSERT INTO xiaotie_comments (content, score, level, created_at, table_name) VALUES (?,?,?,?,?)",
                        (c.get("content", ""), c.get("score", ""), c.get("level", ""), c.get("created_at", ""), c.get("table_name", "")))
        conn.commit()
        print(f"  ✅ 保存{len(data.get('Results', []))}条评论")
    except Exception as e:
        print(f"  ❌ 评论查询失败: {e}")
    
    # 充值统计
    print("\n💰 查询充值统计...")
    for year in [2025, 2026]:
        try:
            data = api_get("/api/system/stat/balance_stats/", {
                "node_id": NODE_ID, "date_type": "2", "limit": "100",
                "date__gte": f"{year}-01-01T00:00:00+08:00", "date__lt": f"{year}-12-31T23:59:59+08:00",
            }, token)
            for b in data.get("Results", []):
                month = (b.get("date") or "")[:7]
                conn.execute("INSERT OR REPLACE INTO xiaotie_balance_stats VALUES (?,?,?,?,?)",
                            (month, cents(b.get("balance")), cents(b.get("money")), cents(b.get("payed")), cents(b.get("consume_money"))))
            conn.commit()
            print(f"  ✅ {year}年: {len(data.get('Results', []))}个月")
        except Exception as e:
            print(f"  ❌ {year}年: {e}")
    
    conn.close()
    print(f"\n{'='*50}")
    print(f"✅ 回灌完成! 成功:{success}月 失败:{failed}月")


if __name__ == "__main__":
    main()
