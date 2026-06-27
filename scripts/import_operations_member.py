#!/usr/bin/env python3
"""
导入营运综合报表、会员开卡、会员充值数据到 daily_snapshots
正确的导入顺序：先营运综合，再会员充值，最后会员开卡
"""
import sys
import json
import sqlite3
from datetime import datetime

sys.path.insert(0, '/Users/Zhuanz/Desktop/codex/ops-dashboard/backend')
from app.services.cinema_excel import parse_cinema_file

DB_PATH = '/Users/Zhuanz/Desktop/codex/ops-dashboard/data/ops_dashboard.db'
BUSINESS_TYPE = 'cinema'
PLATFORM = 'fenghuang'
STORE_ID = 'cinema_feicuicheng'

# 先导入营运综合报表（核心数据），再导入会员数据
files = [
    ('营运综合报表', '/Users/Zhuanz/.hermes-web-ui/upload/default/7022b71dc247172f.xlsx', '影院营运综合报表2026-01-01至2026-06-27.xlsx'),
    ('会员充值明细', '/Users/Zhuanz/.hermes-web-ui/upload/default/dc0a6449b444fb6d.xlsx', '会员卡充值明细查询2026-01-01至2026-06-27.xlsx'),
    ('会员开卡明细', '/Users/Zhuanz/.hermes-web-ui/upload/default/bd345005cbf73dfc.xlsx', '会员卡开卡明细查询2026-01-01至2026-06-27.xlsx'),
]

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
now = datetime.now().isoformat()

for name, path, filename in files:
    print(f'\n=== 导入 {name} ===')
    try:
        with open(path, 'rb') as f:
            file_bytes = f.read()
        
        parsed = parse_cinema_file(file_bytes, filename)
        report_type = parsed['report_type']
        print(f'  报表类型: {report_type}')
        print(f'  快照数量: {len(parsed["snapshots"])}')
        
        success = 0
        for snapshot in parsed['snapshots']:
            date_str = snapshot['date']
            incoming_raw = snapshot['raw']
            incoming_summary = incoming_raw.get('summary', {})
            
            # 查询已有数据
            existing = conn.execute(
                "SELECT raw_json, revenue, orders, customer_count FROM daily_snapshots "
                "WHERE business_type=? AND platform=? AND store_id=? AND date=?",
                (BUSINESS_TYPE, PLATFORM, STORE_ID, date_str)
            ).fetchone()
            
            if existing and existing['raw_json']:
                existing_raw = json.loads(existing['raw_json'])
                existing_summary = existing_raw.get('summary', {})
                
                # 保留已有的 report_type（operations 优先）
                existing_report_type = existing_raw.get('report_type', '')
                final_report_type = existing_report_type if existing_report_type == 'operations' else report_type
                
                # 合并 summary - operations 数据优先
                merged_summary = {**existing_summary}
                
                # 如果是 operations 报表，用新数据覆盖核心字段
                if report_type == 'operations':
                    for key in ['box_office', 'concession_revenue', 'customer_count', 'screenings', 'occupancy_rate', 'member_consume']:
                        if incoming_summary.get(key, 0) > 0:
                            merged_summary[key] = incoming_summary[key]
                
                # 合并会员充值/开卡数据（累加到已有数据）
                if report_type == 'member_recharge':
                    merged_summary['member_recharge_total'] = incoming_summary.get('member_recharge_total', 0)
                    existing_raw['member_recharge_items'] = incoming_raw.get('member_recharge_items', [])
                elif report_type == 'member_open_card':
                    merged_summary['member_open_card_total'] = incoming_summary.get('member_open_card_total', 0)
                    existing_raw['member_open_card_items'] = incoming_raw.get('member_open_card_items', [])
                
                # 重新计算 revenue
                box_office = merged_summary.get('box_office', 0)
                concession = merged_summary.get('concession_revenue', 0)
                merged_summary['revenue'] = round(box_office + concession, 2)
                
                existing_raw['summary'] = merged_summary
                existing_raw['report_type'] = final_report_type
                existing_raw['file_name'] = filename
                
                final_raw = existing_raw
                final_revenue = merged_summary.get('revenue', 0)
                final_orders = existing['orders'] if existing['orders'] > 0 else snapshot['orders']
                final_customer = existing['customer_count'] if existing['customer_count'] > 0 else snapshot['customer_count']
            else:
                final_raw = incoming_raw
                final_revenue = snapshot['revenue']
                final_orders = snapshot['orders']
                final_customer = snapshot['customer_count']
            
            final_raw_json = json.dumps(final_raw, ensure_ascii=False)
            
            conn.execute("""
                INSERT INTO daily_snapshots (business_type, platform, store_id, date, revenue, orders, customer_count, raw_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(business_type, platform, store_id, date) DO UPDATE SET
                    revenue = excluded.revenue,
                    orders = excluded.orders,
                    customer_count = excluded.customer_count,
                    raw_json = excluded.raw_json,
                    created_at = excluded.created_at
            """, (
                BUSINESS_TYPE, PLATFORM, STORE_ID, date_str,
                final_revenue, final_orders, final_customer,
                final_raw_json, now,
            ))
            success += 1
        
        conn.commit()
        print(f'  ✅ 导入成功: {success} 天')
        
    except Exception as e:
        print(f'  ❌ 导入失败: {e}')
        import traceback
        traceback.print_exc()

# 验证结果
print('\n=== 验证导入结果 ===')
result = conn.execute("""
    SELECT 
        json_extract(raw_json, '$.report_type') as report_type,
        COUNT(*) as days,
        MIN(date) as start_date,
        MAX(date) as end_date,
        SUM(json_extract(raw_json, '$.summary.box_office')) as total_box,
        SUM(json_extract(raw_json, '$.summary.concession_revenue')) as total_concession,
        SUM(json_extract(raw_json, '$.summary.member_recharge_total')) as total_recharge,
        SUM(json_extract(raw_json, '$.summary.member_open_card_total')) as total_open_card
    FROM daily_snapshots 
    WHERE business_type='cinema'
    GROUP BY report_type
    ORDER BY days DESC
""").fetchall()

for row in result:
    print(f'  {row["report_type"]}: {row["days"]}天 ({row["start_date"]} ~ {row["end_date"]})')
    print(f'    票房: ¥{row["total_box"] or 0:,.0f}, 卖品: ¥{row["total_concession"] or 0:,.0f}')
    if row['total_recharge']:
        print(f'    会员充值: ¥{row["total_recharge"]:,.0f}')
    if row['total_open_card']:
        print(f'    会员开卡: ¥{row["total_open_card"]:,.0f}')

conn.close()
