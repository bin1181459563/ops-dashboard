import Head from "next/head";
import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
import {
  fetchInventoryOverview,
  importFinanceBatch,
} from "../../lib/dashboardApi";
import type { FinanceImportResult, InventoryOverview, MovementItem } from "../../lib/dashboardApi";

export default function InventoryPage() {
  const [data, setData] = useState<InventoryOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadResult, setUploadResult] = useState<FinanceImportResult | null>(null);
  const [tab, setTab] = useState<"stock" | "movement" | "loss">("stock");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchInventoryOverview();
      setData(result);
    } catch (e: any) {
      setError(e?.message || "获取库存数据失败");
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

  const inv = data?.inventory;
  const mov = data?.movement;
  const invS = inv?.summary;
  const movS = mov?.summary;

  return (
    <>
      <Head><title>库存与损耗 - 翡翠城经营驾驶舱</title></Head>
      <main className="dashboardShell">
        <div className="topBar">
          <div>
            <Link href="/dashboard/cinema" className="backLink">← 返回影院</Link>
            <span className="eyebrow">凤凰云智 · 进销存 + 实时库存</span>
            <h1>📦 库存与损耗</h1>
            {mov?.date_range && <span className="clock">{mov.date_range}</span>}
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
            <h2>未导入库存数据</h2>
            <p>请上传凤凰云智"实时库存"或"进销存汇总"报表（支持同时上传多张）。</p>
          </div>
        )}

        {data?.status === "ok" && (
          <>
            {/* 指标卡 */}
            <section className="metricGrid">
              {invS && (
                <>
                  <Metric label="库存成本" value={currency(invS.total_stock_cost)} caption={`${invS.item_count} 个SKU`} tone="gold" />
                  <Metric label="库存数量" value={`${invS.total_stock_qty}`} caption="件" tone="cyan" />
                  <Metric label="POS价值" value={currency(invS.total_pos_value)} caption={`潜在利润率 ${invS.potential_margin}%`} tone="green" />
                </>
              )}
              {movS && (
                <>
                  <Metric label="损耗金额" value={currency(movS.loss_amount)} caption="本期累计" tone="red" />
                  <Metric label="盘盈亏" value={currency(movS.inventory_profit_amount)} caption={movS.inventory_profit_amount >= 0 ? "盘盈" : "盘亏"} tone={movS.inventory_profit_amount >= 0 ? "green" : "red"} />
                  <Metric label="期末库存" value={currency(movS.closing_amount)} caption={`进货 ${currency(movS.purchase_amount)}`} tone="muted" />
                </>
              )}
            </section>

            {/* Tab切换 */}
            <section className="panel detailSection">
              <div className="panelHeader">
                <h3>📊 数据视图</h3>
                <div className="chartControls">
                  {([["stock", "库存分布"], ["movement", "进销存"], ["loss", "损耗分析"]] as const).map(([k, label]) => (
                    <button key={k} className={`chartControl ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 库存分布 */}
            {tab === "stock" && inv && (
              <>
                <section className="panel">
                  <div className="panelHeader">
                    <h3>库存分类分布</h3>
                    <span className="panelHint">按库存成本排序</span>
                  </div>
                  <div className="concessionCategoryGrid">
                    {inv.categories.map((cat) => {
                      const pct = invS ? ((cat.stock_cost / invS.total_stock_cost) * 100).toFixed(1) : "0";
                      return (
                        <div key={cat.category} className="concessionCategoryCard">
                          <div className="concessionCategoryHeader">
                            <strong>{cat.category}</strong>
                            <span className="concessionCategoryPct">{pct}%</span>
                          </div>
                          <div className="concessionCategoryValue">{currency(cat.stock_cost)}</div>
                          <div className="concessionCategoryMeta">
                            {cat.stock_qty} 件 · {cat.items} 个SKU
                          </div>
                          <div className="concessionCategoryBar">
                            <span style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <InventoryTable items={inv.items} />
              </>
            )}

            {/* 进销存 */}
            {tab === "movement" && mov && (
              <>
                {movS && (
                  <section className="panel">
                    <div className="panelHeader">
                      <h3>进销存流水</h3>
                      <span className="panelHint">{mov.date_range}</span>
                    </div>
                    <div className="statsGrid">
                      <div className="statCard">
                        <span>期初库存</span>
                        <strong>{currency(movS.opening_amount)}</strong>
                      </div>
                      <div className="statCard">
                        <span>本期进货</span>
                        <strong>{currency(movS.purchase_amount)}</strong>
                      </div>
                      <div className="statCard">
                        <span>本期退货</span>
                        <strong>{currency(movS.return_amount)}</strong>
                      </div>
                      <div className="statCard">
                        <span>本期损耗</span>
                        <strong style={{ color: movS.loss_amount > 0 ? "var(--red, #ef4444)" : undefined }}>{currency(movS.loss_amount)}</strong>
                      </div>
                      <div className="statCard">
                        <span>盘盈亏</span>
                        <strong style={{ color: movS.inventory_profit_amount >= 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)" }}>
                          {currency(movS.inventory_profit_amount)}
                        </strong>
                      </div>
                      <div className="statCard">
                        <span>期末库存</span>
                        <strong>{currency(movS.closing_amount)}</strong>
                      </div>
                    </div>
                  </section>
                )}

                {/* 进销存分类汇总 */}
                {mov.categories.length > 0 && (
                  <section className="panel">
                    <div className="panelHeader">
                      <h3>分类进销存</h3>
                      <span className="panelHint">按损耗排序</span>
                    </div>
                    <table className="rankingTable">
                      <thead>
                        <tr>
                          <th>大类</th>
                          <th>期初</th>
                          <th>进货</th>
                          <th>退货</th>
                          <th>损耗</th>
                          <th>期末</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mov.categories.map((cat) => (
                          <tr key={cat.category}>
                            <td><strong>{cat.category}</strong></td>
                            <td>{currency(cat.opening)}</td>
                            <td>{currency(cat.purchase)}</td>
                            <td>{currency(cat.return)}</td>
                            <td style={{ color: cat.loss > 0 ? "var(--red, #ef4444)" : undefined }}>{currency(cat.loss)}</td>
                            <td>{currency(cat.closing)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}
              </>
            )}

            {/* 损耗分析 */}
            {tab === "loss" && mov && (
              <>
                <section className="panel">
                  <div className="panelHeader">
                    <h3>损耗TOP10</h3>
                    <span className="panelHint">按损耗金额排序</span>
                  </div>
                  {mov.loss_items.length ? (
                    <table className="rankingTable">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>商品</th>
                          <th>大类</th>
                          <th>损耗数量</th>
                          <th>损耗金额</th>
                          <th>损耗差异比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mov.loss_items.map((item, i) => (
                          <tr key={`${item.item_code}-${i}`}>
                            <td>{i + 1}</td>
                            <td><strong>{item.item_name}</strong></td>
                            <td>{item.category}</td>
                            <td>{item.loss_qty}</td>
                            <td style={{ color: "var(--red, #ef4444)" }}>{currency(item.loss_amount)}</td>
                            <td>{item.loss_diff_pct.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="emptyState">本期无损耗记录 🎉</div>
                  )}
                </section>

                {/* 全部商品损耗明细 */}
                <MovementDetailTable items={mov.items} />
              </>
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

function InventoryTable({ items }: { items: NonNullable<InventoryOverview["inventory"]>["items"] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<"stock_cost" | "stock_quantity" | "pos_price">("stock_cost");
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
        <h3>库存明细</h3>
        <input
          className="filmSearchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索商品名称或分类..."
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="rankingTable">
          <thead>
            <tr>
              <th>商品名称</th>
              <th>分类</th>
              <th className="sortable" onClick={() => toggleSort("stock_quantity")}>
                库存 {sortKey === "stock_quantity" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th className="sortable" onClick={() => toggleSort("stock_cost")}>
                库存成本 {sortKey === "stock_cost" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th className="sortable" onClick={() => toggleSort("pos_price")}>
                POS零售价 {sortKey === "pos_price" ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </th>
              <th>库存金额</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={`${item.item_code}-${i}`}>
                <td><strong>{item.item_name}</strong></td>
                <td>{item.category}</td>
                <td>{item.stock_quantity}</td>
                <td>{currency(item.stock_cost)}</td>
                <td>{currency(item.pos_price)}</td>
                <td>{currency(item.stock_cost * item.stock_quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panelHint" style={{ padding: "8px 0" }}>共 {filtered.length} 项</div>
    </section>
  );
}

function MovementDetailTable({ items }: { items: MovementItem[] }) {
  const [query, setQuery] = useState("");

  const filtered = items
    .filter((item) => !query || item.item_name.toLowerCase().includes(query.toLowerCase()) || item.category?.toLowerCase().includes(query.toLowerCase()))
    .filter((item) => item.loss_qty !== 0 || item.opening_qty > 0 || item.purchase_qty > 0)
    .sort((a, b) => b.loss_amount - a.loss_amount);

  return (
    <section className="panel">
      <div className="panelHeader">
        <h3>进销存明细</h3>
        <input
          className="filmSearchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索商品名称..."
        />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="rankingTable">
          <thead>
            <tr>
              <th>商品</th>
              <th>大类</th>
              <th>期初</th>
              <th>进货</th>
              <th>退货</th>
              <th>损耗</th>
              <th>盘盈亏</th>
              <th>期末</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 50).map((item, i) => (
              <tr key={`${item.item_code}-${i}`}>
                <td><strong>{item.item_name}</strong></td>
                <td>{item.category}</td>
                <td>{item.opening_qty}</td>
                <td>{item.purchase_qty}</td>
                <td>{item.return_qty}</td>
                <td style={{ color: item.loss_qty !== 0 ? "var(--red, #ef4444)" : undefined }}>
                  {item.loss_qty !== 0 ? `${Math.abs(item.loss_qty)} (${currency(item.loss_amount)})` : "0"}
                </td>
                <td style={{ color: item.inventory_profit_qty !== 0 ? (item.inventory_profit_qty > 0 ? "var(--green, #10b981)" : "var(--red, #ef4444)") : undefined }}>
                  {item.inventory_profit_qty !== 0 ? `${item.inventory_profit_qty} (${currency(item.inventory_profit_amount)})` : "0"}
                </td>
                <td>{item.closing_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panelHint" style={{ padding: "8px 0" }}>共 {filtered.length} 项（仅显示有进出变动的商品）</div>
    </section>
  );
}

function currency(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
