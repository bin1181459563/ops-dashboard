import Head from "next/head";
import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import {
  fetchProfitOverview,
  importFinanceBatch,
} from "../../lib/dashboardApi";
import type { FinanceImportResult, ProfitOverview, ProfitItem } from "../../lib/dashboardApi";

export default function ProfitPage() {
  const [data, setData] = useState<ProfitOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadResult, setUploadResult] = useState<FinanceImportResult | null>(null);
  const [tab, setTab] = useState<"overview" | "items">("overview");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchProfitOverview();
      setData(result);
    } catch (e: any) {
      setError(e?.message || "获取利润数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    setUploadResult(null);
    try {
      const result = await importFinanceBatch(files);
      setUploadResult(result);
      await refresh();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === "object" && "results" in detail) {
        setUploadResult(detail);
        setError(detail.message || "导入失败");
      } else {
        setError(detail || e?.message || "导入失败");
      }
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const s = data?.summary;

  return (
    <>
      <Head><title>利润毛利 - 翡翠城经营驾驶舱</title></Head>
      <main className="dashboardShell">
        <div className="topBar">
          <div>
            <Link href="/dashboard/cinema" className="backLink">← 返回影院</Link>
            <span className="eyebrow">凤凰云智 · 利润毛利报表</span>
            <h1>💰 利润毛利分析</h1>
            {data?.date_range && <span className="clock">{data.date_range}</span>}
          </div>
          <div className="topMeta">
            <label className={`uploadButton ${uploading ? "uploadButton-disabled" : ""}`}>
              {uploading ? "解析中..." : "导入报表"}
              <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleFile} disabled={uploading} style={{ display: "none" }} />
            </label>
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>

        {error && <div className="errorBanner">{error}</div>}
        {uploadResult && (
          <div className={`importResult ${uploadResult.status === "partial" ? "importResult-warning" : ""}`}>
            <strong>{uploadResult.message}</strong>
            <span>成功 {uploadResult.success_count} · 失败 {uploadResult.failed_count}</span>
          </div>
        )}

        {data?.status === "not_imported" && (
          <div className="panel cinemaEmpty">
            <h2>未导入利润数据</h2>
            <p>请点击右上角"导入报表"上传凤凰云智利润毛利报表（xlsx）。</p>
          </div>
        )}

        {data?.status === "ok" && s && (
          <>
            {/* 指标卡 */}
            <section className="metricGrid">
              <Metric label="销售总额" value={currency(s.total_revenue)} caption={`${s.item_count} 个商品`} tone="gold" />
              <Metric label="总成本" value={currency(s.total_cost)} caption="销售成本" tone="muted" />
              <Metric label="总利润" value={currency(s.total_profit)} caption={`利润率 ${s.overall_margin}%`} tone={s.total_profit >= 0 ? "green" : "red"} />
              <Metric label="利润率" value={`${s.overall_margin}%`} caption={s.overall_margin >= 20 ? "健康" : s.overall_margin >= 10 ? "一般" : "偏低"} tone={s.overall_margin >= 20 ? "green" : s.overall_margin >= 10 ? "cyan" : "red"} />
            </section>

            {/* Tab切换 */}
            <section className="panel detailSection">
              <div className="panelHeader">
                <h3>📊 数据视图</h3>
                <div className="chartControls">
                  {([["overview", "分类概览"], ["items", "商品明细"]] as const).map(([k, label]) => (
                    <button key={k} className={`chartControl ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {tab === "overview" && (
              <>
                {/* 按商品类型 */}
                {data.product_types && data.product_types.length > 0 && (
                  <section className="panel">
                    <div className="panelHeader">
                      <h3>商品类型利润</h3>
                      <span className="panelHint">单品 / 合成品 / 套餐</span>
                    </div>
                    <div className="concessionCategoryGrid">
                      {data.product_types.map((pt) => (
                        <div key={pt.product_type} className="concessionCategoryCard">
                          <div className="concessionCategoryHeader">
                            <strong>{pt.product_type}</strong>
                            <span className="concessionCategoryPct">{pt.margin}%</span>
                          </div>
                          <div className="concessionCategoryValue">{currency(pt.profit)}</div>
                          <div className="concessionCategoryMeta">
                            销售 {currency(pt.revenue)} · 成本 {currency(pt.cost)}
                          </div>
                          <div className="concessionCategoryBar">
                            <span style={{ width: `${Math.min(100, Math.abs(pt.margin))}%`, background: pt.margin >= 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 按大类 */}
                {data.categories && data.categories.length > 0 && (
                  <section className="panel">
                    <div className="panelHeader">
                      <h3>大类利润分布</h3>
                      <span className="panelHint">按收入排序</span>
                    </div>
                    <table className="rankingTable">
                      <thead>
                        <tr>
                          <th>大类</th>
                          <th>销售额</th>
                          <th>成本</th>
                          <th>利润</th>
                          <th>利润率</th>
                          <th>SKU数</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.categories.map((cat) => (
                          <tr key={cat.category}>
                            <td><strong>{cat.category}</strong></td>
                            <td>{currency(cat.revenue)}</td>
                            <td>{currency(cat.cost)}</td>
                            <td style={{ color: cat.profit >= 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)" }}>
                              {currency(cat.profit)}
                            </td>
                            <td>{cat.margin}%</td>
                            <td>{cat.items}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {/* TOP10 利润 */}
                <section className="mainGrid">
                  <ProfitTable title="利润TOP10" items={data.top_profit_items || []} valueKey="profit_amount" />
                  <ProfitTable title="亏损TOP10" items={data.bottom_items || []} valueKey="profit_amount" />
                </section>
              </>
            )}

            {tab === "items" && (
              <AllItemsTable items={[
                ...(data.top_profit_items || []),
                ...(data.bottom_items || []),
              ]} />
            )}
          </>
        )}
      </main>
    </>
  );
}

/* ── 子组件 ── */

function Metric({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: string }) {
  return (
    <article className={`metricCard tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{caption}</em>
    </article>
  );
}

function ProfitTable({ title, items, valueKey }: { title: string; items: ProfitItem[]; valueKey: "profit_amount" }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <h3>{title}</h3>
        <span className="panelHint">利润金额</span>
      </div>
      {items.length ? (
        <table className="rankingTable">
          <thead>
            <tr><th>#</th><th>商品</th><th>类型</th><th>大类</th><th>利润</th><th>利润率</th></tr>
          </thead>
          <tbody>
            {items.slice(0, 10).map((item, i) => (
              <tr key={`${item.item_code}-${i}`}>
                <td>{i + 1}</td>
                <td>{item.item_name}</td>
                <td>{item.product_type}</td>
                <td>{item.category}</td>
                <td style={{ color: item[valueKey] >= 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)" }}>
                  {currency(item[valueKey])}
                </td>
                <td>{(item.profit_rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="emptyState">暂无数据</div>}
    </div>
  );
}

function AllItemsTable({ items }: { items: ProfitItem[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"profit_amount" | "net_amount" | "profit_rate">("profit_amount");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const filtered = items
    .filter((item) => !query || item.item_name.toLowerCase().includes(query.toLowerCase()) || item.category?.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey] || 0;
      const bv = b[sortKey] || 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <section className="panel">
      <div className="panelHeader">
        <h3>全部商品明细</h3>
        <input
          className="filmSearchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索商品名称或大类..."
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="rankingTable">
          <thead>
            <tr>
              <th>商品名称</th>
              <th>类型</th>
              <th>大类</th>
              <th className="sortable" onClick={() => toggleSort("net_amount")}>
                销售额 {sortKey === "net_amount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th>成本</th>
              <th className="sortable" onClick={() => toggleSort("profit_amount")}>
                利润 {sortKey === "profit_amount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th className="sortable" onClick={() => toggleSort("profit_rate")}>
                利润率 {sortKey === "profit_rate" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th>数量</th>
              <th>均价</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={`${item.item_code}-${i}`}>
                <td><strong>{item.item_name}</strong></td>
                <td>{item.product_type}</td>
                <td>{item.category}</td>
                <td>{currency(item.net_amount)}</td>
                <td>{currency(item.cost_amount)}</td>
                <td style={{ color: item.profit_amount >= 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)" }}>
                  {currency(item.profit_amount)}
                </td>
                <td>{(item.profit_rate * 100).toFixed(1)}%</td>
                <td>{item.net_quantity}</td>
                <td>{currency(item.avg_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panelHint" style={{ padding: "8px 0" }}>共 {filtered.length} 项</div>
    </section>
  );
}

function currency(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
