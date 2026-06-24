import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { toBilliardsSummary } from "../../lib/businessAdapters";
import { fetchXiaotieFullDetail, runCollect } from "../../lib/dashboardApi";
import type { XiaotieFullDetail } from "../../lib/dashboardApi";

// Tab类型：今日/昨日/本周/上周/本月/上月/今年/去年
type TabKey = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year" | "last_year" | "all";

// 环比计算：返回百分比和方向
function calcChange(current: number, previous: number): { pct: string; dir: "up" | "down" | "flat" } {
  if (previous === 0) return { pct: "--", dir: "flat" };
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { pct: "0%", dir: "flat" };
  return {
    pct: (change > 0 ? "+" : "") + change.toFixed(0) + "%",
    dir: change > 0 ? "up" : "down",
  };
}

// 格式化金额：小于1万显示原值，大于等于1万显示x.xx万
function fmtMoney(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(2) + "万";
  return v.toLocaleString();
}

export default function BilliardsPage() {
  const [data, setData] = useState<XiaotieFullDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("today");
  const [tableTab, setTableTab] = useState<TabKey>("month");
  const [memberTab, setMemberTab] = useState<TabKey>("month");
  const [memberSortBy, setMemberSortBy] = useState<"payed" | "hours">("payed");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await runCollect().catch(() => {});
      const result = await fetchXiaotieFullDetail();
      if (result.error) {
        setError(result.error);
      } else {
        setData(result);
        setLastUpdate(new Date());
      }
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取失败"));
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => { refresh(); }, []);

  // 根据tab获取对应summary
  const getSummary = () => {
    if (!data) return null;
    switch (tab) {
      case "today": return data.summary_today;
      case "yesterday": return data.comparison.yesterday;
      case "week": return data.summary_week;
      case "last_week": return data.comparison.last_week;
      case "month": return data.summary_month;
      case "last_month": return data.comparison.last_month;
      case "year": return data.summary_year;
      case "last_year": return data.summary_last_year;
    }
  };
  const summary = getSummary();
  const businessSummary = toBilliardsSummary(data || {});

  // 获取日期范围显示文本
  const getDateRangeText = () => {
    if (!data?.date_ranges) return "";
    const range = data.date_ranges[tab];
    if (!range) return "";
    // 格式化日期：2026-06-22T00:00:00+08:00 → 6月22日
    const formatDate = (dateStr: string) => {
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return "";
      const month = parseInt(match[2]);
      const day = parseInt(match[3]);
      return `${month}月${day}日`;
    };
    const start = formatDate(range.start);
    const end = formatDate(range.end);
    if (start === end) return start;
    return `${start} ~ ${end}`;
  };
  const dateRangeText = getDateRangeText();

  // 格式化对比日期范围：用于显示环比对比的时间段
  const formatCompRange = (comp: any): string => {
    if (!comp?.date_range) return "";
    const fmt = (dateStr: string) => {
      const match = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!match) return "";
      const y = parseInt(match[1]);
      const m = parseInt(match[2]);
      const d = parseInt(match[3]);
      return `${y}/${m}/${d}`;
    };
    const s = fmt(comp.date_range.start);
    const e = fmt(comp.date_range.end);
    if (!s) return "";
    if (s === e) return `(${s})`;
    return `(${s}~${e})`;
  };

  // 根据tableTab获取对应桌台排行
  const getTableRanking = () => {
    if (!data) return [];
    switch (tableTab) {
      case "today": return data.table_ranking_today;
      case "week": return data.table_ranking_week;
      case "month": return data.table_ranking_month;
      default: return [];
    }
  };
  const tableRanking = getTableRanking();

  // 根据memberTab和排序方式获取对应会员TOP
  const getMemberTop = () => {
    if (!data) return [];
    let list: any[] = [];
    if (memberSortBy === "hours") {
      // 按时长排序
      switch (memberTab) {
        case "today": list = data.member_top_today_by_hours || []; break;
        case "week": list = data.member_top_week_by_hours || []; break;
        case "month": list = data.member_top_month_by_hours || []; break;
        case "year": list = data.member_top_year_by_hours || []; break;
        case "all": list = data.member_top_all_by_hours || []; break;
      }
    } else {
      // 按消费排序（默认）
      switch (memberTab) {
        case "today": list = data.member_top_today || []; break;
        case "week": list = data.member_top_week || []; break;
        case "month": list = data.member_top || []; break;
        case "year": list = data.member_top_year || []; break;
        case "all": list = data.member_top_all || []; break;
      }
    }
    return list.slice(0, 20);
  };
  const memberTop = getMemberTop();

  const tabLabels: Record<TabKey, string> = {
    today: "今日", yesterday: "昨日", week: "本周", last_week: "上周", month: "本月", last_month: "上月", year: "今年", last_year: "去年", all: "总榜",
  };

  return (
    <>
      <Head><title>台球详情 - 翡翠城经营驾驶舱</title></Head>
      <main className="dashboardShell">
        {/* 顶栏 */}
        <div className="topBar">
          <div>
            <Link href="/" className="backLink">← 返回驾驶舱</Link>
            <h1>🎱 台球详情</h1>
            <Link href="/dashboard/customer?platform=billiards" className="backLink" style={{ marginLeft: 12 }}>👥 客户分析</Link>
          </div>
          <div className="topMeta">
            {lastUpdate && <span className="clock">{lastUpdate.toLocaleTimeString("zh-CN")}</span>}
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "手动刷新"}
            </button>
          </div>
        </div>

        {error && <div className="errorBanner">{error}</div>}

        {data && (
          <>
            {/* 当天总营收 — 参考影院风格 */}
            <div className="revenueHeader">
              <div className="revenueHeaderTop">
                <div className="revenueHeaderTitle">
                  当天总营收
                  <span className="revenueSub">实收金额</span>
                </div>
                <div className="revenueHeaderTotal">
                  <span className="currency">¥</span>
                  {businessSummary.revenue.toLocaleString()}
                </div>
              </div>
              <div className="revenueCards">
                {/* 实收金额 */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">实收金额</div>
                  <div className="revenueCardValue">¥{businessSummary.revenue.toLocaleString()}</div>
                  <div className="revenueCardMeta">
                    <span>月累计：<span className="metaValue">{fmtMoney(data.summary_month.revenue ?? 0)}</span></span>
                    <span>年累计：<span className="metaValue">{fmtMoney(data.summary_year.revenue ?? 0)}</span></span>
                    <span>完成率：<span className="metaValue">--</span></span>
                  </div>
                </div>
                {/* 自助售卖机（轻购云） */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">自助售卖机</div>
                  <div className="revenueCardValue">¥{(data.vending?.today_amount ?? 0).toLocaleString()}</div>
                  <div className="revenueCardMeta">
                    <span>月累计：<span className="metaValue">{fmtMoney(data.vending?.month_amount ?? 0)}</span></span>
                    <span>年累计：<span className="metaValue">{fmtMoney(data.vending?.year_amount ?? 0)}</span></span>
                    {data.vending?.month_margin && <span>毛利率：<span className="metaValue">{data.vending.month_margin}</span></span>}
                  </div>
                </div>
                {/* 开台数量 */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">开台数量</div>
                  <div className="revenueCardValue" style={{ color: (businessSummary.utilizationRate || 0) > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {data.busy_count ?? 0}<span style={{ fontSize: 16, color: 'var(--muted)' }}>/{data.total_count ?? 0}</span>
                  </div>
                  <div className="revenueCardMeta">
                    <span>使用中 / 总数</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 经营统计 — 参考小铁后台风格 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>📊 经营统计</h3>
                {dateRangeText && <span className="dateRange">{dateRangeText}</span>}
                <div className="chartControls">
                  {(["today", "yesterday", "week", "last_week", "month", "last_month", "year", "last_year"] as TabKey[]).map((k) => (
                    <button
                      key={k}
                      className={`chartControl ${tab === k ? "active" : ""}`}
                      onClick={() => setTab(k)}
                    >
                      {tabLabels[k]}
                    </button>
                  ))}
                </div>
              </div>
              {summary && (
                <div className="statsGrid">
                  {(summary as any).total_revenue != null && (
                    <div className="statCard">
                      <div className="statLabel">总营业额（元）</div>
                      <div className="statValue">¥{((summary as any).total_revenue ?? 0).toLocaleString()}</div>
                    </div>
                  )}
                  {(summary as any).platform_income != null && (
                    <div className="statCard">
                      <div className="statLabel">平台创收（元）</div>
                      <div className="statValue">¥{((summary as any).platform_income ?? 0).toLocaleString()}</div>
                    </div>
                  )}
                  <div className="statCard">
                    <div className="statLabel">实收金额（元）</div>
                    <div className="statValue">¥{(summary.revenue ?? 0).toLocaleString()}</div>
                  </div>
                  {(summary as any).order_count != null && (
                    <div className="statCard">
                      <div className="statLabel">订单数量（单）</div>
                      <div className="statValue">{(summary as any).order_count ?? 0}</div>
                    </div>
                  )}
                  {(summary as any).face_count != null && (
                    <div className="statCard">
                      <div className="statLabel">到店客流（人）</div>
                      <div className="statValue">{(summary as any).face_count ?? 0}</div>
                    </div>
                  )}
                </div>
              )}
              {/* 环比显示：根据Tab选择显示对应环比 */}
              {summary && (
                <div className="comparisonBar">
                  {tab === "today" && (
                    <>
                      <span>vs 昨日 {formatCompRange(data.comparison.yesterday)}：{(() => {
                        const d = calcChange(summary.revenue, data.comparison.yesterday.revenue);
                        return <span className={`change-${d.dir}`}>{d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.pct}</span>;
                      })()}</span>
                      <span>vs 上月同日 {formatCompRange(data.comparison.last_month_same_day)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_month_same_day.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "yesterday" && (
                    <>
                      <span>vs 前天 {formatCompRange(data.comparison.day_before)}：{(() => {
                        const d = calcChange(summary.revenue, data.comparison.day_before.revenue);
                        return <span className={`change-${d.dir}`}>{d.dir === "up" ? "↑" : d.dir === "down" ? "↓" : "→"} {d.pct}</span>;
                      })()}</span>
                      <span>vs 上月同天 {formatCompRange(data.comparison.last_month_same_day)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_month_same_day.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "week" && (
                    <>
                      <span>vs 上周同期 {formatCompRange(data.comparison.last_week)}：{(() => {
                        const w = calcChange(summary.revenue, data.comparison.last_week.revenue);
                        return <span className={`change-${w.dir}`}>{w.dir === "up" ? "↑" : w.dir === "down" ? "↓" : "→"} {w.pct}</span>;
                      })()}</span>
                      <span>vs 上月本周 {formatCompRange(data.comparison.last_month_week)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_month_week.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "last_week" && (
                    <>
                      <span>vs 上上周 {formatCompRange(data.comparison.week_before_last)}：{(() => {
                        const w = calcChange(summary.revenue, data.comparison.week_before_last.revenue);
                        return <span className={`change-${w.dir}`}>{w.dir === "up" ? "↑" : w.dir === "down" ? "↓" : "→"} {w.pct}</span>;
                      })()}</span>
                      <span>vs 上月同周 {formatCompRange(data.comparison.last_month_week)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_month_week.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "month" && (
                    <>
                      <span>vs 上月 {formatCompRange(data.comparison.last_month)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_month.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                      <span>vs 去年同月（1号至今）{formatCompRange(data.comparison.last_year_month)}：{(() => {
                        const y = calcChange(summary.revenue, data.comparison.last_year_month.revenue);
                        return <span className={`change-${y.dir}`}>{y.dir === "up" ? "↑" : y.dir === "down" ? "↓" : "→"} {y.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "last_month" && (
                    <>
                      <span>vs 上上月 {formatCompRange(data.comparison.last_last_month)}：{(() => {
                        const m = calcChange(summary.revenue, data.comparison.last_last_month.revenue);
                        return <span className={`change-${m.dir}`}>{m.dir === "up" ? "↑" : m.dir === "down" ? "↓" : "→"} {m.pct}</span>;
                      })()}</span>
                      <span>vs 去年同月 {formatCompRange(data.comparison.last_year_month_full)}：{(() => {
                        const y = calcChange(summary.revenue, data.comparison.last_year_month_full.revenue);
                        return <span className={`change-${y.dir}`}>{y.dir === "up" ? "↑" : y.dir === "down" ? "↓" : "→"} {y.pct}</span>;
                      })()}</span>
                    </>
                  )}
                  {tab === "year" && (
                    <span>vs 去年同期 {formatCompRange(data.comparison.last_year_to_today)}：{(() => {
                      const y = calcChange(summary.revenue, data.comparison.last_year_to_today.revenue);
                      return <span className={`change-${y.dir}`}>{y.dir === "up" ? "↑" : y.dir === "down" ? "↓" : "→"} {y.pct}</span>;
                    })()}</span>
                  )}
                  {tab === "last_year" && (
                    <span>vs 前年：{(() => {
                      const y = calcChange(summary.revenue, 0); // 暂无前年数据
                      return <span className="change-flat">--</span>;
                    })()}</span>
                  )}
                </div>
              )}
              {/* 球桌状态 */}
              <div className="tableStatus">
                <span>球桌状态：</span>
                <strong>{data.busy_count}/{data.total_count}</strong>
                <span>使用中/总数</span>
              </div>
            </div>

            {/* 球桌实时状态 */}
            <div className="panel detailSection">
              <h3>🪑 球桌实时状态</h3>
              <div className="tableGrid">
                {data.tables.map((t, i) => (
                  <div key={i} className={`tableCard ${t.open ? "table-busy" : "table-idle"}`}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{t.address || t.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{t.device_type}</div>
                    <div style={{ fontSize: 13, marginTop: 4, color: t.open ? "var(--red)" : "var(--green)" }}>
                      {t.open ? `使用中 ${t.used_time}min` : "空闲"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 每桌收入排行 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>🏆 每桌收入排行</h3>
                <div className="chartControls">
                  {(["today", "week", "month"] as TabKey[]).map((k) => (
                    <button
                      key={k}
                      className={`chartControl ${tableTab === k ? "active" : ""}`}
                      onClick={() => setTableTab(k)}
                    >
                      {tabLabels[k]}
                    </button>
                  ))}
                </div>
              </div>
              {tableRanking && tableRanking.length > 0 ? (
                <table className="rankingTable">
                  <thead>
                    <tr><th>#</th><th>桌号</th><th>类型</th><th>收入</th><th>订单</th><th>时长</th></tr>
                  </thead>
                  <tbody>
                    {tableRanking.map((t, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{t.address}</td>
                        <td>{t.type_name}</td>
                        <td>¥{t.revenue.toLocaleString()}</td>
                        <td>{t.order_count}</td>
                        <td>{Math.round(t.time_min / 60)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="emptyState">暂无数据</div>}
            </div>

            {/* 会员TOP（今日/7日/月/年/总切换） */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>👤 会员消费TOP20</h3>
                <div className="chartControls">
                  {(["today", "week", "month", "year", "all"] as TabKey[]).map((k) => (
                    <button
                      key={k}
                      className={`chartControl ${memberTab === k ? "active" : ""}`}
                      onClick={() => setMemberTab(k)}
                    >
                      {tabLabels[k]}
                    </button>
                  ))}
                  <span style={{ width: 1, height: 16, background: "rgba(122,166,184,0.2)", margin: "0 4px" }} />
                  <button
                    className={`chartControl ${memberSortBy === "payed" ? "active" : ""}`}
                    onClick={() => setMemberSortBy("payed")}
                  >按消费</button>
                  <button
                    className={`chartControl ${memberSortBy === "hours" ? "active" : ""}`}
                    onClick={() => setMemberSortBy("hours")}
                  >按时长</button>
                </div>
              </div>
              {memberTop.length > 0 ? (
                <table className="rankingTable">
                  <thead>
                    <tr><th>#</th><th>昵称</th><th>手机</th><th>消费</th><th>订单</th><th>使用时长</th><th>平均时长</th></tr>
                  </thead>
                  <tbody>
                    {memberTop.map((m, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{m.name}</td>
                        <td style={{ fontSize: 12, color: "var(--muted)" }}>{m.phone}</td>
                        <td>¥{m.total_payed.toLocaleString()}</td>
                        <td>{m.order_count}</td>
                        <td>{m.total_hours ?? (m.avg_duration / 60).toFixed(1)}h</td>
                        <td>{m.avg_duration}min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="emptyState">暂无数据</div>}
            </div>

            {/* VIP汇总 */}
            <div className="panel detailSection">
              <h3>💎 VIP汇总</h3>
              <div className="detailSummary">
                <div className="detailStat"><strong>{data.vip.vip_count}</strong>VIP数</div>
                <div className="detailStat"><strong>¥{data.vip.balance.toLocaleString()}</strong>余额</div>
                <div className="detailStat"><strong>¥{data.vip.total_payed.toLocaleString()}</strong>累计充值</div>
                <div className="detailStat"><strong>¥{data.vip.total_give.toLocaleString()}</strong>累计赠送</div>
              </div>
            </div>

            {/* 时段分布 */}
            <div className="panel detailSection">
              <h3>⏰ 订单时段分布（本月）</h3>
              <div className="hourlyChart">
                {data.hourly_distribution.map((h) => {
                  const maxOrders = Math.max(...data.hourly_distribution.map(x => x.orders), 1);
                  const pct = (h.orders / maxOrders) * 100;
                  return (
                    <div key={h.hour} className="hourlyBar">
                      <div className="hourlyBarFill" style={{ height: `${pct}%` }} />
                      <span className="hourlyLabel">{h.hour}</span>
                      <span className="hourlyValue">{h.orders}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 经营汇总 */}
            <div className="panel detailSection">
              <h3>📈 经营汇总（本月）</h3>
              <div className="detailSummary" style={{ flexWrap: "wrap" }}>
                <div className="detailStat"><strong>{data.operate_summary.face_count}</strong>到店</div>
                <div className="detailStat"><strong>{data.operate_summary.new_face_count}</strong>新客</div>
                <div className="detailStat"><strong>{data.operate_summary.member_count}</strong>会员</div>
                <div className="detailStat"><strong>{data.operate_summary.new_member_count}</strong>新会员</div>
                <div className="detailStat"><strong>¥{data.operate_summary.goods_revenue}</strong>商品收入</div>

              </div>
            </div>

            {/* 充值统计 */}
            {data.balance_stats.length > 0 && (
              <div className="panel detailSection">
                <h3>💰 充值统计（按月）</h3>
                <table className="rankingTable">
                  <thead>
                    <tr><th>月份</th><th>充值</th><th>实付</th><th>次数</th><th>消费</th><th>消费次数</th><th>余额</th></tr>
                  </thead>
                  <tbody>
                    {data.balance_stats.map((b, i) => (
                      <tr key={i}>
                        <td>{b.date}</td>
                        <td>¥{b.recharge.toLocaleString()}</td>
                        <td>¥{b.recharge_payed.toLocaleString()}</td>
                        <td>{b.recharge_count}</td>
                        <td>¥{b.consume.toLocaleString()}</td>
                        <td>{b.consume_count}</td>
                        <td>¥{b.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 用户评论 */}
            <div className="panel detailSection">
              <h3>💬 用户评论（{data.comments.length}条）</h3>
              {data.comments.length > 0 ? (
                <div className="commentList">
                  {data.comments.map((c, i) => (
                    <div key={i} className={`commentItem ${c.level === 1 ? "comment-bad" : ""}`}>
                      <div className="commentMeta">
                        <span>{c.user}</span>
                        {c.label && <span className="commentTag">{c.label}</span>}
                        <span>{c.level === 1 ? "差评" : c.level === 3 ? "好评" : ""}</span>
                        <time>{c.created || "无日期"}</time>
                      </div>
                      <div className="commentContent">{c.content}</div>
                    </div>
                  ))}
                </div>
              ) : <div className="emptyState">暂无评论</div>}
            </div>

            {/* 桌台异常 */}
            <div className="panel detailSection">
              <h3>⚠️ 桌台异常（{data.table_exceptions.length}条）</h3>
              {data.table_exceptions.length > 0 ? (
                <table className="rankingTable">
                  <thead><tr><th>桌台</th><th>类型</th><th>状态</th><th>时间</th><th>已解决</th></tr></thead>
                  <tbody>
                    {data.table_exceptions.map((e, i) => (
                      <tr key={i}>
                        <td>{e.table}</td>
                        <td>{e.type}</td>
                        <td>{e.status}</td>
                        <td>{e.created}</td>
                        <td>{e.resolved ? "✅" : "❌"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="emptyState">无异常 ✅</div>}
            </div>

            {/* 微信支付投诉 */}
            <div className="panel detailSection">
              <h3>🔔 微信支付投诉（{data.complaints.length}条）</h3>
              {data.complaints.length > 0 ? (
                <table className="rankingTable">
                  <thead><tr><th>订单号</th><th>原因</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
                  <tbody>
                    {data.complaints.map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{c.order_no}</td>
                        <td>{c.reason}</td>
                        <td>¥{c.amount}</td>
                        <td>{c.status}</td>
                        <td>{c.created}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="emptyState">无投诉 ✅</div>}
            </div>
          </>
        )}

        {!data && !error && !loading && <div className="emptyState">点击"手动刷新"加载数据</div>}
      </main>

      <style jsx>{`
        .backLink {
          display: inline-block;
          margin-bottom: 4px;
          color: var(--cyan);
          font-size: 13px;
          text-decoration: none;
        }
        .backLink:hover { text-decoration: underline; }
        .errorBanner {
          padding: 12px 16px;
          margin-bottom: 12px;
          background: rgba(255,107,107,0.15);
          border: 1px solid rgba(255,107,107,0.3);
          border-radius: 8px;
          color: #ffb3b3;
        }
        .rankingTable {
          width: 100%;
          border-collapse: collapse;
        }
        .rankingTable th, .rankingTable td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid rgba(122,166,184,0.12);
          font-size: 13px;
        }
        .rankingTable th {
          color: var(--muted);
          font-weight: 500;
          font-size: 12px;
        }
        .rankingTable tr:hover td {
          background: rgba(54,214,255,0.05);
        }
        /* 时段柱状图 */
        .hourlyChart {
          display: flex;
          align-items: flex-end;
          gap: 4px;
          height: 120px;
          padding-top: 8px;
        }
        .hourlyBar {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          position: relative;
          height: 100%;
          justify-content: flex-end;
        }
        .hourlyBarFill {
          width: 100%;
          max-width: 28px;
          background: linear-gradient(180deg, var(--cyan), rgba(54,214,255,0.3));
          border-radius: 3px 3px 0 0;
          min-height: 2px;
          transition: height 0.3s;
        }
        .hourlyLabel {
          font-size: 10px;
          color: var(--muted);
          margin-top: 4px;
        }
        .hourlyValue {
          font-size: 9px;
          color: var(--cyan);
          position: absolute;
          top: -2px;
        }
        /* 评论 */
        .commentList { display: grid; gap: 8px; }
        .commentItem {
          padding: 10px 12px;
          border: 1px solid rgba(122,166,184,0.16);
          border-radius: 8px;
          background: rgba(5,13,17,0.45);
        }
        .comment-bad {
          border-color: rgba(255,107,107,0.3);
          background: rgba(255,107,107,0.06);
        }
        .commentMeta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 6px;
          align-items: center;
        }
        .commentMeta time {
          margin-left: auto;
        }
        .commentTag {
          background: rgba(255,107,107,0.15);
          color: #ffb3b3;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        .commentContent {
          font-size: 14px;
          line-height: 1.5;
        }
        /* 统计卡片样式 - 参考小铁后台 */
        .statsGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .statCard {
          background: rgba(54, 214, 255, 0.05);
          border: 1px solid rgba(54, 214, 255, 0.15);
          border-radius: 8px;
          padding: 16px;
          text-align: center;
        }
        .statLabel {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .statValue {
          font-size: 24px;
          font-weight: 600;
          color: var(--cyan);
        }
        /* 环比条 */
        .comparisonBar {
          display: flex;
          justify-content: space-around;
          padding: 12px;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 12px;
        }
        .change-up {
          color: var(--green);
          font-weight: 500;
        }
        .change-down {
          color: var(--red);
          font-weight: 500;
        }
        .change-flat {
          color: var(--muted);
        }
        /* 球桌状态 */
        .tableStatus {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
          font-size: 14px;
        }
        .tableStatus strong {
          color: var(--cyan);
          font-size: 18px;
        }
      `}</style>
    </>
  );
}
