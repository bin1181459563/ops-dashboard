import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { generateBusinessAlerts } from "../lib/businessAlertRules";
import type { BusinessAlert } from "../lib/businessAlertRules";
import { generateBusinessInsights } from "../lib/businessInsightRules";
import type { BusinessInsight } from "../lib/businessInsightRules";
import { toOverviewBusinessSummaries } from "../lib/businessAdapters";
import { buildBusinessReportSections } from "../lib/businessReportRules";
import {
  DATA_MODE,
  fetchDailyReport,
  fetchDataQualitySummary,
  fetchDataSourcesStatus,
  fetchOverview,
  runCollect,
} from "../lib/dashboardApi";
import type { AlertItem, DashboardState, DataQualitySummary, DataSourcePlatformStatus, OverviewData } from "../types/dashboard";

type RiskLevel = "low" | "medium" | "high";
type Accent = "blue" | "green" | "orange";

interface BusinessCard {
  label: string;
  href: string;
  revenue: number;
  orders: number;
  utilizationRate: number | null;
  avgOrderValue: number;
  accent: Accent;
}

interface DecisionModel {
  summary: string;
  riskLevel: RiskLevel;
  issues: BusinessAlert[];
  actions: string[];
  reportSummary: string;
}

interface AiInsightItem {
  title: string;
  detail: string;
  impact: string;
}

interface AiTaskItem {
  title: string;
  action: string;
  priority: "高" | "中" | "低";
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({});
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const initialRefreshDone = useRef(false);

  const overview = state.overview?.data;
  const dailyReport = state.dailyReport?.data.report;
  const summaries = useMemo(() => toOverviewBusinessSummaries(overview), [overview]);
  const businessCards = useMemo(() => getBusinessCards(overview), [overview]);
  const businessAlerts = useMemo(() => selectTopAlerts(generateBusinessAlerts(summaries), 20), [summaries]);
  const topAlerts = useMemo(() => selectTopAlerts(businessAlerts, 3), [businessAlerts]);
  const businessInsights = useMemo(() => generateBusinessInsights({ summaries, alerts: businessAlerts }), [summaries, businessAlerts]);
  const topInsights = useMemo(() => selectTopInsights(businessInsights, 3), [businessInsights]);
  const totalCustomers = calculateCustomerTotal(overview);
  const availableRooms = roomsAvailable(overview);
  const reportSections = useMemo(
    () => buildBusinessReportSections({
      reportType: "daily",
      reportDate: currentTime?.toISOString().slice(0, 10) || "2026-06-24",
      summary: {
        total_revenue: overview?.total_revenue || 0,
        total_orders: overview?.total_orders || 0,
        total_customers: totalCustomers,
      },
      businesses: businessCards.map((item) => ({
        name: item.label,
        venue: item.label,
        revenue: item.revenue,
        orders: item.orders,
        customers: 0,
      })),
      insights: topInsights,
      baseReport: dailyReport,
    }),
    [businessCards, currentTime, dailyReport, overview, topInsights, totalCustomers],
  );
  const decision = useMemo(
    () => buildDecisionModel({ overview, alerts: topAlerts, insights: topInsights, report: dailyReport, reportHeadline: reportSections.headline }),
    [dailyReport, overview, reportSections.headline, topAlerts, topInsights],
  );

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setCurrentTime(new Date());
    try {
      await runCollect().catch(() => {});
      const [overviewResult, sourcesResult, reportResult, qualityResult] = await Promise.allSettled([
        fetchOverview(),
        fetchDataSourcesStatus(),
        fetchDailyReport(),
        fetchDataQualitySummary(),
      ] as const);
      setState((previous) => ({
        ...previous,
        overview: overviewResult.status === "fulfilled" ? overviewResult.value : previous.overview,
        dataSources: sourcesResult.status === "fulfilled" ? sourcesResult.value : previous.dataSources,
        dailyReport: reportResult.status === "fulfilled" ? reportResult.value : previous.dailyReport,
        dataQuality: qualityResult.status === "fulfilled" ? qualityResult.value : previous.dataQuality,
      }));
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  useEffect(() => {
    if (initialRefreshDone.current) return;
    initialRefreshDone.current = true;
    refreshAll();
  }, []);

  const cinema = businessCards[0];
  const billiards = businessCards[1];
  const mahjong = businessCards[2];

  return (
    <>
      <Head>
        <title>经营中心 - 翡翠城</title>
      </Head>
      <main className="lightDashboard">
        <aside className="sideRail">
          <div className="brandLockup">
            <span className="brandMark">sf.</span>
            <strong>经营中心</strong>
          </div>
          <nav className="navStack">
            {[
              ["经营概览", "/dashboard", "⌂", true],
              ["数据分析", "/dashboard/revenue-forecast", "▥", false],
              ["门店/场馆", "/dashboard/cross-business", "▤", false],
              ["商品管理", "/dashboard/concession", "▣", false],
              ["营销活动", "/dashboard/screening-suggestions", "◇", false],
              ["会员管理", "/dashboard/member", "♧", false],
              ["财务管理", "/dashboard/profit", "▧", false],
              ["报表中心", "/dashboard/reports", "▢", false],
              ["系统设置", "/dashboard/data-quality", "⚙", false],
            ].map(([label, href, icon, active]) => (
              <Link className={`navItem ${active ? "active" : ""}`} href={String(href)} key={String(label)}>
                <span>{icon}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="syncBadge">
            <span>◎</span>
            <strong>数据状态</strong>
            <em>{dataStatusText(state.dataQuality?.data)}</em>
            <small>最后更新 {currentTime ? formatTime(currentTime) : "14:30"}</small>
          </div>
          <button className="collapseMenu">‹ 收起菜单</button>
        </aside>

        <section className="dashboardStage">
          <header className="topBar">
            <div>
              <h1>老板，今天经营状况良好 👋</h1>
              <p>数据更新时间：{currentTime ? formatFullDateTime(currentTime) : "2026-06-24 14:30"} <span /></p>
            </div>
            <div className="topControls">
              <button>{formatControlDate(currentTime)}</button>
              <button>{currentTime ? formatTime(currentTime) : "14:30"}</button>
              <button onClick={refreshAll} disabled={refreshing}>{refreshing ? "刷新中" : "刷新数据"}</button>
              <div className="ownerProfile">
                <Image alt="老板头像" src="/images/dashboard-avatar-v2.png" width={34} height={34} />
                <strong>老板</strong>
                <span>⌄</span>
              </div>
            </div>
          </header>

          <HeroSummaryCard
            totalRevenue={overview?.total_revenue || 0}
            totalOrders={overview?.total_orders || 0}
            availableRooms={availableRooms}
            decision={decision}
            currentTime={currentTime}
          />

          <section className="mainGrid">
            <CinemaPrimeCard card={cinema} cinema={overview?.cinema} />
            <VenueMiniCard card={billiards} target={50000} />
            <VenueMiniCard card={mahjong} target={37000} />
          </section>

          <section className="bottomGrid">
            <TrendCard cards={businessCards} />
            <ProblemCard alerts={topAlerts} total={businessAlerts.length} />
            <ActionCard insights={topInsights} total={businessInsights.length} />
          </section>

          <AiStrategyStrip decision={decision} />
          <DetailsSection report={dailyReport} platforms={state.dataSources?.data.platforms || []} quality={state.dataQuality?.data} />
        </section>
      </main>
      <DashboardStyles />
    </>
  );
}

function HeroSummaryCard({
  totalRevenue,
  totalOrders,
  availableRooms,
  decision,
  currentTime,
}: {
  totalRevenue: number;
  totalOrders: number;
  availableRooms: number;
  decision: DecisionModel;
  currentTime: Date | null;
}) {
  return (
    <section className="heroCard">
      <div className="heroMetric">
        <span>今日总收入（实收金额）</span>
        <strong>{currency(totalRevenue || 185700)}</strong>
        <div>
          <em>较昨日 +¥20,890.50</em>
          <b>↑ 12.6%</b>
        </div>
      </div>
      <div className="heroStats">
        <MiniStat label="自助售卖机" value="¥16,800" hint="月累计 835 台" />
        <MiniStat label="开台/包间总数" value={`${availableRooms || 28} / ${totalOrders ? Math.max(totalOrders, 32) : 32}`} hint="使用中" />
        <MiniStat label="数据状态" value={riskHeroLabel(decision.riskLevel)} hint={`最后更新 ${currentTime ? formatTime(currentTime) : "14:30"}`} positive />
      </div>
      <Image className="heroVisual" alt="经营数据趋势插画" src="/images/dashboard-hero-visual-v2.png" width={269} height={240} priority />
    </section>
  );
}

function MiniStat({ label, value, hint, positive = false }: { label: string; value: string; hint: string; positive?: boolean }) {
  return (
    <div className="miniStat">
      <span>{label}</span>
      <strong className={positive ? "positive" : ""}>{value}</strong>
      <em>{hint}</em>
    </div>
  );
}

function CinemaPrimeCard({ card, cinema }: { card: BusinessCard; cinema?: OverviewData["cinema"] }) {
  const concession = cinema?.concession_revenue || Math.round(card.revenue * 0.33);
  const ticket = cinema?.box_office || Math.max(card.revenue - concession, 0);
  const customers = cinema?.customer_count || card.orders || 2856;
  const spp = customers ? concession / customers : 21.35;
  return (
    <section className="primeCard">
      <div className="cardHeader">
        <div className="venueTitle">
          <span className="venueIcon purple">☷</span>
          <strong>影院（核心利润引擎）</strong>
          <em>核心业务</em>
        </div>
        <button>今日⌄</button>
      </div>
      <div className="primeMetrics">
        <MetricBlock label="票房（流量）" title="票房收入" value={currency(ticket || 125620)} delta="↑ 9.3%" tone="blue" />
        <MetricBlock label="卖品（利润核心）" title="卖品收入" value={currency(concession || 60955)} delta="↑ 18.6%" tone="green" />
        <MetricBlock label="客单价" title="客单价" value={`¥${(card.avgOrderValue || 32.88).toFixed(2)}`} delta="↑ 6.3%" />
        <MetricBlock label="人次" title="人次" value={formatNumber(customers)} delta="↑ 8.7%" />
        <MetricBlock label="场均票价" title="场均票价" value="¥43.98" delta="↑ 0.6%" />
        <div className="sppBlock">
          <span>SPP（每人卖品消费）</span>
          <strong>¥{spp.toFixed(2)}</strong>
          <em>较昨日 ↑ 9.1%</em>
        </div>
        <div className="donutBlock">
          <span>卖品收入占比</span>
          <div className="donut"><b>{percent(card.revenue ? concession / card.revenue : 0.327)}</b></div>
        </div>
      </div>
      <div className="miniCurves">
        <MiniCurve color="#586eff" />
        <MiniCurve color="#63d891" flip />
      </div>
    </section>
  );
}

function MetricBlock({ label, title, value, delta, tone }: { label: string; title: string; value: string; delta: string; tone?: "blue" | "green" }) {
  return (
    <div className={`metricBlock ${tone || ""}`}>
      <span>{label}</span>
      <em>{title}</em>
      <strong>{value}</strong>
      <small>较昨日 {delta}</small>
    </div>
  );
}

function VenueMiniCard({ card, target }: { card: BusinessCard; target: number }) {
  const monthly = Math.min(96, Math.max(18, (card.revenue / target) * 100));
  const yearly = Math.min(88, monthly * 0.78);
  return (
    <section className={`venueCard ${card.accent}`}>
      <div className="cardHeader">
        <div className="venueTitle">
          <span className={`venueIcon ${card.accent}`}>{card.label.slice(0, 1)}</span>
          <strong>{card.label}</strong>
        </div>
        <button>今日⌄</button>
      </div>
      <div className="venueMetrics">
        <MiniMetric label="收入" value={currency(card.revenue)} delta="↑ 6.2%" />
        <MiniMetric label="人次" value={formatNumber(card.orders)} delta="↑ 5.1%" />
        <MiniMetric label="利用率" value={percent(card.utilizationRate || 0.64)} delta="↓ 2.3%" warn />
        <MiniMetric label="客单价" value={`¥${(card.avgOrderValue || 29.99).toFixed(2)}`} delta="↑ 1.1%" />
        <MiniMetric label={card.label === "台球" ? "开台数" : "包间使用率"} value={card.label === "台球" ? "18" : "13 / 16"} delta="↑ 1" />
      </div>
      <ProgressRow label="月完成度" value={monthly} target={target} color={card.accent === "orange" ? "#ffad4d" : "#51bf72"} />
      <ProgressRow label="年完成度" value={yearly} target={target * 12} color={card.accent === "orange" ? "#ffad4d" : "#51bf72"} />
    </section>
  );
}

function MiniMetric({ label, value, delta, warn = false }: { label: string; value: string; delta: string; warn?: boolean }) {
  return (
    <div className="miniMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      <em className={warn ? "down" : ""}>较昨日 {delta}</em>
    </div>
  );
}

function ProgressRow({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="progressRow">
      <span>{label}</span>
      <em>{value.toFixed(1)}%</em>
      <div><b style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>
      <small>目标 {currency(target)}</small>
    </div>
  );
}

function TrendCard({ cards }: { cards: BusinessCard[] }) {
  return (
    <section className="chartCard">
      <div className="cardHeader">
        <div className="venueTitle">
          <span className="venueIcon blue">⌁</span>
          <strong>收入趋势（近7日）</strong>
        </div>
        <div className="legend">
          {cards.map((item) => <span className={item.accent} key={item.label}>{item.label}收入</span>)}
        </div>
      </div>
      <svg className="trendSvg" viewBox="0 0 560 210" role="img" aria-label="近7日收入趋势">
        {[40, 80, 120, 160].map((y) => <line key={y} x1="40" x2="540" y1={y} y2={y} stroke="#edf1fb" strokeWidth="1" />)}
        <TrendPath color="#5a82ff" points="45,78 112,88 180,70 248,76 316,66 384,48 452,64 528,58" />
        <TrendPath color="#9d65ff" points="45,128 112,115 180,104 248,116 316,110 384,94 452,108 528,112" />
        <TrendPath color="#62cd8a" points="45,176 112,168 180,154 248,162 316,158 384,150 452,154 528,148" />
        <TrendPath color="#ffad37" points="45,178 112,170 180,166 248,168 316,166 384,160 452,164 528,162" />
        {["06/18", "06/19", "06/20", "06/21", "06/22", "06/23", "06/24"].map((label, idx) => (
          <text key={label} x={45 + idx * 80} y="200" fill={idx === 6 ? "#2563ff" : "#8a94ad"} fontSize="11">{label}</text>
        ))}
      </svg>
    </section>
  );
}

function TrendPath({ color, points }: { color: string; points: string }) {
  return (
    <>
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(" ").map((point) => {
        const [x, y] = point.split(",");
        return <circle key={`${color}-${point}`} cx={x} cy={y} r="3.5" fill={color} stroke="#fff" strokeWidth="2" />;
      })}
    </>
  );
}

function ProblemCard({ alerts, total }: { alerts: BusinessAlert[]; total: number }) {
  return (
    <section className="topListCard problem">
      <div className="cardHeader">
        <div className="venueTitle">
          <span className="alertIcon">△</span>
          <strong>Top 3 问题</strong>
        </div>
        {total > 3 && <Link href="/dashboard/alerts">查看全部</Link>}
      </div>
      <div className="rankList">
        {alerts.map((item, index) => (
          <article key={item.id}>
            <b>{index + 1}</b>
            <div>
              <strong>{item.businessName}：{shortText(item.title, 12)}</strong>
              <span>{shortText(item.message, 28)}</span>
            </div>
            <em className={item.level === "danger" ? "high" : "mid"}>{item.level === "danger" ? "严重" : "中等"}</em>
          </article>
        ))}
        {!alerts.length && <p className="emptyCopy">暂无高优先级问题</p>}
      </div>
    </section>
  );
}

function ActionCard({ insights, total }: { insights: BusinessInsight[]; total: number }) {
  return (
    <section className="topListCard action">
      <div className="cardHeader">
        <div className="venueTitle">
          <span className="actionIcon">✣</span>
          <strong>Top 3 行动建议</strong>
        </div>
        {total > 3 && <Link href="/dashboard/reports">查看全部</Link>}
      </div>
      <div className="rankList">
        {insights.map((item, index) => (
          <article key={item.id}>
            <b>{index + 1}</b>
            <div>
              <strong>{shortText(item.title, 18)}</strong>
              <span>{shortText(firstInsightAction(item), 34)}</span>
            </div>
            <em className={item.priority === "high" ? "high" : "mid"}>{item.priority === "high" ? "高" : "中"}</em>
          </article>
        ))}
        {!insights.length && <p className="emptyCopy">暂无重点行动建议</p>}
      </div>
    </section>
  );
}

function AiStrategyStrip({ decision }: { decision: DecisionModel }) {
  return (
    <section className="aiStrip">
      <div>
        <span>✦</span>
        <strong>AI 经营洞察</strong>
      </div>
      <p>{decision.summary} {decision.actions[0] ? `建议优先执行：${decision.actions[0]}。` : decision.reportSummary}</p>
      <button>查看详情 →</button>
    </section>
  );
}

function DetailsSection({ report, platforms, quality }: { report?: string; platforms: DataSourcePlatformStatus[]; quality?: DataQualitySummary }) {
  return (
    <section className="detailsRow">
      <details>
        <summary>Report（默认折叠）</summary>
        <pre>{report || "暂无日报内容"}</pre>
      </details>
      <details>
        <summary>数据状态（默认折叠）</summary>
        <div className="statusGrid">
          {platforms.map((item) => (
            <span key={item.platform}>{platformLabel(item.platform)}：{statusLabel(item.status)}</span>
          ))}
          <span>可信度：{dataStatusText(quality)}</span>
        </div>
      </details>
    </section>
  );
}

function MiniCurve({ color, flip = false }: { color: string; flip?: boolean }) {
  const points = flip ? "0,46 40,28 82,44 122,36 166,42 206,28 250,36 300,52" : "0,50 42,36 82,42 122,28 164,52 204,45 250,20 300,40";
  return (
    <svg viewBox="0 0 300 72" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${points.replaceAll(" ", " L ")} L 300 72 L 0 72 Z`} fill={color} opacity="0.13" />
    </svg>
  );
}

export function getBusinessCards(overview?: OverviewData): BusinessCard[] {
  if (!overview) {
    return [
      { label: "影院", href: "/dashboard/cinema", revenue: 185700, orders: 2856, utilizationRate: 0.724, avgOrderValue: 32.88, accent: "blue" },
      { label: "台球", href: "/dashboard/billiards", revenue: 36850, orders: 1245, utilizationRate: 0.684, avgOrderValue: 29.99, accent: "green" },
      { label: "棋牌", href: "/dashboard/mahjong", revenue: 24105, orders: 856, utilizationRate: 0.621, avgOrderValue: 28.18, accent: "orange" },
    ];
  }
  const [billiardsSummary, mahjongSummary, cinemaSummary] = toOverviewBusinessSummaries(overview);
  return [
    {
      label: "影院",
      href: "/dashboard/cinema",
      revenue: cinemaSummary.revenue || overview?.cinema?.revenue || 0,
      orders: cinemaSummary.orders || overview?.cinema?.screenings || 0,
      utilizationRate: cinemaSummary.utilizationRate || overview?.cinema?.occupancy_rate || 0,
      avgOrderValue: cinemaSummary.avgOrderValue || overview?.cinema?.avg_order_value || 0,
      accent: "blue",
    },
    {
      label: "台球",
      href: "/dashboard/billiards",
      revenue: billiardsSummary.revenue,
      orders: billiardsSummary.orders,
      utilizationRate: billiardsSummary.utilizationRate,
      avgOrderValue: billiardsSummary.avgOrderValue || 29.99,
      accent: "green",
    },
    {
      label: "棋牌",
      href: "/dashboard/mahjong",
      revenue: mahjongSummary.revenue,
      orders: mahjongSummary.orders,
      utilizationRate: mahjongSummary.utilizationRate,
      avgOrderValue: mahjongSummary.avgOrderValue || 28.18,
      accent: "orange",
    },
  ];
}

export function buildAiInsights(overview?: OverviewData, alerts: AlertItem[] = [], report?: string): AiInsightItem[] {
  const cards = getBusinessCards(overview);
  const topBusiness = [...cards].sort((a, b) => b.revenue - a.revenue)[0];
  const insights: AiInsightItem[] = [];
  if (topBusiness?.revenue) {
    insights.push({
      title: `${topBusiness.label}贡献最高`,
      detail: `当前收入 ${currency(topBusiness.revenue)}，优先保障高峰服务。`,
      impact: "核心收入",
    });
  }
  const critical = alerts.find((item) => item.level === "critical");
  if (critical) {
    insights.push({ title: "存在高优先级风险", detail: critical.message, impact: "需立即处理" });
  }
  if (report) {
    insights.push({ title: "AI 日报已生成", detail: firstReportLine(report), impact: "可复盘" });
  }
  return insights.length ? insights.slice(0, 3) : [{ title: "经营流动稳定", detail: "继续关注收入、订单和数据源状态。", impact: "正常" }];
}

export function buildAiTasks(overview?: OverviewData, alerts: AlertItem[] = []): AiTaskItem[] {
  const tasks = alerts.slice(0, 3).map((alert) => ({
    title: alert.message,
    action: "去处理",
    priority: alert.level === "critical" ? "高" as const : "中" as const,
  }));
  if (overview?.cinema?.status !== "ok") {
    tasks.push({ title: "影院报表未完整导入，请补传凤凰云智 Excel", action: "去导入", priority: "中" });
  }
  return tasks.length ? tasks : [{ title: "复盘今日低峰时段，优化会员活动触达", action: "查看", priority: "低" }];
}

function selectTopAlerts(alerts: BusinessAlert[], limit: number): BusinessAlert[] {
  const deduped = new Map<string, BusinessAlert>();
  for (const alert of alerts) {
    const key = `${alert.businessType}-${alert.category}-${normalizeText(alert.title || alert.message)}`;
    const existing = deduped.get(key);
    if (!existing || existing.priorityScore < alert.priorityScore) deduped.set(key, alert);
  }
  return [...deduped.values()].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
}

function selectTopInsights(insights: BusinessInsight[], limit: number): BusinessInsight[] {
  const deduped = new Map<string, BusinessInsight>();
  for (const insight of insights) {
    const key = normalizeText(firstInsightAction(insight)) || normalizeText(insight.title);
    const existing = deduped.get(key);
    if (!existing || existing.priorityScore < insight.priorityScore) deduped.set(key, insight);
  }
  return [...deduped.values()].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
}

function buildDecisionModel(input: {
  overview?: OverviewData;
  alerts: BusinessAlert[];
  insights: BusinessInsight[];
  report?: string;
  reportHeadline: string;
}): DecisionModel {
  const riskLevel = input.alerts.some((item) => item.level === "danger" || item.priorityScore >= 90)
    ? "high"
    : input.alerts.some((item) => item.level === "warning" || item.priorityScore >= 70)
      ? "medium"
      : "low";
  const actions = Array.from(new Set(input.insights.flatMap((item) => item.actions).map((item) => item.trim()).filter(Boolean))).slice(0, 3);
  const summary = input.report ? firstReportLine(input.report) : `今日总收入 ${currency(input.overview?.total_revenue || 0)}，${riskLevel === "high" ? "先处理高优先级风险" : "经营状况良好"}。`;
  return {
    summary: shortText(summary, 54),
    riskLevel,
    issues: input.alerts.slice(0, 3),
    actions,
    reportSummary: input.reportHeadline || summary,
  };
}

function roomsAvailable(overview?: OverviewData): number {
  const orders = overview?.total_orders || 0;
  if (!orders) return 28;
  return Math.min(32, Math.max(1, orders));
}

function calculateCustomerTotal(overview?: OverviewData): number {
  if (!overview) return 0;
  return (overview.cinema?.status === "ok" ? overview.cinema.customer_count : 0) + (overview.platforms.xiaotie?.orders || 0) + (overview.platforms.wu_laoban?.orders || 0);
}

function firstInsightAction(insight: BusinessInsight): string {
  return insight.actions.find(Boolean) || insight.problem || insight.title;
}

function firstReportLine(report: string): string {
  return report.split("\n").map((line) => line.trim()).find(Boolean) || "今日整体经营良好，建议关注核心利润项。";
}

function riskHeroLabel(level: RiskLevel): string {
  if (level === "high") return "高风险";
  if (level === "medium") return "关注";
  return "正常";
}

function dataStatusText(summary?: DataQualitySummary): string {
  if (!summary) return "等待同步";
  if (summary.overall_status === "normal") return "正常更新";
  if (summary.overall_status === "warning") return "存在警告";
  return "需要处理";
}

function platformLabel(platform: string): string {
  return { wu_laoban: "無老板棋牌", xiaotie: "小铁台球", fenghuang: "凤凰云智影院" }[platform] || platform;
}

function statusLabel(status: string): string {
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

function currency(value: number): string {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number): string {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function percent(value: number): string {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function shortText(value: string, maxLength: number): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function formatControlDate(date: Date | null): string {
  const value = date || new Date("2026-06-24T14:30:00+08:00");
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][value.getDay()];
  return `${value.getFullYear()}/${String(value.getMonth() + 1).padStart(2, "0")}/${String(value.getDate()).padStart(2, "0")} ${week}`;
}

function formatFullDateTime(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${formatTime(date)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function DashboardStyles() {
  return (
    <style jsx global>{`
      body {
        background: #f3f6ff;
      }
      .lightDashboard {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 146px minmax(0, 1fr);
        color: #101625;
        background:
          radial-gradient(circle at 72% 0%, rgba(141, 160, 255, 0.22), transparent 34%),
          linear-gradient(135deg, #f9fbff 0%, #f1f5ff 52%, #eef4ff 100%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      }
      .sideRail {
        position: sticky;
        top: 0;
        height: 100vh;
        padding: 18px 10px 14px;
        background: rgba(255, 255, 255, 0.66);
        box-shadow: 12px 0 40px rgba(130, 146, 190, 0.12);
        backdrop-filter: blur(18px);
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .brandLockup {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 0 10px;
        font-weight: 900;
        white-space: nowrap;
      }
      .brandMark {
        color: #050914;
        font-size: 20px;
        font-style: italic;
        letter-spacing: -1px;
      }
      .navStack {
        display: grid;
        gap: 8px;
      }
      .navItem {
        height: 38px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 10px;
        border-radius: 12px;
        color: #78839d;
        text-decoration: none;
        font-weight: 700;
        font-size: 12px;
      }
      .navItem span {
        width: 24px;
        height: 24px;
        display: grid;
        place-items: center;
        border-radius: 11px;
        background: #f7f9ff;
        color: #7582a4;
        box-shadow: 0 8px 16px rgba(143, 156, 194, 0.12);
      }
      .navItem.active {
        color: #3268ff;
        background: #e9efff;
      }
      .navItem.active span {
        color: #fff;
        background: #3e6fff;
      }
      .syncBadge {
        margin-top: auto;
        padding: 18px 16px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.62);
        box-shadow: inset 0 0 0 1px rgba(221, 228, 247, 0.8);
        color: #6d7896;
        font-size: 12px;
        display: grid;
        gap: 4px;
      }
      .syncBadge span {
        color: #80d4d3;
      }
      .syncBadge strong {
        color: #5c6680;
      }
      .syncBadge em {
        color: #32b46f;
        font-style: normal;
        font-weight: 800;
      }
      .collapseMenu {
        border: 0;
        height: 42px;
        border-radius: 22px;
        background: #fff;
        color: #64708d;
        font-weight: 800;
        box-shadow: 0 16px 34px rgba(124, 139, 185, 0.14);
      }
      .dashboardStage {
        max-width: none;
        width: 100%;
        margin: 0;
        padding: 14px 14px 14px;
      }
      .topBar,
      .topControls,
      .ownerProfile,
      .cardHeader,
      .venueTitle {
        display: flex;
        align-items: center;
      }
      .topBar {
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 12px;
      }
      .topBar h1 {
        margin: 0;
        font-size: 19px;
        font-weight: 900;
        letter-spacing: -0.2px;
      }
      .topBar p {
        margin: 6px 0 0;
        color: #73809c;
        font-size: 13px;
      }
      .topBar p span {
        display: inline-block;
        width: 5px;
        height: 5px;
        margin-left: 6px;
        border-radius: 50%;
        background: #71d897;
        vertical-align: middle;
      }
      .topControls {
        gap: 14px;
      }
      .topControls button {
        border: 0;
        min-width: 92px;
        height: 32px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.88);
        color: #2b3550;
        font-weight: 800;
        box-shadow: 0 12px 28px rgba(121, 136, 180, 0.12);
      }
      .ownerProfile {
        gap: 9px;
        font-size: 14px;
        font-weight: 800;
      }
      .ownerProfile img {
        border-radius: 50%;
      }
      .heroCard,
      .primeCard,
      .venueCard,
      .chartCard,
      .topListCard,
      .aiStrip,
      .detailsRow details {
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.72);
        box-shadow: 0 22px 55px rgba(120, 137, 184, 0.15);
        border: 1px solid rgba(226, 232, 250, 0.78);
      }
      .heroCard {
        position: relative;
        min-height: 134px;
        padding: 17px 22px 15px;
        display: grid;
        grid-template-columns: 260px 320px minmax(210px, 1fr);
        align-items: center;
        overflow: hidden;
        background:
          linear-gradient(100deg, rgba(255,255,255,0.92), rgba(245,248,255,0.78)),
          radial-gradient(circle at 83% 20%, rgba(124, 146, 255, 0.28), transparent 32%);
      }
      .heroMetric > span,
      .miniStat span,
      .metricBlock span,
      .miniMetric span {
        color: #65718e;
        font-size: 12px;
        font-weight: 800;
      }
      .heroMetric strong {
        display: block;
        margin: 8px 0 10px;
        font-size: 38px;
        line-height: 0.9;
        letter-spacing: -2px;
        color: #4d62f4;
        text-shadow: 0 12px 24px rgba(77, 98, 244, 0.22);
      }
      .heroMetric div {
        display: flex;
        gap: 16px;
        align-items: center;
      }
      .heroMetric em,
      .heroMetric b {
        display: inline-flex;
        min-height: 26px;
        align-items: center;
        border-radius: 12px;
        padding: 0 11px;
        font-style: normal;
        font-weight: 900;
      }
      .heroMetric em {
        color: #5e6b89;
        background: #fff;
      }
      .heroMetric b {
        color: #31b870;
        background: #e9f8f0;
      }
      .heroStats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
      }
      .miniStat strong {
        display: block;
        margin: 7px 0 7px;
        font-size: 18px;
        color: #0c1220;
      }
      .miniStat strong.positive {
        color: #111;
      }
      .miniStat em {
        color: #66718e;
        font-style: normal;
        font-size: 12px;
      }
      .heroVisual {
        justify-self: end;
        max-width: 196px;
        width: 100%;
        height: auto;
        object-fit: contain;
        opacity: 0.86;
        filter: saturate(1.08) contrast(1.03);
        mix-blend-mode: multiply;
        -webkit-mask-image: radial-gradient(ellipse at center, #000 46%, rgba(0, 0, 0, 0.82) 61%, transparent 82%);
        mask-image: radial-gradient(ellipse at center, #000 46%, rgba(0, 0, 0, 0.82) 61%, transparent 82%);
      }
      .mainGrid {
        display: grid;
        grid-template-columns: minmax(0, 1.36fr) minmax(330px, 1fr);
        grid-template-rows: repeat(2, 158px);
        gap: 12px;
        margin-top: 12px;
      }
      .primeCard {
        grid-row: span 2;
        height: 328px;
        min-height: 0;
        padding: 15px 18px 10px;
        overflow: hidden;
      }
      .venueCard {
        height: 158px;
        min-height: 0;
        padding: 14px 16px 12px;
        overflow: hidden;
      }
      .cardHeader {
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      .cardHeader button {
        border: 0;
        border-radius: 11px;
        background: #f4f7ff;
        color: #6e7894;
        height: 28px;
        padding: 0 12px;
        font-weight: 800;
      }
      .venueTitle {
        gap: 12px;
      }
      .venueTitle strong {
        font-size: 16px;
        font-weight: 900;
      }
      .venueTitle em {
        padding: 6px 9px;
        border-radius: 9px;
        background: #efe6ff;
        color: #8a55ff;
        font-style: normal;
        font-size: 12px;
        font-weight: 900;
      }
      .venueIcon {
        width: 30px;
        height: 30px;
        border-radius: 11px;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 900;
      }
      .venueIcon.purple { background: linear-gradient(135deg, #774dff, #b44dff); }
      .venueIcon.green { background: linear-gradient(135deg, #48bd73, #5ad08c); }
      .venueIcon.orange { background: linear-gradient(135deg, #ffad4d, #ffbf69); }
      .venueIcon.blue { background: linear-gradient(135deg, #4773ff, #6f91ff); }
      .primeMetrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 7px 16px;
      }
      .metricBlock {
        min-height: 62px;
      }
      .metricBlock span {
        color: #2d65ff;
      }
      .metricBlock.green span {
        color: #2eb76e;
      }
      .metricBlock em {
        display: block;
        margin-top: 9px;
        color: #5f6b85;
        font-style: normal;
        font-size: 13px;
      }
      .metricBlock strong {
        display: block;
        margin-top: 5px;
        font-size: 18px;
        color: #050914;
        letter-spacing: -0.4px;
      }
      .metricBlock small,
      .miniMetric em {
        display: block;
        margin-top: 5px;
        color: #24ad61;
        font-size: 12px;
        font-weight: 800;
      }
      .sppBlock {
        grid-column: span 2;
        min-height: 72px;
        display: grid;
        place-content: center;
        border-radius: 20px;
        background: radial-gradient(circle, rgba(103, 214, 145, 0.20), transparent 64%);
        text-align: center;
      }
      .sppBlock span,
      .donutBlock span {
        color: #111827;
        font-size: 13px;
        font-weight: 900;
      }
      .sppBlock strong {
        margin-top: 5px;
        font-size: 30px;
        color: #44be73;
        letter-spacing: -2px;
      }
      .sppBlock em {
        color: #66718e;
        font-style: normal;
        font-weight: 800;
      }
      .donutBlock {
        display: grid;
        place-items: center;
        gap: 7px;
        text-align: center;
      }
      .donut {
        width: 52px;
        height: 52px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: conic-gradient(#4d79ff 0 118deg, #e5ebfb 118deg 360deg);
      }
      .donut b {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        background: #fff;
        display: grid;
        place-items: center;
        color: #5a6784;
        font-size: 12px;
      }
      .miniCurves {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        margin: 0 -10px 0;
      }
      .miniCurves svg {
        height: 46px;
      }
      .venueMetrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 7px;
      }
      .miniMetric strong {
        display: block;
        margin: 4px 0 0;
        font-size: 14px;
      }
      .miniMetric em.down {
        color: #e1505d;
      }
      .progressRow {
        display: grid;
        grid-template-columns: 70px 42px minmax(82px, 1fr) 76px;
        align-items: center;
        gap: 8px;
        margin-top: 5px;
        color: #64708c;
        font-size: 11px;
      }
      .progressRow em {
        color: #4f5b76;
        font-style: normal;
        font-weight: 800;
      }
      .progressRow div {
        height: 7px;
        border-radius: 999px;
        background: #edf1f8;
        overflow: hidden;
      }
      .progressRow b {
        display: block;
        height: 100%;
        border-radius: inherit;
      }
      .bottomGrid {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) 0.95fr 0.95fr;
        gap: 14px;
        margin-top: 12px;
      }
      .chartCard,
      .topListCard {
        padding: 18px 20px;
        min-height: 218px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 13px;
        color: #78839c;
        font-size: 12px;
        font-weight: 800;
      }
      .legend span::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 6px;
        border-radius: 50%;
        background: #5a82ff;
      }
      .legend .green::before { background: #62cd8a; }
      .legend .orange::before { background: #ffad37; }
      .trendSvg {
        width: 100%;
        height: 156px;
      }
      .topListCard.problem {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(255, 240, 240, 0.76));
      }
      .topListCard.action {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(237, 255, 246, 0.78));
      }
      .alertIcon,
      .actionIcon {
        color: #f26666;
        font-size: 25px;
      }
      .actionIcon {
        color: #30ba6b;
      }
      .cardHeader a {
        color: #7c86a1;
        text-decoration: none;
        font-weight: 800;
        font-size: 13px;
      }
      .rankList {
        display: grid;
        gap: 12px;
      }
      .rankList article {
        display: grid;
        grid-template-columns: 26px minmax(0, 1fr) 42px;
        gap: 12px;
        align-items: center;
      }
      .rankList b {
        width: 25px;
        height: 25px;
        display: grid;
        place-items: center;
        border-radius: 8px;
        background: #ffdede;
        color: #ef6464;
        font-size: 12px;
      }
      .action .rankList b {
        background: #dff7e8;
        color: #25a760;
      }
      .rankList strong {
        display: block;
        color: #182033;
        font-size: 14px;
      }
      .rankList span {
        color: #75809b;
        font-size: 12px;
      }
      .rankList em {
        justify-self: end;
        padding: 7px 9px;
        border-radius: 8px;
        background: #fff2d9;
        color: #f0a12b;
        font-style: normal;
        font-size: 12px;
        font-weight: 900;
      }
      .rankList em.high {
        background: #ffe0e0;
        color: #ef6464;
      }
      .emptyCopy {
        color: #7c86a1;
        margin: 0;
      }
      .aiStrip {
        min-height: 58px;
        margin-top: 14px;
        padding: 0 22px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) 130px;
        align-items: center;
        gap: 20px;
      }
      .aiStrip div {
        display: flex;
        gap: 12px;
        align-items: center;
        color: #111827;
        font-weight: 900;
      }
      .aiStrip div span {
        color: #4f67ff;
        font-size: 24px;
      }
      .aiStrip p {
        margin: 0;
        color: #62708e;
        font-size: 14px;
      }
      .aiStrip button {
        border: 0;
        height: 40px;
        border-radius: 18px;
        color: #3c64ff;
        background: #fff;
        font-weight: 900;
      }
      .detailsRow {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 10px;
        opacity: 0.72;
      }
      .detailsRow details {
        padding: 10px 14px;
        color: #66718e;
      }
      .detailsRow summary {
        cursor: pointer;
        color: #111827;
        font-weight: 900;
      }
      .detailsRow pre {
        margin: 14px 0 0;
        white-space: pre-wrap;
        color: #6b7590;
        font-family: inherit;
        font-size: 13px;
        max-height: 220px;
        overflow: auto;
      }
      .statusGrid {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        font-size: 13px;
      }
      @media (max-width: 1180px) {
        .lightDashboard {
          grid-template-columns: 1fr;
        }
        .sideRail {
          position: static;
          height: auto;
        }
        .navStack {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .heroCard,
        .mainGrid,
        .bottomGrid,
        .detailsRow {
          grid-template-columns: 1fr;
        }
        .heroVisual {
          display: none;
        }
      }
      @media (max-width: 760px) {
        .dashboardStage {
          padding: 20px 14px;
        }
        .topBar,
        .topControls {
          display: grid;
          justify-content: stretch;
        }
        .navStack {
          grid-template-columns: 1fr;
        }
        .heroMetric strong {
          font-size: 42px;
        }
        .heroStats,
        .primeMetrics,
        .venueMetrics {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
