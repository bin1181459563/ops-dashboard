# 翡翠城经营驾驶舱 - 项目分析文档

## 1. 项目概述

**项目名称**: 翡翠城经营驾驶舱 (ops-dashboard)  
**项目路径**: `/Users/Zhuanz/Desktop/codex/ops-dashboard/`  
**技术栈**: Next.js (前端) + FastAPI (后端) + SQLite (数据库)  
**目标**: 统一监控台球、棋牌、影院三条业务线的经营数据

---

## 2. 当前已完成页面

### 2.1 主驾驶舱页面 (`/dashboard`)
- 状态: ✅ 已完成
- 功能: 总览所有业务线数据

### 2.2 台球详情页 (`/dashboard/billiards`)
- 状态: ⚠️ 有token问题
- 功能: 台球业务详细数据

### 2.3 棋牌详情页 (`/dashboard/mahjong`)
- 状态: ✅ 已完成
- 功能: 棋牌业务详细数据

---

## 3. 每个页面的模块

### 3.1 主驾驶舱页面模块

| 模块 | 状态 | 数据来源 |
|------|------|----------|
| 总收入卡片 | ✅ 已修复 | 聚合所有可用真实API数据 |
| 台球收入卡片 | ❌ token失效 | 小铁API |
| 棋牌收入卡片 | ✅ 正常 | 無老板API |
| 影院卡片 | ✅ Excel导入版 | 凤凰云智Excel + daily_snapshots |
| 收入趋势图 | ✅ 正常 | SQLite历史数据 |
| 经营预警 | ✅ 正常 | 暂无异常 |
| 实时订单快照 | ⚠️ 无数据 | 需要接入订单流 |
| 数据源状态中心 | ✅ 新增 | 后端状态接口 |
| AI经营日报 | ✅ 新增 | 规则模板 + daily_snapshots |

### 3.2 台球详情页模块

| 模块 | 状态 | 数据来源 |
|------|------|----------|
| 经营统计(6维度) | ❌ token失效 | 小铁API new_summary |
| 环比数据 | ❌ token失效 | 小铁API |
| 球桌实时状态 | ❌ token失效 | 小铁API tables |
| 每桌收入排行 | ❌ token失效 | 小铁API table_summary |
| 会员消费TOP20 | ❌ token失效 | 小铁API member_summary_v2 |
| VIP汇总 | ❌ token失效 | 小铁API vip_summary |
| 时段分布 | ❌ token失效 | 小铁API time_summary |
| 经营汇总 | ❌ token失效 | 小铁API operate_summary |
| 充值统计 | ❌ token失效 | 小铁API balance_stats |
| 用户评论 | ❌ token失效 | 小铁API comments |
| 桌台异常 | ❌ token失效 | 小铁API |
| 微信支付投诉 | ❌ token失效 | 小铁API |

### 3.3 棋牌详情页模块

| 模块 | 状态 | 数据来源 |
|------|------|----------|
| 概览指标卡(4个) | ✅ 真实数据 | 無老板API |
| 经营统计(7维度) | ✅ 真实数据 | 無老板API stats/finance + stats/orders |
| 环比数据 | ✅ 真实数据 | 無老板API |
| 包间实时状态 | ✅ 真实数据 | 無老板API order/list |
| 收入构成 | ✅ 真实数据 | 無老板API stats/finance |
| 各包间收入排名 | ✅ 真实数据 | 無老板API stats/place |
| 用户排行榜(3维度) | ✅ 真实数据 | 無老板API user/ranking |
| 储值卡订单 | ✅ 真实数据 | 無老板API depositCard/order |
| 充值订单 | ✅ 真实数据 | 無老板API deposit/order |
| 优惠券列表 | ✅ 真实数据 | 無老板API coupon/list |
| 订单统计详情(4维度) | ✅ 真实数据 | 無老板API stats/orders |

### 3.4 影院详情页模块

| 模块 | 状态 | 数据来源 |
|------|------|----------|
| 顶部状态卡 | ✅ 已完成 | `GET /api/cinema/overview` |
| Excel上传区 | ✅ 已完成 | `POST /api/cinema/import-excel` |
| 缺失字段提示 | ✅ 已完成 | 后端解析结果 |
| 今日影院概览 | ✅ 已完成 | `daily_snapshots` |
| 7天/30天票房趋势 | ✅ 已完成 | `daily_snapshots.raw_json` |
| 影片票房排行 | ✅ 已完成 | `raw_json.films` |
| 影片人次排行 | ✅ 已完成 | `raw_json.films` |
| 场次和上座率分析 | ✅ 已完成 | `daily_snapshots` |
| 最近导入记录 | ✅ 已完成 | `sync_logs` |

---

## 4. 真实接口和假数据

### 4.1 真实数据 (来自API)

**棋牌业务 (無老板)**:
- 财务统计: `stats/finance` ✅
- 订单统计: `stats/orders` ✅
- 包间统计: `stats/place` ✅
- 用户统计: `stats/user` ✅
- 用户列表: `user/list` ✅
- 用户排行榜: `user/ranking` ✅
- 储值卡: `depositCard/*` ✅
- 充值: `deposit/*` ✅
- 优惠券: `coupon/list` ✅
- 美团团购: `meituan` ✅

**台球业务 (小铁)**:
- 所有API: ❌ token失效，需要重新抓取

**影院业务 (凤凰云智)**:
- Excel导入: ✅ 已完成第一版，支持 `.xlsx` / `.xls` / `.csv`
- API逆向: ⏸️ 暂不做

### 4.2 假数据/占位数据

- 影院数据: 未导入时明确显示“未导入”，不会伪装真实数据
- 主驾驶舱总收入: 已按可用真实API数据聚合，异常/占位平台不计入
- 实时订单快照: 暂无数据

---

## 5. 三个平台接入进度

### 5.1 凤凰云智 (影院)
- **状态**: ✅ Excel导入第一版已接入
- **数据**: 支持凤凰云智导出的经营报表上传
- **API**: 第一版不做逆向，后续如需要再评估
- **写入规则**: `business_type=cinema`、`platform=fenghuang`、`store_id=cinema_feicuicheng`
- **缺失字段处理**: 不因非日期字段缺失报错，会返回缺失字段提示；缺少日期无法写入快照，会返回明确错误

### 5.2 小铁台球
- **状态**: ⚠️ token失效
- **已完成**:
  - ✅ API逆向完成 (57个端点)
  - ✅ 采集器开发完成
  - ✅ 详情页开发完成
- **问题**: token每次开微信小程序会刷新
- **需要**: 重新抓取token

### 5.3 無老板棋牌
- **状态**: ✅ 完全接入
- **已完成**:
  - ✅ API破解完成 (MD5签名算法)
  - ✅ 采集器开发完成
  - ✅ 详情页开发完成 (11个模块)
  - ✅ 所有数据均为真实数据

---

## 6. 当前接口列表

### 6.1 后端API端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/overview` | GET | 总览数据 |
| `/api/token-status` | GET | Token状态检测 |
| `/api/trend/revenue` | GET | 收入趋势 |
| `/api/trend/orders` | GET | 订单趋势 |
| `/api/trend/hourly` | GET | 时段分布 |
| `/api/detail/xiaotie` | GET | 台球详情 |
| `/api/detail/wu_laoban` | GET | 棋牌详情 |
| `/api/collect/run` | POST | 手动触发采集 |
| `/api/data-sources/status` | GET | 数据源状态中心 |
| `/api/sync/logs` | GET | 同步日志，支持 `platform` 查询 |
| `/api/ai/daily-report` | GET | 规则版AI经营日报 |
| `/api/token/xiaotie/update` | POST | 更新小铁token文件 |
| `/api/cinema/import-excel` | POST | 上传凤凰云智Excel/CSV并写入影院快照 |
| `/api/cinema/overview` | GET | 影院概览，用于主驾驶舱和详情页状态 |
| `/api/cinema/detail` | GET | 影院详情，含趋势、影片排行、导入记录 |

### 6.2 無老板API端点 (已验证)

| 端点 | 说明 | 状态 |
|------|------|------|
| `/admin/stats/finance` | 财务统计 | ✅ |
| `/admin/stats/orders` | 订单统计 | ✅ |
| `/admin/stats/place` | 包间统计 | ✅ |
| `/admin/stats/user` | 用户统计 | ✅ |
| `/admin/user/list` | 用户列表 | ✅ |
| `/admin/user/ranking` | 用户排行榜 | ✅ |
| `/admin/order/list` | 订单列表 | ✅ |
| `/admin/depositCard/list` | 储值卡列表 | ✅ |
| `/admin/depositCard/order` | 储值卡订单 | ✅ |
| `/admin/deposit/list` | 充值列表 | ✅ |
| `/admin/deposit/order` | 充值订单 | ✅ |
| `/admin/coupon/list` | 优惠券列表 | ✅ |
| `/admin/meituan` | 美团团购 | ✅ |
| `/admin/workbench` | 工作台 | ✅ |

### 6.3 小铁API端点 (已验证，token失效)

| 端点 | 说明 | 状态 |
|------|------|------|
| `new_summary` | 经营统计 | ❌ token失效 |
| `tables` | 球桌列表 | ❌ token失效 |
| `table_summary` | 每桌统计 | ❌ token失效 |
| `member_summary_v2` | 会员排行 | ❌ token失效 |
| `vip_summary` | VIP汇总 | ❌ token失效 |
| `time_summary` | 时段分布 | ❌ token失效 |
| `operate_summary` | 经营汇总 | ❌ token失效 |
| `balance_stats` | 充值统计 | ❌ token失效 |
| `comments` | 用户评论 | ❌ token失效 |

---

## 7. 数据库结构

**数据库路径**: `data/ops_dashboard.db`

### 7.1 revenue 表 (收入)
```sql
CREATE TABLE revenue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,      -- 平台: xiaotie/wu_laoban
    store_id TEXT NOT NULL,      -- 店铺ID
    revenue REAL NOT NULL,       -- 收入金额
    time TEXT NOT NULL,          -- 时间戳
    source TEXT NOT NULL DEFAULT 'api'  -- 数据来源
);
```

### 7.2 orders 表 (订单)
```sql
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    store_id TEXT NOT NULL,
    orders INTEGER NOT NULL,     -- 订单数
    time TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'api'
);
```

### 7.3 usage 表 (使用率)
```sql
CREATE TABLE usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    store_id TEXT NOT NULL,
    usage_rate REAL NOT NULL,    -- 使用率
    time TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'api'
);
```

### 7.4 alerts 表 (预警)
```sql
CREATE TABLE alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    store_id TEXT NOT NULL,
    alert_type TEXT NOT NULL,    -- 预警类型
    message TEXT NOT NULL,       -- 预警消息
    level TEXT NOT NULL,         -- 预警级别
    time TEXT NOT NULL
);
```

### 7.5 sync_logs 表 (同步日志)
```sql
CREATE TABLE sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    business_type TEXT,
    store_id TEXT NOT NULL,
    status TEXT NOT NULL,       -- success/failed/token_invalid/skipped
    message TEXT,
    file_name TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER,
    records_count INTEGER DEFAULT 0
);
```

### 7.6 daily_snapshots 表 (每日经营快照)
```sql
CREATE TABLE daily_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_type TEXT NOT NULL,
    platform TEXT,
    store_id TEXT NOT NULL,
    date TEXT NOT NULL,
    revenue REAL DEFAULT 0,
    orders INTEGER DEFAULT 0,
    usage_rate REAL DEFAULT 0,
    customer_count INTEGER DEFAULT 0,
    avg_order_value REAL DEFAULT 0,
    raw_json TEXT,
    created_at TEXT NOT NULL
);
```

同一天、同平台、同业务通过唯一索引更新同一条快照，避免重复堆积。

---

## 8. 工程目录结构

```
ops-dashboard/
├── backend/                    # 后端 (FastAPI)
│   ├── app/
│   │   ├── api/routes/        # API路由
│   │   │   ├── overview.py    # 总览
│   │   │   ├── detail.py      # 详情
│   │   │   ├── trend.py       # 趋势
│   │   │   ├── alerts.py      # 预警
│   │   │   ├── collect.py     # 采集
│   │   │   ├── cinema.py      # 影院Excel导入/概览/详情
│   │   │   ├── data_sources.py # 数据源状态
│   │   │   ├── sync_logs.py    # 同步日志
│   │   │   ├── ai_report.py    # AI日报
│   │   │   └── realtime.py    # 实时
│   │   ├── core/              # 核心模块
│   │   │   ├── config.py      # 配置
│   │   │   ├── database.py    # 数据库
│   │   │   └── scheduler.py   # 调度器
│   │   ├── services/          # 业务逻辑
│   │   │   ├── collectors/    # 采集器
│   │   │   │   ├── xiaotie.py     # 小铁采集器
│   │   │   │   └── wu_laoban.py   # 無老板采集器
│   │   │   ├── detail_xiaotie.py      # 台球详情
│   │   │   ├── detail_wu_laoban.py    # 棋牌详情
│   │   │   ├── cinema_excel.py        # 影院Excel解析和快照服务
│   │   │   ├── ai_report.py           # 规则版日报生成
│   │   │   ├── aggregator.py          # 数据聚合
│   │   │   └── alerts.py              # 预警逻辑
│   │   ├── models/            # 数据模型
│   │   └── tasks/             # 定时任务
│   ├── tests/                 # 测试
│   └── .env                   # 环境变量
│
├── frontend/                   # 前端 (Next.js)
│   ├── src/
│   │   ├── pages/             # 页面
│   │   │   ├── index.tsx      # 首页
│   │   │   ├── dashboard.tsx  # 主驾驶舱
│   │   │   └── dashboard/
│   │   │       ├── billiards.tsx   # 台球详情
│   │   │       ├── cinema.tsx      # 影院Excel导入详情
│   │   │       └── mahjong.tsx     # 棋牌详情
│   │   ├── components/        # 组件
│   │   │   └── dashboard/
│   │   │       ├── MetricCards.tsx         # 指标卡
│   │   │       ├── RevenueTrendChart.tsx   # 趋势图
│   │   │       ├── AlertPanel.tsx          # 预警面板
│   │   │       ├── OrderFeed.tsx           # 订单流
│   │   │       ├── TopBar.tsx              # 顶栏
│   │   │       ├── XiaotieDetailModal.tsx  # 台球弹窗
│   │   │       └── WuLaobanDetailModal.tsx # 棋牌弹窗
│   │   ├── lib/               # 工具库
│   │   │   └── dashboardApi.ts    # API调用
│   │   └── types/             # 类型定义
│   │       └── dashboard.ts
│   └── public/                # 静态资源
│
├── data/                       # 数据
│   └── ops_dashboard.db       # SQLite数据库
│
├── scripts/                    # 脚本
│   └── capture_xiaotie_token.py   # token抓取
│
└── start.sh                    # 启动脚本
```

---

## 9. 当前问题

### 9.1 严重问题

1. **小铁台球token失效**
   - 影响: 台球详情页所有数据无法显示
   - 原因: token每次开微信小程序会刷新
   - 现状: 后端会写入 `token_invalid` 同步日志和预警；前端明确提示重新抓取token
   - 解决: 需要重新用mitmproxy抓取token，并通过 `/api/token/xiaotie/update` 写入

### 9.2 中等问题

2. **实时订单快照暂无数据**
   - 影响: 主驾驶舱订单流为空
   - 原因: 还没有接入稳定订单流
   - 解决: 后续从棋牌/台球订单接口落地实时订单表

3. **前端服务频繁挂死**
   - 影响: 页面打不开
   - 原因: Next.js编译大文件时卡住
   - 解决: 已配置launchd自动重启

4. **包间排名今日数据为0**
   - 影响: 棋牌详情页今日包间数据不准确
   - 原因: 無老板统计API数据同步延迟
   - 解决: 已改为从订单列表聚合

5. **凤凰云智真实Excel样例尚未验证**
   - 影响: 字段别名已做容错，但真实导出格式可能存在标题行、合并单元格或字段命名差异
   - 现状: CSV/XLSX/XLS解析链路和缺失字段提示已完成
   - 解决: 拿到真实报表后补充字段别名或表头识别规则

### 9.3 轻微问题

5. **部分API不支持时间筛选**
   - 影响: 优惠券/储值卡/充值订单无法按时间维度切换
   - 原因: API本身不支持
   - 解决: 保持现状，显示累计数据

---

## 10. 下一步计划

### 10.1 高优先级

1. **重新抓取小铁台球token**
   - 使用mitmproxy抓包
   - 更新 `~/.hermes/workspace/xiaotie-token.txt`
   - 或调用 `/api/token/xiaotie/update` 写入新token

2. **凤凰云智Excel样例校准**
   - 使用真实导出报表验证字段映射
   - 根据真实表头补充别名

### 10.2 中优先级

3. **真正AI模型接入**
   - 当前日报为规则模板
   - 后续可基于 `daily_snapshots`、`sync_logs`、`alerts` 调用大模型生成分析

4. **优化台球详情页**
   - 与棋牌详情页保持一致的模块
   - 添加用户排行榜、储值卡等模块

### 10.3 低优先级

5. **添加更多数据维度**
   - 员工绩效分析
   - 会员生命周期分析
   - 预测性分析

6. **移动端适配**
   - 响应式设计
   - 微信小程序嵌入

---

## 11. V3 更新摘要（2026-06-20）

### 11.1 本次新增功能
- 主驾驶舱聚合逻辑升级：只计入可用真实API平台，异常/占位平台进入未计入清单。
- 数据源状态中心：显示無老板棋牌、小铁台球、凤凰云智影院的状态、来源、最后同步和错误原因。
- 同步日志：每次采集都会写入 `sync_logs`，包括 success、failed、token_invalid、skipped。
- 每日经营快照：成功采集后写入/更新 `daily_snapshots`，为AI日报和趋势分析提供稳定底座。
- 小铁token管理：保留 `~/.hermes/workspace/xiaotie-token.txt`，新增token状态检测和更新接口。
- AI经营日报第一版：使用规则模板生成日报，不编造缺失数据，支持前端一键复制。
- 预警类型升级：新增 `token_invalid`、`sync_failed`、`stale_data`、`revenue_drop`、`usage_low`。

### 11.2 新增接口
- `GET /api/data-sources/status`
- `GET /api/sync/logs?platform=wu_laoban`
- `GET /api/ai/daily-report`
- `POST /api/token/xiaotie/update`

### 11.3 新增数据库表
- `sync_logs`
- `daily_snapshots`

### 11.4 已解决问题
- 主驾驶舱总收入不再因为台球token失效整体显示“无”。
- 棋牌正常时，总收入仍可显示棋牌收入。
- 台球token失效、影院未接入均在前端明确标记，不伪装成真实数据。
- 手动采集按平台隔离，单个平台失败不会阻断其他平台。
- 棋牌成功采集后会生成每日经营快照。

### 11.5 仍然遗留的问题
- 小铁token仍需要重新抓取，台球真实数据暂不可恢复。
- 凤凰云智影院已完成Excel导入第一版，但还未用真实导出样例做字段校准。
- 实时订单快照还没有稳定订单流数据。
- 当前AI日报是规则模板，尚未调用真正大模型。

### 11.6 下一步建议
- 优先重新抓取小铁token，并通过 `/api/token/xiaotie/update` 更新。
- 准备凤凰云智Excel导入模板，先用文件导入打通影院数据。
- 在 `daily_snapshots` 数据稳定后接入真正AI模型，生成更细的经营分析和建议。

---

## 12. V4 更新摘要（2026-06-20）

### 12.1 本次新增功能
- 新增影院Excel导入接口，支持 `.xlsx` / `.xls` / `.csv`。
- 自动解析日期、票房收入、观影人次、场次数、上座率、卖品收入、影片名称、影片票房、影片人次。
- 导入成功后写入 `daily_snapshots`，同一天同平台同门店使用 upsert，不重复插入。
- 原始解析结果保存到 `daily_snapshots.raw_json`，用于影片排行和后续审计。
- 每次导入都会写入 `sync_logs`，成功和失败都记录，`platform=fenghuang`、`business_type=cinema`。
- 新增影院概览和详情接口，供主驾驶舱和 `/dashboard/cinema` 使用。
- 主驾驶舱影院卡片从占位改为“未导入/已导入/导入失败”状态；已导入时计入总收入，未导入时不影响棋牌和台球。
- 数据源状态中心新增影院Excel状态。

### 12.2 新增/变更接口
- `POST /api/cinema/import-excel`
- `GET /api/cinema/overview`
- `GET /api/cinema/detail`
- `GET /api/data-sources/status` 增加凤凰云智影院状态
- `GET /api/overview` 增加影院Excel数据聚合

### 12.3 数据库变化
- `sync_logs` 新增兼容迁移列：`business_type`、`file_name`
- `daily_snapshots.customer_count` 在影院导入时写入观影人次
- `daily_snapshots.avg_order_value` 影院按 `总收入 / 观影人次` 计算

### 12.4 新增前端页面
- `/dashboard/cinema`
  - 状态卡
  - Excel上传区
  - 缺失字段提示
  - 今日影院概览
  - 7天/30天票房趋势
  - 影片票房/人次排行
  - 场次和上座率分析
  - 导入记录

### 12.5 遗留问题
- 已拿到并校准 2026-06 真实凤凰云智样例；后续如报表模板变化，字段别名可能还需补充。
- 第一版不做凤凰云智API逆向、复杂排片分析、会员画像。
- 影院趋势依赖历史导入积累，刚导入一天时趋势只有一个点。

### 12.6 真实样例校准（2026-06-20）
- 只导入 `SFC上影国际影城翡翠城店`，过滤同表中的 `成都上影国际影城创意山店`。
- 兼容凤凰云智导出的异常 xlsx：`dimension ref="A1"` 但实际 `sheetData` 有多行多列，后端会重置 worksheet 维度后读取。
- 已识别真实营运综合表头：`营业日期`、`影院`、`场次数`、`观影总人数`、`上座率%`、`票房总收入`、`卖品总收入`。
- 已识别真实影片成绩表头：`影院名称`、`影片名称`、`票房（元）`、`人次`、`场次`。
- 影片成绩排名表没有单日日期时，使用文件名日期范围结束日作为快照日期。
- 卖品销售明细按同日多笔销售求和；日汇总报表中的重复汇总值不会因影片拆分行重复累加。
- 影院概览和主驾驶舱只展示不晚于当前日期的最新快照，避免导出范围包含未来日期时误取未来低值。
- 影院详情页新增营业日期筛选：昨日、前天、今日、近7天、近30天、自定义日期；默认展示昨日，避免今天未闭店时数据偏低。
- `GET /api/cinema/overview` 支持 `date=YYYY-MM-DD`；`GET /api/cinema/detail` 支持 `date=YYYY-MM-DD&days=7|30`。
- 影院导入会识别报表类型：营运综合报表写入日经营汇总，影片成绩排名表补充影片排行并按影片名聚合，不覆盖同日营运汇总。
- 影院详情页新增影片名称筛选框，可按影片名过滤票房/人次排行。

---

## 附录: 页面截图说明

### A.1 主驾驶舱页面
- 位置: `/dashboard`
- 截图: 主驾驶舱截图
- 说明: 深色主题，4个指标卡 + 趋势图 + 预警 + 订单流

### A.2 台球详情页
- 位置: `/dashboard/billiards`
- 截图: 台球详情截图
- 说明: 显示token失效错误，需要重新抓取

### A.3 棋牌详情页
- 位置: `/dashboard/mahjong`
- 截图: 棋牌详情截图
- 说明: 11个模块全部正常显示，数据均为真实数据

---

**文档生成时间**: 2026-06-19  
**最近更新**: 2026-06-20  
**项目状态**: V4 影院Excel导入第一版已完成基础实现  
**维护人**: 翡翠城运营团队
