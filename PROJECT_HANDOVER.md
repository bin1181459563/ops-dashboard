# 翡翠城经营驾驶舱 — 工程交接文档

> 生成时间: 2026-06-20  
> 项目路径: `/Users/Zhuanz/Desktop/codex/ops-dashboard/`

---

## 1. 项目概览

多业务统一经营驾驶舱，覆盖三条业务线：

| 业务 | 平台 | 状态 |
|------|------|------|
| 台球 | 小铁 (table-api.xironiot.com) | ✅ 已接入 (token 失效中) |
| 棋牌 | 無老板 (admin.5laoban.com) | ✅ 已接入，真实数据 |
| 影院 | 凤凰云智 (Excel 导入) | ✅ 已接入，需按顺序重新导入 |

---

## 2. 当前已完成功能

### 主驾驶舱 `/dashboard`
- [x] 4 指标卡（台球+棋牌总收入/订单）
- [x] ECharts 收入趋势图（7天/30天切换）
- [x] 预警面板 + 订单流
- [x] 手动刷新（无自动刷新）
- [x] Token 失效状态检测 (`/api/token-status`)

### 台球详情页 `/dashboard/billiards`
- [x] 经营统计 6 Tab（今日/昨日/本周/上周/本月/上月）
- [x] 2×2 指标卡（总营业额/平台创收/实收/订单数）+ 环比
- [x] 球桌实时状态（13桌，使用中/空闲）
- [x] 每桌收入排行（今日/本月/本年）
- [x] 会员消费 TOP20（今日/本周/本月/本年）
- [x] VIP 汇总、时段分布、充值统计
- [x] 用户评论、桌台异常、微信支付投诉

### 棋牌详情页 `/dashboard/mahjong`
- [x] 概览指标卡（今日收入/本月收入/包间状态/今日订单）
- [x] 经营统计 7 Tab + 4 指标卡 + 环比
- [x] 包间实时状态（6 间：财八筒/怪叫胡/杠上花/喵将台/连庄阁/胡牌院）
- [x] 收入构成（今日/本月/本年，微信/支付宝/美团/会员卡/团购/现金/其他）
- [x] 各包间收入排名（今日/月/年）
- [x] 用户排行榜（本周/本月/总榜）
- [x] 储值卡订单、充值订单、优惠券
- [x] 订单统计详情（日/周/月/年，复购/首单/均价/时长）

### 影院详情页 `/dashboard/cinema`
- [x] 4 张报表导入（营运综合 + 影片排名 + 卖品明细 + 会员明细）
- [x] 指标卡（票房/卖品/总收入/观影人次）
- [x] 时间选择器（昨日/前天/今日/本周/本月 + 自定义日期）
- [x] 卖品大类详情（大类占比 + TOP10 单品）
- [x] 影片票房/人次排行（支持搜索筛选）
- [x] 7天/30天票房趋势柱状图
- [x] 场次和上座率分析表
- [x] 导入面板 + 导入记录
- [ ] ~~会员消费详情~~ — 用户要求移除，组件已删除（后端端点保留）

### 卖品详情页 `/dashboard/concession`
- [x] 时间切换（今日/本周/本月）
- [x] 卖品类别排行表（12 类）
- [x] 娱乐项目独立展示
- [x] 卖品 TOP50 表
- [x] 类别筛选按钮

---

## 3. 技术架构

### 前端

| 项 | 值 |
|----|-----|
| 框架 | Next.js 14.2.35 + React 18.3.1 |
| 语言 | TypeScript 5.9 |
| 样式 | styled-jsx + globals.css（暗色主题 `--bg: #071015`） |
| 图表 | ECharts 5.5 |
| HTTP | axios |
| 端口 | 9100 |
| 启动 | `NODE_ENV=development npm run dev` |

### 后端

| 项 | 值 |
|----|-----|
| 框架 | FastAPI |
| 语言 | Python 3.12+ |
| 数据库 | SQLite (`data/ops_dashboard.db`) |
| 调度 | APScheduler |
| Excel 解析 | openpyxl + xlrd |
| 端口 | 8000 |
| 启动 | `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000` |

### 数据源

| 平台 | 认证方式 | 数据获取 |
|------|----------|----------|
| 小铁台球 | JWT token（手机 mitmproxy 抓取） | API 实时拉取 |
| 無老板棋牌 | Cookie + MD5 签名 token | API 实时拉取 |
| 凤凰云智影院 | 无（手动上传 Excel） | Excel 解析导入 |

### 数据库表

```sql
-- 时序数据（台球/棋牌采集）
revenue(platform, store_id, revenue, time, source)
orders(platform, store_id, orders, time, source)
usage(platform, store_id, usage_rate, time, source)
alerts(platform, store_id, alert_type, message, level, time)

-- 采集日志
sync_logs(platform, business_type, store_id, status, message, file_name, started_at, ...)

-- 影院每日快照（核心表，含 raw_json）
daily_snapshots(business_type, platform, store_id, date, revenue, orders, 
                usage_rate, customer_count, avg_order_value, raw_json)
-- UNIQUE(business_type, platform, store_id, date)
```

**当前数据量:**
- billiards: 2 条快照 (2026-06-19 ~ 06-20)
- mahjong: 2 条快照 (2026-06-19 ~ 06-20)
- cinema: 21 条快照 (2026-06-01 ~ 06-21)

---

## 4. API 端点清单

### 后端 API（共 25 个）

| 方法 | 路径 | 文件 | 说明 |
|------|------|------|------|
| GET | `/health` | main.py | 健康检查 |
| GET | `/api/overview` | overview.py | 总览（台球+棋牌汇总） |
| GET | `/api/token-status` | overview.py | Token 有效性检测 |
| POST | `/api/token/xiaotie/update` | overview.py | 更新小铁 token |
| GET | `/api/revenue/realtime` | realtime.py | 实时收入 |
| GET | `/api/orders/realtime` | realtime.py | 实时订单 |
| GET | `/api/orders/snapshots` | realtime.py | 订单快照 |
| GET | `/api/usage/realtime` | realtime.py | 实时使用率 |
| GET | `/api/alerts` | alerts.py | 预警列表 |
| POST | `/api/collect/run` | collect.py | 手动触发采集 |
| GET | `/api/trend/revenue` | trend.py | 收入趋势（7/30天） |
| GET | `/api/trend/orders` | trend.py | 订单趋势 |
| GET | `/api/trend/hourly` | trend.py | 按小时分布 |
| GET | `/api/detail/xiaotie` | detail.py | 台球全量详情 |
| GET | `/api/detail/wu_laoban` | detail.py | 棋牌全量详情 |
| POST | `/api/cinema/import-excel` | cinema.py | Excel 导入 |
| GET | `/api/cinema/overview` | cinema.py | 影院概览 |
| GET | `/api/cinema/detail` | cinema.py | 影院详情（趋势+影片） |
| GET | `/api/cinema/concession` | concession.py | 卖品详情（大类+单品） |
| GET | `/api/cinema/concession/categories` | concession.py | 卖品类别列表 |
| GET | `/api/cinema/member` | concession.py | 会员消费详情 |
| GET | `/api/cinema/member/categories` | concession.py | 会员消费类别 |
| GET | `/api/data-sources/status` | data_sources.py | 数据源状态 |
| GET | `/api/sync/logs` | sync_logs.py | 同步日志 |
| GET | `/api/ai/daily-report` | ai_report.py | AI 日报 |

### 外部 API（小铁台球）

| 端点 | 说明 | 备注 |
|------|------|------|
| `new_summary` | 经营统计（小程序同款） | ⚠️ 用这个，不用 `summary` |
| `tables` | 球桌列表+实时状态 | |
| `table_summary` | 每桌统计 | 需 `date_type` + `start_date/end_date` |
| `member_summary_v2` | 会员消费排行 | 响应用 `Results` 不是 `Result` |
| `vip_summary` | VIP 汇总 | |
| `operate_stats` | 每日经营明细 | |
| `operate_summary` | 经营汇总 | |
| `balance_stats` | 充值统计 | |
| `time_summary` | 订单时长分布 | |
| `comments` | 用户评论 | 字段是 `created_at` 不是 `created` |

### 外部 API（無老板棋牌）

| 端点 | 说明 | 备注 |
|------|------|------|
| `/admin/stats/finance` | 财务统计 | 微信是 `wx` 不是 `wechat` |
| `/admin/stats/orders` | 订单统计 | 数据在 `result.nowData`/`lastData` |
| `/admin/stats/place` | 包间统计 | 今日数据可能为 0 |
| `/admin/stats/user` | 用户统计 | |
| `/admin/user/list` | 用户列表 | `money` 字段不准确 |
| `/admin/user/ranking` | 用户排行榜 | `type`: week_time/month_time/total_time |
| `/admin/order/list` | 订单列表 | `pay_price` = 实付金额 |
| `/admin/depositCard/list` | 储值卡列表 | 5 种卡 |
| `/admin/depositCard/order` | 储值卡订单 | |
| `/admin/deposit/order` | 充值订单 | `pay_price`=金额, `price`=套餐描述 |
| `/admin/coupon/list` | 优惠券列表 | 不支持时间筛选 |
| `/admin/meituan` | 美团团购 | |

### 影院数据结构示例（raw_json）

```json
{
  "report_type": "operations",
  "date": "2026-06-19",
  "summary": {
    "box_office": 9855.0,
    "concession_revenue": 2643.1,
    "customer_count": 322,
    "screenings": 56,
    "occupancy_rate": 0.082,
    "member_consume": 1744.0,
    "revenue": 12498.1,
    "avg_order_value": 38.81
  },
  "films": [
    {"film_name": "给阿嬷的情书", "film_box_office": 22772.5, "film_attendance": 814}
  ],
  "concession_items": [
    {"item_name": "30暑期套餐", "category": "活动", "quantity": 6, "revenue": 180.0}
  ],
  "member_items": [
    {"member_id": "1003315000101006", "product_type": "影票", "product_name": "电影票", "amount": 38.0}
  ]
}
```

---

## 5. 未完成功能清单（按优先级）

### P0 — 必须做

| # | 功能 | 说明 |
|---|------|------|
| 1 | 影院数据重新导入 | 2026-06-20 清空了所有快照（导入顺序错误），需按正确顺序重导 4 张报表 |
| 2 | 小铁 token 续期 | 当前 token 失效，台球详情页数据全无。需要手机 mitmproxy 重新抓取 |

### P1 — 重要

| # | 功能 | 说明 |
|---|------|------|
| 3 | 主驾驶舱影院卡片 | 影院导入数据后，主驾驶舱应显示影院收入卡片 |
| 4 | 影院数据自动采集 | 当前靠手动上传 Excel，可考虑定时从凤凰云智抓取 |
| 5 | 会员消费前端恢复 | 后端 `/api/cinema/member` 可用，前端组件已移除，可按需恢复 |

### P2 — 优化

| # | 功能 | 说明 |
|---|------|------|
| 6 | 小铁 token 自动续期 | 目前需手动抓取，可研究 refresh_token 机制 |
| 7 | 影院 ECharts 趋势图 | 当前是简易柱状图，可升级为 ECharts 多轴折线图 |
| 8 | 移动端适配 | 响应式布局 |
| 9 | 台球/棋牌详情页数据持久化 | 当前每次打开都实时拉取，可加本地缓存 |

---

## 6. 已知 Bug / 风险点

### 严重

| # | 问题 | 影响 | 状态 |
|---|------|------|------|
| 1 | 小铁 token 失效 | 台球详情页全部数据为 0 | ⚠️ 待用户重新抓取 |
| 2 | 影院快照已清空 | 影院详情页无数据 | ⚠️ 待用户重新导入 4 张报表 |
| 3 | Next.js 无 proxy 配置 | 页面内用 `fetch('/api/...')` 会返回 HTML 不是 JSON | ✅ 已修复：改用 `dashboardApi.ts` 函数 |

### 中等

| # | 问题 | 影响 |
|---|------|------|
| 4 | 無老板统计 API 今日延迟 | `/admin/stats/place` 和 `/admin/stats/orders` 今日可能返回 0 |
| 5 | 前端进程卡死 | Next.js dev server 编译大文件时 CPU 飙升，页面卡在 "Compiling..." |
| 6 | `NODE_ENV=production` | 全局设置了 production，Next.js dev 需要 `NODE_ENV=development` |
| 7 | 影院导入顺序敏感 | 必须营运综合 → 影片排名 → 卖品明细 → 会员明细 |

### 低

| # | 问题 |
|---|------|
| 8 | 小铁 `summary` 端点今日返回 0（已弃用，改用 `new_summary`） |
| 9 | 無老板 `user/list` 的 `money` 字段不准确 |
| 10 | 無老板 `user_name` 含 HTML 标签需 strip |
| 11 | 储值卡/充值订单不支持时间筛选 |
| 12 | macOS Python SSL 中间 CA 缺失（已修复，需 `SSL_CERT_FILE` 环境变量） |

---

## 7. 环境配置

### 目录结构

```
ops-dashboard/
├── backend/           # FastAPI 后端
│   ├── .env           # OPS_WU_LAOBAN_ADMIN_TOKEN, OPS_WU_LAOBAN_SID
│   ├── requirements.txt
│   └── app/
├── frontend/          # Next.js 前端
│   ├── .env.local     # NEXT_PUBLIC_DATA_MODE=api
│   └── package.json
├── data/
│   └── ops_dashboard.db   # SQLite 数据库
├── logs/
│   ├── README.md       # 日志说明
│   └── archive/        # 历史日志归档
├── scripts/
│   └── capture_xiaotie_token.py
├── start.sh           # 后台启动脚本
├── stop.sh            # 停止脚本
└── restart.sh         # 重启脚本
```

### 依赖安装

```bash
# 后端
cd backend
pip install -r requirements.txt

# 前端
cd frontend
npm install
```

### 启动

```bash
# 方式一：一键启动
./start.sh

# 停止 / 重启
./stop.sh
./restart.sh

# 方式二：分别启动
# 终端 1 — 后端
cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 终端 2 — 前端（必须加 NODE_ENV=development）
cd frontend && NODE_ENV=development npm run dev
```

### 验证

```bash
curl http://localhost:8000/health          # 后端健康检查
curl -s http://localhost:8000/api/token-status | python3 -m json.tool  # Token 状态
curl -s -o /dev/null -w "%{http_code}" http://localhost:9100/          # 前端 200
```

运行日志:

- 当前日志: `logs/backend.log`、`logs/frontend.log`
- 历史日志: `logs/archive/`
- 当前项目暂无 lint script，验证以前端 `npm run typecheck`、`npm run build` 和后端 `python3 -m pytest` 为准。
- 当前已移除 `typescript.ignoreBuildErrors`，前端构建不再忽略 TypeScript 错误。

### 环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `OPS_WU_LAOBAN_ADMIN_TOKEN` | backend/.env | 無老板 Cookie token |
| `OPS_WU_LAOBAN_SID` | backend/.env | 店铺 ID (1238) |
| `NEXT_PUBLIC_DATA_MODE` | frontend/.env.local | `api` 或 `mock` |
| `NEXT_PUBLIC_API_BASE_URL` | frontend/.env.local | `http://localhost:8000` |
| `NODE_ENV` | 启动时 | 必须 `development`（系统可能全局设了 `production`） |
| `SSL_CERT_FILE` | ~/.zshrc | macOS SSL 修复：`~/.hermes/certs/ca-bundle.pem` |

### 小铁 Token 抓取

```bash
# 1. 确认 Mac IP
ipconfig getifaddr en0

# 2. 启动 mitmproxy
mitmdump -p 8888 -s scripts/capture_xiaotie_token.py

# 3. 手机 WiFi 代理 → Mac IP:8888
# 4. 手机打开小铁小程序
# 5. token 自动保存到 ~/.hermes/workspace/xiaotie-token.txt
# 6. 验证：wc -c ~/.hermes/workspace/xiaotie-token.txt（应 > 300 字节）
```

---

## 8. Codex 任务清单

### TASK 1：修复主驾驶舱影院数据聚合

**目标**: 影院数据导入后，主驾驶舱 `/dashboard` 应显示影院收入卡片，总收入应包含影院。

**涉及文件**:
- `backend/app/api/routes/overview.py` — 修改总览 API，查询 `daily_snapshots` 中 cinema 数据
- `frontend/src/pages/dashboard.tsx` — 添加影院指标卡

**具体步骤**:
1. 在 `overview.py` 的总览端点中，查询 `daily_snapshots` 表 `business_type='cinema'` 的最新快照
2. 从 `raw_json` 提取 `summary.revenue`、`summary.box_office`、`summary.customer_count`
3. 返回 `cinema` 字段：`{ status: "ok", revenue, box_office, customer_count, date }`
4. 如果无数据返回 `{ status: "not_imported", message: "请先上传凤凰云智 Excel" }`
5. 前端 `MetricCards.tsx` 添加影院指标卡，与台球/棋牌并列
6. 总收入 = 台球 + 棋牌 + 影院（任何一方无数据时排除该方）

**验证**: 导入影院报表后，主驾驶舱总收入应包含影院票房+卖品。

---

### TASK 2：影院报表批量导入 API

**目标**: 支持一次上传多个 Excel 文件，按正确顺序自动解析合并。

**涉及文件**:
- `backend/app/api/routes/cinema.py` — 新增 `POST /api/cinema/import-batch` 端点
- `backend/app/services/cinema_excel.py` — 修改导入逻辑支持批量

**具体步骤**:
1. 新增 `POST /api/cinema/import-batch` 端点，接收 `files: list[UploadFile]`
2. 按文件名自动排序：营运综合 → 影片排名 → 卖品明细 → 会员明细
3. 依次调用 `parse_cinema_report()` + `save_cinema_import()`
4. 返回每个文件的导入结果（成功/失败/报告类型）
5. 前端 `cinema.tsx` 的上传面板改为支持多文件选择
6. 导入完成后自动刷新页面数据

**验证**: 选择 4 个 Excel 文件一次性上传，系统自动按顺序导入，数据正确。

---

### TASK 3：影院 ECharts 多轴趋势图

**目标**: 将影院详情页的简易柱状图升级为 ECharts 多轴折线图，支持票房+人次+场次。

**涉及文件**:
- `frontend/src/pages/dashboard/cinema.tsx` — 替换 `TrendPanel` 组件
- `frontend/src/components/dashboard/` — 新增 `CinemaTrendChart.tsx`

**具体步骤**:
1. 新建 `CinemaTrendChart.tsx`，参考 `RevenueTrendChart.tsx` 的 ECharts 用法
2. 左 Y 轴：票房收入（柱状图），右 Y 轴：观影人次（折线图）
3. X 轴：日期（支持 7天/30天 切换）
4. Tooltip 显示：日期、票房、人次、场次、上座率
5. 颜色方案：票房用金色 `#f0b940`，人次用青色 `#36d6ff`，与现有主题一致
6. 在 `cinema.tsx` 中替换 `<TrendPanel>` 为 `<CinemaTrendChart>`
7. 数据源：`detail.box_office_trend_7d` / `detail.box_office_trend_30d`

**验证**: 影院详情页趋势图显示票房柱状+人次折线，hover 显示完整数据。

---

## 附录：关键 Pitfalls

| # | Pitfall | 规则 |
|---|---------|------|
| 1 | 前端 API 调用 | 必须用 `dashboardApi.ts` 函数，不能用 `fetch('/api/...')` |
| 2 | 影院导入顺序 | 营运综合 → 影片排名 → 卖品 → 会员 |
| 3 | 小铁端点选择 | 经营统计用 `new_summary`，不用 `summary` |
| 4 | 小铁响应格式 | `r.get("Result") or r.get("Results")` 兼容两种包装 |
| 5 | 無老板微信字段 | `wx` 不是 `wechat` |
| 6 | 無老板充值字段 | `pay_price` 是金额，`price` 是套餐描述字符串 |
| 7 | 环比计算 | 自然周/自然月同期对比，不是滚动窗口 |
| 8 | `date` 参数遮蔽 | FastAPI 路由参数不要用 `date`/`datetime` 等内置名 |
| 9 | 金额单位 | 小铁 API 金额是**分**，需 `/100` 转元 |
| 10 | `lose_count` | 小铁返回 101162 是占位值，非真实数据 |
| 11 | 用户名 HTML | 無老板 `user_name` 可能含 `<img>` 标签，需 strip |
| 12 | 启动前端 | 必须 `NODE_ENV=development npm run dev` |
