# AI 经营管理系统项目交接说明书

> **文档版本**: v1.0
> **更新日期**: 2026-06-23
> **当前状态**: 生产使用中

---

## 1. 项目名称

**翡翠城经营驾驶舱** (Ops Dashboard)

## 2. 项目目标

为成都翡翠城多业务经营者（影院+台球+棋牌）提供统一的经营数据监控、分析和 AI 辅助决策平台。

## 3. 当前系统定位

- **核心功能**: 多业务数据聚合 + AI 经营分析 + 自动化报表
- **用户**: 影院经营者（老板）
- **使用场景**: 日常经营监控、员工绩效分析、排片决策、库存管理

## 4. 业务范围

### 4.1 影院
- **平台**: 凤凰云智
- **账号**: sfcsygjxxb1（单店，无需过滤）
- **门店**: SFC上影国际影城翡翠城店
- **数据来源**: Excel 报表导入（手动上传）
- **核心指标**: 票房、人次、场次、上座率、卖品收入

### 4.2 台球
- **平台**: 小铁台球
- **数据来源**: API 实时获取
- **认证方式**: Token（通过 mitmproxy 抓包获取，存放在 `~/.hermes/workspace/xiaotie-token.txt`）
- **核心指标**: 营收、订单数、使用时长、会员消费

### 4.3 棋牌/麻将
- **平台**: 無老板
- **数据来源**: API 实时获取
- **认证方式**: Token（MD5 算法生成，详见 `wu_laoban.py`）
- **核心指标**: 营收、订单数、包间使用率

## 5. 当前技术栈

### 5.1 前端框架
- **框架**: Next.js 14.2.35
- **UI 库**: React 18.3.1
- **语言**: TypeScript 5.9.3
- **样式**: styled-jsx
- **图表**: ECharts 5.5.0
- **HTTP 客户端**: axios

### 5.2 后端/API 结构
- **框架**: FastAPI
- **服务器**: uvicorn
- **语言**: Python 3.14
- **任务调度**: APScheduler

### 5.3 数据库/缓存
- **数据库**: SQLite（本地文件）
- **实际默认路径**: `data/ops_dashboard.db`
- **代码来源**: `backend/app/core/config.py` 中的 `settings.database_path`
- **遗留文件**: `data/dashboard.db` 当前是 0B 空文件，先视为遗留文件忽略，不建议在未备份前删除任何数据文件
- **主要表**: daily_snapshots, revenue, orders, usage, alerts, sync_logs, automation_tasks, data_sources, ai_insights, audit_logs, cinema_profit, cinema_inventory, cinema_inventory_movement

### 5.4 部署方式
- **前端**: `cd frontend && NODE_ENV=development npm run dev`（`package.json` 固定为 9100）
- **后端**: `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- **端口**: 前端 9100，后端 8000

## 6. 当前项目目录结构

```
ops-dashboard/
├── frontend/                    # 前端项目
│   ├── src/
│   │   ├── pages/              # Next.js 页面
│   │   │   ├── dashboard.tsx   # 驾驶舱首页
│   │   │   └── dashboard/      # 详情页
│   │   │       ├── billiards.tsx    # 台球详情
│   │   │       ├── mahjong.tsx      # 棋牌详情
│   │   │       ├── cinema.tsx       # 影院详情
│   │   │       ├── employee.tsx     # 员工绩效（合并版）
│   │   │       ├── profit.tsx       # 利润毛利
│   │   │       ├── inventory.tsx    # 库存损耗
│   │   │       └── ...
│   │   ├── components/         # 组件
│   │   ├── lib/                # API 客户端
│   │   │   └── dashboardApi.ts # 所有 API 调用
│   │   └── styles/             # 样式
│   │       └── globals.css
│   └── package.json
│
├── backend/                     # 后端项目
│   ├── app/
│   │   ├── api/routes/         # API 路由
│   │   │   ├── overview.py     # 概览
│   │   │   ├── detail.py       # 详情
│   │   │   ├── cinema.py       # 影院
│   │   │   ├── employee.py     # 员工绩效
│   │   │   ├── finance.py      # 财务
│   │   │   └── ...
│   │   ├── services/           # 业务逻辑
│   │   │   ├── detail_xiaotie.py    # 台球详情
│   │   │   ├── detail_wu_laoban.py  # 棋牌详情
│   │   │   ├── cinema_excel.py      # 影院 Excel 解析
│   │   │   ├── employee_performance.py # 员工绩效
│   │   │   ├── ai_insights.py       # AI 洞察
│   │   │   └── ...
│   │   ├── core/               # 核心模块
│   │   │   ├── database.py     # 数据库操作
│   │   │   ├── config.py       # 配置
│   │   │   └── scheduler.py    # 任务调度
│   │   └── main.py             # FastAPI 入口
│   └── requirements.txt
│
└── scripts/                     # 辅助脚本
    └── capture_xiaotie_token.py
```

## 7. 已完成页面清单

| 页面路径 | 功能 | 数据源 | 状态 | 已知问题 |
|---------|------|--------|------|---------|
| `/dashboard` | 驾驶舱首页 | overview API | ✅ 正常 | - |
| `/dashboard/billiards` | 台球详情 | detail_xiaotie | ✅ 正常 | - |
| `/dashboard/mahjong` | 棋牌详情 | detail_wu_laoban | ✅ 正常 | - |
| `/dashboard/cinema` | 影院详情 | cinema API | ✅ 正常 | - |
| `/dashboard/employee` | 员工绩效（合并版） | employee-performance | ✅ 正常 | - |
| `/dashboard/profit` | 利润毛利 | finance API | ✅ 正常 | - |
| `/dashboard/inventory` | 库存损耗 | finance API | ✅ 正常 | - |
| `/dashboard/member` | 会员分析 | member API | ✅ 正常 | - |
| `/dashboard/concession` | 卖品详情 | concession API | ✅ 正常 | - |
| `/dashboard/alerts` | AI 预警 | alerts API | ✅ 正常 | - |
| `/dashboard/reports` | AI 报告 | ai_report API | ✅ 正常 | - |
| `/dashboard/customer` | 客户分析 | customer API | ✅ 正常 | - |
| `/dashboard/customer-wake-up` | 客户唤醒 | customer_wake_up | ✅ 正常 | - |
| `/dashboard/screening-suggestions` | 排片建议 | screening_suggestions | ✅ 正常 | - |
| `/dashboard/revenue-forecast` | 收入预测 | revenue_forecast | ✅ 正常 | - |
| `/dashboard/cross-business` | 多业务联动 | cross_business | ✅ 正常 | - |
| `/dashboard/data-quality` | 数据可信度 | data_quality | ✅ 正常 | - |
| `/dashboard/audit` | 审计日志 | audit API | ✅ 正常 | - |

## 8. 已完成 API 清单

### 8.1 概览类
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `GET /api/overview` | 驾驶舱概览 | 三个业务聚合 | ✅ |
| `GET /api/revenue/realtime` | 实时收入 | SQLite 最新采集数据 | ✅ |
| `GET /api/orders/realtime` | 实时订单 | SQLite 最新采集数据 | ✅ |
| `GET /api/usage/realtime` | 实时使用率 | SQLite 最新采集数据 | ✅ |
| `GET /api/orders/snapshots` | 订单快照 | `order_snapshots` 服务 | ✅ |

### 8.2 台球详情
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `GET /api/detail/xiaotie` | 台球详情，包含会员 TOP、时段分布、球桌状态等 | 小铁 API | ✅ |

说明：当前没有独立的 `/api/detail/xiaotie/member-top` 路由，会员 TOP 数据包含在 `/api/detail/xiaotie` 返回体中。

### 8.3 棋牌详情
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `GET /api/detail/wu_laoban` | 棋牌详情 | 無老板 API | ✅ |

### 8.4 影院相关
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `POST /api/cinema/import-excel` | 导入单个 Excel | 上传文件 | ✅ |
| `POST /api/cinema/import-batch` | 批量导入 | 上传文件 | ✅ |
| `GET /api/cinema/overview` | 影院概览 | daily_snapshots | ✅ |
| `GET /api/cinema/detail` | 影院详情 | daily_snapshots | ✅ |
| `GET /api/cinema/concession` | 卖品详情 | cinema_excel | ✅ |
| `GET /api/cinema/member` | 会员消费详情 | cinema_excel raw_json | ✅ |
| `GET /api/cinema/member-analysis` | 会员消费分析页数据 | member_analysis | ✅ |
| `GET /api/cinema/employee-performance` | 员工绩效 | cinema_excel | ✅ |

说明：`/api/cinema/member` 是按导入明细聚合的会员消费详情；`/api/cinema/member-analysis` 是 `/dashboard/member` 使用的会员分析接口。

### 8.5 财务相关
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `POST /api/cinema/finance/import` | 导入财务 Excel | 上传文件 | ✅ |
| `GET /api/cinema/finance/profit` | 利润毛利 | cinema_finance | ✅ |
| `GET /api/cinema/finance/inventory` | 库存损耗 | cinema_finance | ✅ |

### 8.6 AI 相关
| API 路径 | 功能 | 数据来源 | 状态 |
|---------|------|---------|------|
| `GET /api/ai/daily-report` | 经营日报 | ai_report | ✅ |
| `GET /api/ai/weekly-report` | 经营周报 | ai_insights | ✅ |
| `GET /api/ai/monthly-report` | 经营月报 | ai_insights | ✅ |
| `GET /api/ai/anomalies` | AI 异常预警 | ai_insights | ✅ |
| `GET /api/alerts` | 传统预警列表 | alerts 表 | ✅ |
| `GET /api/cinema/screening-suggestions` | 排片建议 | screening_suggestions | ✅ |
| `GET /api/ai/revenue-forecast` | 收入预测 | revenue_forecast | ✅ |
| `GET /api/ai/cross-business` | 多业务联动 | cross_business | ✅ |

说明：`/api/ai/daily-report` 当前实际生效路由在 `backend/app/api/routes/ai_report.py`。`backend/app/api/routes/ai_insights.py` 里也定义了同名日报路由，但由于 `main.py` 先注册 `ai_report.router`，当前响应来自 `ai_report.py`；该重复定义是维护风险，本次只记录不重构。

## 9. 三个业务的数据来源说明

### 9.1 影院
- **当前状态**: 已接入，但需手动上传 Excel
- **数据来源**: 凤凰云智导出的 Excel 报表
- **已完成功能**:
  - Excel 自动识别（营运报表、卖品报表、会员报表、利润报表、库存报表）
  - 影院详情页（票房趋势、影片排名、排片分析）
  - 卖品详情页（分类分析、TOP10）
  - 员工绩效（卖品套餐+活动套餐+充值+开卡）
  - 利润毛利分析
  - 库存损耗分析
- **待补充**:
  - 自动从凤凰云智抓取数据（目前需手动下载）
  - 实时数据对接

### 9.2 台球
- **当前状态**: 已接入，实时数据
- **数据来源**: 小铁台球 API
- **认证方式**: Token（需定期抓包更新）
- **已完成功能**:
  - 实时营收、订单、使用率
  - 球台状态
  - 会员 TOP20（按消费/按时长双排序）
  - 时段热力图
- **已知问题**:
  - Token 过期需手动更新
  - `detail_xiaotie.py` 中 `NameError` 会导致误报 token 失效

### 9.3 棋牌/麻将
- **当前状态**: 已接入，实时数据
- **数据来源**: 無老板 API
- **认证方式**: Token（MD5 算法自动生成）
- **已完成功能**:
  - 实时营收、订单
  - 包间使用率
  - 客户分布
- **已知问题**:
  - `/admin/stats/place` API 格式变更，需适配
  - 储值卡订单 `pay_price` 始终为 0，实际金额在 `price` 字段

## 10. AI 功能现状

### 10.1 AI 经营建议
- **实现方式**: 规则计算（前端/后端）
- **触发条件**: 日报/周报/月报生成时
- **核心逻辑**: 对比环比数据，识别增长/下降业务，生成建议文本

### 10.2 异常预警
- **实现方式**: 后端规则计算
- **触发条件**: 营收变化超过阈值
- **核心逻辑**: 对比历史数据，计算变化率，置信度评分

### 10.3 员工 AI 教练
- **实现方式**: 前端计算 + 后端数据
- **核心逻辑**: 
  - 后端提供员工销售数据
  - 前端计算得分、强弱项、AI 建议
  - 基于均值和标准差的评分算法

### 10.4 排片建议
- **实现方式**: 后端规则计算
- **核心逻辑**: 分析历史票房、上座率，推荐加场/减场

### 10.5 卖品推荐
- **实现方式**: 后端规则计算
- **核心逻辑**: 分析销售数据，推荐畅销品

### 10.6 客户唤醒
- **实现方式**: 后端规则计算
- **核心逻辑**: 识别沉睡客户，生成唤醒建议

## 11. 当前已知问题

### 11.1 高风险问题
1. **小铁 Token 过期**: 需定期手动抓包更新，否则台球数据中断
2. **凤凰云智 Excel 手动上传**: 无法自动获取实时数据

### 11.2 中风险问题
1. **NameError 误报**: `detail_xiaotie.py` 中变量未定义会导致"token 失效"误报
2. **無老板 API 格式变更**: `/admin/stats/place` 返回格式变化，需适配
3. **进销存损耗负数**: Excel 中"耗损数量"为负数，需特殊处理

### 11.3 低风险问题
1. **虚拟商品库存膨胀**: PS5/Switch 等虚拟商品库存 999 万+，影响统计
2. **Excel 合计行**: 部分报表末尾有合计行（品名="--"），需过滤

### 11.4 UI 体验问题
1. **HMR 不生效**: dev server 运行时间较长后，HMR 可能失效，需重启
2. **前端进程静默死亡**: Next.js dev server 偶尔会静默退出

### 11.5 数据准确性问题
1. **班次观影人次**: 必须用场次放映表，不能用卖品订单数
2. **员工班次判断**: 必须按天判断，不能用投票制

### 11.6 性能问题
1. **小铁 API 并发**: 每个时间段需请求两次 API（按消费+按时长）

### 11.7 安全问题
1. **Token 明文存储**: 小铁 token 存放在文本文件中
2. **CORS 白名单**: 仅允许 localhost

## 12. 当前不能乱改的地方

### 12.1 已经能正常工作的 API
- `/api/detail/xiaotie` — 台球详情，双排序逻辑已稳定
- `/api/detail/wu_laoban` — 棋牌详情
- `/api/cinema/employee-performance` — 员工绩效，自然周/月/年过滤已实现
- `/api/cinema/finance/profit` — 利润毛利
- `/api/cinema/finance/inventory` — 库存损耗

### 12.2 已经完成的页面
- `employee.tsx` — 员工绩效合并版，包含指标卡+排名表+日期切换+AI洞察
- `cinema.tsx` — 影院详情，自然周/月过滤已实现
- `billiards.tsx` — 台球详情，双排序已实现

### 12.3 第三方平台认证方式
- **小铁**: Token 存放在 `~/.hermes/workspace/xiaotie-token.txt`
- **無老板**: Token 通过 MD5 算法生成，详见 `wu_laoban.py`
- **凤凰云智**: 当前代码未实现账号密码/cookie 自动登录，影院数据通过手动上传 Excel 导入

### 12.4 真实数据字段
- **卖品销售明细**: `销售日期`、`销售时间`、`销售员`、`卖品大类`、`卖品名称`、`支付金额（元）`、`销售数量`
- **会员卡充值明细**: `充值/续费日期`、`操作员`、`支付金额`、`充值/续费影院`
- **会员卡开卡明细**: `开卡日期`、`发卡日期`、`操作员`、`发卡影院`

### 12.5 环境变量
- `NEXT_PUBLIC_API_BASE_URL`: 后端 API 地址（默认 `http://localhost:8000`）

### 12.6 部署配置
- 前端端口: 9100
- 后端端口: 8000
- CORS 白名单: `http://localhost:9100`
- `start.sh` 和 `frontend/package.json` 均以 9100 作为推荐前端端口；如发现 3000 端口残留进程，应视为旧手动启动进程并停止，避免双进程排障混乱。
- 推荐启动: `./start.sh`
- 推荐停止: `./stop.sh`
- 推荐重启: `./restart.sh`
- 当前运行日志: `logs/backend.log`、`logs/frontend.log`
- 历史日志归档: `logs/archive/`，其中可能包含旧 HMR 报错，排查当前问题时不要直接当作现行故障。

## 13. 后续推荐优化顺序

### 优先级 1：稳定性修复
1. 修复 `NameError` 误报问题
2. 适配無老板 API 格式变更
3. 修复 HMR 失效问题

### 优先级 2：数据模型统一
1. 统一日期格式（YYYY-MM-DD）
2. 统一金额单位（元/分）
3. 统一字段命名

### 优先级 3：UI 升级
1. 移动端适配
2. 深色主题优化
3. 图表交互优化

### 优先级 4：AI 建议升级
1. 接入大模型生成建议
2. 个性化推荐
3. 预测准确性提升

### 优先级 5：报表完善
1. 自动导出 Excel
2. 邮件/微信推送
3. 自定义报表

### 优先级 6：性能优化
1. 数据库索引优化
2. API 缓存
3. 前端懒加载

### 优先级 7：安全加固
1. Token 加密存储
2. 用户认证
3. 操作日志

## 14. 给 Codex 的执行原则

### 14.1 不要从零重做
- 当前系统已经稳定运行，不要重写
- 优先修复问题，而不是重构

### 14.2 不要一次改太多
- 每次只做一个任务
- 修改后必须测试验证

### 14.3 先读代码再修改
- 理解现有逻辑再动手
- 不要假设，要验证

### 14.4 每次只做一个任务
- 完成一个任务后再开始下一个
- 避免同时修改多个文件

### 14.5 修改后必须运行 lint/build/test
- 前端: `npm run typecheck` + `npm run build`
- 后端: `python3 -m pytest`
- 当前暂无 lint script
- 当前已移除 `typescript.ignoreBuildErrors`，前端构建不再忽略 TypeScript 错误

### 14.6 必须输出修改文件清单
- 列出所有修改的文件
- 说明每个文件的修改内容

### 14.7 必须说明风险和遗留问题
- 每次修改都要评估风险
- 记录遗留问题

## 15. Codex 接手提示词

```
你是翡翠城经营驾驶舱项目的接手开发者。

项目背景：
- 这是一个多业务经营数据监控平台，覆盖影院（凤凰云智）、台球（小铁）、棋牌（無老板）
- 前端 Next.js 14 + React 18，后端 FastAPI + SQLite
- 已经稳定运行，用户在日常使用

你的任务：
1. 首先阅读 HANDOVER.md 了解项目全貌
2. 阅读 SKILL.md 了解开发规范
3. 不要从零重做，优先修复问题
4. 每次只做一个任务，完成后验证
5. 修改后必须输出文件清单和风险评估

当前优先任务：
1. 修复 NameError 误报问题
2. 适配無老板 API 格式变更
3. 优化 AI 建议生成逻辑

注意事项：
- 不要修改已经能正常工作的 API
- 不要修改已经完成的页面布局
- 不要修改第三方平台认证方式
- 不要修改真实数据字段映射
- 每次修改后必须测试验证

开发环境：
- 一键启动: `./start.sh`
- 停止服务: `./stop.sh`
- 重启服务: `./restart.sh`
- 前端手动启动: `cd frontend && NODE_ENV=development npm run dev`
- 后端手动启动: `cd backend && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000`
- 测试: `cd backend && python3 -m pytest`
```

---

**文档维护者**: Claude
**最后更新**: 2026-06-23
