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
  fetchBudget,
  fetchCinemaOverview,
  fetchDailyReport,
  fetchDataQualitySummary,
  fetchDataSourcesStatus,
  fetchOverview,
  fetchWuLaobanDbDetail,
  fetchWuLaobanFullDetail,
  fetchXiaotieDbDetail,
  fetchXiaotieFullDetail,
} from "../lib/dashboardApi";
import type { BudgetData, WuLaobanFullDetail, XiaotieFullDetail } from "../lib/dashboardApi";
import type { AlertItem, CinemaOverview, DashboardState, DataQualitySummary, DataSourcePlatformStatus, OverviewData } from "../types/dashboard";

type RiskLevel = "low" | "medium" | "high";
type Accent = "blue" | "green" | "orange";
type PeriodKey = "today" | "yesterday" | "month" | "year";

interface BusinessCard {
  label: string;
  href: string;
  revenue: number;
  orders: number;
  customers: number;
  utilizationRate: number | null;
  avgOrderValue: number;
  capacityLabel: string;
  dataNote: string;
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cinemaPeriod, setCinemaPeriod] = useState<PeriodKey>("yesterday");
  const [billiardsPeriod, setBilliardsPeriod] = useState<PeriodKey>("yesterday");
  const [mahjongPeriod, setMahjongPeriod] = useState<PeriodKey>("yesterday");
  const [xiaotieDetail, setXiaotieDetail] = useState<XiaotieFullDetail | null>(null);
  const [mahjongDetail, setMahjongDetail] = useState<WuLaobanFullDetail | null>(null);
  const [cinemaRanges, setCinemaRanges] = useState<Partial<Record<PeriodKey, CinemaOverview>>>({});
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [realtimeLoading, setRealtimeLoading] = useState<Set<string>>(new Set());
  // 追踪实时数据是否已加载完成（台球/棋牌）
  const [realtimeLoaded, setRealtimeLoaded] = useState<{billiards: boolean; mahjong: boolean}>({billiards: false, mahjong: false});
  const initialRefreshDone = useRef(false);

  const overview = state.overview?.data;
  const dailyReport = state.dailyReport?.data.report;
  const summaries = useMemo(() => toOverviewBusinessSummaries(overview), [overview]);
  const businessCards = useMemo(
    () => getBusinessCards(overview, { cinema: cinemaPeriod, billiards: billiardsPeriod, mahjong: mahjongPeriod }, { xiaotie: xiaotieDetail, mahjong: mahjongDetail, cinemaRanges }),
    [cinemaRanges, mahjongDetail, overview, cinemaPeriod, billiardsPeriod, mahjongPeriod, xiaotieDetail],
  );
  const businessAlerts = useMemo(() => selectTopAlerts(generateBusinessAlerts(summaries), 20), [summaries]);
  const topAlerts = useMemo(() => selectTopAlerts(businessAlerts, 3), [businessAlerts]);
  const businessInsights = useMemo(() => generateBusinessInsights({ summaries, alerts: businessAlerts }), [summaries, businessAlerts]);
  const topInsights = useMemo(() => selectTopInsights(businessInsights, 3), [businessInsights]);
  const totalCustomers = calculateCustomerTotal(overview);
  const periodRevenue = businessCards.reduce((total, item) => total + item.revenue, 0);
  const periodOrders = businessCards.reduce((total, item) => total + item.orders, 0);
  const availableRooms = roomsAvailable(overview, xiaotieDetail, mahjongDetail);
  const reportSections = useMemo(
    () => buildBusinessReportSections({
      reportType: "daily",
      reportDate: currentTime ? `${currentTime.getFullYear()}-${String(currentTime.getMonth()+1).padStart(2,"0")}-${String(currentTime.getDate()).padStart(2,"0")}` : "2026-06-24",
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

  // 用本地时间格式化日期（避免 toISOString() 返回 UTC 导致日期偏移）
  const formatLocalDate = useCallback((d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const loadDetailData = useCallback(async () => {
    // 计算今日和昨日的日期字符串
    const todayStr = formatLocalDate(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatLocalDate(yesterday);

    // ====== 第一层：从数据库读取（秒开，~0.1秒） ======
    // 台球DB → 立即渲染summary数据
    fetchXiaotieDbDetail().then(
      (v) => { if (!v.error) setXiaotieDetail(v); },
      () => {},
    );
    // 棋牌DB → 立即渲染summary数据
    fetchWuLaobanDbDetail().then(
      (v) => { if (!v.error) setMahjongDetail(v); },
      () => {},
    );
    // 影院4个维度各自独立更新
    fetchCinemaOverview(todayStr, 1).then(
      (v) => setCinemaRanges((p) => ({ ...p, today: v })),
      () => {},
    );
    fetchCinemaOverview(yesterdayStr, 1).then(
      (v) => setCinemaRanges((p) => ({ ...p, yesterday: v })),
      () => {},
    );
    fetchCinemaOverview(undefined, 31).then(
      (v) => setCinemaRanges((p) => ({ ...p, month: v })),
      () => {},
    );
    fetchCinemaOverview(undefined, 366).then(
      (v) => setCinemaRanges((p) => ({ ...p, year: v })),
      () => {},
    );

    // ====== 第二层：实时API（后台预加载，fire-and-forget） ======
    // 无论当前选择什么period，都后台预加载今日实时数据
    // 这样用户切换到"今日"时数据已经准备好，秒显示
    
    // 台球实时 → 后台预加载，覆盖busy_count/total_count，保留DB的summary_yesterday
    fetchXiaotieFullDetail().then(
      (v) => {
        if (!v.error) {
          setXiaotieDetail((prev) => {
            // 保留DB的summary_yesterday，合并实时数据
            const dbYesterday = prev && (prev as any).summary_yesterday;
            if (dbYesterday) (v as any).summary_yesterday = dbYesterday;
            return v;
          });
          setRealtimeLoaded(prev => ({...prev, billiards: true}));
        }
      },
      () => {},
    );
    
    // 棋牌实时 → 后台预加载，覆盖active_orders/total_rooms，保留DB的summary_yesterday
    fetchWuLaobanFullDetail().then(
      (v) => {
        if (!v.error) {
          setMahjongDetail((prev) => {
            const dbYesterday = prev && (prev as any).summary_yesterday;
            if (dbYesterday) (v as any).summary_yesterday = dbYesterday;
            return v;
          });
          setRealtimeLoaded(prev => ({...prev, mahjong: true}));
        }
      },
      () => {},
    );
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setCurrentTime(new Date());
    try {
      // 第一阶段：快速数据（总览、数据源状态等）~1秒
      const [overviewResult, sourcesResult, reportResult, qualityResult, budgetResult] = await Promise.allSettled([
        fetchOverview(),
        fetchDataSourcesStatus(),
        fetchDailyReport(),
        fetchDataQualitySummary(),
        fetchBudget(),
      ] as const);
      
      setState((previous) => ({
        ...previous,
        overview: overviewResult.status === "fulfilled" ? overviewResult.value : previous.overview,
        dataSources: sourcesResult.status === "fulfilled" ? sourcesResult.value : previous.dataSources,
        dailyReport: reportResult.status === "fulfilled" ? reportResult.value : previous.dailyReport,
        dataQuality: qualityResult.status === "fulfilled" ? qualityResult.value : previous.dataQuality,
      }));
      if (budgetResult.status === "fulfilled") setBudget(budgetResult.value);
      
      // 第二阶段：详情数据（台球、麻将、影院）~15秒，有加载指示器
      setRefreshing(false);
      setDetailLoading(true);
      await loadDetailData();
      setDetailLoading(false);
    } catch {
      setRefreshing(false);
      setDetailLoading(false);
    }
  }, [loadDetailData, refreshing]);

  useEffect(() => {
    if (initialRefreshDone.current) return;
    initialRefreshDone.current = true;
    refreshAll();
  }, []);

// 实时数据已自动预加载，切换到"今日"时无需额外加载

  const cinema = businessCards[0];
  const billiards = businessCards[1];
  const mahjong = businessCards[2];

  return (
    <>
      <Head>
        <title>经营中心 - 翡翠城</title>
      </Head>
      <main className={`lightDashboard ${sidebarCollapsed ? "navCollapsed" : ""}`}>
        <aside className="sideRail">
          <div className="brandLockup">
            <span className="brandMark">sf.</span>
            <strong>经营中心</strong>
          </div>
          <nav className="navStack">
            {[
              ["今日经营中心", "/dashboard", "今", true],
              ["AI 报告", "/dashboard/reports", "报", false],
              ["每日简报", "/dashboard/daily-briefing", "简", false],
              ["交接助手", "/dashboard/handover-assistant", "交", false],
              ["采购报销", "/dashboard/procurement-reimbursement", "采", false],
              ["客户唤醒", "/dashboard/customer-wake-up", "客", false],
              ["排片建议", "/dashboard/screening-suggestions", "排", false],
              ["收入预测", "/dashboard/revenue-forecast", "收", false],
              ["多业务联动", "/dashboard/cross-business", "联", false],
              ["数据可信度", "/dashboard/data-quality", "数", false],
            ].map(([label, href, icon, active]) => (
              <Link className={`navItem ${active ? "active" : ""}`} href={String(href)} key={String(label)}>
                <span>{icon}</span>
                <span className="navLabel">{label}</span>
              </Link>
            ))}
          </nav>
          <div className="syncBadge">
            <span>◎</span>
            <strong>数据状态</strong>
            <em>{dataStatusText(state.dataQuality?.data)}</em>
            <small>最后更新 {currentTime ? formatTime(currentTime) : "14:30"}</small>
          </div>
          <button className="collapseMenu" onClick={() => setSidebarCollapsed((value) => !value)}>
            {sidebarCollapsed ? "› 展开菜单" : "‹ 收起菜单"}
          </button>
        </aside>

        <section className="dashboardStage">
          <header className="topBar">
            <div>
              <h1>老板，今天经营状况良好 👋</h1>
              <p>数据更新时间：{currentTime ? formatFullDateTime(currentTime) : "2026-06-24 14:30"} <span /></p>
            </div>
            <div className="topControls">
              <button onClick={() => setCurrentTime(new Date())}>{formatControlDate(currentTime)}</button>
              <button onClick={() => setCurrentTime(new Date())}>{currentTime ? formatTime(currentTime) : "14:30"}</button>
              <button onClick={refreshAll} disabled={refreshing}>{refreshing ? "刷新中" : "刷新数据"}</button>
              <div className="ownerProfile">
                <Image alt="老板头像" src="/images/dashboard-avatar-v2.png" width={34} height={34} />
                <strong>老板</strong>
                <span>⌄</span>
              </div>
            </div>
          </header>

          <HeroSummaryCard
            totalRevenue={periodRevenue || overview?.total_revenue || 0}
            totalOrders={periodOrders || overview?.total_orders || 0}
            availableRooms={availableRooms}
            vending={periodVendingAmount(billiardsPeriod, xiaotieDetail)}
            decision={decision}
            currentTime={currentTime}
            period={cinemaPeriod}
          />

          <section className="mainGrid">
            <CinemaPrimeCard card={cinema} cinema={cinemaRanges[cinemaPeriod] || overview?.cinema} period={cinemaPeriod} onPeriodChange={setCinemaPeriod} budget={budget?.cinema} cinemaRanges={cinemaRanges} />
            <VenueMiniCard card={billiards} target={periodRevenue} period={billiardsPeriod} onPeriodChange={setBilliardsPeriod} budget={budget?.billiards} monthlyActual={xiaotieDetail?.summary_month?.revenue} annualActual={xiaotieDetail?.summary_year?.revenue} loading={!xiaotieDetail} realtimeLoading={realtimeLoading.has("billiards")} realtimeLoaded={realtimeLoaded.billiards} />
            <VenueMiniCard card={mahjong} target={periodRevenue} period={mahjongPeriod} onPeriodChange={setMahjongPeriod} budget={budget?.mahjong} monthlyActual={mahjongDetail?.summary_month?.revenue} annualActual={mahjongDetail?.summary_year?.revenue} loading={!mahjongDetail} realtimeLoading={realtimeLoading.has("mahjong")} realtimeLoaded={realtimeLoaded.mahjong} />
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
  vending,
  decision,
  currentTime,
  period,
}: {
  totalRevenue: number;
  totalOrders: number;
  availableRooms: number;
  vending: number;
  decision: DecisionModel;
  currentTime: Date | null;
  period: PeriodKey;
}) {
  return (
    <section className="heroCard">
      <div className="heroMetric">
        <span>{periodLabel(period)}总收入（实收金额）</span>
        <strong>{currency(totalRevenue)}</strong>
        <div className="heroBadges">
          <em>凤凰云智 · 小铁 · 無老板</em>
          <b>{periodLabel(period)}</b>
        </div>
      </div>
      <div className="heroStats">
        <MiniStat label="自助售卖机" value={currency(vending)} hint={vending ? "小铁详情接口" : "暂无售卖机数据"} />
        <MiniStat label="订单/场次总数" value={formatNumber(totalOrders)} hint={`使用中 ${availableRooms}`} />
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

function CinemaPrimeCard({
  card,
  cinema,
  period,
  onPeriodChange,
  budget,
  cinemaRanges,
}: {
  card: BusinessCard;
  cinema?: OverviewData["cinema"];
  period: PeriodKey;
  onPeriodChange: (value: PeriodKey) => void;
  budget?: BudgetData["cinema"];
  cinemaRanges?: Partial<Record<PeriodKey, CinemaOverview>>;
}) {
  const concession = cinema?.concession_revenue ?? 0;
  // 票房直接用API返回的box_office，不再用 revenue - concession 算残差
  const ticket = cinema?.box_office ?? 0;
  const customers = card.customers || cinema?.customer_count || 0;
  const spp = customers ? concession / customers : 0;
  
  // 预算目标
  const monthlyBoxTarget = budget?.monthly_box_office_target || 0;
  const annualBoxTarget = budget?.annual_box_office_target || 0;
  const monthlyConcTarget = budget?.monthly_concession_target || 0;
  const annualConcTarget = budget?.annual_concession_target || 0;
  
  // 用实际聚合数据计算完成率
  const monthData = cinemaRanges?.month;
  const yearData = cinemaRanges?.year;
  
  // detail数据是否已加载（有month/year数据说明已加载完成）
  const detailLoaded = !!(cinemaRanges?.month && cinemaRanges?.year);
  
  // 月度完成率：用月度聚合数据
  const monthlyBoxActual = monthData?.box_office || ticket;
  const monthlyConcActual = monthData?.concession_revenue || concession;
  const monthlyBoxRate = monthlyBoxTarget ? Math.min(100, Math.round((monthlyBoxActual / monthlyBoxTarget) * 100)) : 0;
  const monthlyConcRate = monthlyConcTarget ? Math.min(100, Math.round((monthlyConcActual / monthlyConcTarget) * 100)) : 0;
  
  // 年度完成率：用年度聚合数据
  const annualBoxActual = yearData?.box_office || ticket;
  const annualConcActual = yearData?.concession_revenue || concession;
  const annualBoxRate = annualBoxTarget ? Math.min(100, Math.round((annualBoxActual / annualBoxTarget) * 100)) : 0;
  const annualConcRate = annualConcTarget ? Math.min(100, Math.round((annualConcActual / annualConcTarget) * 100)) : 0;
  
  // 根据时间选择器决定显示
  const showMonthly = period !== "year";
  const showAnnual = period !== "month";
  return (
    <section className="primeCard">
      <Link className="cardJump" href={card.href} aria-label={`查看${card.label}详情`} />
      <div className="cardHeader">
        <div className="venueTitle">
          <span className="venueIcon purple">☷</span>
          <strong>影院（核心利润引擎）</strong>
          <em>核心业务</em>
        </div>
        <PeriodSelect value={period} onChange={onPeriodChange} />
      </div>
      <div className="primeMetrics">
        <MetricBlock label="票房（流量）" title="票房收入" value={currency(ticket)} note={card.dataNote} tone="blue" />
        <MetricBlock label="卖品（利润核心）" title="卖品收入" value={currency(concession)} note={card.dataNote} tone="green" />
        <MetricBlock label="客单价" title="客单价" value={`¥${(card.avgOrderValue || (customers > 0 ? ticket / customers : 0)).toFixed(2)}`} note={card.dataNote} />
        <MetricBlock label="人次" title="人次" value={formatNumber(customers)} note={card.dataNote} />
      </div>
      <div className="cinemaBottomRow">
        <MetricBlock label="场次数" title="场次数" value={formatNumber(card.orders)} note={card.dataNote} compact />
        <div className="sppArea">
          <div className="sppBlock">
            <span>SPP（每人卖品消费）</span>
            <strong>¥{spp.toFixed(2)}</strong>
          </div>
          <div className="curvePair">
            <MiniCurve color="#586eff" />
            <MiniCurve color="#63d891" flip />
          </div>
        </div>
        <div className="donutBlock">
          <span>卖品收入占比</span>
          <div className="donut"><b>{percent(card.revenue ? concession / card.revenue : 0.327)}</b></div>
        </div>
      </div>
      {budget && (
        <>
          {/* 票房进度行 */}
          <div className="cinemaProgressRow">
            {showMonthly && (
              <div className="cinemaProgressItem">
                <ProgressRow label="月度票房" value={detailLoaded ? monthlyBoxRate : 0} note={detailLoaded ? `${currency(monthlyBoxActual)} / ${currency(monthlyBoxTarget)}` : "加载中..."} color={monthlyBoxRate >= 100 ? "#22c55e" : monthlyBoxRate >= 80 ? "#586eff" : "#ef4444"} />
              </div>
            )}
            {showAnnual && (
              <div className="cinemaProgressItem">
                <ProgressRow label="年度票房" value={detailLoaded ? annualBoxRate : 0} note={detailLoaded ? `${currency(annualBoxActual)} / ${currency(annualBoxTarget)}` : "加载中..."} color={annualBoxRate >= 100 ? "#22c55e" : annualBoxRate >= 80 ? "#586eff" : "#ef4444"} />
              </div>
            )}
          </div>
          {/* 卖品进度行（独立） */}
          <div className="cinemaProgressRow">
            {showMonthly && (
              <div className="cinemaProgressItem">
                <ProgressRow label="月度卖品" value={detailLoaded ? monthlyConcRate : 0} note={detailLoaded ? `${currency(monthlyConcActual)} / ${currency(monthlyConcTarget)}` : "加载中..."} color={monthlyConcRate >= 100 ? "#22c55e" : monthlyConcRate >= 80 ? "#586eff" : "#ef4444"} />
              </div>
            )}
            {showAnnual && (
              <div className="cinemaProgressItem">
                <ProgressRow label="年度卖品" value={detailLoaded ? annualConcRate : 0} note={detailLoaded ? `${currency(annualConcActual)} / ${currency(annualConcTarget)}` : "加载中..."} color={annualConcRate >= 100 ? "#22c55e" : annualConcRate >= 80 ? "#586eff" : "#ef4444"} />
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function MetricBlock({ label, title, value, note, tone, compact = false }: { label: string; title: string; value: string; note: string; tone?: "blue" | "green"; compact?: boolean }) {
  return (
    <div className={`metricBlock ${tone || ""} ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <em>{title}</em>
      <strong>{value}</strong>
    </div>
  );
}

function VenueMiniCard({
  card,
  target,
  period,
  onPeriodChange,
  budget,
  monthlyActual,
  annualActual,
  loading = false,
  realtimeLoading = false,
  realtimeLoaded = false,
}: {
  card: BusinessCard;
  target: number;
  period: PeriodKey;
  onPeriodChange: (value: PeriodKey) => void;
  budget?: BudgetData["billiards"] | BudgetData["mahjong"];
  monthlyActual?: number;
  annualActual?: number;
  loading?: boolean;
  realtimeLoading?: boolean;
  realtimeLoaded?: boolean;
}) {
  const utilization = Math.round((card.utilizationRate || 0) * 100);
  const revenueShare = target ? Math.min(100, Math.round((card.revenue / target) * 100)) : 0;
  
  // 预算目标
  const monthlyTarget = budget?.monthly_target || 0;
  const annualTarget = budget?.annual_target || 0;
  
  // 用实际数据计算完成率
  const monthlyRate = monthlyTarget ? Math.min(100, Math.round(((monthlyActual || 0) / monthlyTarget) * 100)) : 0;
  const annualRate = annualTarget ? Math.min(100, Math.round(((annualActual || 0) / annualTarget) * 100)) : 0;
  
  // 根据时间选择器决定显示
  const showMonthly = period !== "year";
  const showAnnual = period !== "month";
  const noteText = loading ? "加载中..." : realtimeLoading ? "实时数据加载中..." : card.dataNote;
  return (
    <section className={`venueCard ${card.accent}`}>
      <Link className="cardJump" href={card.href} aria-label={`查看${card.label}详情`} />
      <div className="cardHeader">
        <div className="venueTitle">
          <span className={`venueIcon ${card.accent}`}>{card.label.slice(0, 1)}</span>
          <strong>{card.label}</strong>
        </div>
        <PeriodSelect value={period} onChange={onPeriodChange} />
      </div>
      <div className="venueMetrics">
        <MiniMetric label="收入" value={period === "today" && !realtimeLoaded ? "加载中..." : currency(card.revenue)} />
        <MiniMetric label="人次/订单" value={period === "today" && !realtimeLoaded ? "加载中..." : formatNumber(card.customers || card.orders)} />
        <MiniMetric label="利用率" value={period === "today" && !realtimeLoaded ? "加载中..." : card.utilizationRate == null ? "-" : percent(card.utilizationRate)} warn={utilization < 35} />
        <MiniMetric label="客单价" value={period === "today" && !realtimeLoaded ? "加载中..." : `¥${(card.avgOrderValue || (card.customers > 0 ? card.revenue / card.customers : 0)).toFixed(2)}`} />
        <MiniMetric label={card.label === "台球" ? "开台数" : "包间使用率"} value={period === "today" && !realtimeLoaded ? "加载中..." : card.capacityLabel} note={realtimeLoading ? "⏳ 实时加载中..." : "实时状态"} />
      </div>
      {budget && showMonthly && (
        <ProgressRow label="月度任务" value={monthlyRate} note={`${currency(monthlyActual || 0)} / ${currency(monthlyTarget)}`} color={monthlyRate >= 100 ? "#22c55e" : monthlyRate >= 80 ? "#586eff" : "#ef4444"} />
      )}
      {budget && showAnnual && (
        <ProgressRow label="年度任务" value={annualRate} note={`${currency(annualActual || 0)} / ${currency(annualTarget)}`} color={annualRate >= 100 ? "#22c55e" : annualRate >= 80 ? "#586eff" : "#ef4444"} />
      )}
    </section>
  );
}

function PeriodSelect({ value, onChange }: { value: PeriodKey; onChange: (value: PeriodKey) => void }) {
  return (
    <select className="periodSelect" value={value} onChange={(event) => onChange(event.target.value as PeriodKey)} aria-label="切换时间范围">
      <option value="yesterday">昨日</option>
      <option value="today">今日</option>
      <option value="month">本月</option>
      <option value="year">本年</option>
    </select>
  );
}

function MiniMetric({ label, value, note, warn = false }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="miniMetric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <em className={warn ? "down" : ""}>{note}</em>}
    </div>
  );
}

function ProgressRow({ label, value, note, color }: { label: string; value: number; note: string; color: string }) {
  return (
    <div className="progressRow">
      <span>{label}</span>
      <em>{value.toFixed(1)}%</em>
      <div><b style={{ width: `${Math.min(100, value)}%`, background: color }} /></div>
      <small>{note}</small>
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
      <Link href="/dashboard/reports">查看详情 →</Link>
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

export function getBusinessCards(
  overview?: OverviewData,
  periods: { cinema: PeriodKey; billiards: PeriodKey; mahjong: PeriodKey } = { cinema: "today", billiards: "today", mahjong: "today" },
  details: {
    xiaotie?: XiaotieFullDetail | null;
    mahjong?: WuLaobanFullDetail | null;
    cinemaRanges?: Partial<Record<PeriodKey, CinemaOverview>>;
  } = {},
): BusinessCard[] {
  if (!overview) {
    return [
      emptyBusinessCard("影院", "/dashboard/cinema", "blue"),
      emptyBusinessCard("台球", "/dashboard/billiards", "green"),
      emptyBusinessCard("棋牌", "/dashboard/mahjong", "orange"),
    ];
  }
  const [billiardsSummary, mahjongSummary, cinemaSummary] = toOverviewBusinessSummaries(overview);
  const xiaotieSummary = xiaotiePeriodSummary(details.xiaotie, periods.billiards);
  const mahjongPeriodData = mahjongPeriodSummary(details.mahjong, periods.mahjong);
  const cinemaPeriodData = details.cinemaRanges?.[periods.cinema] || overview.cinema;
  const useOverview = periods.cinema === "today";
  const cinemaRevenue = useOverview ? cinemaSummary.revenue || overview.cinema?.revenue || 0 : cinemaPeriodData?.revenue || 0;
  const cinemaOrders = useOverview ? cinemaSummary.orders || overview.cinema?.screenings || 0 : cinemaPeriodData?.screenings || 0;
  const cinemaCustomers = useOverview ? cinemaSummary.customers || overview.cinema?.customer_count || 0 : cinemaPeriodData?.customer_count || 0;
  return [
    {
      label: "影院",
      href: "/dashboard/cinema",
      revenue: cinemaRevenue,
      orders: cinemaOrders,
      customers: cinemaCustomers,
      utilizationRate: useOverview ? cinemaSummary.utilizationRate || overview.cinema?.occupancy_rate || 0 : cinemaPeriodData?.occupancy_rate || 0,
      avgOrderValue: useOverview ? cinemaSummary.avgOrderValue || overview.cinema?.avg_order_value || 0 : cinemaPeriodData?.avg_order_value || 0,
      capacityLabel: `${cinemaOrders} 场`,
      dataNote: useOverview && overview.cinema?.date ? `凤凰云智 ${overview.cinema.date}` : periods.cinema === "yesterday" ? `凤凰云智昨日` : `凤凰云智${periodLabel(periods.cinema)}`,
      accent: "blue",
    },
    {
      label: "台球",
      href: "/dashboard/billiards",
      revenue: xiaotieSummary?.revenue ?? billiardsSummary.revenue,
      orders: xiaotieSummary?.orders ?? billiardsSummary.orders,
      customers: xiaotieSummary?.customers ?? billiardsSummary.customers,
      utilizationRate: billiardsSummary.utilizationRate,
      avgOrderValue: average(xiaotieSummary?.revenue ?? billiardsSummary.revenue, xiaotieSummary?.orders ?? billiardsSummary.orders),
      capacityLabel: details.xiaotie ? `${details.xiaotie.busy_count || 0} / ${details.xiaotie.total_count || 0}` : "-",
      dataNote: details.xiaotie ? `小铁${periodLabel(periods.billiards)}` : "小铁概览",
      accent: "green",
    },
    {
      label: "棋牌",
      href: "/dashboard/mahjong",
      revenue: mahjongPeriodData?.revenue ?? mahjongSummary.revenue,
      orders: mahjongPeriodData?.orders ?? mahjongSummary.orders,
      customers: mahjongPeriodData?.customers ?? mahjongSummary.customers,
      utilizationRate: details.mahjong ? ratio(details.mahjong.active_orders, details.mahjong.total_rooms) : mahjongSummary.utilizationRate,
      avgOrderValue: average(mahjongPeriodData?.revenue ?? mahjongSummary.revenue, mahjongPeriodData?.orders ?? mahjongSummary.orders),
      capacityLabel: details.mahjong ? `${details.mahjong.active_orders || 0} / ${details.mahjong.total_rooms || 0}` : "-",
      dataNote: details.mahjong ? `無老板${periodLabel(periods.mahjong)}` : "無老板概览",
      accent: "orange",
    },
  ];
}

function emptyBusinessCard(label: string, href: string, accent: Accent): BusinessCard {
  return {
    label,
    href,
    revenue: 0,
    orders: 0,
    customers: 0,
    utilizationRate: null,
    avgOrderValue: 0,
    capacityLabel: "-",
    dataNote: "等待数据",
    accent,
  };
}

function xiaotiePeriodSummary(detail: XiaotieFullDetail | null | undefined, period: PeriodKey) {
  if (!detail) return null;
  const summary = period === "year" ? detail.summary_year : period === "month" ? detail.summary_month : period === "yesterday" ? (detail as any).summary_yesterday || detail.summary_today : detail.summary_today;
  if (!summary) return null;
  const record = summary as { revenue?: number; order_count?: number; face_count?: number; member_count?: number };
  return {
    revenue: Number(record.revenue || 0),
    orders: Number(record.order_count || 0),
    customers: Number(record.face_count || record.member_count || record.order_count || 0),
  };
}

function mahjongPeriodSummary(detail: WuLaobanFullDetail | null | undefined, period: PeriodKey) {
  if (!detail) return null;
  const summary = period === "year" ? detail.summary_year : period === "month" ? detail.summary_month : period === "yesterday" ? (detail as any).summary_yesterday || detail.summary_today : detail.summary_today;
  if (!summary) return null;
  return {
    revenue: Number(summary?.revenue || 0),
    orders: Number(summary?.order_count || 0),
    customers: Number(summary?.user_count || summary?.order_count || 0),
  };
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

function roomsAvailable(overview?: OverviewData, xiaotie?: XiaotieFullDetail | null, mahjong?: WuLaobanFullDetail | null): number {
  const billiardsBusy = xiaotie?.busy_count || 0;
  const mahjongBusy = mahjong?.active_orders || 0;
  if (billiardsBusy || mahjongBusy) return billiardsBusy + mahjongBusy;
  return overview?.total_orders || 0;
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

function periodLabel(period: PeriodKey): string {
  return { today: "今日", yesterday: "昨日", month: "本月", year: "本年" }[period];
}

function periodVendingAmount(period: PeriodKey, detail?: XiaotieFullDetail | null): number {
  const vending = detail?.vending;
  if (!vending) return 0;
  if (period === "year") return Number(vending.year_amount || 0);
  if (period === "month") return Number(vending.month_amount || 0);
  return Number(vending.today_amount || 0);
}

function average(total?: number | null, count?: number | null): number {
  const safeTotal = Number(total || 0);
  const safeCount = Number(count || 0);
  return safeCount ? safeTotal / safeCount : 0;
}

function ratio(part?: number | null, total?: number | null): number | null {
  const safePart = Number(part || 0);
  const safeTotal = Number(total || 0);
  return safeTotal ? safePart / safeTotal : null;
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
      .lightDashboard.navCollapsed {
        grid-template-columns: 72px minmax(0, 1fr);
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
      .navCollapsed .brandLockup strong,
      .navCollapsed .navLabel,
      .navCollapsed .syncBadge strong,
      .navCollapsed .syncBadge em,
      .navCollapsed .syncBadge small {
        display: none;
      }
      .navCollapsed .brandLockup {
        justify-content: center;
        padding: 0;
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
      .navCollapsed .navItem {
        justify-content: center;
        padding: 0;
      }
      .navItem > span:first-child {
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
      .navItem.active > span:first-child {
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
        cursor: pointer;
      }
      .navCollapsed .collapseMenu {
        width: 48px;
        justify-self: center;
        font-size: 0;
      }
      .navCollapsed .collapseMenu::first-letter {
        font-size: 16px;
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
        cursor: pointer;
      }
      .topControls button:disabled {
        cursor: wait;
        opacity: 0.68;
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
        min-height: 138px;
        padding: 18px 24px;
        display: grid;
        grid-template-columns: minmax(240px, 0.9fr) minmax(420px, 1.35fr) minmax(190px, 0.7fr);
        align-items: center;
        gap: 24px;
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
        margin: 8px 0 9px;
        font-size: 40px;
        line-height: 0.9;
        letter-spacing: -2px;
        color: #4d62f4;
        text-shadow: 0 12px 24px rgba(77, 98, 244, 0.22);
      }
      .heroBadges {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
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
        gap: 12px;
      }
      .miniStat {
        min-height: 74px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.42);
        box-shadow: inset 0 0 0 1px rgba(232, 237, 252, 0.72);
      }
      .miniStat strong {
        display: block;
        margin: 8px 0 6px;
        font-size: 19px;
        color: #0c1220;
        line-height: 1;
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
        max-width: 180px;
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
        grid-template-rows: 1fr 1fr;
        gap: 12px;
        margin-top: 12px;
      }
      .primeCard {
        position: relative;
        grid-row: span 2;
        padding: 16px 18px 14px;
        overflow: visible;
      }
      .venueCard {
        position: relative;
        height: 166px;
        min-height: 0;
        padding: 14px 16px 12px;
        overflow: hidden;
      }
      .cardJump {
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: inherit;
      }
      .primeCard > :not(.cardJump),
      .venueCard > :not(.cardJump) {
        position: relative;
        z-index: 2;
        pointer-events: none;
      }
      .periodSelect {
        pointer-events: auto;
        border: 0;
        border-radius: 11px;
        background: #f4f7ff;
        color: #6e7894;
        height: 28px;
        padding: 0 26px 0 12px;
        font-weight: 800;
        outline: none;
        cursor: pointer;
      }
      .primeCard:hover,
      .venueCard:hover {
        transform: translateY(-1px);
        box-shadow: 0 28px 62px rgba(105, 125, 178, 0.18);
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
        grid-template-rows: 92px;
        gap: 8px 14px;
        align-items: stretch;
      }
      .metricBlock {
        min-height: 0;
        padding: 6px 0;
      }
      .metricBlock span {
        color: #2d65ff;
      }
      .metricBlock.green span {
        color: #2eb76e;
      }
      .metricBlock em {
        display: block;
        margin-top: 8px;
        color: #5f6b85;
        font-style: normal;
        font-size: 12px;
      }
      .metricBlock strong {
        display: block;
        margin-top: 5px;
        font-size: 20px;
        line-height: 1.05;
        color: #050914;
        letter-spacing: -0.4px;
      }
      .metricBlock.compact {
        grid-column: 1 / 2;
      }
      .metricBlock small,
      .miniMetric em {
        display: block;
        margin-top: 5px;
        color: #24ad61;
        font-size: 11px;
        font-weight: 800;
      }
      .cinemaBottomRow {
        display: grid;
        grid-template-columns: minmax(120px, 0.85fr) minmax(340px, 2fr) minmax(140px, 0.85fr);
        gap: 18px;
        align-items: end;
        height: 100px;
        margin-top: 8px;
      }
      .cinemaBottomRow .metricBlock {
        grid-column: 1;
        align-self: start;
      }
      .sppArea {
        grid-column: 2;
        align-self: end;
        display: grid;
        grid-template-rows: 56px 36px;
        gap: 2px;
        min-width: 0;
        transform: translateY(6px);
      }
      .curvePair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
        align-items: end;
      }
      .curvePair svg {
        width: 100%;
        height: 32px;
      }
      .sppBlock {
        display: grid;
        place-content: center;
        border-radius: 16px;
        background: radial-gradient(ellipse at center, rgba(103, 214, 145, 0.16), transparent 68%);
        text-align: center;
      }
      .sppBlock span,
      .donutBlock span {
        color: #111827;
        font-size: 13px;
        font-weight: 900;
      }
      .sppBlock strong {
        margin-top: 2px;
        font-size: 24px;
        color: #44be73;
        letter-spacing: -1px;
      }
      .sppBlock em {
        color: #66718e;
        font-style: normal;
        font-weight: 800;
      }
      .donutBlock {
        grid-column: 3;
        align-self: center;
        display: grid;
        place-items: center;
        gap: 6px;
        text-align: center;
        transform: translateY(8px);
      }
      .donut {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: conic-gradient(#4d79ff 0 118deg, #e5ebfb 118deg 360deg);
      }
      .donut b {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #fff;
        display: grid;
        place-items: center;
        color: #5a6784;
        font-size: 15px;
        font-weight: 900;
      }
      .completionRow {
        display: flex;
        gap: 16px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(0,0,0,0.06);
      }
      .completionRow.compact {
        margin-top: 8px;
        padding-top: 8px;
      }
      .completionItem {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .completionItem span {
        font-size: 11px;
        color: #8a94ad;
      }
      .completionItem strong {
        font-size: 18px;
        font-weight: 800;
        color: #101625;
      }
      .completionItem strong.positive {
        color: #22c55e;
      }
      .completionItem strong.warn {
        color: #ef4444;
      }
      .completionItem small {
        font-size: 10px;
        color: #8a94ad;
      }
      .cinemaProgressRow {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid rgba(0,0,0,0.06);
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .cinemaProgressItem {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .miniCurves {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        margin: 0 -10px 0;
      }
      .miniCurves svg {
        height: 36px;
      }
      .venueMetrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 8px;
      }
      .miniMetric {
        min-width: 0;
      }
      .miniMetric strong {
        display: block;
        margin: 4px 0 0;
        font-size: 15px;
        line-height: 1.1;
        white-space: nowrap;
      }
      .miniMetric em {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .miniMetric em.down {
        color: #e1505d;
      }
      .progressRow {
        display: grid;
        grid-template-columns: 58px 42px minmax(90px, 1fr) 96px;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
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
      .aiStrip a {
        height: 40px;
        border-radius: 18px;
        color: #3c64ff;
        background: #fff;
        font-weight: 900;
        display: grid;
        place-items: center;
        text-decoration: none;
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
