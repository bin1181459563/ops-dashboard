import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { generateBusinessAlerts } from "../../lib/businessAlertRules";
import { generateBusinessInsights } from "../../lib/businessInsightRules";
import { buildBusinessReportSections, formatBusinessReportText } from "../../lib/businessReportRules";
import type { BusinessInsight } from "../../lib/businessInsightRules";
import type { BusinessSummary, BusinessType } from "../../lib/businessAdapters";
import { fetchDailyReport, fetchAiWeeklyReport, fetchAiMonthlyReport } from "../../lib/dashboardApi";

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

const reportTabs = [
  { key: "daily", label: "📅 日报", color: "blue" },
  { key: "weekly", label: "📊 周报", color: "purple" },
  { key: "monthly", label: "📈 月报", color: "amber" },
] as const;

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

  const tabColors: Record<string, { active: string; inactive: string }> = {
    daily: { active: "bg-blue-600 text-white shadow-lg shadow-blue-600/30", inactive: "bg-gray-800 text-gray-400 hover:bg-gray-700" },
    weekly: { active: "bg-purple-600 text-white shadow-lg shadow-purple-600/30", inactive: "bg-gray-800 text-gray-400 hover:bg-gray-700" },
    monthly: { active: "bg-amber-600 text-white shadow-lg shadow-amber-600/30", inactive: "bg-gray-800 text-gray-400 hover:bg-gray-700" },
  };
  const businessInsights = data ? buildReportBusinessInsights(data).slice(0, 3) : [];
  const reportSections = data ? buildReportSections(reportType, data, businessInsights) : null;

  return (
    <>
      <Head>
        <title>AI 报告 · 翡翠城经营驾驶舱</title>
      </Head>
      <main className="min-h-screen bg-gray-900 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-blue-400 hover:underline text-sm">← 返回主页</Link>
            <h1 className="text-2xl font-bold mt-2">📋 AI 经营报告</h1>
            <p className="text-gray-400 text-sm mt-1">AI 生成的经营分析报告，可一键复制发群</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCopy} disabled={!data}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                copied ? "bg-green-600 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-200"
              } disabled:opacity-50`}>
              {copied ? "✅ 已复制" : "📋 一键复制"}
            </button>
            <button onClick={refresh} disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
              🔄 刷新
            </button>
          </div>
        </div>

        {/* Report Type Tabs */}
        <div className="flex gap-2 mb-6">
          {reportTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setReportType(tab.key as ReportType)}
              className={`px-6 py-3 rounded-xl text-sm font-medium transition-colors ${
                reportType === tab.key ? tabColors[tab.key].active : tabColors[tab.key].inactive
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="text-gray-400 text-xs mb-1">总收入</div>
                  <div className="text-2xl font-bold text-green-400">
                    ¥{(data.summary.total_revenue || 0).toLocaleString()}
                  </div>
                </div>
                {(data.summary?.total_orders ?? 0) > 0 && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <div className="text-gray-400 text-xs mb-1">总订单</div>
                    <div className="text-2xl font-bold text-blue-400">{(data.summary?.total_orders ?? 0)}单</div>
                  </div>
                )}
                {(data.summary?.total_customers ?? 0) > 0 && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <div className="text-gray-400 text-xs mb-1">总客流</div>
                    <div className="text-2xl font-bold text-purple-400">{(data.summary?.total_customers ?? 0)}人</div>
                  </div>
                )}
                {(data.summary?.avg_daily_revenue ?? 0) > 0 && (
                  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                    <div className="text-gray-400 text-xs mb-1">日均收入</div>
                    <div className="text-2xl font-bold text-amber-400">
                      ¥{(data.summary.avg_daily_revenue || 0).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {reportSections && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-gray-200 font-semibold">{reportSections.title}</h3>
                    <p className="text-gray-400 text-sm mt-1">{reportSections.headline}</p>
                  </div>
                  <span className="text-xs text-gray-500">{data.report_date || data.generated_at?.slice(0, 10) || "未标注日期"}</span>
                </div>
                {reportSections.highlights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {reportSections.highlights.map((item, index) => (
                      <div key={`${item}-${index}`} className="text-sm text-gray-300 px-3 py-2 rounded-lg" style={{ background: "#1a2332" }}>
                        {item}
                      </div>
                    ))}
                  </div>
                )}
                {reportSections.focusIssues.length > 0 && (
                  <div className="mt-4">
                    <div className="text-gray-400 text-xs mb-2">重点经营问题</div>
                    <ol className="text-gray-300 text-sm space-y-1">
                      {reportSections.focusIssues.map((item, index) => (
                        <li key={`${item}-${index}`}>{index + 1}. {item}</li>
                      ))}
                    </ol>
                  </div>
                )}
                {reportSections.actions.length > 0 && (
                  <div className="mt-4">
                    <div className="text-gray-400 text-xs mb-2">{reportSections.actionTitle}</div>
                    <ol className="text-gray-300 text-sm space-y-1">
                      {reportSections.actions.map((item, index) => (
                        <li key={`${item}-${index}`}>{index + 1}. {item}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-gray-300 font-semibold mb-4">💡 规则经营建议</h3>
              {businessInsights.length ? (
                <div className="space-y-3">
                  {businessInsights.map((item) => (
                    <div key={item.id} className="p-3 rounded-lg" style={{ background: "#1a2332" }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <strong className="text-white">{item.title}</strong>
                        <span className={`text-xs px-2 py-0.5 rounded text-white ${priorityBadgeClass(item.priority)}`}>
                          {priorityLabel(item.priority)}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm">{item.problem}</p>
                      <ol className="text-gray-400 text-xs mt-2 space-y-1">
                        {item.actions.slice(0, 3).map((action, index) => (
                          <li key={`${item.id}-${index}`}>{index + 1}. {action}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm">暂无重点经营建议</div>
              )}
            </div>

            {/* 各业务明细 */}
            {data.businesses && data.businesses.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-gray-300 font-semibold mb-4">📊 各业态明细</h3>
                <div className="space-y-3">
                  {data.businesses.map((biz, i) => {
                    const revenue = biz.today?.revenue || biz.period?.revenue || 0;
                    const change = biz.changes?.revenue_change;
                    const isPositive = change !== null && change !== undefined && change > 0;
                    const isNegative = change !== null && change !== undefined && change < 0;

                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-750 rounded-lg" style={{ background: "#1a2332" }}>
                        <div>
                          <span className="text-white font-medium">
                            {biz.venue}{biz.name}
                          </span>
                          {biz.period && (
                            <span className="text-gray-500 text-xs ml-2">
                              ({biz.period.days}天, 日均¥{biz.period.avg_daily_revenue?.toLocaleString()})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white font-bold text-lg">¥{revenue.toLocaleString()}</span>
                          {biz.changes?.revenue && (
                            <span className={`text-sm font-medium px-2 py-0.5 rounded ${
                              isPositive ? "bg-green-900/50 text-green-400" :
                              isNegative ? "bg-red-900/50 text-red-400" :
                              "bg-gray-700 text-gray-400"
                            }`}>
                              {biz.changes.revenue}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 排名（月报/周报） */}
            {data.ranking && data.ranking.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-gray-300 font-semibold mb-4">🏆 收入排名</h3>
                <div className="flex gap-4">
                  {data.ranking.map((r) => (
                    <div key={r.rank} className="flex-1 text-center p-4 bg-gray-750 rounded-lg" style={{ background: "#1a2332" }}>
                      <div className="text-2xl mb-1">{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : "🥉"}</div>
                      <div className="text-white font-medium">{r.name}</div>
                      <div className="text-green-400 font-bold">¥{r.revenue.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 最高/最低日 */}
            {data.businesses?.some(b => b.best_day) && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-gray-300 font-semibold mb-4">📅 最高/最低收入日</h3>
                <div className="space-y-2">
                  {data.businesses.filter(b => b.best_day).map((biz, i) => (
                    <div key={i} className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400 w-20">{biz.name}</span>
                      <span className="text-green-400">
                        最高: {biz.best_day?.date} ¥{biz.best_day?.revenue.toLocaleString()}
                      </span>
                      {biz.worst_day && (
                        <span className="text-red-400">
                          最低: {biz.worst_day.date} ¥{biz.worst_day.revenue.toLocaleString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI建议 */}
            {data.suggestions && data.suggestions.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-gray-300 font-semibold mb-4">💡 AI 建议</h3>
                <div className="space-y-2">
                  {data.suggestions.map((s, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg" style={{ background: "#1a2332" }}>
                      <span className="text-blue-400 font-bold shrink-0">{i + 1}.</span>
                      <span className="text-gray-300 text-sm leading-relaxed">{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 旧格式纯文本报告 */}
            {data.report && !data.businesses && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {data.report}
                </div>
              </div>
            )}
          </div>
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无报告内容"
            description="当前没有可展示的经营报告。"
            compact
          />
        ) : null}

        {/* Quick Copy Hint */}
        {data && (
          <div className="mt-4 text-center">
            <p className="text-gray-500 text-xs">
              💡 点击&quot;一键复制&quot;按钮，复制内容可直接粘贴到微信群
            </p>
          </div>
        )}
      </main>
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

function priorityBadgeClass(priority: BusinessInsight["priority"]): string {
  if (priority === "high") return "bg-red-600";
  if (priority === "medium") return "bg-yellow-600";
  return "bg-blue-600";
}

function priorityLabel(priority: BusinessInsight["priority"]): string {
  if (priority === "high") return "高";
  if (priority === "medium") return "中";
  return "低";
}
