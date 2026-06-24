import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchEmployeeCoach } from "../../lib/dashboardApi";
import type { EmployeeCoachData, EmployeeCoachItem } from "../../lib/dashboardApi";

/* ---- 套餐类型 ---- */
const PKG_TYPES = ["单人餐", "双人餐", "三人餐", "儿童套餐", "会员套餐", "单点餐"];

const PKG_SHORT: Record<string, string> = {
  "单人餐": "单人",
  "双人餐": "双人",
  "三人餐": "三人",
  "儿童套餐": "儿童",
  "会员套餐": "会员",
  "单点餐": "单点",
};

/* ---- 辅助函数 ---- */
function currency(v: number) {
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}
function currencyShort(v: number) {
  if (v >= 10000) return `¥${(v / 10000).toFixed(1)}万`;
  return `¥${Number(v || 0).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

export default function EmployeeCoachPage() {
  const [data, setData] = useState<EmployeeCoachData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeCoachItem | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month" | "year">("all");

  // 计算自然周/月/年的日期范围
  const dateRangeLabels: Record<string, string> = {
    all: "全部",
    today: "今日",
    week: "本周",
    month: "本月",
    year: "本年",
  };

  // 获取日期范围
  const getDateRange = useCallback(() => {
    const now = new Date();
    // 使用本地时间，避免时区问题
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();
    const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    
    if (dateRange === "all") return { start: undefined, end: undefined };
    if (dateRange === "today") return { start: today, end: today };
    
    if (dateRange === "week") {
      // 自然周：周一到今天
      const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
      const monday = new Date(now);
      monday.setDate(day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
      const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      return { start: mondayStr, end: today };
    }
    
    if (dateRange === "month") {
      // 自然月：1号到今天
      const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      return { start: firstDay, end: today };
    }
    
    if (dateRange === "year") {
      // 自然年：1月1号到今天
      const yearStart = `${year}-01-01`;
      return { start: yearStart, end: today };
    }
    
    return { start: undefined, end: undefined };
  }, [dateRange]);

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  // 获取日期范围描述
  const dateRangeDescription = useCallback(() => {
    const { start, end } = getDateRange();
    if (!start && !end) return "全部数据";
    if (start === end) return formatDate(start);
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, [getDateRange]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { start, end } = getDateRange();
      const result = await fetchEmployeeCoach(start, end);
      setData(result);
    } catch (e: any) {
      setError(e?.message || "获取员工教练数据失败");
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => { refresh(); }, [dateRange]);

  const summary = data?.team_summary;
  // 分离普通员工和主管
  const regularEmps = data?.employees.filter(e => !e.is_manager) || [];
  const managerEmps = data?.employees.filter(e => e.is_manager) || [];
  // 合计（所有员工）
  const totals = data?.employees.reduce((acc, e) => {
    acc.package_count += e.package_count || 0;
    acc.activity_count += e.activity_count || 0;
    acc.activity_amount += e.activity_amount || 0;
    acc.recharge_count += e.recharge_count || 0;
    acc.recharge_amount += e.recharge_amount || 0;
    acc.open_count += e.open_count || 0;
    acc.total_count += e.total_count || 0;
    acc.total_amount += e.total_amount || 0;
    // 套餐细分
    for (const t of PKG_TYPES) {
      const d = e.package_detail[t];
      if (d) {
        if (!acc.pkg_detail[t]) acc.pkg_detail[t] = { count: 0, amount: 0 };
        acc.pkg_detail[t].count += d.count || 0;
        acc.pkg_detail[t].amount += d.amount || 0;
      }
    }
    return acc;
  }, { package_count: 0, activity_count: 0, activity_amount: 0, recharge_count: 0, recharge_amount: 0, open_count: 0, total_count: 0, total_amount: 0, pkg_detail: {} as Record<string, { count: number; amount: number }> });

  return (
    <>
      <Head><title>🧑‍🏫 员工AI教练 - 翡翠城经营驾驶舱</title></Head>
      <main className="dashboardShell">
        <div className="topBar">
          <div>
            <Link href="/dashboard" className="backLink">← 返回驾驶舱</Link>
            <Link href="/dashboard/employee" className="backLink" style={{ marginLeft: 12 }}>👥 员工绩效</Link>
            <h1>🧑‍🏫 员工AI教练</h1>
            <span className="eyebrow">能力分析 · AI培训建议 · 绩效排名</span>
          </div>
          <div className="topMeta">
            <button className="refreshButton" onClick={refresh} disabled={loading}>
              {loading ? "加载中..." : "刷新"}
            </button>
          </div>
        </div>

        {error && <div className="errorBanner">{error}</div>}

        {data && data.status === "ok" && (
          <>
            {/* 团队概览 */}
            <section className="metricGrid">
              <Metric label="参与排名人数" value={`${summary?.total_employees || 0}`} tone="cyan" />
              <Metric label="平均得分" value={`${(summary?.avg_score || 0).toFixed(1)}`} tone="gold" />
              <Metric label="最佳员工" value={summary?.top_performer || "-"} tone="green" />
              <Metric label="需关注" value={`${summary?.needs_attention?.length || 0}人`} tone="muted" />
              {data.shift_summary && (
                <>
                  <Metric label="早班观影人次" value={`${data.shift_summary.morning_total}`} tone="gold" />
                  <Metric label="晚班观影人次" value={`${data.shift_summary.evening_total}`} tone="purple" />
                </>
              )}
            </section>

            {/* AI 团队洞察 */}
            {data.ai_insights && data.ai_insights.length > 0 && (
              <section className="panel">
                <div className="panelHeader">
                  <h3>🤖 AI团队洞察</h3>
                  <button className="chartControl" onClick={() => setShowInsights(!showInsights)}>
                    {showInsights ? "收起" : "展开"}
                  </button>
                </div>
                {showInsights && (
                  <div className="insightList">
                    {data.ai_insights.map((insight, i) => (
                      <div key={i} className="insightItem">
                        <span className="insightIcon">💡</span>
                        <span>{insight}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 员工绩效排名表 */}
            <section className="panel">
              <div className="panelHeader">
                <div>
                  <h3>🏆 员工绩效排名</h3>
                  <span className="panelHint">{dateRangeDescription()}</span>
                </div>
                <div className="panelHeaderRight">
                  {/* 日期范围切换 */}
                  <div className="dateRangeTabs">
                    {(["all", "today", "week", "month", "year"] as const).map((key) => (
                      <button
                        key={key}
                        className={`dateRangeTab ${dateRange === key ? "active" : ""}`}
                        onClick={() => setDateRange(key)}
                      >
                        {dateRangeLabels[key]}
                      </button>
                    ))}
                  </div>
                  <span className="panelHint">按综合得分降序 · 主管不参与排名</span>
                </div>
              </div>
              <div className="tableWrap">
                <table className="rankingTable employeeTable">
                  <thead>
                    <tr>
                      <th rowSpan={2}>#</th>
                      <th rowSpan={2}>员工</th>
                      <th rowSpan={2}>得分</th>
                      <th colSpan={PKG_TYPES.length} className="groupHeader groupPackage">卖品套餐</th>
                      <th colSpan={2} className="groupHeader groupActivity">活动套餐</th>
                      <th colSpan={2} className="groupHeader groupRecharge">会员充值</th>
                      <th rowSpan={2} className="groupHeader groupOpen">开卡</th>
                      <th rowSpan={2} className="groupHeader groupTotal">合计</th>
                      <th rowSpan={2}>人均效率</th>
                      <th rowSpan={2}>强项</th>
                      <th rowSpan={2}>弱项</th>
                      <th rowSpan={2}>操作</th>
                    </tr>
                    <tr>
                      {PKG_TYPES.map(t => (
                        <th key={t} className="subHeader">{PKG_SHORT[t] || t}</th>
                      ))}
                      <th className="subHeader">数量</th>
                      <th className="subHeader">金额</th>
                      <th className="subHeader">数量</th>
                      <th className="subHeader">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 普通员工 */}
                    {regularEmps.map((e) => (
                      <tr key={e.name} className={selectedEmployee?.name === e.name ? "selectedRow" : ""}>
                        <td>
                          <span className={`rankBadge rank-${e.rank <= 3 ? "top" : "mid"}`}>
                            {e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : `#${e.rank}`}
                          </span>
                        </td>
                        <td><strong>{e.name}</strong></td>
                        <td className="scoreCell">
                          <span className="scoreValue">{e.total_score}</span>
                        </td>
                        {/* 套餐细分 */}
                        {PKG_TYPES.map(t => {
                          const d = e.package_detail[t];
                          return (
                            <td key={t} className="numCell">
                              {d && d.count > 0 ? (
                                <>
                                  <div>{d.count}笔</div>
                                  <div className="cellSub">{currencyShort(d.amount)}</div>
                                </>
                              ) : (
                                <span className="cellEmpty">-</span>
                              )}
                            </td>
                          );
                        })}
                        {/* 活动套餐 */}
                        <td className="numCell">
                          {e.activity_count > 0 ? `${e.activity_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        <td className="numCell">
                          {e.activity_amount > 0 ? currencyShort(e.activity_amount) : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 会员充值 */}
                        <td className="numCell">
                          {e.recharge_count > 0 ? `${e.recharge_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        <td className="numCell">
                          {e.recharge_amount > 0 ? currencyShort(e.recharge_amount) : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 开卡 */}
                        <td className="numCell">
                          {e.open_count > 0 ? `${e.open_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 合计 */}
                        <td className="totalCell">
                          <strong>{currency(e.total_amount)}</strong>
                          <div className="cellSub">{e.total_count}笔</div>
                        </td>
                        {/* 人均效率 */}
                        <td className="efficiencyCell">
                          {e.efficiency > 0 ? (
                            <>
                              <span className="efficiencyValue">¥{e.efficiency.toFixed(2)}</span>
                              <div className="cellSub">{e.shift_attendance || 0}人次</div>
                            </>
                          ) : (
                            <span className="cellEmpty">-</span>
                          )}
                        </td>
                        {/* 强弱项 */}
                        <td>
                          <div className="tagList">
                            {e.strengths.slice(0, 2).map((s, i) => (
                              <span key={i} className="tag tag-green">{s}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="tagList">
                            {e.weaknesses.slice(0, 2).map((w, i) => (
                              <span key={i} className="tag tag-red">{w}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button className="actionBtn" onClick={() => setSelectedEmployee(selectedEmployee?.name === e.name ? null : e)}>
                            {selectedEmployee?.name === e.name ? "收起" : "详细分析"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* 分隔行 */}
                    {managerEmps.length > 0 && (
                      <tr className="managerDivider">
                        <td colSpan={15} style={{ padding: "4px 12px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "left" }}>
                          👑 主管（不参与排名）
                        </td>
                      </tr>
                    )}
                    {/* 主管行 */}
                    {managerEmps.map((e) => (
                      <tr key={e.name} className={`managerRow ${selectedEmployee?.name === e.name ? "selectedRow" : ""}`}>
                        <td><span className="rankBadge managerBadge">👑</span></td>
                        <td>
                          <strong>{e.name}</strong>
                          <span className="managerTag">主管</span>
                        </td>
                        <td className="scoreCell"><span className="cellEmpty">-</span></td>
                        {/* 套餐细分 */}
                        {PKG_TYPES.map(t => {
                          const d = e.package_detail[t];
                          return (
                            <td key={t} className="numCell">
                              {d && d.count > 0 ? (
                                <>
                                  <div>{d.count}笔</div>
                                  <div className="cellSub">{currencyShort(d.amount)}</div>
                                </>
                              ) : (
                                <span className="cellEmpty">-</span>
                              )}
                            </td>
                          );
                        })}
                        {/* 活动套餐 */}
                        <td className="numCell">
                          {e.activity_count > 0 ? `${e.activity_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        <td className="numCell">
                          {e.activity_amount > 0 ? currencyShort(e.activity_amount) : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 会员充值 */}
                        <td className="numCell">
                          {e.recharge_count > 0 ? `${e.recharge_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        <td className="numCell">
                          {e.recharge_amount > 0 ? currencyShort(e.recharge_amount) : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 开卡 */}
                        <td className="numCell">
                          {e.open_count > 0 ? `${e.open_count}笔` : <span className="cellEmpty">-</span>}
                        </td>
                        {/* 合计 */}
                        <td className="totalCell">
                          <strong>{currency(e.total_amount)}</strong>
                          <div className="cellSub">{e.total_count}笔</div>
                        </td>
                        {/* 人均效率 */}
                        <td className="efficiencyCell">
                          {e.efficiency > 0 ? (
                            <>
                              <span className="efficiencyValue">¥{e.efficiency.toFixed(2)}</span>
                              <div className="cellSub">{e.shift_attendance || 0}人次</div>
                            </>
                          ) : (
                            <span className="cellEmpty">-</span>
                          )}
                        </td>
                        <td><span className="cellEmpty">-</span></td>
                        <td><span className="cellEmpty">-</span></td>
                        <td>
                          <button className="actionBtn" onClick={() => setSelectedEmployee(selectedEmployee?.name === e.name ? null : e)}>
                            {selectedEmployee?.name === e.name ? "收起" : "查看"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* 合计行 */}
                    {totals && (
                      <tr className="totalRow">
                        <td></td>
                        <td><strong>合计</strong></td>
                        <td></td>
                        {PKG_TYPES.map(t => {
                          const d = totals.pkg_detail[t];
                          return (
                            <td key={t} className="numCell totalNumCell">
                              {d && d.count > 0 ? (
                                <>
                                  <div><strong>{d.count}笔</strong></div>
                                  <div className="cellSub">{currencyShort(d.amount)}</div>
                                </>
                              ) : (
                                <span className="cellEmpty">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="numCell totalNumCell"><strong>{totals.activity_count}笔</strong></td>
                        <td className="numCell totalNumCell">{currencyShort(totals.activity_amount)}</td>
                        <td className="numCell totalNumCell"><strong>{totals.recharge_count}笔</strong></td>
                        <td className="numCell totalNumCell">{currencyShort(totals.recharge_amount)}</td>
                        <td className="numCell totalNumCell"><strong>{totals.open_count}笔</strong></td>
                        <td className="totalCell">
                          <strong>{currency(totals.total_amount)}</strong>
                          <div className="cellSub">{totals.total_count}笔</div>
                        </td>
                        <td></td>
                        <td></td>
                        <td></td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 选中员工详细分析 */}
            {selectedEmployee && (
              <section className="panel detailPanel">
                <div className="panelHeader">
                  <h3>📋 {selectedEmployee.name} — 详细分析</h3>
                  <button className="chartControl" onClick={() => setSelectedEmployee(null)}>关闭</button>
                </div>

                {!selectedEmployee.is_manager && (
                  <>
                    <div className="sectionBlock">
                      <h4>✅ 强项</h4>
                      <ul className="bulletList">
                        {selectedEmployee.strengths.map((s, i) => (
                          <li key={i} className="bullet-green">{s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="sectionBlock">
                      <h4>⚠️ 待提升</h4>
                      <ul className="bulletList">
                        {selectedEmployee.weaknesses.map((w, i) => (
                          <li key={i} className="bullet-red">{w}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="sectionBlock">
                      <h4>🎓 AI培训建议</h4>
                      <div className="trainingList">
                        {selectedEmployee.training_suggestions.map((t, i) => (
                          <div key={i} className="trainingCard">
                            <span className="trainingNum">{i + 1}</span>
                            <span>{t}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {selectedEmployee.is_manager && (
                  <div className="sectionBlock">
                    <p style={{ color: "var(--muted)", fontSize: 13 }}>主管不参与评分分析，仅展示销售数据。</p>
                  </div>
                )}
              </section>
            )}

            {/* 需关注员工提示 */}
            {summary?.needs_attention && summary.needs_attention.length > 0 && (
              <section className="panel attentionPanel">
                <div className="panelHeader">
                  <h3>⚠️ 需重点关注</h3>
                </div>
                <div className="attentionList">
                  {summary.needs_attention.map((name, i) => (
                    <span key={i} className="attentionTag">{name}</span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {!data && !error && !loading && <div className="emptyState">加载中...</div>}
      </main>

      <style jsx>{`
        .errorBanner {
          padding: 12px 16px;
          margin-bottom: 12px;
          background: rgba(255,107,107,0.15);
          border: 1px solid rgba(255,107,107,0.3);
          border-radius: 8px;
          color: #ffb3b3;
        }
        .panelHeaderRight {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .selectedRow td {
          background: rgba(54, 214, 255, 0.08) !important;
        }
        .rankBadge {
          font-size: 14px;
          font-weight: 600;
        }
        .rank-top { color: #ffd700; }
        .rank-mid { color: rgba(255,255,255,0.6); }
        .managerBadge { color: #fbbf24 !important; }
        .scoreCell {
          text-align: center;
        }
        .scoreValue {
          font-size: 16px;
          font-weight: 700;
          color: var(--cyan);
        }
        /* 表格 */
        .tableWrap {
          overflow-x: auto;
          margin-top: 8px;
        }
        .employeeTable {
          min-width: 1000px;
        }
        .employeeTable th,
        .employeeTable td {
          padding: 6px 8px;
          text-align: center;
          white-space: nowrap;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .employeeTable th {
          font-size: 11px;
          color: var(--muted);
          font-weight: 500;
        }
        .groupHeader {
          font-size: 12px !important;
          font-weight: 600 !important;
          padding: 8px 6px 4px !important;
          border-bottom: 2px solid rgba(255,255,255,0.1) !important;
        }
        .groupPackage { color: #ffd700; }
        .groupActivity { color: #4ecdc4; }
        .groupRecharge { color: #a78bfa; }
        .groupOpen { color: #fb923c; }
        .groupTotal { color: var(--cyan); }
        .subHeader {
          font-size: 10px !important;
          color: rgba(255,255,255,0.4) !important;
          padding: 2px 6px 6px !important;
          font-weight: 400 !important;
        }
        .numCell {
          font-size: 12px;
          color: rgba(255,255,255,0.8);
        }
        .cellSub {
          font-size: 10px;
          color: var(--muted);
          margin-top: 1px;
        }
        .cellEmpty {
          color: rgba(255,255,255,0.15);
          font-size: 11px;
        }
        .totalCell {
          color: var(--cyan);
          font-size: 13px;
          background: rgba(0,255,255,0.03);
        }
        .totalCell .cellSub {
          color: rgba(0,255,255,0.5);
        }
        .totalRow td {
          border-top: 2px solid rgba(54, 214, 255, 0.3) !important;
          background: rgba(54, 214, 255, 0.06) !important;
          font-weight: 600;
        }
        .totalNumCell {
          color: rgba(255,255,255,0.9) !important;
        }
        /* 班次标签 */
        .shiftBadge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255,255,255,0.08);
        }
        /* 人均效率 */
        .efficiencyCell {
          text-align: center;
        }
        .efficiencyValue {
          font-size: 12px;
          font-weight: 600;
          color: #4ecdc4;
        }
        /* 主管行 */
        .managerDivider td {
          background: transparent !important;
          border-bottom: 1px dashed rgba(255,255,255,0.1) !important;
        }
        .managerRow td {
          opacity: 0.75;
        }
        .managerTag {
          display: inline-block;
          margin-left: 6px;
          padding: 1px 8px;
          background: rgba(251, 191, 36, 0.15);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
          color: #fbbf24;
          vertical-align: middle;
        }
        /* 标签 */
        .tagList {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .tag {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          white-space: nowrap;
        }
        .tag-green {
          background: rgba(34,197,94,0.12);
          color: #22c55e;
        }
        .tag-red {
          background: rgba(239,68,68,0.12);
          color: #ef4444;
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
        .detailPanel {
          margin-top: 16px;
          border-left: 3px solid #4ecdc4;
        }
        .sectionBlock {
          margin-top: 20px;
        }
        .sectionBlock h4 {
          font-size: 14px;
          margin-bottom: 10px;
          color: rgba(255,255,255,0.9);
        }
        .bulletList {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .bulletList li {
          padding: 6px 0 6px 20px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          position: relative;
        }
        .bullet-green::before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #22c55e;
          font-weight: 700;
        }
        .bullet-red::before {
          content: "!";
          position: absolute;
          left: 2px;
          color: #ef4444;
          font-weight: 700;
        }
        .trainingList {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .trainingCard {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(167, 139, 250, 0.05);
          border: 1px solid rgba(167, 139, 250, 0.12);
          border-radius: 6px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          line-height: 1.5;
        }
        .trainingNum {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          background: rgba(167, 139, 250, 0.2);
          border-radius: 50%;
          font-size: 11px;
          font-weight: 700;
          color: #a78bfa;
          flex-shrink: 0;
        }
        .insightList {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .insightItem {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(251, 191, 36, 0.05);
          border: 1px solid rgba(251, 191, 36, 0.12);
          border-radius: 6px;
          font-size: 13px;
          color: rgba(255,255,255,0.8);
          line-height: 1.5;
        }
        .insightIcon { font-size: 16px; }
        .attentionPanel {
          margin-top: 16px;
          border-left: 3px solid #ef4444;
        }
        .attentionList {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 8px;
        }
        .attentionTag {
          padding: 4px 12px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 16px;
          font-size: 13px;
          color: #fca5a5;
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
