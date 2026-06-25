/**
 * AI 报告页面
 * 显示 AI 生成的经营分析报告，支持日报/周报/月报切换
 * 使用统一样式系统（浅色主题）
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { generateBusinessAlerts } from "../../lib/businessAlertRules";
import { generateBusinessInsights } from "../../lib/businessInsightRules";
import { buildBusinessReportSections, formatBusinessReportText } from "../../lib/businessReportRules";
import type { BusinessInsight } from "../../lib/businessInsightRules";
import type { BusinessSummary, BusinessType } from "../../lib/businessAdapters";
import { fetchDailyReport, fetchAiWeeklyReport, fetchAiMonthlyReport } from "../../lib/dashboardApi";
import {
  AppShell,
  PageHeader,
  MetricCard,
  CapsuleGroup,
  SectionCard,
  StatusBadge,
  EmptyState,
} from "../../components/dashboard";

type ReportType = "daily" | "weekly" | "monthly";

interface ReportData {
  report?: string;
  report_type?: string;
  title?: string;
  source?: string;
  generated_at?: string;
  report_date?: string;
  snapshots_count?: number;
  period?: string;
  // 结构化报告字段
  summary?: {
    total_revenue?: number;
    total_orders?: number;
    total_customers?: number;
    avg_daily_revenue?: number;
  };
  businesses?: Array<{
    name?: string;
    venue?: string;
    today?: { revenue: number; orders: number; customer_count: number };
    period?: { days: number; revenue: number; orders: number; customers: number; avg_daily_revenue: number };
    previous_period?: { revenue: number };
    changes?: { revenue: string; revenue_change: number | null };
    best_day?: { date: string; revenue: number } | null;
    worst_day?: { date: string; revenue: number } | null;
    daily_data?: Array<{ date: string; revenue: number }>;
  }>;
  highlights?: {
    best_business?: { name: string; venue: string; revenue: number; change: string } | null;
    worst_business?: { name: string; venue: string; revenue: number; change: string } | null;
  };
  ranking?: Array<{ rank: number; name: string; revenue: number }>;
  suggestions?: string[];
  period_days?: number;
}

/** 报告类型选项 */
const REPORT_TABS = [
  { value: "daily", label: "📅 日报" },
  { value: "weekly", label: "📊 周报" },
  { value: "monthly", label: "📈 月报" },
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const fetchers = {
        daily: fetchDailyReport,
        weekly: fetchAiWeeklyReport,
        monthly: fetchAiMonthlyReport,
      };
      const res = await fetchers[reportType]();
      setData(res.data ?? res);
    } catch (e: unknown) {
      setError(getDashboardErrorMessage(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [reportType]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCopy = async () => {
    if (!data) return;
    const text = buildCopyReportText(reportType, data, businessInsights);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const businessInsights = data ? buildReportBusinessInsights(data).slice(0, 3) : [];
  const reportSections = data ? buildReportSections(reportType, data, businessInsights) : null;

  return (
    <>
      <Head>
        <title>AI 报告 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/reports">
        {/* 页面头部 */}
        <PageHeader
          title="📋 AI 经营报告"
          description="AI 生成的经营分析报告，可一键复制发群"
          actions={
            <>
              <button
                onClick={handleCopy}
                disabled={!data}
                className={`btn ${copied ? "btnPrimary" : "btnSecondary"}`}
              >
                {copied ? "✅ 已复制" : "📋 一键复制"}
              </button>
              <button onClick={refresh} disabled={loading} className="btn btnSecondary">
                🔄 刷新
              </button>
            </>
          }
        />

        {/* 报告类型切换 */}
        <CapsuleGroup
          options={REPORT_TABS}
          value={reportType}
          onChange={(v) => setReportType(v as ReportType)}
        />

        {/* 加载/错误状态 */}
        {loading && !data && !error && (
          <DashboardStatePanel
            state="loading"
            title="正在生成报告"
            description="日报/周报/月报需要聚合经营数据，首次加载可能稍慢。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}
        {error && (
          <DashboardStatePanel
            state="error"
            title="报告加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {/* 结构化报告展示 */}
        {data && !loading ? (
          <div className="space-y-4">
            {/* 概览卡片 */}
            {data.summary && (
              <div className="metricGrid">
                <MetricCard
                  label="总收入"
                  value={`¥${(data.summary.total_revenue || 0).toLocaleString()}`}
                  trendDirection="positive"
                />
                {(data.summary?.total_orders ?? 0) > 0 && (
                  <MetricCard
                    label="总订单"
                    value={`${data.summary?.total_orders ?? 0}单`}
                  />
                )}
                {(data.summary?.total_customers ?? 0) > 0 && (
                  <MetricCard
                    label="总客流"
                    value={`${data.summary?.total_customers ?? 0}人`}
                  />
                )}
                {(data.summary?.avg_daily_revenue ?? 0) > 0 && (
                  <MetricCard
                    label="日均收入"
                    value={`¥${(data.summary.avg_daily_revenue || 0).toLocaleString()}`}
                  />
                )}
              </div>
            )}

            {/* 报告内容 */}
            {reportSections && (
              <SectionCard
                title={reportSections.title}
                subtitle={reportSections.headline}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className="text-xs text-gray-500">{data.report_date || data.generated_at?.slice(0, 10) || "未标注日期"}</span>
                </div>
                {reportSections.highlights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {reportSections.highlights.map((item, index) => (
                      <div key={`${item}-${index}`} className="actionCard">
                        <div className="actionIcon">💡</div>
                        <div className="actionContent">
                          <p className="actionDesc">{item}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {reportSections.focusIssues.length > 0 && (
                  <div className="mt-4">
                    <div className="text-gray-500 text-xs mb-2">重点经营问题</div>
                    <ol className="text-gray-700 text-sm space-y-1">
                      {reportSections.focusIssues.map((item, index) => (
                        <li key={`${item}-${index}`}>{index + 1}. {item}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {reportSections.actions.length > 0 && (
                  <div className="mt-4">
                    <div className="text-gray-500 text-xs mb-2">{reportSections.actionTitle}</div>
                    <ol className="text-gray-700 text-sm space-y-1">
                      {reportSections.actions.map((item, index) => (
                        <li key={`${item}-${index}`}>{index + 1}. {item}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </SectionCard>
            )}

            {/* 经营建议 */}
            <SectionCard title="💡 规则经营建议">
              {businessInsights.length ? (
                <div className="space-y-3">
                  {businessInsights.map((item) => (
                    <div key={item.id} className="actionCard">
                      <div className="actionIcon">
                        {item.priority === "high" ? "🚨" : item.priority === "medium" ? "⚠️" : "ℹ️"}
                      </div>
                      <div className="actionContent">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <strong className="actionTitle">{item.title}</strong>
                          <StatusBadge status={item.priority === "high" ? "error" : item.priority === "medium" ? "warning" : "info"}>
                            {priorityLabel(item.priority)}
                          </StatusBadge>
                        </div>
                        <p className="actionDesc">{item.problem}</p>
                        <ol className="text-gray-500 text-xs mt-2 space-y-1">
                          {item.actions.slice(0, 3).map((action, index) => (
                            <li key={`${item.id}-${index}`}>{index + 1}. {action}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">暂无重点经营建议</div>
              )}
            </SectionCard>

            {/* 各业务明细 */}
            {data.businesses && data.businesses.length > 0 && (
              <SectionCard title="📊 各业态明细">
                <div className="space-y-3">
                  {data.businesses.map((biz, i) => {
                    const revenue = biz.today?.revenue || biz.period?.revenue || 0;
                    const change = biz.changes?.revenue_change;
                    const isPositive = change !== null && change !== undefined && change > 0;
                    const isNegative = change !== null && change !== undefined && change < 0;

                    return (
                      <div key={i} className="actionCard">
                        <div className="actionIcon">
                          {biz.venue?.includes("台球") ? "🎱" : biz.venue?.includes("棋牌") ? "🀄" : "🎬"}
                        </div>
                        <div className="actionContent">
                          <div className="actionTitle">{biz.venue}{biz.name}</div>
                          {biz.period && (
                            <span className="text-gray-500 text-xs">
                              ({biz.period.days}天, 日均¥{biz.period.avg_daily_revenue?.toLocaleString()})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-bold">¥{revenue.toLocaleString()}</span>
                          {biz.changes?.revenue && (
                            <StatusBadge status={isPositive ? "success" : isNegative ? "error" : "info"}>
                              {biz.changes.revenue}
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* 排名（月报/周报） */}
            {data.ranking && data.ranking.length > 0 && (
              <SectionCard title="🏆 收入排名">
                <div className="flex gap-4">
                  {data.ranking.map((r) => (
                    <div key={r.rank} className="flex-1 text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl mb-1">{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}</div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-green-500 font-bold">¥{r.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* 最高/最低日 */}
            {data.businesses?.some(b => b.best_day) && (
              <SectionCard title="📅 最高/最低收入日">
                <div className="space-y-2">
                  {data.businesses.filter(b => b.best_day).map((biz, i) => (
                    <div key={i} className="flex items-center gap-4 text-sm">
                      <span className="text-gray-500 w-20">{biz.name}</span>
                      <span className="text-green-500">
                        最高: {biz.best_day?.date} ¥{biz.best_day?.revenue.toLocaleString()}
                      </span>
                      {biz.worst_day && (
                        <span className="text-red-500">
                          最低: {biz.worst_day.date} ¥{biz.worst_day.revenue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* AI建议 */}
            {data.suggestions && data.suggestions.length > 0 && (
              <SectionCard title="💡 AI 建议">
                <div className="space-y-2">
                  {data.suggestions.map((s, i) => (
                    <div key={i} className="actionCard">
                      <div className="actionIcon">💡</div>
                      <div className="actionContent">
                        <span className="text-blue-500 font-bold shrink-0">{i + 1}.</span>
                        <span className="text-gray-700 text-sm leading-relaxed">{s}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* 旧格式纯文本报告 */}
            {data.report && !data.businesses && (
              <SectionCard title="报告内容">
                <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {data.report}
                </div>
              </SectionCard>
            )}
          </div>
        ) : !loading && !error ? (
          <EmptyState
            icon="📋"
            title="暂无报告内容"
            description="当前没有可展示的经营报告。"
          />
        ) : null}

        {/* 快速复制提示 */}
        {data && (
          <div className="mt-4 text-center">
            <p className="text-gray-500 text-xs">
              💡 点击"一键复制"按钮，复制内容可直接粘贴到微信群
            </p>
          </div>
        )}
      </AppShell>
    </>
  );
}

function buildReportBusinessInsights(data: ReportData): BusinessInsight[] {
  const summaries = reportBusinessSummaries(data);
  const alerts = generateBusinessAlerts(summaries);
  return generateBusinessInsights({ summaries, alerts });
}

function buildReportSections(reportType: ReportType, data: ReportData, insights: BusinessInsight[]) {
  return buildBusinessReportSections({
    reportType,
    reportDate: data.report_date || data.generated_at?.slice(0, 10) || "",
    summary: data.summary || {},
    businesses: (data.businesses || []).map((business) => ({
      name: business.name || "",
      venue: business.venue || "",
      revenue: business.today?.revenue ?? business.period?.revenue ?? 0,
      orders: business.today?.orders ?? business.period?.orders ?? 0,
      customers: business.today?.customer_count ?? business.period?.customers ?? 0,
      changeLabel: business.changes?.revenue || undefined,
    })),
    insights,
    baseReport: data.report,
  });
}

function buildCopyReportText(reportType: ReportType, data: ReportData, insights: BusinessInsight[]) {
  return formatBusinessReportText({
    reportType,
    reportDate: data.report_date || data.generated_at?.slice(0, 10) || "",
    summary: data.summary || {},
    businesses: (data.businesses || []).map((business) => ({
      name: business.name || "",
      venue: business.venue || "",
      revenue: business.today?.revenue ?? business.period?.revenue ?? 0,
      orders: business.today?.orders ?? business.period?.orders ?? 0,
      customers: business.today?.customer_count ?? business.period?.customers ?? 0,
      changeLabel: business.changes?.revenue || undefined,
    })),
    insights,
    baseReport: data.report,
  });
}

function reportBusinessSummaries(data: ReportData): BusinessSummary[] {
  if (!data.businesses?.length) return [];
  return data.businesses.map((business) => {
    const businessType = inferBusinessType(`${business.venue || ""}${business.name || ""}`);
    const revenue = business.today?.revenue ?? business.period?.revenue ?? 0;
    const orders = business.today?.orders ?? business.period?.orders ?? 0;
    const customers = business.today?.customer_count ?? business.period?.customers ?? 0;
    return {
      businessType,
      displayName: displayNameForBusiness(businessType),
      revenue,
      orders,
      customers,
      utilizationRate: null,
      avgOrderValue: orders > 0 ? revenue / orders : null,
      status: revenue > 0 || orders > 0 || customers > 0 ? "normal" : "empty",
      statusMessage: revenue > 0 || orders > 0 || customers > 0 ? undefined : "暂无经营数据",
    };
  });
}

function inferBusinessType(label: string): BusinessType {
  if (label.includes("台球") || label.toLowerCase().includes("billiard")) return "billiards";
  if (label.includes("棋牌") || label.includes("麻将") || label.includes("無老板")) return "mahjong";
  if (label.includes("影院") || label.includes("电影") || label.includes("凤凰")) return "cinema";
  return "qgcloud";
}

function displayNameForBusiness(type: BusinessType): string {
  return { billiards: "台球", mahjong: "棋牌", cinema: "影院", qgcloud: "轻购云" }[type];
}

function priorityLabel(priority: BusinessInsight["priority"]): string {
  if (priority === "high") return "高";
  if (priority === "medium") return "中";
  return "低";
}
