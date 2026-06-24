# Ops Dashboard 运行说明

## 项目位置

```txt
/Users/Zhuanz/Desktop/codex/ops-dashboard
```

这是翡翠城经营数据中枢 MVP，独立于当前目录里的影院打票工具和小程序代码。

## 后端启动

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/backend
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000
```

后端启动后会自动创建 SQLite 数据库：

```txt
/Users/Zhuanz/Desktop/codex/ops-dashboard/data/ops_dashboard.db
```

## 前端启动

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/frontend
npm install
npm run dev
```

打开：

```txt
http://localhost:9100/dashboard
```

当前推荐前端端口是 9100，`frontend/package.json` 和根目录 `start.sh` 已统一使用该端口。若看到 3000 端口仍有 Next.js 进程，通常是旧手动启动进程，建议停止后只保留 9100。

## 一键启动 / 停止 / 重启

推荐使用根目录脚本运行本地环境：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard
./start.sh
```

`start.sh` 会先清理本项目占用的旧 `8000` / `9100` 进程，再后台启动：

- 后端: `http://localhost:8000`
- 前端: `http://localhost:9100/dashboard`

停止：

```bash
./stop.sh
```

重启：

```bash
./restart.sh
```

停止脚本优先使用 `/tmp/ops-dashboard-*.pid`，并只会清理工作目录属于本项目的 `8000` / `9100` / 旧 `3000` 端口进程，避免误杀其他项目。

## 运行验证

前端类型检查：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/frontend
npm run typecheck
```

前端构建：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/frontend
npm run build
```

页面回归检查：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/frontend
npm run check:pages
```

如果页面突然返回 500，或看到 chunk 缺失、运行时错误，先执行：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard
./restart.sh
```

慢接口如果加载失败，前端会显示错误状态和“重新加载”按钮，直接点按钮即可重试当前页面请求。

前端 API 返回结构兼容由 `frontend/src/lib/apiEnvelope.ts` 负责。新增接口时，优先用这里的 `unwrapApiData`、`unwrapApiArray`、`unwrapApiObject` 做收口，页面里尽量不要再手写复杂的 envelope 判断。

业务指标的第一层统一由 `frontend/src/lib/businessAdapters.ts` 负责。新增或改造台球、棋牌、影院、轻购云等核心业务指标时，优先把 raw 数据先转成这里的 `BusinessSummary`，页面只消费统一后的收入、订单、客流、利用率和状态，不要在页面里反复判断原始字段。

`BusinessSummary` 是当前前端的业务核心指标统一模型；基于它的轻量经营预警由 `frontend/src/lib/businessAlertRules.ts` 负责，用来发现收入、订单、利用率、客单价和数据源问题。`frontend/src/lib/businessInsightRules.ts` 负责把 `BusinessSummary` 和 `BusinessAlert` 转成店长可执行的经营建议动作。

预警会在规则层按 `businessType + category + title` 和收入/订单/利用率/数据源等同类问题做去重，并为每条预警生成 `priorityScore`。同一业务最多保留 3 条核心预警，页面优先展示分数最高的经营问题，避免总览和预警页出现重复噪音。

当前预警和建议第一版都是前端规则模板，不是真正大模型，也不会调用外部 AI API。后续如果需要更复杂的同比/环比、门店级策略、建议确认/追踪，或更自然的语言生成，可以再升级为后端规则引擎或接入 LLM。

经营日报、周报、月报的前端增强由 `frontend/src/lib/businessReportRules.ts` 负责。报表页会在保留原始后端报告内容的基础上，补充标题、核心摘要、业务概览、重点经营问题和重点动作；重点经营问题与动作会按 `BusinessInsight.priorityScore` 收敛，动作标题会按日报/周报/月报显示为“今日重点动作”“本周重点动作”“本月重点动作”。复制到微信群的文本也走同一层规则，避免页面和复制内容各写一套逻辑。当前仍是前端轻量规则增强，不改变后端日报/周报/月报接口。

## 日志

当前运行日志写入：

```txt
logs/backend.log
logs/frontend.log
```

历史 `stdout.log` / `stderr.log` 已归档到 `logs/archive/`。归档日志可能包含早期 HMR、端口冲突或旧配置报错；排查当前问题时以 `backend.log` / `frontend.log` 为准。

## mock/API 模式

前端通过环境变量切换：

```txt
NEXT_PUBLIC_DATA_MODE=mock
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

mock 模式读取：

```txt
frontend/public/mock/dashboard.json
```

API 模式：

```txt
NEXT_PUBLIC_DATA_MODE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

数据库实际默认路径由 `backend/app/core/config.py` 决定：

```txt
/Users/Zhuanz/Desktop/codex/ops-dashboard/data/ops_dashboard.db
```

`data/dashboard.db` 当前是 0B 遗留空文件，先忽略即可；不要在未备份前删除任何数据文件。

## 采集配置

小铁台球配置使用后端环境变量，前缀为 `OPS_`：

```txt
OPS_XIAOTIE_AUTHORIZATION=Motern <JWT>
OPS_XIAOTIE_APP_ID=0a60f00b28c849d3ac529994f98b825f
OPS_XIAOTIE_STORE_ID=5227
OPS_XIAOTIE_NODE_ID=b553e29d-a389-45c0-b10f-8b40be2a7e2c
OPS_XIAOTIE_SITE_ID=e2a9329b-e09b-4f10-9e3d-19348184d8cf
```

如果没有设置 `OPS_XIAOTIE_AUTHORIZATION`，后端会自动读取：

```txt
/Users/Zhuanz/.hermes/workspace/xiaotie-token.txt
```

如果小铁接口返回 401，说明当前 token 已过期或权限失效。更新这个文件里的 token 后，重启后端，再点击驾驶舱里的“手动采集”。

## 电脑微信小程序抓取小铁 token

项目提供了抓取脚本：

```txt
/Users/Zhuanz/Desktop/codex/ops-dashboard/scripts/capture_xiaotie_token.py
```

抓取流程：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard
mitmdump --listen-host 0.0.0.0 --listen-port 8888 -s scripts/capture_xiaotie_token.py
```

然后临时打开 macOS 系统代理：

```bash
networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8888
networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8888
networksetup -setwebproxystate "Wi-Fi" on
networksetup -setsecurewebproxystate "Wi-Fi" on
```

在电脑微信里打开小铁小程序，进入会触发接口请求的页面，例如门店首页、经营统计或台桌列表。脚本看到 `table-api.xironiot.com` 请求后，会自动把 `Authorization: Motern ...` 写入：

```txt
/Users/Zhuanz/.hermes/workspace/xiaotie-token.txt
```

抓到后立刻关闭系统代理：

```bash
networksetup -setwebproxystate "Wi-Fi" off
networksetup -setsecurewebproxystate "Wi-Fi" off
```

验证 token：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard
PYTHONPATH=backend python3 - <<'PY'
from app.services.collectors.xiaotie import check_xiaotie_token
print(check_xiaotie_token())
PY
```

返回 `{"valid": True, ...}` 后，重启后端或点击驾驶舱“手动刷新”即可重新采集。

无老板棋牌第一版保留配置位：

```txt
OPS_WU_LAOBAN_ADMIN_TOKEN=<admin_token>
OPS_WU_LAOBAN_SID=1238
```

当前无老板缺少具体 API 路径和返回样例，因此第一版使用 mock 原始数据适配。

## 手动采集

前端 API 模式下顶部会显示“手动采集”按钮。点击后：

- 调用 `POST /api/collect/run`
- 后端执行一次小铁和无老板采集
- 前端立即刷新收入、订单、利用率和异常
- 按钮冷却 60 秒，降低误触和第三方风控风险

也可以直接调用：

```bash
curl -X POST http://localhost:8000/api/collect/run
```

## 自动采集

默认关闭自动采集，只使用手动采集按钮，降低第三方接口风控风险。

当前第三方采集请求在遇到超时、连接失败或临时 5xx 时，会在后端自动重试一次；如果是 401 或 token 失效，则不会重试，会直接保留明确的 token 异常状态，方便尽快处理认证问题。

`POST /api/collect/run` 的返回结果会保留兼容字段 `metrics` 和 `excluded_platforms`，同时新增 `platform_results`，用于查看每个平台的采集状态、耗时、采集记录数、是否发生过重试和重试次数。

`/dashboard/data-quality` 现在可以直接点“手动采集”，并在同页查看最近一次采集的每个平台结果；适合先判断采集是否成功，再看后续经营数据是否可信。

采集结果会写入 `collection_runs` 历史表；`GET /api/collect/history` 可查看最近采集记录，`/dashboard/data-quality` 刷新后也会自动读取最近一次采集结果。

如果后续要恢复自动采集，可以设置：

```txt
OPS_AUTO_COLLECT_ENABLED=true
OPS_COLLECT_INTERVAL_MINUTES=5
```

然后重启后端。

## 影院边界

影院只返回占位结构：

```json
{
  "platform": "cinema",
  "status": "placeholder",
  "note": "future integration only"
}
```

第一版不做影院 API 采集、不做数据抓取、不做 Excel 解析。

## 验证命令

后端：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/backend
python3 -m pytest
```

前端：

```bash
cd /Users/Zhuanz/Desktop/codex/ops-dashboard/frontend
npm run typecheck
npm run build
```

当前前端已移除 `typescript.ignoreBuildErrors`，构建会执行 TypeScript 有效性检查；日常排查建议先单独运行 `npm run typecheck`，再运行 `npm run build`。

当前项目没有 lint script，不要把 lint 作为必跑命令伪造。

运行检查：

```bash
curl http://localhost:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9100/dashboard
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9100/dashboard/data-quality
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9100/dashboard/alerts
```
