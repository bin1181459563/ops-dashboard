import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchMemberAnalysis } from "../../lib/dashboardApi";
import type { MemberAnalysis, MemberDetail } from "../../lib/dashboardApi";

export default function MemberAnalysisPage() {
  const [data, setData] = useState<MemberAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);
  const [sortBy, setSortBy] = useState<"total_amount" | "total_count" | "avg_amount">("total_amount");
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await fetchMemberAnalysis(days);
      setData(result);
    } catch (e: any) {
      setError(e?.message || "获取会员数据失败");
    } finally {
      setLoading(false);
    }
  }, [loading, days]);

  useEffect(() => { refresh(); }, [days]);

  const members = showAll ? data?.all_members : data?.top_members;
  const sortedMembers = [...(members || [])].sort((a, b) => {
    if (sortBy === "total_amount") return b.total_amount - a.total_amount;
    if (sortBy === "total_count") return b.total_count - a.total_count;
    return b.avg_amount - a.avg_amount;
  });

  return (
    <>
      <Head><title>会员消费分析 - 翡翠城经营驾驶舱</title></Head>
      <main className="dashboardShell">
        <div className="topBar">
          <div>
            <Link href="/dashboard/cinema" className="backLink">← 返回影院详情</Link>
            <h1>👥 会员消费分析</h1>
          </div>
          <div className="topMeta">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="dateSelect">
              <option value={7}>近7天</option>
              <option value={30}>近30天</option>
              <option value={90}>近90天</option>
              <option value={180}>近半年</option>
              <option value={365}>近一年</option>
            </select>
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>

        {error && <div className="errorBanner">{error}</div>}

        {data && data.status === "ok" && (
          <>
            {/* 概览指标 */}
            <div className="statsGrid" style={{ marginBottom: 24 }}>
              <div className="statItem">
                <span>会员总数</span>
                <strong>{data.summary.total_members}</strong>
              </div>
              <div className="statItem">
                <span>总消费金额</span>
                <strong>¥{data.summary.total_amount.toLocaleString()}</strong>
              </div>
              <div className="statItem">
                <span>消费笔数</span>
                <strong>{data.summary.total_count}</strong>
              </div>
              <div className="statItem">
                <span>人均消费</span>
                <strong>¥{data.summary.avg_per_member.toLocaleString()}</strong>
              </div>
              <div className="statItem">
                <span>笔单价</span>
                <strong>¥{data.summary.avg_per_visit.toLocaleString()}</strong>
              </div>
            </div>

            {/* 分布图表 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* 消费频次分布 */}
              <div className="panel">
                <h3>📊 消费频次分布</h3>
                <div className="distributionChart">
                  {Object.entries(data.frequency_distribution).map(([key, count]) => {
                    const pct = data.summary.total_members > 0 
                      ? (count / data.summary.total_members * 100).toFixed(1) 
                      : "0";
                    return (
                      <div key={key} className="distItem">
                        <span className="distLabel">{key}</span>
                        <div className="distBar">
                          <div className="distFill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="distValue">{count}人 ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 客单价分布 */}
              <div className="panel">
                <h3>💰 客单价分布</h3>
                <div className="distributionChart">
                  {Object.entries(data.avg_amount_distribution).map(([key, count]) => {
                    const pct = data.summary.total_members > 0 
                      ? (count / data.summary.total_members * 100).toFixed(1) 
                      : "0";
                    return (
                      <div key={key} className="distItem">
                        <span className="distLabel">{key}</span>
                        <div className="distBar">
                          <div className="distFill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="distValue">{count}人 ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 渠道统计 */}
            {Object.keys(data.channel_stats).length > 0 && (
              <div className="panel" style={{ marginBottom: 24 }}>
                <h3>📱 消费渠道分布</h3>
                <div className="channelGrid">
                  {Object.entries(data.channel_stats)
                    .sort((a, b) => b[1] - a[1])
                    .map(([channel, count]) => (
                      <div key={channel} className="channelItem">
                        <span className="channelName">{channel || "未知"}</span>
                        <span className="channelCount">{count}人</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* 会员排行 */}
            <div className="panel">
              <div className="panelHeader">
                <h3>🏆 会员消费排行</h3>
                <div className="chartControls">
                  <button className={`chartControl ${sortBy === "total_amount" ? "active" : ""}`} onClick={() => setSortBy("total_amount")}>按金额</button>
                  <button className={`chartControl ${sortBy === "total_count" ? "active" : ""}`} onClick={() => setSortBy("total_count")}>按次数</button>
                  <button className={`chartControl ${sortBy === "avg_amount" ? "active" : ""}`} onClick={() => setSortBy("avg_amount")}>按客单价</button>
                  <button className={`chartControl ${showAll ? "active" : ""}`} onClick={() => setShowAll(!showAll)}>
                    {showAll ? "TOP20" : "全部"}
                  </button>
                </div>
              </div>
              
              <table className="rankingTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>会员ID</th>
                    <th>卡类型</th>
                    <th>总消费</th>
                    <th>次数</th>
                    <th>客单价</th>
                    <th>影票</th>
                    <th>卖品</th>
                    <th>最近消费</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((m, i) => (
                    <tr key={m.member_id}>
                      <td>{i + 1}</td>
                      <td title={m.member_id}>{m.member_id.slice(-6)}</td>
                      <td>{m.card_type}</td>
                      <td>¥{m.total_amount.toLocaleString()}</td>
                      <td>{m.total_count}</td>
                      <td>¥{m.avg_amount.toLocaleString()}</td>
                      <td>¥{m.ticket_amount.toLocaleString()}</td>
                      <td>¥{m.concession_amount.toLocaleString()}</td>
                      <td style={{ fontSize: 12 }}>{m.last_time ? new Date(m.last_time).toLocaleDateString("zh-CN") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {data && data.status === "no_data" && (
          <div className="emptyState">{data.message}</div>
        )}
      </main>
    </>
  );
}
