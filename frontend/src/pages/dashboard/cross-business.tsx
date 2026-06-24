import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchCrossBusiness, type CrossBusinessData } from "../../lib/dashboardApi";

const priorityColors: Record<string, { bg: string; text: string }> = {
  high: { bg: "#7f1d1d", text: "#fca5a5" },
  medium: { bg: "#78350f", text: "#fcd34d" },
  low: { bg: "#1e293b", text: "#94a3b8" },
};

const priorityLabels: Record<string, string> = {
  high: "🔴 高优先",
  medium: "🟡 中优先",
  low: "⚪ 建议",
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
        <title>多业务联动 - 翡翠城经营驾驶舱</title>
      </Head>
      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {/* 顶部导航 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link href="/dashboard" style={{ color: "#64748b", textDecoration: "none", fontSize: 14 }}>
            ← 返回首页
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            🔗 多业务联动分析
          </h1>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              marginLeft: "auto",
              padding: "6px 16px",
              background: "#1e293b",
              color: "#94a3b8",
              border: "1px solid #334155",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 13,
            }}
          >
            {loading ? "刷新中..." : "刷新"}
          </button>
        </div>

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
            <div style={{
              background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
              border: "1px solid #1e3a5f",
              borderRadius: 12,
              padding: "20px 24px",
              marginBottom: 24,
              textAlign: "center",
            }}>
              <div style={{ color: "#64748b", fontSize: 13 }}>三业态30天合计收入</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: "#38bdf8" }}>
                ¥{(data.total_revenue_30d || 0).toLocaleString()}
              </div>
            </div>

            {/* 各业务概览 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              {Object.entries(data.summary).map(([key, biz]) => (
                <div key={key} style={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: 12,
                  padding: 20,
                }}>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "#f1f5f9",
                    marginBottom: 12,
                  }}>
                    {key === "billiards" ? "🎱" : key === "mahjong" ? "🀄" : "🎬"} {biz.name}
                  </div>
                  {biz.status === "no_data" ? (
                    <div style={{ color: "#64748b", fontSize: 13 }}>暂无数据</div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#64748b", fontSize: 13 }}>数据天数</span>
                        <span style={{ color: "#e2e8f0", fontSize: 13 }}>{biz.data_days}天</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ color: "#64748b", fontSize: 13 }}>总收入</span>
                        <span style={{ color: "#4ade80", fontSize: 13, fontWeight: 600 }}>¥{(biz.total_revenue || 0).toLocaleString()}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b", fontSize: 13 }}>日均收入</span>
                        <span style={{ color: "#e2e8f0", fontSize: 13 }}>¥{(biz.avg_daily || 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* 星期收入热力图 */}
            {data.weekday_patterns && Object.keys(data.weekday_patterns).length > 0 && (
              <div style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: 24,
                marginBottom: 24,
              }}>
                <div style={{ color: "#94a3b8", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>📊 各业态星期收入分布</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", color: "#64748b", fontSize: 12, padding: "8px 12px" }}>业态</th>
                      {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map(d => (
                        <th key={d} style={{ textAlign: "center", color: "#64748b", fontSize: 12, padding: "8px 4px" }}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.weekday_patterns).map(([biz, pattern]) => {
                      const vals = Object.values(pattern).map(p => p.avg_revenue);
                      const maxVal = Math.max(...vals, 1);
                      return (
                        <tr key={biz}>
                          <td style={{ color: "#e2e8f0", fontSize: 13, padding: "8px 12px" }}>
                            {biz === "billiards" ? "🎱 台球" : biz === "mahjong" ? "🀄 棋牌" : "🎬 影院"}
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
                              <td key={day} style={{
                                textAlign: "center",
                                padding: "8px 4px",
                                background: val > 0 ? bg : "transparent",
                                borderRadius: 4,
                              }}>
                                <div style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>
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
            )}

            {/* 联动建议 */}
            <div style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 12,
              padding: 24,
            }}>
              <div style={{ color: "#94a3b8", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                💡 联动营销建议 ({data.suggestions.length}条)
              </div>

              {data.suggestions.length === 0 && (
                <div style={{ color: "#64748b", textAlign: "center", padding: 20 }}>
                  暂无足够数据生成建议，需要更多天的经营数据。
                </div>
              )}

              {data.suggestions.map((s, i) => {
                const p = priorityColors[s.priority] || priorityColors.low;
                return (
                  <div key={s.id} style={{
                    background: "#1e293b",
                    borderRadius: 10,
                    padding: 20,
                    marginBottom: i < data.suggestions.length - 1 ? 12 : 0,
                    borderLeft: `4px solid ${p.text}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        background: p.bg,
                        color: p.text,
                      }}>
                        {priorityLabels[s.priority] || s.priority}
                      </span>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        background: "#0f172a",
                        color: "#94a3b8",
                      }}>
                        {s.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 8 }}>
                      {s.title}
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8, lineHeight: 1.6 }}>
                      {s.description}
                    </div>
                    <div style={{
                      background: "#0f172a",
                      borderRadius: 8,
                      padding: "10px 14px",
                      marginBottom: 8,
                    }}>
                      <div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>📋 建议执行方案</div>
                      <div style={{ color: "#e2e8f0", fontSize: 13 }}>{s.action}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                      <div>
                        <span style={{ color: "#64748b" }}>预期效果: </span>
                        <span style={{ color: "#4ade80" }}>{s.expected_impact}</span>
                      </div>
                      <div>
                        <span style={{ color: "#64748b" }}>数据依据: </span>
                        <span style={{ color: "#94a3b8" }}>{s.data_basis}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : data && data.status !== "ok" ? (
          <DashboardStatePanel
            state="empty"
            title="暂无联动分析结果"
            description="当前没有足够跨业务数据生成建议。"
            compact
          />
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无联动分析数据"
            description="当前没有可展示的多业务联动结果。"
            compact
          />
        ) : null}
      </div>
    </>
  );
}
