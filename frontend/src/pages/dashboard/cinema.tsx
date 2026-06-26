import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CinemaTrendChart } from "../../components/dashboard/CinemaTrendChart";
import { getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { toCinemaSummary } from "../../lib/businessAdapters";
import { fetchCinemaDetail, fetchCinemaOverview, fetchConcessionDetail, importCinemaBatch } from "../../lib/dashboardApi";
import type { CinemaBatchImportResult, CinemaDetail, CinemaImportResult, ConcessionDetail } from "../../lib/dashboardApi";
import type { CinemaOverview } from "../../types/dashboard";

export default function CinemaPage() {
  const [overview, setOverview] = useState<CinemaOverview | null>(null);
  const [detail, setDetail] = useState<CinemaDetail | null>(null);
  const [concession, setConcession] = useState<ConcessionDetail | null>(null);
  const [dateMode, setDateMode] = useState<"today" | "yesterday" | "day_before" | "week" | "month" | "custom">("yesterday");
  const [customDate, setCustomDate] = useState(() => offsetDate(-1));
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CinemaBatchImportResult | null>(null);
  const [filmQuery, setFilmQuery] = useState("");
  const [filmDateMode, setFilmDateMode] = useState<"day" | "month" | "year">("day");
  const [filmDate, setFilmDate] = useState(() => offsetDate(-1));
  const [filmRankingData, setFilmRankingData] = useState<{ box: CinemaDetail["film_box_office_ranking"]; att: CinemaDetail["film_attendance_ranking"] }>({ box: [], att: [] });
  const [filmLoading, setFilmLoading] = useState(false);
  const [error, setError] = useState("");

  /* 本月天数 */
  const monthDays = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }, []);

  /* 范围模式（本周/本月）不传date，让后端默认从最新快照往前取 */
  const isRange = dateMode === "week" || dateMode === "month";

  /* 计算自然周/月的起始日期 */
  const startDate = useMemo(() => {
    const now = new Date();
    if (dateMode === "week") {
      // 自然周：周一到今天
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
      const y = monday.getFullYear();
      const m = String(monday.getMonth() + 1).padStart(2, "0");
      const d = String(monday.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    if (dateMode === "month") {
      // 自然月：1号到今天
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    return undefined;
  }, [dateMode]);

  const selectedDate = useMemo(() => {
    if (isRange) return undefined;
    if (dateMode === "today") return offsetDate(0);
    if (dateMode === "yesterday") return offsetDate(-1);
    if (dateMode === "day_before") return offsetDate(-2);
    if (dateMode === "custom") return customDate;
    return offsetDate(-1);
  }, [dateMode, customDate, isRange]);

  const selectedDays = dateMode === "month" ? monthDays : dateMode === "week" ? 7 : 1;

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const [overviewData, detailData, concessionData] = await Promise.all([
        fetchCinemaOverview(selectedDate, selectedDays, startDate),
        fetchCinemaDetail(selectedDate, selectedDays, startDate),
        fetchConcessionDetail(selectedDate, selectedDays),
      ]);
      setOverview(overviewData);
      setDetail(detailData);
      setConcession(concessionData);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "获取影院数据失败"));
    } finally {
      setLoading(false);
    }
  }, [loading, selectedDate, selectedDays, startDate]);

  useEffect(() => { refresh(); }, [selectedDate, selectedDays]);

  /* 影片排行独立查询 */
  const refreshFilmRanking = useCallback(async () => {
    setFilmLoading(true);
    try {
      const filmDays = filmDateMode === "year" ? 365 : filmDateMode === "month" ? new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() : 1;
      const filmStart = filmDateMode === "year"
        ? `${new Date().getFullYear()}-01-01`
        : filmDateMode === "month"
          ? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
          : undefined;
      const d = await fetchCinemaDetail(filmDateMode === "day" ? filmDate : undefined, filmDays, filmStart);
      setFilmRankingData({ box: d.film_box_office_ranking || [], att: d.film_attendance_ranking || [] });
    } catch {
      setFilmRankingData({ box: [], att: [] });
    } finally {
      setFilmLoading(false);
    }
  }, [filmDateMode, filmDate]);

  useEffect(() => { refreshFilmRanking(); }, [filmDateMode, filmDate]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError("");
    setUploadResult(null);
    try {
      const result = await importCinemaBatch(files);
      setUploadResult(result);
      await refresh();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      if (detail && typeof detail === "object" && "results" in detail) {
        setUploadResult(detail);
        setError(detail.message || "批量导入失败");
      } else {
        setError(getDashboardErrorMessage(detail || e, "导入失败"));
      }
      await refresh();
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const today = detail?.today;
  const recentImports = detail?.recent_imports || [];
  const uploadSuccesses = uploadResult?.results.filter(isSuccessfulImport) || [];
  const uploadFailures = uploadResult?.results.filter((item) => item.status === "failed") || [];
  const missingFields = uploadResult
    ? unique(uploadSuccesses.flatMap((item) => item.missing_fields))
    : detail?.missing_fields || [];
  const cinemaSummary = toCinemaSummary(detail || overview || {});

  /* 标题文本 */
  const headerTitle = isRange
    ? (dateMode === "week" ? "本周复盘" : "本月复盘")
    : (selectedDate || "营业日期");

  return (
    <>
      <Head><title>🎬 影院详情 · 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/cinema">
        <div className="topBar">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <span className="eyebrow">凤凰云智 Excel</span>
            <h1>影院接入</h1>
            <div className="cinemaNav">
              <Link href="/dashboard/concession" className="navLink">🍿 卖品详情</Link>
              <Link href="/dashboard/employee" className="navLink" style={{ marginLeft: 12 }}>👥 员工绩效</Link>
              <Link href="/dashboard/profit" className="navLink" style={{ marginLeft: 12 }}>💰 利润毛利</Link>
              <Link href="/dashboard/inventory" className="navLink" style={{ marginLeft: 12 }}>📦 库存损耗</Link>
              <Link href="/dashboard/member" className="navLink" style={{ marginLeft: 12 }}>👤 会员分析</Link>
            </div>
          </div>
          <div className="topMeta">
            {overview?.last_import_time && <span className="clock">最后导入 {formatDateTime(overview.last_import_time)}</span>}
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "刷新中..." : "刷新"}
            </button>
          </div>
        </div>

        <section className="panel cinemaFilterPanel">
          <div>
            <span className="eyebrow">营业日期</span>
            <h2>{headerTitle}</h2>
          </div>
          <div className="cinemaDateControls">
            {[
              ["yesterday", "昨日"],
              ["day_before", "前天"],
              ["today", "今日"],
              ["week", "本周"],
              ["month", "本月"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`chartControl ${dateMode === key ? "active" : ""}`}
                onClick={() => setDateMode(key as typeof dateMode)}
              >
                {label}
              </button>
            ))}
            <input
              className="dateInput"
              type="date"
              value={customDate}
              onChange={(event) => {
                setCustomDate(event.target.value);
                setDateMode("custom");
              }}
            />
          </div>
        </section>

        <section className="cinemaStatusGrid">
          <div className="panel cinemaStatusPanel">
            <div className="panelHeader">
              <div>
                <span className="eyebrow">数据源</span>
                <h2>凤凰云智 Excel</h2>
              </div>
              <span className={`importStatus statusBadge-${overview?.status || "not_imported"}`}>
                {statusLabel(overview?.status)}
              </span>
            </div>
            <div className="statusMetaGrid">
              <div><span>最后导入</span><strong>{overview?.last_import_time ? formatDateTime(overview.last_import_time) : "暂无"}</strong></div>
              <div><span>业务日期</span><strong>{overview?.date || selectedDate || "未导入"}</strong></div>
              <div><span>状态说明</span><strong>{overview?.message || "请先上传凤凰云智 Excel 报表"}</strong></div>
            </div>
          </div>

          <div className="panel uploadPanel">
            <div className="panelHeader">
              <div>
                <span className="eyebrow">导入报表</span>
                <h2>上传经营报表</h2>
              </div>
              <label className={`uploadButton ${uploading ? "uploadButton-disabled" : ""}`}>
                {uploading ? "解析中..." : "选择文件"}
                <input type="file" accept=".xlsx,.xls,.csv" multiple onChange={handleFile} disabled={uploading} />
              </label>
            </div>
            <p className="uploadHint">支持 xlsx / xls / csv，可一次选择多张报表。系统会自动按营运综合、影片排名、卖品明细、会员明细的顺序导入。</p>
            {error && <div className="errorBanner">{error}</div>}
            {uploadResult && (
              <div className={`importResult ${uploadResult.status === "partial" ? "importResult-warning" : ""} ${uploadResult.status === "failed" ? "importResult-error" : ""}`}>
                <strong>{uploadResult.message}</strong>
                <span>成功 {uploadResult.success_count} 个 · 失败 {uploadResult.failed_count} 个</span>
                {uploadSuccesses.length > 0 && (
                  <div className="batchImportList">
                    {uploadSuccesses.map((item) => (
                      <span key={`${item.file_name}-${item.report_type}`}>
                        {item.file_name} · {reportTypeLabel(item.report_type)} · {item.imported_dates.join("、")}
                      </span>
                    ))}
                  </div>
                )}
                {uploadFailures.length > 0 && (
                  <div className="batchImportList batchImportErrors">
                    {uploadFailures.map((item) => (
                      <span key={item.file_name}>
                        {item.file_name} · {item.error || item.message}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {missingFields.length > 0 && (
              <div className="missingFields">
                <span>当前上传文件缺失字段</span>
                <strong>{missingFields.join("、")}</strong>
                {missingFields.some((field) => field.includes("影片")) && (
                  <em>影片排行数据请继续上传"影片成绩排名表"，系统会合并到同一营业日，不覆盖营运汇总。</em>
                )}
              </div>
            )}
          </div>
        </section>

        {overview?.status !== "ok" && (
          <div className="panel cinemaEmpty">
            <h2>{overview?.status === "no_data" ? "所选日期暂无数据" : "未导入影院数据"}</h2>
            <p>{overview?.message || "请上传凤凰云智 Excel 报表。未导入时影院不会计入主驾驶舱总收入，也不会影响棋牌和台球数据。"}</p>
          </div>
        )}

        {overview?.status === "ok" && today && (
          <>
            <section className="metricGrid">
              <Metric label="票房" value={currency(today.box_office)} caption={today.date} tone="gold" />
              <Metric label="卖品收入" value={currency(today.concession_revenue)} caption="Excel 解析" tone="green" />
              <Metric label="总收入" value={currency(cinemaSummary.revenue)} caption={`人均 ${currency(cinemaSummary.avgOrderValue || 0)}`} tone="cyan" />
              <Metric label="观影人次" value={`${cinemaSummary.customers}`} caption={`${cinemaSummary.orders} 场 · 上座率 ${percent(cinemaSummary.utilizationRate || 0)}`} tone="muted" />
            </section>

            {/* 卖品大类详情 */}
            <ConcessionSection data={concession} />


            <CinemaTrendChart
              trend7d={detail?.box_office_trend_7d || []}
              trend30d={detail?.box_office_trend_30d || []}
            />

            <section className="panel cinemaFilterPanel">
              <div>
                <span className="eyebrow">影片筛选</span>
                <h2>{filmQuery ? `筛选：${filmQuery}` : "全部影片"}</h2>
              </div>
              <div className="cinemaDateControls">
                {[["day", "按日"], ["month", "按月"], ["year", "按年"]].map(([key, label]) => (
                  <button key={key} className={`chartControl ${filmDateMode === key ? "active" : ""}`} onClick={() => setFilmDateMode(key as typeof filmDateMode)}>{label}</button>
                ))}
                {filmDateMode === "day" && (
                  <input className="dateInput" type="date" value={filmDate} onChange={(e) => setFilmDate(e.target.value)} />
                )}
                {filmLoading && <span style={{ fontSize: 12, opacity: 0.6 }}>加载中...</span>}
              </div>
              <input
                className="filmSearchInput"
                value={filmQuery}
                onChange={(event) => setFilmQuery(event.target.value)}
                placeholder="输入影片名称，例如 给阿嬷、火遮眼"
              />
            </section>

            <section className="mainGrid">
              <RankingPanel title="影片票房排行" data={filterFilms(filmRankingData.box || [], filmQuery)} valueKey="film_box_office" />
              <RankingPanel title="影片人次排行" data={filterFilms(filmRankingData.att || [], filmQuery)} valueKey="film_attendance" />
            </section>

            <section className="mainGrid">
              <div className="panel">
                <div className="panelHeader">
                  <h3>场次和上座率分析</h3>
                  <span className="panelHint">按已导入日期统计</span>
                </div>
                <table className="rankingTable">
                  <thead><tr><th>日期</th><th>场次</th><th>上座率</th></tr></thead>
                  <tbody>
                    {(detail?.screening_analysis || []).map((item) => (
                      <tr key={item.date}>
                        <td>{item.date}</td>
                        <td>{item.screenings}</td>
                        <td>{percent(item.occupancy_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ImportRecords records={recentImports} />
            </section>
          </>
        )}
      </AppShell>
    </>
  );
}

/* ===== 卖品大类详情组件 ===== */
function ConcessionSection({ data }: { data: ConcessionDetail | null }) {
  if (!data || data.status !== "ok" || !data.categories?.length) return null;
  const total = data.summary?.total_revenue || 0;
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">卖品分析</span>
          <h2>卖品大类详情</h2>
        </div>
        <span className="panelHint">
          总收入 {currency(total)} · 日均 {currency(data.summary?.avg_daily_revenue || 0)}
        </span>
      </div>
      <div className="concessionCategoryGrid">
        {data.categories.map((cat) => {
          const pct = total > 0 ? ((cat.revenue / total) * 100).toFixed(1) : "0";
          return (
            <div key={cat.category} className="concessionCategoryCard">
              <div className="concessionCategoryHeader">
                <strong>{cat.category}</strong>
                <span className="concessionCategoryPct">{pct}%</span>
              </div>
              <div className="concessionCategoryValue">{currency(cat.revenue)}</div>
              <div className="concessionCategoryMeta">
                {cat.quantity} 件 · {cat.items} 个SKU
              </div>
              <div className="concessionCategoryBar">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {/* TOP10单品 */}
      {data.items && data.items.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="panelHeader" style={{ marginBottom: 8 }}>
            <h3>卖品TOP10</h3>
            <span className="panelHint">按收入排序</span>
          </div>
          <table className="rankingTable">
            <thead><tr><th>#</th><th>品名</th><th>大类</th><th>数量</th><th>收入</th></tr></thead>
            <tbody>
              {data.items.slice(0, 10).map((item, i) => (
                <tr key={`${item.item_name}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{item.item_name}</td>
                  <td>{item.category}</td>
                  <td>{item.quantity}</td>
                  <td>{currency(item.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}



function Metric({ label, value, caption, tone }: { label: string; value: string; caption: string; tone: string }) {
  return (
    <article className={`metricCard tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{caption}</em>
    </article>
  );
}

function RankingPanel({ title, data, valueKey }: { title: string; data: Array<{ film_name: string; film_box_office: number; film_attendance: number }>; valueKey: "film_box_office" | "film_attendance" }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <h3>{title}</h3>
        <span className="panelHint">{valueKey === "film_box_office" ? "票房" : "人次"}</span>
      </div>
      {data.length ? (
        <table className="rankingTable">
          <thead><tr><th>#</th><th>影片</th><th>{valueKey === "film_box_office" ? "票房" : "人次"}</th></tr></thead>
          <tbody>
            {data.slice(0, 10).map((item, index) => (
              <tr key={`${item.film_name}-${index}`}>
                <td>{index + 1}</td>
                <td>{item.film_name}</td>
                <td>{valueKey === "film_box_office" ? currency(item[valueKey]) : item[valueKey]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="emptyState">暂无影片排行</div>}
    </div>
  );
}

function filterFilms<T extends { film_name: string }>(films: T[], query: string): T[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return films;
  return films.filter((film) => film.film_name.toLowerCase().includes(keyword));
}

function isSuccessfulImport(item: CinemaBatchImportResult["results"][number]): item is CinemaImportResult {
  return item.status === "ok";
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function ImportRecords({ records }: { records: Array<{ file_name: string | null; import_time: string | null; status: string; error_reason?: string | null; message?: string | null }> }) {
  return (
    <div className="panel">
      <div className="panelHeader">
        <h3>最近导入记录</h3>
        <span className="panelHint">sync_logs</span>
      </div>
      {records.length ? (
        <table className="rankingTable">
          <thead><tr><th>文件名</th><th>导入时间</th><th>状态</th><th>错误原因</th></tr></thead>
          <tbody>
            {records.map((item, index) => (
              <tr key={`${item.file_name}-${index}`}>
                <td>{item.file_name || "未知文件"}</td>
                <td>{item.import_time ? formatDateTime(item.import_time) : "暂无"}</td>
                <td>{item.status === "success" ? "成功" : "失败"}</td>
                <td>{item.error_reason || item.message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div className="emptyState">暂无导入记录</div>}
    </div>
  );
}

function currency(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function percent(value: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function statusLabel(status?: string) {
  return { ok: "已导入", not_imported: "未导入", no_data: "暂无数据", error: "导入失败" }[status || "not_imported"] || status;
}

function reportTypeLabel(type: string) {
  return {
    operations: "营运综合报表",
    film_ranking: "影片成绩排名表",
    concession_detail: "卖品销售明细",
    member_detail: "会员卡明细",
    generic: "通用报表",
  }[type] || type;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function offsetDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
