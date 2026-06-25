import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchScreeningSuggestions } from "../../lib/dashboardApi";
import type { ScreeningSuggestionsData, ScreeningSuggestion } from "../../lib/dashboardApi";

export default function ScreeningSuggestionsPage() {
  const [data, setData] = useState<ScreeningSuggestionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<ScreeningSuggestion | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchScreeningSuggestions();
      setData(result);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取排片建议失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  return (
    <>
      <Head><title>🎬 排片建议 - 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/screening-suggestions">
        <div className="topBar">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <Link href="/dashboard/cinema" className="backLink" style={{ marginLeft: 12 }}>🎬 影院详情</Link>
            <h1>🎬 排片建议</h1>
            <span className="eyebrow">时段分析 · AI排片优化 · 上座率提升</span>
          </div>
          <div className="topMeta">
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>

        {loading && !data && !error && (
          <DashboardStatePanel
            state="loading"
            title="正在加载排片建议"
            description="排片分析需要读取影院历史数据，请稍候。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {error && (
          <DashboardStatePanel
            state="error"
            title="排片建议加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {data && data.status === "ok" ? (
          <>
            {/* 概览指标 */}
            <section className="metricGrid">
              <Metric label="分析周期" value={data.evidence?.[0]?.split(": ")[1] || "近7日"} tone="cyan" />
              <Metric label="建议数量" value={`${data.suggestions?.length || 0}条`} tone="gold" />
              <Metric label="置信度" value={`${((data.confidence || 0) * 100).toFixed(0)}%`} tone="green" />
              <Metric label="数据状态" value={data.conclusion || "-"} tone="muted" />
            </section>

            {/* 星期分析 */}
            <section className="panel">
              <div className="panelHeader">
                <h3>📊 星期分析</h3>
                <span className="panelHint">按星期分析客流和票房</span>
              </div>
              <div className="timeSlotGrid">
                {(data.weekday_analysis || []).map((day) => {
                  const isHigh = day.avg_customers >= 100;
                  const isLow = day.avg_customers < 50;
                  return (
                    <div key={day.weekday} className={`timeSlotCard ${isHigh ? "slot-high" : isLow ? "slot-low" : "slot-mid"}`}>
                      <div className="slotTime">{day.weekday}</div>
                      <div className="slotOccupancy">{day.avg_customers} 人次</div>
                      <div className="slotOccupancyBar">
                        <span style={{ width: `${Math.min(day.avg_customers / 2, 100)}%` }} />
                      </div>
                      <div className="slotMeta">
                        <span>票房 {currency(day.avg_box_office)}</span>
                        <span>{day.sample_days} 天样本</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(data.weekday_analysis || []).length === 0 && <div className="emptyState">暂无星期数据</div>}
            </section>

            {/* AI排片建议 */}
            <section className="panel">
              <div className="panelHeader">
                <h3>🤖 AI排片建议</h3>
                <span className="panelHint">{data.suggestions.length} 条建议</span>
              </div>
              <table className="rankingTable">
                <thead>
                  <tr>
                    <th>类别</th>
                    <th>建议</th>
                    <th>优先级</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.suggestions.map((s, i) => (
                    <tr key={`${s.category}-${s.title}-${i}`}>
                      <td><strong>{s.title || s.film_name || "排片建议"}</strong></td>
                      <td>
                        <div className="slotTagList">
                          <span className="slotTag">{s.category || "排片优化"}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`improveTag priority-${s.priority || "medium"}`}>{s.priority || "medium"}</span>
                      </td>
                      <td>
                        <button className="actionBtn" onClick={() => setSelectedSuggestion(selectedSuggestion?.title === s.title ? null : s)}>
                          {selectedSuggestion?.title === s.title ? "收起" : "查看原因"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.suggestions.length === 0 && <div className="emptyState">暂无排片建议</div>}
            </section>

            {/* 选中建议详情 */}
            {selectedSuggestion && (
              <section className="panel suggestionPanel">
                <div className="panelHeader">
                  <h3>💡 {selectedSuggestion.title || selectedSuggestion.film_name || "排片建议"} — 排片分析</h3>
                  <button className="chartControl" onClick={() => setSelectedSuggestion(null)}>关闭</button>
                </div>
                <div className="suggestionDetail">
                  <div className="suggestionRow">
                    <span className="suggestionLabel">建议时段</span>
                    <div className="slotTagList">
                      {(selectedSuggestion.suggested_slots || [selectedSuggestion.category || "排片优化"]).map((s, i) => (
                        <span key={i} className="slotTag">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="suggestionRow">
                    <span className="suggestionLabel">预期提升</span>
                    <span className="improveTag">{selectedSuggestion.expected_improvement || selectedSuggestion.priority || "-"}</span>
                  </div>
                  <div className="suggestionReason">
                    <span className="suggestionLabel">分析原因</span>
                    <p>{selectedSuggestion.reason || selectedSuggestion.detail || selectedSuggestion.suggestion || "暂无详细说明"}</p>
                  </div>
                </div>
              </section>
            )}

            {/* 历史数据对比 */}
            {data.historical_comparison && data.historical_comparison.length > 0 && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>📈 历史数据</h3>
                  <button className="chartControl" onClick={() => setShowHistory(!showHistory)}>
                    {showHistory ? "收起" : "展开查看"}
                  </button>
                </div>
                {showHistory && (
                  <table className="rankingTable">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>场次</th>
                        <th>上座率</th>
                        <th>票房</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.historical_comparison.map((h, i) => (
                        <tr key={`${h.date}-${i}`}>
                          <td>{h.date}</td>
                          <td>{h.screenings}</td>
                          <td>{percent(h.occupancy)}</td>
                          <td>{currency(h.box_office)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </>
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无排片建议数据"
            description="当前没有足够影院数据生成排片建议。"
            compact
          />
        ) : null}
      </AppShell>

      <style jsx>{`
        .errorBanner {
          padding: 12px 16px;
          margin-bottom: 12px;
          background: rgba(255,107,107,0.15);
          border: 1px solid rgba(255,107,107,0.3);
          border-radius: 8px;
          color: #ffb3b3;
        }
        .timeSlotGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .timeSlotCard {
          padding: 14px;
          border-radius: 8px;
          border-left: 3px solid;
        }
        .slot-high {
          background: rgba(34, 197, 94, 0.06);
          border-color: #22c55e;
        }
        .slot-mid {
          background: rgba(251, 191, 36, 0.06);
          border-color: #fbbf24;
        }
        .slot-low {
          background: rgba(239, 68, 68, 0.06);
          border-color: #ef4444;
        }
        .slotTime {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
          margin-bottom: 6px;
        }
        .slotOccupancy {
          font-size: 22px;
          font-weight: 700;
          color: var(--cyan);
          margin-bottom: 6px;
        }
        .slotOccupancyBar {
          width: 100%;
          height: 4px;
          background: rgba(255,255,255,0.06);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .slotOccupancyBar span {
          display: block;
          height: 100%;
          background: linear-gradient(90deg, #4ecdc4, #36d6ff);
          border-radius: 2px;
          transition: width 0.3s;
        }
        .slotMeta {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }
        .slotTagList {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        .slotTag {
          display: inline-block;
          padding: 2px 8px;
          background: rgba(54, 214, 255, 0.1);
          border: 1px solid rgba(54, 214, 255, 0.2);
          border-radius: 10px;
          font-size: 11px;
          color: var(--cyan);
          white-space: nowrap;
        }
        .improveTag {
          display: inline-block;
          padding: 2px 8px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 10px;
          font-size: 12px;
          color: #22c55e;
          font-weight: 600;
        }
        .actionBtn {
          padding: 4px 10px;
          background: rgba(54, 214, 255, 0.1);
          border: 1px solid rgba(54, 214, 255, 0.2);
          border-radius: 4px;
          color: var(--cyan);
          font-size: 12px;
          cursor: pointer;
        }
        .actionBtn:hover {
          background: rgba(54, 214, 255, 0.2);
        }
        .suggestionPanel {
          margin-top: 16px;
          border-left: 3px solid #fbbf24;
        }
        .suggestionDetail {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .suggestionRow {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .suggestionLabel {
          font-size: 12px;
          color: var(--muted);
          min-width: 70px;
        }
        .suggestionReason {
          margin-top: 4px;
        }
        .suggestionReason p {
          margin-top: 6px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          line-height: 1.7;
          padding: 12px;
          background: rgba(251, 191, 36, 0.05);
          border-radius: 6px;
        }
      `}</style>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className={`metricCard tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function currency(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function percent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}
