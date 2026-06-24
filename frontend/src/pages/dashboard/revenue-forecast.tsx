import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchRevenueForecast, type RevenueForecast } from "../../lib/dashboardApi";

const bizColors: Record<string, string> = {
  billiards: "#3b82f6",
  mahjong: "#a855f7",
  cinema: "#f59e0b",
};

const bizIcons: Record<string, string> = {
  billiards: "🎱",
  mahjong: "🀄",
  cinema: "🎬",
};

const confidenceColors: Record<string, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#ef4444",
};

const confidenceLabels: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export default function RevenueForecastPage() {
  const [data, setData] = useState<RevenueForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchRevenueForecast();
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
        <title>收入预测 - 翡翠城经营驾驶舱</title>
      </Head>
      <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
        {/* 顶部导航 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link href="/dashboard" style={{ color: "#64748b", textDecoration: "none", fontSize: 14 }}>
            ← 返回首页
          </Link>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            📈 收入预测
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
            title="正在生成收入预测"
            description="模型需要读取历史数据，首次加载可能较慢。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}
        {error && (
          <DashboardStatePanel
            state="error"
            title="收入预测加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {data && data.status === "ok" ? (
          <>
            {/* 总预测 */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 24,
            }}>
              <div style={{
                background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
                border: "1px solid #1e3a5f",
                borderRadius: 12,
                padding: "20px 24px",
              }}>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>未来7天预测总收入</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#38bdf8" }}>
                  ¥{(data.summary?.total_7d_prediction || 0).toLocaleString()}
                </div>
              </div>
              <div style={{
                background: "linear-gradient(135deg, #3b1f5e 0%, #0f172a 100%)",
                border: "1px solid #3b1f5e",
                borderRadius: 12,
                padding: "20px 24px",
              }}>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>未来30天预测总收入</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: "#c084fc" }}>
                  ¥{(data.summary?.total_30d_prediction || 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* 各业务预测卡片 */}
            {data.forecasts.filter(f => f.status === "ok").map((forecast) => (
              <div key={forecast.key} style={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 12,
                padding: 24,
                marginBottom: 16,
              }}>
                {/* 标题行 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ fontSize: 20 }}>{bizIcons[forecast.key]}</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "#f1f5f9" }}>{forecast.business}</span>
                  <span style={{
                    marginLeft: 8,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    background: forecast.trend === "up" ? "#166534" : forecast.trend === "down" ? "#7f1d1d" : "#374151",
                    color: forecast.trend === "up" ? "#4ade80" : forecast.trend === "down" ? "#f87171" : "#9ca3af",
                  }}>
                    {forecast.trend === "up" ? "↑" : forecast.trend === "down" ? "↓" : "→"} {forecast.trend_label}
                  </span>
                  <span style={{
                    marginLeft: 4,
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 12,
                    background: "#1e293b",
                    color: confidenceColors[forecast.confidence || "low"],
                    border: `1px solid ${confidenceColors[forecast.confidence || "low"]}40`,
                  }}>
                    置信度: {confidenceLabels[forecast.confidence || "low"]}
                  </span>
                </div>

                {/* 关键指标 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>数据天数</div>
                    <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600 }}>{forecast.data_days}天</div>
                  </div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>日均收入</div>
                    <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600 }}>¥{(forecast.avg_daily_revenue || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>近7日均</div>
                    <div style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600 }}>¥{(forecast.recent_7d_avg || 0).toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>最高日</div>
                    <div style={{ color: "#4ade80", fontSize: 16, fontWeight: 600 }}>
                      ¥{(forecast.max_day?.revenue || 0).toLocaleString()}
                    </div>
                    <div style={{ color: "#475569", fontSize: 10 }}>{forecast.max_day?.date}</div>
                  </div>
                  <div>
                    <div style={{ color: "#64748b", fontSize: 11 }}>30天预测</div>
                    <div style={{ color: "#38bdf8", fontSize: 16, fontWeight: 600 }}>¥{(forecast.predictions_30d_total || 0).toLocaleString()}</div>
                  </div>
                </div>

                {/* 7天预测表格 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>未来7天预测</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    {(forecast.predictions_7d || []).map((pred, i) => (
                      <div key={i} style={{
                        background: "#1e293b",
                        borderRadius: 8,
                        padding: "10px 8px",
                        textAlign: "center",
                      }}>
                        <div style={{ color: "#64748b", fontSize: 11 }}>{pred.weekday}</div>
                        <div style={{ color: "#475569", fontSize: 10 }}>{pred.date.slice(5)}</div>
                        <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, marginTop: 4 }}>
                          ¥{pred.predicted_revenue.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 星期模式 */}
                {forecast.weekday_averages && (
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>星期收入分布</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                      {Object.entries(forecast.weekday_averages).map(([day, avg]) => {
                        const maxAvg = Math.max(...Object.values(forecast.weekday_averages || {}));
                        const pct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
                        return (
                          <div key={day} style={{ textAlign: "center" }}>
                            <div style={{
                              height: 60,
                              display: "flex",
                              alignItems: "flex-end",
                              justifyContent: "center",
                              marginBottom: 4,
                            }}>
                              <div style={{
                                width: 24,
                                height: `${Math.max(pct, 5)}%`,
                                background: `linear-gradient(to top, ${bizColors[forecast.key]}80, ${bizColors[forecast.key]})`,
                                borderRadius: "4px 4px 0 0",
                              }} />
                            </div>
                            <div style={{ color: "#64748b", fontSize: 11 }}>{day}</div>
                            <div style={{ color: "#94a3b8", fontSize: 10 }}>¥{avg.toLocaleString()}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        ) : data && data.status !== "ok" ? (
          <DashboardStatePanel
            state="empty"
            title="暂无足够历史数据"
            description="请先导入更多天的数据，再生成收入预测。"
            compact
          />
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无预测结果"
            description="当前没有可展示的收入预测。"
            compact
          />
        ) : null}
      </div>
    </>
  );
}
