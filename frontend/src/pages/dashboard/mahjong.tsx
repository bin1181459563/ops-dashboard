import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { toMahjongSummary } from "../../lib/businessAdapters";
import { fetchWuLaobanFullDetail, runCollect } from "../../lib/dashboardApi";
import type { WuLaobanFullDetail, RevenueBreakdown } from "../../lib/dashboardApi";

// Tab类型定义
type SummaryTabKey = "today" | "yesterday" | "week" | "last_week" | "month" | "last_month" | "year";
type PeriodTabKey = "today" | "month" | "year";
type RankTabKey = "today" | "month" | "year";
type UserRankTabKey = "week_time" | "month_time" | "total_time";

// 过滤HTML标签（無老板用户名可能含VIP图标<img>标签）
function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").trim() || "未知";
}

// 环比计算
function calcChange(current: number, previous: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (previous === 0) return { pct: 0, dir: "flat" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { pct: 0, dir: "flat" };
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : "down" };
}

// 格式化金额：小于1万显示原值，大于等于1万显示x.xx万
function fmtMoney(v: number): string {
  if (v >= 10000) return (v / 10000).toFixed(2) + "万";
  return v.toLocaleString();
}

export default function MahjongPage() {
  const [data, setData] = useState<WuLaobanFullDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summaryTab, setSummaryTab] = useState<SummaryTabKey>("today");
  const [periodTab, setPeriodTab] = useState<PeriodTabKey>("today");
  const [rankTab, setRankTab] = useState<RankTabKey>("today");
  const [userRankTab, setUserRankTab] = useState<"week" | "month" | "total">("total");
  const [orderStatsTab, setOrderStatsTab] = useState<"today" | "week" | "month" | "year">("month");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await runCollect().catch(() => {});
      const result = await fetchWuLaobanFullDetail();
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

  // 获取当前Tab的汇总数据
  const getSummary = () => {
    if (!data) return null;
    switch (summaryTab) {
      case "today": return data.summary_today;
      case "yesterday": return data.comparison?.yesterday;
      case "week": return data.summary_week;
      case "last_week": return data.comparison?.last_week;
      case "month": return data.summary_month;
      case "last_month": return data.comparison?.last_month;
      case "year": return data.summary_year;
    }
  };

  // 获取环比数据
  const getComparison = () => {
    if (!data?.comparison) return [];
    const comps: Array<{ label: string; current: number; previous: number }> = [];

    switch (summaryTab) {
      case "today":
        if (data.comparison.yesterday) comps.push({ label: "vs 昨日", current: data.summary_today?.revenue || 0, previous: data.comparison.yesterday.revenue });
        if (data.comparison.last_year_month) comps.push({ label: "vs 上月同日", current: data.summary_today?.revenue || 0, previous: data.comparison.last_year_month.revenue });
        if (data.comparison.last_year_same_day) comps.push({ label: "vs 去年同日", current: data.summary_today?.revenue || 0, previous: data.comparison.last_year_same_day.revenue });
        break;
      case "yesterday":
        if (data.comparison.last_year_month) comps.push({ label: "vs 上月同天", current: data.comparison.yesterday?.revenue || 0, previous: data.comparison.last_year_month.revenue });
        break;
      case "week":
        if (data.comparison.last_week) comps.push({ label: "vs 上周同期", current: data.summary_week?.revenue || 0, previous: data.comparison.last_week.revenue });
        break;
      case "month":
        if (data.comparison.last_month) comps.push({ label: "vs 上月同期", current: data.summary_month?.revenue || 0, previous: data.comparison.last_month.revenue });
        if (data.comparison.last_year_month) comps.push({ label: "vs 去年本月", current: data.summary_month?.revenue || 0, previous: data.comparison.last_year_month.revenue });
        break;
      case "last_month":
        // 上月 vs 上上月（没有数据）
        break;
      case "year":
        if (data.comparison.last_year) comps.push({ label: "vs 去年同期", current: data.summary_year?.revenue || 0, previous: data.comparison.last_year.revenue });
        break;
    }
    return comps;
  };

  // 获取当前收入构成
  const revenueMap: Record<string, RevenueBreakdown> = {
    today: data?.revenue_today || { total: 0, wechat: 0, alipay: 0, meituan: 0, cash: 0, other: 0, member_card: 0, group_buy: 0 },
    month: data?.revenue_month || { total: 0, wechat: 0, alipay: 0, meituan: 0, cash: 0, other: 0, member_card: 0, group_buy: 0 },
    year: data?.revenue_year || { total: 0, wechat: 0, alipay: 0, meituan: 0, cash: 0, other: 0, member_card: 0, group_buy: 0 },
  };
  const currentRevenue = revenueMap[periodTab];

  // 获取当前包间排名
  const getRanking = () => {
    if (!data) return [];
    switch (rankTab) {
      case "today": return data.place_ranking_today || [];
      case "month": return data.place_ranking_month || [];
      case "year": return data.place_ranking_year || [];
    }
  };
  const currentRanking = getRanking();

  // Tab标签映射
  const summaryTabLabels: Record<SummaryTabKey, string> = {
    today: "今日", yesterday: "昨日", week: "本周", last_week: "上周", month: "本月", last_month: "上月", year: "本年",
  };

  const summary = getSummary();
  const comparisons = getComparison();
  const businessSummary = toMahjongSummary(data || {});

  return (
    <>
      <Head><title>🀄 棋牌详情 · 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/mahjong">
        {/* 顶栏 */}
        <div className="topBar">
          <div>
            <Link href="/" className="backLink">← 返回驾驶舱</Link>
            <h1>🀄 棋牌详情</h1>
            <div style={{ marginTop: 4 }}>
              <Link href="/dashboard/customer?platform=mahjong" className="backLink">👥 客户分析</Link>
            </div>
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
            {/* 当天总营收 */}
            <div className="revenueHeader">
              <div className="revenueHeaderTop">
                <div className="revenueHeaderTitle">
                  当天总营收
                  <span className="revenueSub">包间收入</span>
                </div>
                <div className="revenueHeaderTotal">
                  <span className="currency">¥</span>
                  {businessSummary.revenue.toLocaleString()}
                </div>
              </div>
              <div className="revenueCards">
                {/* 包间收入 */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">包间收入</div>
                  <div className="revenueCardValue">¥{businessSummary.revenue.toLocaleString()}</div>
                  <div className="revenueCardMeta">
                    <span>月累计：<span className="metaValue">{fmtMoney(data.summary_month?.revenue ?? 0)}</span></span>
                    <span>年累计：<span className="metaValue">{fmtMoney(data.summary_year?.revenue ?? 0)}</span></span>
                    <span>完成率：<span className="metaValue">--</span></span>
                  </div>
                </div>
                {/* 售卖机金额（暂时无数据，填0） */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">售卖机金额</div>
                  <div className="revenueCardValue">¥0</div>
                  <div className="revenueCardMeta">
                    <span>月累计：<span className="metaValue">0</span></span>
                    <span>年累计：<span className="metaValue">0</span></span>
                  </div>
                </div>
                {/* 在用包间 */}
                <div className="revenueCard">
                  <div className="revenueCardTitle">在用包间</div>
                  <div className="revenueCardValue" style={{ color: (businessSummary.utilizationRate || 0) > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    {data.active_orders ?? 0}<span style={{ fontSize: 16, color: 'var(--muted)' }}>/{data.total_rooms ?? 6}</span>
                  </div>
                  <div className="revenueCardMeta">
                    <span>使用中 / 总数</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 经营统计 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>📊 经营统计</h3>
                <div className="chartControls">
                  {(Object.keys(summaryTabLabels) as SummaryTabKey[]).map((k) => (
                    <button
                      key={k}
                      className={`chartControl ${summaryTab === k ? "active" : ""}`}
                      onClick={() => setSummaryTab(k)}
                    >
                      {summaryTabLabels[k]}
                    </button>
                  ))}
                </div>
              </div>
              {summary && (
                <>
                  <div className="statsGrid">
                    <div className="statItem">
                      <span>总收入（元）</span>
                      <strong>¥{summary.revenue?.toLocaleString() || 0}</strong>
                    </div>
                    <div className="statItem">
                      <span>订单数量（单）</span>
                      <strong>{summary.order_count || 0}</strong>
                    </div>
                    {summary.user_count != null && (
                      <div className="statItem">
                        <span>用户数</span>
                        <strong>{summary.user_count}</strong>
                      </div>
                    )}
                    {summary.new_user_count != null && (
                      <div className="statItem">
                        <span>新客数</span>
                        <strong>{summary.new_user_count}</strong>
                      </div>
                    )}
                  </div>
                  {comparisons.length > 0 && (
                    <div className="comparisonBar">
                      {comparisons.map((c, i) => {
                        const change = calcChange(c.current, c.previous);
                        return (
                          <div key={i} className="comparisonItem">
                            <span>{c.label}：</span>
                            <span className={`change-${change.dir}`}>
                              {change.dir === "up" ? "↑" : change.dir === "down" ? "↓" : "→"} {change.pct.toFixed(0)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 包间实时状态 */}
            <div className="panel detailSection">
              <h3>🏠 包间实时状态</h3>
              <div className="roomGrid">
                {data.rooms.map((r, i) => (
                  <div key={i} className={`roomCard ${r.status === "使用中" ? "room-busy" : "room-idle"}`}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{r.type}</div>
                    {r.status === "使用中" ? (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 13, color: "var(--red)" }}>使用中</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{stripHtml(r.user)}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>剩余 {r.remaining_min}min</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, marginTop: 6, color: "var(--green)" }}>空闲</div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      今日 {r.today_orders}单 · ¥{r.today_revenue}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 收入构成 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>💰 收入构成</h3>
                <div className="chartControls">
                  {(["today", "month", "year"] as const).map(p => (
                    <button key={p} className={`chartControl ${periodTab === p ? "active" : ""}`}
                      onClick={() => setPeriodTab(p)}>
                      {p === "today" ? "今日" : p === "month" ? "本月" : "本年"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="revenueBreakdown">
                <div className="revenueTotal">
                  <span>总计</span>
                  <strong>¥{currentRevenue.total.toLocaleString()}</strong>
                </div>
                <div className="revenueItems">
                  {[
                    { label: "微信", value: currentRevenue.wechat, color: "#7de58a" },
                    { label: "支付宝", value: currentRevenue.alipay, color: "#36d6ff" },
                    { label: "美团", value: currentRevenue.meituan, color: "#f6c667" },
                    { label: "会员卡", value: currentRevenue.member_card, color: "#c084fc" },
                    { label: "团购", value: currentRevenue.group_buy, color: "#fb923c" },
                    { label: "现金", value: currentRevenue.cash, color: "#94a3b8" },
                    { label: "其他", value: currentRevenue.other, color: "#77828a" },
                  ].filter(x => x.value > 0).map((x, i) => (
                    <div key={i} className="revenueItem">
                      <div className="revenueItemBar">
                        <div className="revenueItemFill" style={{
                          width: `${currentRevenue.total ? (x.value / currentRevenue.total) * 100 : 0}%`,
                          background: x.color,
                        }} />
                      </div>
                      <span className="revenueItemLabel">{x.label}</span>
                      <span className="revenueItemValue">¥{x.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 各包间收入排名 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>🏆 各包间收入排名</h3>
                <div className="chartControls">
                  <button className={`chartControl ${rankTab === "today" ? "active" : ""}`} onClick={() => setRankTab("today")}>今日</button>
                  <button className={`chartControl ${rankTab === "month" ? "active" : ""}`} onClick={() => setRankTab("month")}>本月</button>
                  <button className={`chartControl ${rankTab === "year" ? "active" : ""}`} onClick={() => setRankTab("year")}>本年</button>
                </div>
              </div>
              {currentRanking && currentRanking.length > 0 ? (
                <table className="rankingTable">
                  <thead><tr><th>#</th><th>包间</th><th>类型</th><th>收入</th><th>订单</th></tr></thead>
                  <tbody>
                    {currentRanking.map((r, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.name}</td>
                        <td>{r.type}</td>
                        <td>¥{r.revenue.toLocaleString()}</td>
                        <td>{r.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="emptyState">暂无数据</div>}
            </div>

            {/* 用户排行榜 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>👥 用户使用时长排行榜</h3>
                <div className="chartControls">
                  <button className={`chartControl ${userRankTab === "week" ? "active" : ""}`} onClick={() => setUserRankTab("week")}>本周</button>
                  <button className={`chartControl ${userRankTab === "month" ? "active" : ""}`} onClick={() => setUserRankTab("month")}>本月</button>
                  <button className={`chartControl ${userRankTab === "total" ? "active" : ""}`} onClick={() => setUserRankTab("total")}>总榜</button>
                </div>
              </div>
              {(() => {
                const rankingData = userRankTab === "week" ? data.user_ranking_week : userRankTab === "month" ? data.user_ranking_month : data.user_ranking_total;
                return rankingData && rankingData.length > 0 ? (
                  <table className="rankingTable">
                    <thead><tr><th>#</th><th>用户</th><th>使用时长</th><th>到店次数</th></tr></thead>
                    <tbody>
                      {rankingData.map((u, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{stripHtml(u.name)}</td>
                          <td>{u.total_time}</td>
                          <td>{u.check_num || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="emptyState">暂无数据</div>;
              })()}
            </div>

            {/* 储值卡订单 */}
            {data.deposit_card_orders && data.deposit_card_orders.length > 0 && (
              <div className="panel detailSection">
                <h3>💳 储值卡订单（{data.deposit_card_orders.length}笔）</h3>
                <table className="rankingTable">
                  <thead><tr><th>时间</th><th>用户</th><th>金额</th></tr></thead>
                  <tbody>
                    {data.deposit_card_orders.map((o, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{o.time}</td>
                        <td>{stripHtml(o.user)}</td>
                        <td>¥{o.price.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 充值订单 */}
            {data.deposit_orders && data.deposit_orders.length > 0 && (
              <div className="panel detailSection">
                <h3>💰 充值订单（{data.deposit_orders.length}笔）</h3>
                <table className="rankingTable">
                  <thead><tr><th>时间</th><th>用户</th><th>套餐</th><th>支付金额</th><th>状态</th></tr></thead>
                  <tbody>
                    {data.deposit_orders.map((o, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: 12 }}>{o.time}</td>
                        <td>{stripHtml(o.user)}</td>
                        <td>{o.package}</td>
                        <td>¥{o.pay_price.toLocaleString()}</td>
                        <td>{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 优惠券列表 */}
            {data.coupons && data.coupons.length > 0 && (
              <div className="panel detailSection">
                <h3>🎫 优惠券列表（{data.coupons.length}种）</h3>
                <table className="rankingTable">
                  <thead><tr><th>名称</th><th>价格</th><th>VIP价</th><th>原价</th><th>销量</th><th>类型</th></tr></thead>
                  <tbody>
                    {data.coupons.map((c, i) => (
                      <tr key={i}>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                        <td>¥{c.price}</td>
                        <td>¥{c.vip_price}</td>
                        <td>¥{c.origin_price}</td>
                        <td>{c.sale_num}</td>
                        <td style={{ fontSize: 11 }}>{c.type_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 订单统计详情 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>📋 订单统计详情</h3>
                <div className="chartControls">
                  <button className={`chartControl ${orderStatsTab === "today" ? "active" : ""}`} onClick={() => setOrderStatsTab("today")}>今日</button>
                  <button className={`chartControl ${orderStatsTab === "week" ? "active" : ""}`} onClick={() => setOrderStatsTab("week")}>本周</button>
                  <button className={`chartControl ${orderStatsTab === "month" ? "active" : ""}`} onClick={() => setOrderStatsTab("month")}>本月</button>
                  <button className={`chartControl ${orderStatsTab === "year" ? "active" : ""}`} onClick={() => setOrderStatsTab("year")}>本年</button>
                </div>
              </div>
              {(() => {
                const stats = data.order_stats?.[orderStatsTab];
                if (!stats) return <div className="emptyState">暂无数据</div>;
                return (
                  <div className="orderStatsGrid">
                    <div className="orderStatItem">
                      <span>总订单</span>
                      <strong>{stats.order_count || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>总用户</span>
                      <strong>{stats.user_count || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>新客</span>
                      <strong>{stats.new_user_count || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>复购人数</span>
                      <strong>{stats.rebuy_count || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>首单人数</span>
                      <strong>{stats.first_count || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>首单均价</span>
                      <strong>¥{stats.first_price_avg?.toLocaleString() || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>复购均价</span>
                      <strong>¥{stats.rebuy_price_avg?.toLocaleString() || 0}</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>首单平均时长</span>
                      <strong>{stats.first_time_avg || 0}min</strong>
                    </div>
                    <div className="orderStatItem">
                      <span>复购平均时长</span>
                      <strong>{stats.rebuy_time_avg || 0}min</strong>
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {!data && !error && !loading && <div className="emptyState">点击"手动刷新"加载数据</div>}
      </AppShell>

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
        .roomGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 10px;
        }
        .roomCard {
          padding: 14px;
          border-radius: 10px;
          text-align: center;
          border: 1px solid var(--line);
          transition: transform 0.15s;
        }
        .roomCard:hover { transform: translateY(-2px); }
        .room-busy {
          background: rgba(255,107,107,0.1);
          border-color: rgba(255,107,107,0.3);
        }
        .room-idle {
          background: rgba(125,229,138,0.06);
          border-color: rgba(125,229,138,0.2);
        }
        .panelHeader {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .statsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }
        .statItem {
          padding: 12px;
          background: rgba(122,166,184,0.06);
          border-radius: 8px;
          text-align: center;
        }
        .statItem span {
          display: block;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .statItem strong {
          font-size: 20px;
          color: var(--text);
        }
        .comparisonBar {
          display: flex;
          gap: 16px;
          padding: 8px 12px;
          background: rgba(122,166,184,0.06);
          border-radius: 6px;
          font-size: 13px;
        }
        .comparisonItem {
          display: flex;
          gap: 4px;
        }
        .change-up { color: var(--green); }
        .change-down { color: var(--red); }
        .change-flat { color: var(--muted); }
        .revenueBreakdown { }
        .revenueTotal {
          display: flex;
          align-items: baseline;
          gap: 8px;
          margin-bottom: 16px;
        }
        .revenueTotal span { color: var(--muted); font-size: 14px; }
        .revenueTotal strong { font-size: 28px; color: var(--text); }
        .revenueItems { display: grid; gap: 8px; }
        .revenueItem {
          display: grid;
          grid-template-columns: 1fr 60px 80px;
          align-items: center;
          gap: 8px;
        }
        .revenueItemBar {
          height: 8px;
          background: rgba(122,166,184,0.12);
          border-radius: 4px;
          overflow: hidden;
        }
        .revenueItemFill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s;
        }
        .revenueItemLabel {
          font-size: 12px;
          color: var(--muted);
          text-align: right;
        }
        .revenueItemValue {
          font-size: 13px;
          text-align: right;
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
        .orderStatsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 12px;
        }
        .orderStatItem {
          padding: 12px;
          background: rgba(122,166,184,0.06);
          border-radius: 8px;
          text-align: center;
        }
        .orderStatItem span {
          display: block;
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .orderStatItem strong {
          font-size: 18px;
          color: var(--text);
        }
      `}</style>
    </>
  );
}
