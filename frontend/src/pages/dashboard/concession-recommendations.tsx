import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchConcessionRecommendations } from "../../lib/dashboardApi";
import type { ConcessionRecommendationsData, ConcessionHotItem } from "../../lib/dashboardApi";

type TabKey = "hot" | "cold" | "combos" | "pricing";

const TAB_LABELS: Record<TabKey, string> = {
  hot: "🔥 热销品",
  cold: "❄️ 冷门品",
  combos: "🎁 组合推荐",
  pricing: "💰 定价建议",
};

export default function ConcessionRecommendationsPage() {
  const [data, setData] = useState<ConcessionRecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("hot");
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchConcessionRecommendations();
      setData(result);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取卖品推荐失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  const categoryBreakdown = data?.category_breakdown ?? [];
  const hotCombinations = data?.hot_combinations ?? [];
  const combos = data?.combos ?? [];
  const pricingSuggestions = data?.pricing_suggestions ?? [];
  const suggestions = data?.suggestions ?? [];

  return (
    <>
      <Head><title>🍿 卖品推荐 - 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/concession-recommendations">
        <div className="topBar">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <Link href="/dashboard/concession" className="backLink" style={{ marginLeft: 12 }}>🍿 卖品详情</Link>
            <h1>🍿 卖品推荐</h1>
            <span className="eyebrow">热销分析 · 冷门预警 · 组合推荐 · 定价优化</span>
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
            title="正在加载卖品推荐"
            description="推荐分析需要读取卖品数据，请稍候。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {error && (
          <DashboardStatePanel
            state="error"
            title="卖品推荐加载失败"
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
              <Metric label="品类数" value={`${data.category_breakdown?.length || 0}`} tone="cyan" />
              <Metric label="热销组合" value={`${data.hot_combinations?.length || 0}`} tone="gold" />
              <Metric label="建议数" value={`${suggestions.length}`} tone="green" />
              <Metric label="置信度" value={`${((data.confidence || 0) * 100).toFixed(0)}%`} tone="muted" />
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
            </section>

            {/* 品类分布 */}
            {tab === "hot" && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>📊 品类分布</h3>
                  <span className="panelHint">按销售额排序</span>
                </div>
                <table className="rankingTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>品类</th>
                      <th>销量</th>
                      <th>收入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map((item, i) => (
                      <tr key={`${item.category}-${i}`}>
                        <td>{i + 1}</td>
                        <td><strong>{item.category}</strong></td>
                        <td>{item.count}</td>
                        <td>{currency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {categoryBreakdown.length === 0 && <div className="emptyState">暂无品类数据</div>}
              </section>
            )}

            {/* 热销组合 */}
            {tab === "cold" && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>🔗 热销组合</h3>
                  <span className="panelHint">经常一起购买的商品组合</span>
                </div>
                <table className="rankingTable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>组合</th>
                      <th>次数</th>
                      <th>总收入</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hotCombinations.map((item, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td><strong>{item.items?.join(" + ")}</strong></td>
                        <td>{item.count}</td>
                        <td>{currency(item.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {hotCombinations.length === 0 && <div className="emptyState">暂无热销组合</div>}
              </section>
            )}

            {/* 组合推荐 */}
            {tab === "combos" && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>🎁 AI套餐组合推荐</h3>
                  <span className="panelHint">基于消费数据的智能搭配</span>
                </div>
                <div className="comboGrid">
                  {combos.map((combo, i) => (
                    <div key={`${combo.name}-${i}`} className={`comboCard ${selectedItem === combo.name ? "comboCard-active" : ""}`}
                      onClick={() => setSelectedItem(selectedItem === combo.name ? null : combo.name)}>
                      <div className="comboName">{combo.name}</div>
                      <div className="comboItems">{combo.items.join(" + ")}</div>
                      <div className="comboPrice">{currency(combo.price)}</div>
                      <div className="comboExpected">
                        预期收入 {currency(combo.expected_revenue)}
                      </div>
                      {selectedItem === combo.name && (
                        <div className="comboReason">{combo.reason}</div>
                      )}
                    </div>
                  ))}
                </div>
                {combos.length === 0 && <div className="emptyState">暂无组合推荐</div>}
              </section>
            )}

            {/* 定价建议 */}
            {tab === "pricing" && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>💰 定价优化建议</h3>
                  <span className="panelHint">AI 分析后的价格调整建议</span>
                </div>
                <table className="rankingTable">
                  <thead>
                    <tr>
                      <th>商品</th>
                      <th>当前价格</th>
                      <th>建议价格</th>
                      <th>调整</th>
                      <th>原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingSuggestions.map((p, i) => {
                      const diff = p.suggested_price - p.current_price;
                      const diffPct = p.current_price > 0 ? ((diff / p.current_price) * 100).toFixed(1) : "0";
                      return (
                        <tr key={`${p.item}-${i}`}>
                          <td><strong>{p.item}</strong></td>
                          <td>{currency(p.current_price)}</td>
                          <td>{currency(p.suggested_price)}</td>
                          <td>
                            <span className={diff > 0 ? "price-up" : diff < 0 ? "price-down" : "price-same"}>
                              {diff > 0 ? "+" : ""}{diffPct}%
                            </span>
                          </td>
                          <td className="reasonCell">{p.reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {pricingSuggestions.length === 0 && <div className="emptyState">暂无定价建议</div>}
              </section>
            )}
          </>
        ) : !loading && !error ? (
          <DashboardStatePanel
            state="empty"
            title="暂无卖品推荐数据"
            description="当前没有可展示的推荐结果。"
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
        .tabPanel {
          margin-bottom: 16px;
        }
        .trend-up {
          color: #22c55e;
          font-weight: 600;
        }
        .trend-down {
          color: #ef4444;
          font-weight: 600;
        }
        .trend-stable {
          color: var(--muted);
        }
        .comboGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .comboCard {
          padding: 16px;
          background: rgba(167, 139, 250, 0.04);
          border: 1px solid rgba(167, 139, 250, 0.12);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .comboCard:hover {
          background: rgba(167, 139, 250, 0.08);
        }
        .comboCard-active {
          border-color: rgba(167, 139, 250, 0.35);
          background: rgba(167, 139, 250, 0.1);
        }
        .comboName {
          font-size: 15px;
          font-weight: 700;
          color: rgba(255,255,255,0.9);
          margin-bottom: 6px;
        }
        .comboItems {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 8px;
        }
        .comboPrice {
          font-size: 20px;
          font-weight: 700;
          color: var(--cyan);
          margin-bottom: 4px;
        }
        .comboExpected {
          font-size: 12px;
          color: #a78bfa;
        }
        .comboReason {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid rgba(167, 139, 250, 0.15);
          font-size: 13px;
          color: rgba(255,255,255,0.75);
          line-height: 1.6;
        }
        .price-up {
          color: #22c55e;
          font-weight: 600;
        }
        .price-down {
          color: #ef4444;
          font-weight: 600;
        }
        .price-same {
          color: var(--muted);
        }
        .reasonCell {
          max-width: 300px;
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          line-height: 1.5;
        }
      `}</style>
    </>
  );
}

/* 热销/冷门共用行组件 */
function HotColdRow({ item, rank }: { item: ConcessionHotItem; rank: number }) {
  const trendLabel = item.trend === "up" ? `↑${item.trend_pct}%` : item.trend === "down" ? `↓${item.trend_pct}%` : "→";
  const trendClass = `trend-${item.trend}`;
  return (
    <tr>
      <td>{rank}</td>
      <td><strong>{item.item_name}</strong></td>
      <td>{item.category}</td>
      <td>{item.quantity}</td>
      <td>{currency(item.revenue)}</td>
      <td><span className={trendClass}>{trendLabel}</span></td>
    </tr>
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
