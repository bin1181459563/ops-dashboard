import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchCustomerWakeUp } from "../../lib/dashboardApi";
import type { CustomerWakeUpData, WakeUpCustomer } from "../../lib/dashboardApi";

type CustomerCategory = "vip" | "normal" | "dormant" | "new" | "low";

const TAB_LABELS: Record<string, string> = {
  all: "全部客户",
  vip: "优质客户",
  normal: "正常客户",
  dormant: "沉睡客户",
  low: "低频客户",
  new: "新客",
};

type TabKey = keyof typeof TAB_LABELS;

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <article className={`metricCard tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function CustomerWakeUpPage() {
  const [data, setData] = useState<CustomerWakeUpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const json = await fetchCustomerWakeUp();
      setData(json);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取客户数据失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const currency = (v: number) => `¥${(v || 0).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // 根据tab和平台筛选客户
  const getFilteredCustomers = () => {
    if (!data) return [];
    let list: WakeUpCustomer[] = [];
    switch (tab) {
      case "vip": list = data.vip_customers; break;
      case "normal": list = data.normal_customers; break;
      case "dormant": list = data.dormant_customers; break;
      case "low": list = data.all_customers.filter(c => c.category === "low"); break;
      case "new": list = data.all_customers.filter(c => c.category === "new"); break;
      default: list = data.all_customers; break;
    }
    if (filterPlatform !== "all") {
      list = list.filter(c => c.platform_key === filterPlatform);
    }
    return list;
  };

  const filtered = getFilteredCustomers();

  return (
    <>
      <Head>
        <title>客户分析 - 翡翠城经营驾驶舱</title>
      </Head>
      <main className="dashboardShell">
        <div className="pageHeader">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <h1>👥 客户分析</h1>
            <p className="pageDesc">优质客户识别 · 正常客户维护 · 沉睡客户唤醒</p>
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
            title="正在加载客户唤醒数据"
            description="客户唤醒接口可能需要更久的时间，数据回来前会保留清晰状态。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {error && (
          <DashboardStatePanel
            state="error"
            title="客户唤醒加载失败"
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
              <Metric label="总客户数" value={`${data.summary.total_customers}`} tone="cyan" />
              <Metric label="优质客户" value={`${data.summary.vip_count}人`} tone="gold" />
              <Metric label="正常客户" value={`${data.summary.normal_count}人`} tone="green" />
              <Metric label="沉睡客户" value={`${data.summary.dormant_count}人`} tone="red" />
            </section>

            {/* Tab 切换 */}
            <section className="panel tabPanel">
              <div className="chartControls">
                {(Object.entries(TAB_LABELS) as [TabKey, string][]).map(([k, label]) => (
                  <button key={k} className={`chartControl ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="filterActions" style={{ marginTop: 8 }}>
                <button className={`chartControl ${filterPlatform === "all" ? "active" : ""}`} onClick={() => setFilterPlatform("all")}>全部</button>
                <button className={`chartControl ${filterPlatform === "billiards" ? "active" : ""}`} onClick={() => setFilterPlatform("billiards")}>台球</button>
                <button className={`chartControl ${filterPlatform === "mahjong" ? "active" : ""}`} onClick={() => setFilterPlatform("mahjong")}>棋牌</button>
              </div>
            </section>

            {/* 客户列表 */}
            <section className="panel">
              <div className="panelHeader">
                <h3>{TAB_LABELS[tab]}</h3>
                <span className="panelHint">共 {filtered.length} 人</span>
              </div>
              <table className="rankingTable">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>客户名</th>
                    <th>来源</th>
                    <th>累计消费</th>
                    <th>订单数</th>
                    <th>消费时长</th>
                    <th>最后消费</th>
                    <th>类型</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr key={`${c.name}-${i}`}>
                      <td>{i + 1}</td>
                      <td><strong>{c.name}</strong></td>
                      <td>
                        <span className={`platformTag platform-${c.platform_key}`}>
                          {c.platform}
                        </span>
                      </td>
                      <td>{currency(c.total_amount)}</td>
                      <td>{c.order_count}</td>
                      <td>{c.order_hours ? `${c.order_hours}小时` : "-"}</td>
                      <td>{c.last_consume_date || "-"}</td>
                      <td>
                        <span className={`categoryTag category-${c.category}`}>
                          {c.category_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="emptyState">暂无客户数据</div>}
            </section>
          </>
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无客户唤醒数据"
            description="当前没有可展示的客户记录。"
            compact
          />
        ) : null}

        <style jsx>{`
          .dashboardShell {
            max-width: 1200px;
            margin: 0 auto;
            padding: 24px;
            color: var(--text, #e5e7eb);
          }
          .pageHeader {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
          }
          .backLink {
            color: var(--cyan, #22d3ee);
            text-decoration: none;
            font-size: 14px;
          }
          .pageDesc {
            color: var(--muted, #9ca3af);
            margin-top: 4px;
          }
          .topMeta {
            display: flex;
            gap: 8px;
          }
          .refreshButton {
            padding: 8px 16px;
            background: rgba(54, 214, 255, 0.1);
            border: 1px solid rgba(54, 214, 255, 0.2);
            border-radius: 6px;
            color: var(--cyan, #22d3ee);
            cursor: pointer;
          }
          .refreshButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .errorBanner {
            padding: 12px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 8px;
            color: #ef4444;
            margin-bottom: 16px;
          }
          .metricGrid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .metricCard {
            padding: 16px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
          }
          .metricCard span {
            display: block;
            font-size: 13px;
            color: var(--muted, #9ca3af);
            margin-bottom: 4px;
          }
          .metricCard strong {
            font-size: 24px;
            font-weight: 700;
          }
          .tone-cyan strong { color: #22d3ee; }
          .tone-gold strong { color: #fbbf24; }
          .tone-green strong { color: #34d399; }
          .tone-red strong { color: #f87171; }
          .panel {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .panelHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .panelHeader h3 {
            margin: 0;
            font-size: 16px;
          }
          .panelHint {
            color: var(--muted, #9ca3af);
            font-size: 13px;
          }
          .chartControls {
            display: flex;
            gap: 8px;
          }
          .chartControl {
            padding: 6px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: var(--text, #e5e7eb);
            cursor: pointer;
            font-size: 13px;
          }
          .chartControl.active {
            background: rgba(54, 214, 255, 0.15);
            border-color: rgba(54, 214, 255, 0.3);
            color: var(--cyan, #22d3ee);
          }
          .rankingTable {
            width: 100%;
            border-collapse: collapse;
          }
          .rankingTable th,
          .rankingTable td {
            padding: 10px 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          .rankingTable th {
            font-size: 12px;
            color: var(--muted, #9ca3af);
            font-weight: 600;
          }
          .platformTag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .platform-billiards {
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
          }
          .platform-mahjong {
            background: rgba(168, 85, 247, 0.15);
            color: #c084fc;
          }
          .categoryTag {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }
          .category-vip {
            background: rgba(251, 191, 36, 0.15);
            color: #fbbf24;
          }
          .category-normal {
            background: rgba(52, 211, 153, 0.15);
            color: #34d399;
          }
          .category-dormant {
            background: rgba(239, 68, 68, 0.15);
            color: #f87171;
          }
          .category-new {
            background: rgba(156, 163, 175, 0.15);
            color: #9ca3af;
          }
          .category-low {
            background: rgba(251, 146, 60, 0.15);
            color: #fb923c;
          }
          .emptyState {
            text-align: center;
            padding: 24px;
            color: var(--muted, #9ca3af);
          }
          .filterActions {
            display: flex;
            gap: 8px;
          }
        `}</style>
      </main>
    </>
  );
}
