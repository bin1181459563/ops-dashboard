import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RevenueTrendChart } from "../components/dashboard/RevenueTrendChart";
import { generateBusinessAlerts } from "../lib/businessAlertRules";
import type { BusinessAlert } from "../lib/businessAlertRules";
import { generateBusinessInsights } from "../lib/businessInsightRules";
import type { BusinessInsight } from "../lib/businessInsightRules";
import { toOverviewBusinessSummaries } from "../lib/businessAdapters";
import { DATA_MODE, askAiAssistant, createAutomationTask, fetchAlerts, fetchAiAnomalies, fetchAiMonthlyReport, fetchAiWeeklyReport, fetchAutomationTasks, fetchDailyReport, fetchDataQualitySummary, fetchDataSourcesStatus, fetchOrders, fetchOrderSnapshots, fetchOverview, fetchRevenue, fetchUsage, runCollect } from "../lib/dashboardApi";
import type { AutomationTask } from "../lib/dashboardApi";
import type { AiAnomaly, AlertItem, DashboardState, DataQualitySummary, DataSourcePlatformStatus, OverviewData } from "../types/dashboard";

type AiPriority = "高" | "中" | "低";

interface BusinessCard {
  label: string;
  href: string;
  status: string;
  revenue: number;
  ordersLabel: string;
  peopleLabel: string;
  accent: "blue" | "green" | "gold";
}

interface AiInsight {
  title: string;
  detail: string;
  impact: string;
  tone: "blue" | "green" | "gold" | "red";
}

interface AiTask {
  type: string;
  title: string;
  venue: string;
  priority: AiPriority;
  status: "待处理" | "处理中" | "已完成";
  action: string;
  due: string;
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({});
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [systemStatus, setSystemStatus] = useState(DATA_MODE === "mock" ? "mock" : "正常");
  const [refreshing, setRefreshing] = useState(false);
  const [question, setQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiAnswerMeta, setAiAnswerMeta] = useState("");
  const [aiAsking, setAiAsking] = useState(false);
  const [automationTasks, setAutomationTasks] = useState<AutomationTask[]>([]);
  const [dispatchingTask, setDispatchingTask] = useState("");
  const initialRefreshDone = useRef(false);

  const overview = state.overview?.data;
  const alerts = state.alerts?.data || overview?.alerts || [];
  const dailyReport = state.dailyReport?.data.report;
  const businessCards = useMemo(() => getBusinessCards(overview), [overview]);
  const businessAlerts = useMemo(() => generateBusinessAlerts(toOverviewBusinessSummaries(overview)).slice(0, 5), [overview]);
  const businessInsights = useMemo(
    () => generateBusinessInsights({ summaries: toOverviewBusinessSummaries(overview), alerts: businessAlerts }).slice(0, 3),
    [overview, businessAlerts],
  );
  const insights = useMemo(() => buildAiInsights(overview, alerts, dailyReport), [overview, alerts, dailyReport]);
  const tasks = useMemo(() => buildAiTasks(overview, alerts), [overview, alerts]);
  const healthScore = calculateHealthScore(overview, alerts, systemStatus);
  const customerTotal = calculateCustomerTotal(overview);

  const source = (() => {
    const sources = [state.overview?.source, state.revenue?.source, state.orders?.source, state.usage?.source, state.alerts?.source].filter(Boolean);
    const uniqueSources = Array.from(new Set(sources));
    return uniqueSources.includes("mixed") || uniqueSources.length > 1 ? "mixed" : uniqueSources[0] || DATA_MODE;
  })();

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setCurrentTime(new Date());
    try {
      await runCollect().catch(() => {});
      const results = await Promise.allSettled([
        fetchOverview(),
        fetchRevenue(),
        fetchOrders(),
        fetchUsage(),
        fetchAlerts(),
        fetchOrderSnapshots(),
        fetchDataSourcesStatus(),
        fetchDailyReport(),
        fetchAutomationTasks(),
        fetchDataQualitySummary(),
        fetchAiAnomalies(),
      ] as const);
      const [overviewResult, revenueResult, ordersResult, usageResult, alertsResult, orderSnapshotsResult, dataSourcesResult, dailyReportResult, automationResult, dataQualityResult, aiAnomaliesResult] = results;
      const nextOverview = overviewResult.status === "fulfilled" ? overviewResult.value : undefined;
      const revenue = revenueResult.status === "fulfilled" ? revenueResult.value : undefined;
      const orders = ordersResult.status === "fulfilled" ? ordersResult.value : undefined;
      const usage = usageResult.status === "fulfilled" ? usageResult.value : undefined;
      const nextAlerts = alertsResult.status === "fulfilled" ? alertsResult.value : undefined;
      const orderSnapshots = orderSnapshotsResult.status === "fulfilled" ? orderSnapshotsResult.value : undefined;
      const dataSources = dataSourcesResult.status === "fulfilled" ? dataSourcesResult.value : undefined;
      const report = dailyReportResult.status === "fulfilled" ? dailyReportResult.value : undefined;
      const automation = automationResult.status === "fulfilled" ? automationResult.value : undefined;
      const dataQuality = dataQualityResult.status === "fulfilled" ? dataQualityResult.value : undefined;
      const aiAnomalies = aiAnomaliesResult.status === "fulfilled" ? aiAnomaliesResult.value : undefined;
      setState((previous) => ({
        overview: nextOverview || previous.overview,
        revenue: revenue || previous.revenue,
        orders: orders || previous.orders,
        usage: usage || previous.usage,
        alerts: nextAlerts || previous.alerts,
        orderSnapshots: orderSnapshots || previous.orderSnapshots,
        dataSources: dataSources || previous.dataSources,
        dailyReport: report || previous.dailyReport,
        dataQuality: dataQuality || previous.dataQuality,
        aiAnomalies: aiAnomalies || previous.aiAnomalies,
      }));
      if (automation) setAutomationTasks(automation.data.tasks || []);
      if (nextOverview) {
        const failedCount = results.filter((result) => result.status === "rejected").length;
        setSystemStatus(failedCount > 0 ? "部分异常" : nextOverview.source === "mock" && DATA_MODE === "api" ? "API回退" : DATA_MODE === "mock" ? "mock" : "正常");
      } else {
        setSystemStatus("异常");
      }
    } catch {
      setSystemStatus("异常");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (initialRefreshDone.current) return;
    initialRefreshDone.current = true;
    refreshAll();
  }, []);

  const askAi = async () => {
    const value = question.trim();
    if (!value) return;
    setAiAsking(true);
    setAiAnswer("");
    setAiAnswerMeta("");
    try {
      const response = await askAiAssistant(value);
      setAiAnswer(response.data.answer);
      setAiAnswerMeta(`${response.data.model} · ${aiSourceLabel(response.data.source)}`);
      setQuestion("");
    } catch {
      setAiAnswer("AI 助手暂时没有连上后端。请确认后端服务已启动，或稍后再试。");
      setAiAnswerMeta("连接失败");
    } finally {
      setAiAsking(false);
    }
  };

  const dispatchHermesTask = async (task: AiTask) => {
    if (dispatchingTask) return;
    setDispatchingTask(task.title);
    try {
      const response = await createAutomationTask({
        task_type: automationTypeForTask(task),
        title: task.title,
        venue: task.venue,
      });
      setAutomationTasks((previous) => [response.data, ...previous].slice(0, 6));
    } finally {
      setDispatchingTask("");
    }
  };

  return (
    <>
      <Head>
        <title>AI 经营管理系统 - 翡翠城</title>
      </Head>
      <main className="aiDashboardShell">
        <aside className="aiSidebar">
          <div className="aiBrand">
            <div className="aiBrandMark">翡</div>
            <div>
              <strong>翡翠城</strong>
              <span>AI 经营管理系统</span>
            </div>
          </div>
          <nav className="aiNav">
            {[
              ["今日经营中心", "/dashboard", true],
              ["AI 预警", "/dashboard/alerts", false],
              ["AI 报告", "/dashboard/reports", false],
              ["客户唤醒", "/dashboard/customer-wake-up", false],
              ["排片建议", "/dashboard/screening-suggestions", false],
              ["收入预测", "/dashboard/revenue-forecast", false],
              ["多业务联动", "/dashboard/cross-business", false],
              ["数据可信度", "/dashboard/data-quality", false],
              ["审计日志", "/dashboard/audit", false],
            ].map(([label, href, active]) => (
              <Link className={`aiNavItem ${active ? "active" : ""}`} href={String(href)} key={String(label)}>
                <span>{String(label).slice(0, 1)}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="aiStoreSwitch">
            <span>当前门店</span>
            <strong>翡翠城 · 总部</strong>
          </div>
        </aside>

        <section className="aiWorkspace">
          <header className="aiTopbar">
            <div>
              <span className="aiEyebrow">AI 今日经营中心</span>
              <h1>老板，今天先看这三件事</h1>
            </div>
            <div className="aiTopMeta">
              <span>{currentTime ? formatDateTime(currentTime) : "等待刷新"}</span>
              <span>{sourceLabel(source)} · {systemStatus}</span>
              <button className="aiRefreshButton" onClick={refreshAll} disabled={refreshing}>{refreshing ? "刷新中..." : "刷新数据"}</button>
            </div>
          </header>

          <section className="aiKpiGrid">
            <KpiCard label="今日总收入（元）" value={currency(overview?.total_revenue || 0)} delta="已计入台球 / 棋牌 / 影院" tone="gold" />
            <KpiCard label="订单/场次（单·场）" value={formatNumber(overview?.total_orders || 0)} delta="经营动作总量" tone="blue" />
            <KpiCard label="客流/人次（人）" value={formatNumber(customerTotal)} delta="含影院观影人次" tone="cyan" />
            <KpiCard label="AI 健康分" value={`${healthScore} 分`} delta={healthScore >= 85 ? "经营状态良好" : "存在待处理事项"} tone="blue" />
          </section>

          <section className="aiBusinessGrid">
            {businessCards.map((item) => (
              <Link className={`aiBusinessCard accent-${item.accent}`} href={item.href} key={item.label}>
                <div>
                  <span className="statusDot" />
                  <strong>{item.label}</strong>
                  <em>{item.status}</em>
                </div>
                <b>{currency(item.revenue)}</b>
                <footer>
                  <span>{item.ordersLabel}</span>
                  <span>{item.peopleLabel}</span>
                </footer>
              </Link>
            ))}
          </section>

          <section className="aiDataQualityGrid">
            <DataQualityCard summary={state.dataQuality?.data} />
            <AiAnomaliesCard anomalies={state.aiAnomalies?.data || []} businessAlerts={businessAlerts} />
          </section>

          <section className="aiMainGrid">
            <div className="aiDataColumn">
              <RevenueTrendChart />
              <section className="aiPanel aiComparisonPanel">
                <div className="aiPanelHeader">
                  <h2>今日收入对比</h2>
                  <span>AI 用于判断变化幅度和业务贡献</span>
                </div>
                <div className="aiComparisonGrid">
                  {[
                    ["较昨日同期", "+12.35%", "up"],
                    ["较上周同日", "+14.02%", "up"],
                    ["较上月同期", "+23.10%", "up"],
                    ["较年初日均", "+31.00%", "up"],
                  ].map(([label, value, direction]) => (
                    <div className="aiComparisonItem" key={label}>
                      <span>{label}</span>
                      <strong className={`change-${direction}`}>{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="aiAssistantPanel">
              <div className="aiPanelHeader">
              <div>
                <span className="aiEyebrow">AI 老板助手</span>
                <h2>经营摘要</h2>
              </div>
              <button className="aiGhostButton">收起</button>
            </div>
            <p className="aiSummary">{buildSummary(overview, alerts)}</p>
            <section className="aiBusinessInsightBlock">
              <div className="aiPanelHeader" style={{ marginBottom: 8 }}>
                <h2>规则经营建议</h2>
                <span>{businessInsights.length ? `${businessInsights.length} 条` : "暂无重点经营建议"}</span>
              </div>
              <div className="aiInsightList">
                {businessInsights.map((item) => (
                  <article className={`aiInsight tone-${businessInsightTone(item.priority)}`} key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.problem}</span>
                    </div>
                    <em>{item.actions.slice(0, 2).join(" · ")}</em>
                  </article>
                ))}
                {!businessInsights.length && <div className="emptyState">暂无重点经营建议</div>}
              </div>
            </section>
            <div className="aiInsightList">
                {insights.map((item, idx) => (
                  <article className={`aiInsight tone-${item.tone}`} key={`insight-${idx}-${item.title}`}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <em>{item.impact}</em>
                  </article>
                ))}
              </div>
              <div className="aiAskBox">
                <span>想问点什么？</span>
                <div>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") askAi();
                    }}
                    placeholder="例如：今天哪个业务收入最高？影院卖品占比如何？"
                  />
                  <button onClick={askAi} disabled={aiAsking}>{aiAsking ? "思考中" : "发送"}</button>
                </div>
                {(aiAnswer || aiAsking) && (
                  <article className="aiAnswerBox">
                    <strong>{aiAsking ? "AI 正在读取经营数据..." : "AI 回答"}</strong>
                    <p>{aiAsking ? "正在结合台球、棋牌、影院和异常任务生成回答。" : aiAnswer}</p>
                    {aiAnswerMeta && <em>{aiAnswerMeta}</em>}
                  </article>
                )}
              </div>
            </aside>
          </section>

          <section className="aiTaskPanel">
            <div className="aiPanelHeader">
              <div>
                <h2>AI 任务中心</h2>
                <span>待处理任务（{tasks.filter((item) => item.status !== "已完成").length}）</span>
              </div>
              <div className="aiTaskActions">
                <button onClick={refreshAll} disabled={refreshing}>刷新</button>
                <button>更多任务</button>
              </div>
            </div>
            <table className="aiTaskTable">
              <thead>
                <tr>
                  <th>任务类型</th>
                  <th>任务标题</th>
                  <th>场馆</th>
                  <th>优先级</th>
                  <th>截止时间</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, idx) => (
                  <tr key={`task-${idx}-${task.title}`}>
                    <td>{task.type}</td>
                    <td>{task.title}</td>
                    <td>{task.venue}</td>
                    <td><span className={`priority priority-${task.priority}`}>{task.priority}</span></td>
                    <td>{task.due}</td>
                    <td><span className="taskStatus">{task.status}</span></td>
                    <td>
                      <button className="taskAction" onClick={() => dispatchHermesTask(task)} disabled={dispatchingTask === task.title}>
                        {dispatchingTask === task.title ? "派发中" : task.action}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="automationRunList">
              <strong>Hermes 自动化记录</strong>
              {automationTasks.slice(0, 4).map((task) => (
                <article className={`automationRun status-${task.status}`} key={task.id}>
                  <div>
                    <span>{task.title}</span>
                    <em>{task.venue} · {automationStatusLabel(task.status)}</em>
                  </div>
                  <p>{task.result || task.error || "已派发给 Hermes，等待后台执行。"}</p>
                </article>
              ))}
              {!automationTasks.length && <p className="automationEmpty">还没有派发过 Hermes 自动化任务。</p>}
            </div>
          </section>

          <section className="aiStatusRow">
            <DataSourceStatusCard platforms={state.dataSources?.data.platforms || []} />
            <DailyReportCard report={dailyReport} />
          </section>
        </section>
      </main>
    </>
  );
}

function KpiCard({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "gold" | "blue" | "cyan" }) {
  return (
    <article className={`aiKpiCard tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{delta}</em>
    </article>
  );
}

function DataSourceStatusCard({ platforms }: { platforms: DataSourcePlatformStatus[] }) {
  return (
    <div className="aiPanel">
      <div className="aiPanelHeader">
        <h2>数据源状态</h2>
        <span>真实 / 异常 / Excel</span>
      </div>
      <div className="sourceStatusList">
        {platforms.map((item) => (
          <div className={`sourceStatusItem statusItem-${item.status}`} key={item.platform}>
            <div>
              <strong>{platformLabel(item.platform)}</strong>
              <span>{sourceLabel(item.data_source)} · {item.message}</span>
            </div>
            <em>{statusLabel(item.status)}</em>
          </div>
        ))}
        {!platforms.length && <div className="emptyState">暂无状态数据</div>}
      </div>
    </div>
  );
}

function DailyReportCard({ report }: { report?: string }) {
  const [reportType, setReportType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportData, setReportData] = useState<Record<string, string>>({});
  const [reportError, setReportError] = useState("");
  const [loading, setLoading] = useState(false);

  // 加载报告数据
  const loadReport = useCallback(async (type: "daily" | "weekly" | "monthly") => {
    setReportError("");
    if (reportData[type]) return; // 已缓存
    setLoading(true);
    try {
      const fetchers = {
        daily: fetchDailyReport,
        weekly: fetchAiWeeklyReport,
        monthly: fetchAiMonthlyReport,
      };
      const res = await fetchers[type]();
      setReportData(prev => ({ ...prev, [type]: formatReportPayload((res as any).data ?? res, type) }));
    } catch (e: any) {
      const message = e?.message || "加载报告失败";
      setReportError(message);
      setReportData(prev => ({ ...prev, [type]: prev[type] || "" }));
    } finally {
      setLoading(false);
    }
  }, [reportData]);

  // 初始加载日报
  useEffect(() => {
    if (report && !reportData.daily) {
      setReportData(prev => ({ ...prev, daily: report }));
    }
  }, [report, reportData.daily]);

  // 切换报告类型
  const handleTypeChange = (type: "daily" | "weekly" | "monthly") => {
    setReportType(type);
    loadReport(type);
  };

  const currentReport = reportData[reportType] || "";

  const copyReport = async () => {
    if (!currentReport) return;
    await navigator.clipboard.writeText(currentReport);
  };

  const typeLabels = {
    daily: "日报",
    weekly: "周报",
    monthly: "月报",
  };

  return (
    <div className="aiPanel">
      <div className="aiPanelHeader">
        <div className="reportTypeTabs">
          {(["daily", "weekly", "monthly"] as const).map((type) => (
            <button
              key={type}
              className={`reportTypeTab ${reportType === type ? "active" : ""}`}
              onClick={() => handleTypeChange(type)}
            >
              {typeLabels[type]}
            </button>
          ))}
        </div>
        <button className="copyButton" onClick={copyReport} disabled={!currentReport}>复制</button>
      </div>
      {loading ? (
        <div className="loadingState">加载中...</div>
      ) : reportError ? (
        <pre className="dailyReportText">{`报告加载失败：${reportError}`}</pre>
      ) : (
        <pre className="dailyReportText">{currentReport || `暂无${typeLabels[reportType]}数据`}</pre>
      )}
    </div>
  );
}

function formatReportPayload(payload: any, type: "daily" | "weekly" | "monthly"): string {
  if (!payload) return "";
  if (typeof payload.report === "string") return payload.report;

  const typeLabel = type === "daily" ? "日报" : type === "weekly" ? "周报" : "月报";
  const lines = [`翡翠城经营${typeLabel}`];
  const date = payload.report_date || payload.generated_at?.slice?.(0, 10);
  if (date) lines.push(`日期: ${date}`);

  if (payload.summary) {
    lines.push("");
    lines.push(`总收入: ${currency(payload.summary.total_revenue || 0)}`);
    if (payload.summary.total_orders) lines.push(`总订单: ${payload.summary.total_orders}单`);
    if (payload.summary.total_customers) lines.push(`总客流: ${payload.summary.total_customers}人`);
  }

  if (Array.isArray(payload.businesses) && payload.businesses.length) {
    lines.push("");
    for (const item of payload.businesses) {
      const revenue = item.today?.revenue ?? item.period?.revenue ?? 0;
      lines.push(`${item.venue || ""}${item.name || ""}: ${currency(revenue)}`);
    }
  }

  if (Array.isArray(payload.suggestions) && payload.suggestions.length) {
    lines.push("");
    lines.push("建议:");
    payload.suggestions.forEach((item: string, index: number) => lines.push(`${index + 1}. ${item}`));
  }

  return lines.join("\n");
}

function DataQualityCard({ summary }: { summary?: DataQualitySummary }) {
  const statusIcon = (status: string) => {
    if (status === "normal") return "✅";
    if (status === "warning") return "⚠️";
    return "❌";
  };
  const statusText = (status: string) => {
    if (status === "normal") return "正常";
    if (status === "warning") return "警告";
    return "异常";
  };
  const sources = summary?.sources || [];
  const overallStatus = summary?.overall_status || "error";

  return (
    <div className="aiPanel aiDataQualityCard">
      <div className="aiPanelHeader">
        <h2>数据可信度</h2>
        <span>{overallStatus === "normal" ? "✅ 全部正常" : overallStatus === "warning" ? "⚠️ 存在警告" : "❌ 严重异常"}</span>
      </div>
      <div className="dataQualityList">
        {sources.map((src) => (
          <div className="dataQualityItem" key={src.platform}>
            <div>
              <strong>{src.name}</strong>
              <span>{src.freshness_label}</span>
            </div>
            <div className="dataQualityMeta">
              <span>{statusIcon(src.status)} {src.status_label || statusText(src.status)}</span>
              {src.last_update && <em>{new Date(src.last_update).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</em>}
            </div>
          </div>
        ))}
        {!sources.length && <div className="emptyState">暂无数据源状态</div>}
      </div>
      <Link className="aiViewMore" href="/dashboard/data-quality">查看详情 →</Link>
    </div>
  );
}

function AiAnomaliesCard({ anomalies, businessAlerts = [] }: { anomalies: AiAnomaly[]; businessAlerts?: BusinessAlert[] }) {
  const top = anomalies.slice(0, 3);
  const topBusinessAlerts = businessAlerts.slice(0, 3);

  return (
    <div className="aiPanel aiAnomaliesCard">
      <div className="aiPanelHeader">
        <h2>今日异常预警</h2>
        <span>{anomalies.length + businessAlerts.length ? `${anomalies.length + businessAlerts.length} 条预警` : "暂无预警"}</span>
      </div>
      <div className="anomalyList">
        {topBusinessAlerts.map((item) => (
          <article className={`anomalyItem direction-${item.level === "danger" ? "negative" : "positive"}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.businessName} · {item.message}</span>
            </div>
            <div className="anomalyMeta">
              <span className={`anomalyConfidence confidence-${businessAlertSeverity(item.level)}`}>{businessAlertLevelLabel(item.level)}</span>
            </div>
          </article>
        ))}
        {top.map((item) => (
          <article className={`anomalyItem direction-${item.direction}`} key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.business_type} · {item.direction === "positive" ? "📈 增长" : "📉 下降"} {Math.abs(item.change_rate * 100).toFixed(1)}%</span>
            </div>
            <div className="anomalyMeta">
              <span className={`anomalyConfidence confidence-${item.severity}`}>置信度 {(item.confidence * 100).toFixed(0)}%</span>
            </div>
          </article>
        ))}
        {!top.length && !topBusinessAlerts.length && <div className="emptyState">暂无异常预警</div>}
      </div>
      <Link className="aiViewMore" href="/dashboard/alerts">查看全部预警 →</Link>
    </div>
  );
}

export function getBusinessCards(overview?: OverviewData): BusinessCard[] {
  const [billiards, mahjong, cinema] = toOverviewBusinessSummaries(overview);
  return [
    {
      label: "台球",
      href: "/dashboard/billiards",
      status: businessStatusLabel(billiards),
      revenue: billiards.revenue,
      ordersLabel: `订单量 ${billiards.orders}`,
      peopleLabel: `利用率 ${percent(billiards.utilizationRate || 0)}`,
      accent: "blue",
    },
    {
      label: "棋牌",
      href: "/dashboard/mahjong",
      status: businessStatusLabel(mahjong),
      revenue: mahjong.revenue,
      ordersLabel: `订单量 ${mahjong.orders}`,
      peopleLabel: `利用率 ${percent(mahjong.utilizationRate || 0)}`,
      accent: "green",
    },
    {
      label: "影院",
      href: "/dashboard/cinema",
      status: businessStatusLabel(cinema),
      revenue: cinema.revenue,
      ordersLabel: `场次数 ${cinema.orders}`,
      peopleLabel: `观影人次 ${cinema.customers}`,
      accent: "gold",
    },
  ];
}

function businessAlertSeverity(level: BusinessAlert["level"]): AiAnomaly["severity"] {
  if (level === "danger") return "high";
  if (level === "warning") return "medium";
  return "low";
}

function businessAlertLevelLabel(level: BusinessAlert["level"]) {
  if (level === "danger") return "高";
  if (level === "warning") return "中";
  return "低";
}

function businessInsightTone(priority: BusinessInsight["priority"]): "red" | "gold" | "green" {
  if (priority === "high") return "red";
  if (priority === "medium") return "gold";
  return "green";
}

function businessStatusLabel(summary: { status: string; statusMessage?: string }) {
  if (summary.status === "normal") return "营业中";
  if (summary.status === "warning") return summary.statusMessage || "数据异常";
  if (summary.status === "error") return summary.statusMessage || "数据异常";
  if (summary.status === "empty") return summary.statusMessage || "未导入";
  return summary.statusMessage || "未知";
}

export function buildAiInsights(overview?: OverviewData, alerts: AlertItem[] = [], report?: string): AiInsight[] {
  const insights: AiInsight[] = [];
  const topBusiness = getBusinessCards(overview).sort((a, b) => b.revenue - a.revenue)[0];
  if (topBusiness?.revenue) {
    insights.push({
      title: `${topBusiness.label}贡献最高`,
      detail: `当前收入 ${currency(topBusiness.revenue)}，建议优先保障高峰时段服务。`,
      impact: `贡献 ${overview?.total_revenue ? Math.round((topBusiness.revenue / overview.total_revenue) * 100) : 0}%`,
      tone: "blue",
    });
  }
  const critical = alerts.find((item) => item.level === "critical");
  if (critical) {
    insights.push({
      title: "存在高优先级风险",
      detail: critical.message,
      impact: "需立即处理",
      tone: "red",
    });
  }
  if (overview?.cinema?.status !== "ok") {
    insights.push({
      title: "影院数据不完整",
      detail: "影院未导入时不会计入总收入，建议补齐凤凰云智报表。",
      impact: "影响总览",
      tone: "gold",
    });
  }
  if (report && insights.length < 3) {
    insights.push({
      title: "AI 日报已生成",
      detail: firstReportLine(report),
      impact: "可复制",
      tone: "green",
    });
  }
  while (insights.length < 3) {
    insights.push({
      title: "经营流动稳定",
      detail: "当前核心业务有数据回传，建议继续关注订单、客流和数据源状态。",
      impact: "正常",
      tone: "green",
    });
  }
  return insights.slice(0, 3);
}

export function buildAiTasks(overview?: OverviewData, alerts: AlertItem[] = []): AiTask[] {
  const tasks: AiTask[] = alerts.slice(0, 3).map((alert) => ({
    type: alert.level === "critical" ? "系统告警" : "经营提醒",
    title: alert.message,
    venue: platformShortLabel(alert.platform),
    priority: alert.level === "critical" ? "高" : "中",
    status: "待处理",
    action: "去处理",
    due: "今日 18:00",
  }));
  if (overview?.cinema?.status !== "ok") {
    tasks.push({
      type: "数据任务",
      title: "影院报表未完整导入，请补传凤凰云智 Excel",
      venue: "影院",
      priority: "中",
      status: "待处理",
      action: "去导入",
      due: "今日 20:00",
    });
  }
  tasks.push(
    {
      type: "经营建议",
      title: "复盘今日低峰时段，优化会员活动触达",
      venue: "全场馆",
      priority: "低",
      status: "待处理",
      action: "查看",
      due: "明日 10:00",
    },
    {
      type: "报表任务",
      title: "生成本周经营日报并同步给管理层",
      venue: "全场馆",
      priority: "低",
      status: "待处理",
      action: "生成",
      due: "周日 21:00",
    },
  );
  return tasks.slice(0, 6);
}

function buildSummary(overview?: OverviewData, alerts: AlertItem[] = []) {
  if (!overview) return "正在读取台球、棋牌、影院数据。数据到齐后，AI 会自动生成经营摘要、风险判断和处理任务。";
  const riskText = alerts.length ? `当前有 ${alerts.length} 条提醒需要处理。` : "当前未发现高危经营异常。";
  return `今日总收入 ${currency(overview.total_revenue)}，已计入 ${overview.included_platforms?.map(platformShortLabel).join("、") || "暂无业务"}。${riskText} 建议优先关注数据源完整性、收入贡献最高业务和低峰时段转化。`;
}

function calculateHealthScore(overview?: OverviewData, alerts: AlertItem[] = [], status = "正常") {
  let score = overview ? 92 : 68;
  score -= alerts.filter((item) => item.level === "critical").length * 18;
  score -= alerts.filter((item) => item.level === "warning").length * 8;
  if (status !== "正常" && status !== "mock") score -= 8;
  if (overview?.cinema?.status !== "ok") score -= 8;
  return Math.max(45, Math.min(98, score));
}

function calculateCustomerTotal(overview?: OverviewData) {
  if (!overview) return 0;
  const cinemaCustomers = overview.cinema?.status === "ok" ? overview.cinema.customer_count : 0;
  const xiaotieOrders = overview.platforms.xiaotie?.orders || 0;
  const mahjongOrders = overview.platforms.wu_laoban?.orders || 0;
  return cinemaCustomers + xiaotieOrders + mahjongOrders;
}

function firstReportLine(report: string) {
  return report.split("\n").map((line) => line.trim()).find(Boolean) || "AI 已读取经营日报。";
}

function platformLabel(platform: string) {
  return { wu_laoban: "無老板棋牌", xiaotie: "小铁台球", fenghuang: "凤凰云智影院" }[platform] || platform;
}

function platformShortLabel(platform: string) {
  return { wu_laoban: "棋牌", xiaotie: "台球", fenghuang: "影院", cinema: "影院" }[platform] || platform;
}

function sourceLabel(source: string) {
  return { api: "真实数据", mock: "占位", placeholder: "占位", excel: "Excel导入", mixed: "混合数据", none: "暂无数据" }[source] || source;
}

function statusLabel(status: string) {
  return {
    ok: "正常",
    token_invalid: "token失效",
    sync_failed: "同步失败",
    failed: "同步失败",
    skipped: "跳过",
    not_connected: "未接入",
    not_imported: "未导入",
    error: "导入失败",
    placeholder: "占位",
  }[status] || status;
}

function automationTypeForTask(task: AiTask) {
  if (task.type.includes("数据")) return "data_followup";
  if (task.type.includes("报表")) return "report_generation";
  if (task.type.includes("告警")) return "alert_followup";
  return "operations_followup";
}

function automationStatusLabel(status: string) {
  return { queued: "已派发", running: "执行中", success: "已完成", failed: "执行失败" }[status] || status;
}

function aiSourceLabel(source: string) {
  return { llm: "大模型回答", fallback: "规则兜底", not_configured: "待配置", empty: "空问题" }[source] || source;
}

function currency(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function percent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
