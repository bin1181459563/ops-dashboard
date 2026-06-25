/**
 * 多业务联动页面
 * 分析台球、棋牌、影院三个业态的联动关系
 * 使用统一样式系统（浅色主题）
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchCrossBusiness, type CrossBusinessData } from "../../lib/dashboardApi";
import {
  AppShell,
  PageHeader,
  MetricCard,
  SectionCard,
  StatusBadge,
  EmptyState,
} from "../../components/dashboard";

/** 优先级映射到 StatusBadge 状态 */
const PRIORITY_STATUS: Record<string, "error" | "warning" | "info"> = {
  high: "error",
  medium: "warning",
  low: "info",
};

/** 优先级中文标签 */
const PRIORITY_LABELS: Record<string, string> = {
  high: "🔴 高优先",
  medium: "🟡 中优先",
  low: "⚪ 建议",
};

/** 业态图标 */
const BIZ_ICONS: Record<string, string> = {
  billiards: "🎱",
  mahjong: "🀄",
  cinema: "🎬",
};

export default function CrossBusinessPage() {
  const [data, setData] = useState<CrossBusinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchCrossBusiness();
      setData(res);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <Head>
        <title>多业务联动 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/cross-business">
        {/* 页面头部 */}
        <PageHeader
          title="🔗 多业务联动分析"
          description="分析台球、棋牌、影院三个业态的联动关系"
          actions={
            <button onClick={refresh} disabled={loading} className="btn btnSecondary">
              {loading ? "刷新中..." : "刷新"}
            </button>
          }
        />

        {/* 加载/错误状态 */}
        {loading && !data && !error && (
          <DashboardStatePanel
            state="loading"
            title="正在加载多业务联动分析"
            description="这类分析要聚合多个业务的数据，通常会慢一些。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}
        {error && (
          <DashboardStatePanel
            state="error"
            title="多业务联动加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {data && data.status === "ok" ? (
          <>
            {/* 30天总收入 */}
            <MetricCard
              label="三业态30天合计收入"
              value={`¥${(data.total_revenue_30d || 0).toLocaleString()}`}
              icon="💰"
            />

            {/* 各业务概览 */}
            <div className="metricGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {Object.entries(data.summary).map(([key, biz]) => (
                <SectionCard
                  key={key}
                  title={`${BIZ_ICONS[key] || "📊"} ${biz.name}`}
                >
                  {biz.status === "no_data" ? (
                    <div className="text-gray-500 text-sm">暂无数据</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">数据天数</span>
                        <span className="text-sm">{biz.data_days}天</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">总收入</span>
                        <span className="text-green-500 text-sm font-semibold">¥{(biz.total_revenue || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">日均收入</span>
                        <span className="text-sm">¥{(biz.avg_daily || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </SectionCard>
              ))}
            </div>

            {/* 星期收入热力图 */}
            {data.weekday_patterns && Object.keys(data.weekday_patterns).length > 0 && (
              <SectionCard title="📊 各业态星期收入分布">
                <div className="overflow-x-auto">
                  <table className="dataTable">
                    <thead>
                      <tr>
                        <th>业态</th>
                        {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(d => (
                          <th key={d} className="text-center">{d}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.weekday_patterns).map(([biz, pattern]) => {
                        const vals = Object.values(pattern).map(p => p.avg_revenue);
                        const maxVal = Math.max(...vals, 1);
                        return (
                          <tr key={biz}>
                            <td>
                              {BIZ_ICONS[biz] || "📊"} {biz === "billiards" ? "台球" : biz === "mahjong" ? "棋牌" : "影院"}
                            </td>
                            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(day => {
                              const val = pattern[day]?.avg_revenue || 0;
                              const intensity = val / maxVal;
                              const bg = biz === "billiards"
                                ? `rgba(59,130,246,${intensity * 0.6})`
                                : biz === "mahjong"
                                  ? `rgba(168,85,247,${intensity * 0.6})`
                                  : `rgba(245,158,11,${intensity * 0.6})`;
                              return (
                                <td
                                  key={day}
                                  className="text-center"
                                  style={{ background: val > 0 ? bg : "transparent" }}
                                >
                                  <div className="text-xs font-semibold">
                                    {val > 0 ? `¥${val.toLocaleString()}` : "-"}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {/* 联动建议 */}
            <SectionCard title={`💡 联动营销建议 (${data.suggestions.length}条)`}>
              {data.suggestions.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  暂无足够数据生成建议，需要更多天的经营数据。
                </div>
              ) : (
                <div className="space-y-4">
                  {data.suggestions.map((s) => {
                    const status = PRIORITY_STATUS[s.priority] || "info";
                    return (
                      <div key={s.id} className="actionCard">
                        <div className="actionIcon">
                          {s.priority === "high" ? "🚨" : s.priority === "medium" ? "⚠️" : "💡"}
                        </div>
                        <div className="actionContent">
                          <div className="flex items-center gap-2 mb-2">
                            <StatusBadge status={status}>
                              {PRIORITY_LABELS[s.priority] || s.priority}
                            </StatusBadge>
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {s.category}
                            </span>
                          </div>
                          <div className="actionTitle">{s.title}</div>
                          <p className="actionDesc">{s.description}</p>
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                            <div className="text-blue-600 text-xs font-semibold mb-1">📋 建议执行方案</div>
                            <div className="text-gray-700 text-sm">{s.action}</div>
                          </div>
                          <div className="flex gap-4 mt-2 text-xs">
                            <div>
                              <span className="text-gray-500">预期效果: </span>
                              <span className="text-green-500">{s.expected_impact}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">数据依据: </span>
                              <span className="text-gray-600">{s.data_basis}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          </>
        ) : data && data.status !== "ok" ? (
          <EmptyState
            icon="🔗"
            title="暂无联动分析结果"
            description="当前没有足够跨业务数据生成建议。"
          />
        ) : !loading && !error ? (
          <EmptyState
            icon="🔗"
            title="暂无联动分析数据"
            description="当前没有可展示的多业务联动结果。"
          />
        ) : null}
      </AppShell>
    </>
  );
}
