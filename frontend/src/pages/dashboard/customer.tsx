import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchCustomerRfm, fetchRepurchase, fetchConsumptionTrend } from "../../lib/dashboardApi";
import type { RfmData, RepurchaseData, ConsumptionTrendData } from "../../lib/dashboardApi";

type TabKey = "rfm" | "repurchase" | "trend";

/* 平台配置 */
const PLATFORM_CONFIG: Record<string, {
  label: string;
  icon: string;
  backHref: string;
  backLabel: string;
  hasRepurchase: boolean;
  hasTrend: boolean;
  eyebrow: string;
}> = {
  mahjong: {
    label: "棋牌",
    icon: "🀄",
    backHref: "/dashboard/mahjong",
    backLabel: "← 棋牌详情",
    hasRepurchase: true,
    hasTrend: true,
    eyebrow: "RFM 模型 · 复购率 · 消费变化",
  },
  billiards: {
    label: "台球",
    icon: "🎱",
    backHref: "/dashboard/billiards",
    backLabel: "← 台球详情",
    hasRepurchase: false,
    hasTrend: false,
    eyebrow: "RFM 模型 · 会员消费分层",
  },
};

const TIER_COLORS: Record<string, string> = {
  "高价值": "#f0b940",
  "活跃": "#36d6ff",
  "普通": "#7aa6b8",
  "沉睡": "#f97316",
  "流失风险": "#ef4444",
  "新客": "#a78bfa",
};

const TIER_ICONS: Record<string, string> = {
  "高价值": "🏆",
  "活跃": "✅",
  "普通": "👤",
  "沉睡": "😴",
  "流失风险": "🔴",
  "新客": "🆕",
};

export default function CustomerPage() {
  const router = useRouter();
  const platform = (router.query.platform as string) || "mahjong";
  const config = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.mahjong;

  const [tab, setTab] = useState<TabKey>("rfm");
  const [rfm, setRfm] = useState<RfmData | null>(null);
  const [repurchase, setRepurchase] = useState<RepurchaseData | null>(null);
  const [trend, setTrend] = useState<ConsumptionTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "rfm") {
        const data = await fetchCustomerRfm(platform, 90);
        setRfm(data);
      } else if (tab === "repurchase") {
        const data = await fetchRepurchase(6);
        setRepurchase(data);
      } else {
        const data = await fetchConsumptionTrend();
        setTrend(data);
      }
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取数据失败"));
    } finally {
      setLoading(false);
    }
  }, [tab, platform]);

  useEffect(() => { refresh(); }, [tab, platform]);

  /* 可用的 tabs */
  const availableTabs: [TabKey, string][] = [["rfm", "📊 RFM 分层"]];
  if (config.hasRepurchase) availableTabs.push(["repurchase", "🔄 复购率"]);
  if (config.hasTrend) availableTabs.push(["trend", "📈 消费变化"]);
  const currentTabData = tab === "rfm" ? rfm : tab === "repurchase" ? repurchase : trend;

  return (
    <>
      <Head><title>{config.icon} {config.label}客户分析 - 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/customer">
        <div className="topBar">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <Link href={config.backHref} className="backLink" style={{ marginLeft: 12 }}>{config.backLabel}</Link>
            <h1>{config.icon} {config.label}客户分析</h1>
            <span className="eyebrow">{config.eyebrow}</span>
          </div>
          <div className="topMeta">
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>

        {/* Tab 切换 */}
        {availableTabs.length > 1 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="chartControls">
              {availableTabs.map(([k, label]) => (
                <button key={k} className={`chartControl ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && !error && !currentTabData && (
          <DashboardStatePanel
            state="loading"
            title="正在加载客户分析"
            description="客户相关接口响应可能较慢，页面会在数据回来后自动展示。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {error && (
          <DashboardStatePanel
            state="error"
            title="客户分析加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {/* RFM 分层 */}
        {tab === "rfm" && rfm && rfm.status === "ok" && (
          <>
            {/* 概览 */}
            <section className="metricGrid">
              <Metric label="总客户数" value={`${rfm.total_users}`} tone="cyan" />
              {rfm.total_orders ? <Metric label="总订单数" value={`${rfm.total_orders}`} tone="gold" /> : null}
              {rfm.total_revenue ? <Metric label="总消费额" value={currency(rfm.total_revenue)} tone="green" /> : null}
              {rfm.period_days ? <Metric label="分析周期" value={`${rfm.period_days}天`} tone="muted" /> : null}
            </section>

            {/* 分层卡片 */}
            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="panelHeader">
                <h3>客户分层分布</h3>
                <span className="panelHint">
                  {platform === "billiards" ? "基于 F(订单数) × M(金额)" : "基于 R(最近消费) × F(频率) × M(金额)"}
                </span>
              </div>
              <div className="tierGrid">
                {Object.entries(rfm.tier_stats).sort((a, b) => b[1].total_amount - a[1].total_amount).map(([tier, stats]) => (
                  <div key={tier} className="tierCard" style={{ borderColor: TIER_COLORS[tier] || "#7aa6b8" }}>
                    <div className="tierHeader">
                      <span className="tierIcon">{TIER_ICONS[tier] || "👤"}</span>
                      <strong>{tier}</strong>
                    </div>
                    <div className="tierCount">{stats.count} 人</div>
                    <div className="tierAmount">{currency(stats.total_amount)}</div>
                    <div className="tierMeta">平均 {stats.avg_frequency} 单</div>
                  </div>
                ))}
              </div>
            </section>

            {/* TOP 用户表 */}
            <section className="panel">
              <div className="panelHeader">
                <h3>消费排行 TOP50</h3>
                <span className="panelHint">按累计消费降序</span>
              </div>
              <table className="rankingTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>用户</th>
                    <th>分层</th>
                    <th>累计消费</th>
                    <th>订单数</th>
                    {platform !== "billiards" && <th>最近消费</th>}
                    {platform !== "billiards" && <th>距今</th>}
                  </tr>
                </thead>
                <tbody>
                  {rfm.top_users.map((u, i) => (
                    <tr key={u.name}>
                      <td>{i + 1}</td>
                      <td>{stripHtml(u.name)}</td>
                      <td><span style={{ color: TIER_COLORS[u.tier] || "#7aa6b8" }}>{TIER_ICONS[u.tier]} {u.tier}</span></td>
                      <td>{currency(u.monetary)}</td>
                      <td>{u.frequency}</td>
                      {platform !== "billiards" && <td>{u.last_date || "-"}</td>}
                      {platform !== "billiards" && <td>{u.recency != null ? `${u.recency}天` : "-"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {/* 复购率（仅棋牌） */}
        {tab === "repurchase" && repurchase && repurchase.status === "ok" && (
          <section className="panel">
            <div className="panelHeader">
              <h3>新客 → 复购转化率</h3>
              <span className="panelHint">按首次消费月份分组，计算次月复购率</span>
            </div>
            <table className="rankingTable">
              <thead>
                <tr><th>月份</th><th>新客数</th><th>次月复购</th><th>复购率</th></tr>
              </thead>
              <tbody>
                {repurchase.cohorts.map((c) => (
                  <tr key={c.month}>
                    <td>{c.month}</td>
                    <td>{c.new_users}</td>
                    <td>{c.repurchased}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div className="pctBar">
                          <span style={{ width: `${Math.min(c.repurchase_rate, 100)}%`, background: c.repurchase_rate >= 30 ? "#36d6ff" : c.repurchase_rate >= 15 ? "#f0b940" : "#ef4444" }} />
                        </div>
                        <span>{c.repurchase_rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 消费变化（仅棋牌） */}
        {tab === "trend" && trend && trend.status === "ok" && (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <div className="panelHeader">
                <h3>本月 vs 上月 消费变化</h3>
                <span className="panelHint">{trend.this_month} vs {trend.last_month}</span>
              </div>
              <div className="tierGrid">
                {Object.entries(trend.trend_summary).map(([k, v]) => (
                  <div key={k} className="tierCard" style={{ borderColor: k === "增长" ? "#22c55e" : k === "流失" ? "#ef4444" : k === "新增" ? "#a78bfa" : "#7aa6b8" }}>
                    <div className="tierCount">{v} 人</div>
                    <div className="tierMeta">{k}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panelHeader">
                <h3>用户消费变化明细</h3>
                <span className="panelHint">共 {trend.total_compared} 人</span>
              </div>
              <table className="rankingTable">
                <thead>
                  <tr><th>#</th><th>用户</th><th>趋势</th><th>本月</th><th>上月</th><th>变化</th><th>本月单数</th><th>上月单数</th></tr>
                </thead>
                <tbody>
                  {trend.details.slice(0, 50).map((u, i) => (
                    <tr key={u.name}>
                      <td>{i + 1}</td>
                      <td>{stripHtml(u.name)}</td>
                      <td><span style={{ color: u.trend === "增长" ? "#22c55e" : u.trend === "流失" ? "#ef4444" : u.trend === "新增" ? "#a78bfa" : "#7aa6b8" }}>{u.trend}</span></td>
                      <td>{currency(u.this_month)}</td>
                      <td>{currency(u.last_month)}</td>
                      <td style={{ color: u.change_pct > 0 ? "#22c55e" : u.change_pct < 0 ? "#ef4444" : "#7aa6b8" }}>{u.change_pct > 0 ? "+" : ""}{u.change_pct}%</td>
                      <td>{u.this_orders}</td>
                      <td>{u.last_orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {!loading && !error && (!currentTabData || currentTabData.status !== "ok") && (
          <DashboardStatePanel
            state="empty"
            title="暂无客户分析数据"
            description="当前没有可展示的客户分析结果。"
            compact
          />
        )}
      </AppShell>

      <style jsx>{`
        .tierGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .tierCard {
          padding: 16px;
          background: rgba(54, 214, 255, 0.03);
          border: 1px solid rgba(54, 214, 255, 0.15);
          border-left: 3px solid;
          border-radius: 8px;
        }
        .tierHeader {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 8px;
        }
        .tierIcon { font-size: 18px; }
        .tierCount {
          font-size: 24px;
          font-weight: 700;
          color: var(--text);
        }
        .tierAmount {
          font-size: 14px;
          color: var(--cyan);
          margin-top: 4px;
        }
        .tierMeta {
          font-size: 12px;
          color: var(--muted);
          margin-top: 4px;
        }
        .pctBar {
          width: 80px;
          height: 6px;
          background: rgba(255,255,255,0.08);
          border-radius: 3px;
          overflow: hidden;
        }
        .pctBar span {
          display: block;
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s;
        }
        .errorBanner {
          padding: 12px 16px;
          margin-bottom: 12px;
          background: rgba(255,107,107,0.15);
          border: 1px solid rgba(255,107,107,0.3);
          border-radius: 8px;
          color: #ffb3b3;
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

function stripHtml(html: string): string {
  return (html || "").replace(/<[^>]*>/g, "").trim() || "未知";
}
