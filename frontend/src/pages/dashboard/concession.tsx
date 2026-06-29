import Head from "next/head";
import { AppShell, PageHeader } from "../../components/dashboard";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchConcessionDetail } from "../../lib/dashboardApi";
import type { ConcessionDetail } from "../../lib/dashboardApi";
import InventoryAlert from "../../components/InventoryAlert";

type TabKey = "today" | "week" | "month" | "year";

const TAB_LABELS: Record<TabKey, string> = {
  today: "今日",
  week: "本周",
  month: "本月",
  year: "本年",
};

// 娱乐项目类别（需要单独显示）
const ENTERTAINMENT_CATEGORIES = ["顽小游", "顽麻社", "轰趴区"];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCalendarRange(tab: TabKey) {
  const end = new Date();
  const start = new Date(end);
  if (tab === "today") {
    return { startDate: formatLocalDate(end), endDate: formatLocalDate(end) };
  }
  if (tab === "week") {
    const dayOfWeek = end.getDay();
    start.setDate(end.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
    return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
  }
  if (tab === "year") {
    start.setMonth(0, 1);
    return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
  }
  start.setDate(1);
  return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
}

export default function ConcessionPage() {
  const [data, setData] = useState<ConcessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabKey>("month");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { startDate, endDate } = getCalendarRange(tab);
      const result = await fetchConcessionDetail(endDate, 366, undefined, startDate);
      if (result.status === "ok") {
        setData(result);
        setLastUpdate(new Date());
      } else {
        setError("获取失败");
      }
    } catch (e: any) {
      setError(e.message || "获取失败");
    } finally {
      setLoading(false);
    }
  }, [loading, tab]);

  useEffect(() => { refresh(); }, [tab]);

  // 计算分类统计
  const getFilteredCategories = () => {
    if (!data) return { entertainment: [], regular: [] };
    // 分离娱乐项目和普通卖品
    const entertainment = (data.categories || []).filter(c => ENTERTAINMENT_CATEGORIES.includes(c.category));
    const regular = (data.categories || []).filter(c => !ENTERTAINMENT_CATEGORIES.includes(c.category));
    return { entertainment, regular };
  };

  const { entertainment, regular } = getFilteredCategories();

  return (
    <>
      <Head><title>卖品详情 - 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/concession">
        {/* 顶栏 */}
        <div className="topBar">
          <div>
            <Link href="/dashboard/cinema" className="backLink">← 返回影院</Link>
            <h1>🍿 卖品详情</h1>
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
            {/* 时间切换 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>📊 经营统计</h3>
                <div className="chartControls">
                  {(["today", "week", "month", "year"] as TabKey[]).map((k) => (
                    <button
                      key={k}
                      className={`chartControl ${tab === k ? "active" : ""}`}
                      onClick={() => setTab(k)}
                    >
                      {TAB_LABELS[k]}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* 指标卡 */}
              <div className="statsGrid">
                <div className="statCard">
                  <div className="statLabel">卖品总收入</div>
                  <div className="statValue">¥{(data.summary?.total_revenue ?? 0).toLocaleString()}</div>
                </div>
                <div className="statCard">
                  <div className="statLabel">总销量</div>
                  <div className="statValue">{(data.summary?.total_quantity ?? 0).toLocaleString()}</div>
                </div>
                <div className="statCard">
                  <div className="statLabel">日均收入</div>
                  <div className="statValue">¥{(data.summary?.avg_daily_revenue ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* 类别筛选 */}
            <div className="panel detailSection">
              <div className="panelHeader">
                <h3>🏷️ 类别筛选</h3>
              </div>
              <div className="categoryFilter">
                <button
                  className={`categoryBtn ${selectedCategory === null ? "active" : ""}`}
                  onClick={() => setSelectedCategory(null)}
                >
                  全部
                </button>
                {(data.categories || []).map((cat) => (
                  <button
                    key={cat.category}
                    className={`categoryBtn ${selectedCategory === cat.category ? "active" : ""}`}
                    onClick={() => setSelectedCategory(cat.category)}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>
            </div>

            {/* 卖品类别排行 */}
            <div className="panel detailSection">
              <h3>📈 卖品类别排行</h3>
              <table className="rankingTable">
                <thead>
                  <tr><th>#</th><th>类别</th><th>销量</th><th>收入</th><th>占比</th></tr>
                </thead>
                <tbody>
                  {regular.map((cat, i) => {
                    const pct = (data.summary?.total_revenue ?? 0) > 0 
                      ? (cat.revenue / (data.summary?.total_revenue ?? 1) * 100).toFixed(1)
                      : "0";
                    return (
                      <tr key={cat.category}>
                        <td>{i + 1}</td>
                        <td>{cat.category}</td>
                        <td>{cat.quantity}</td>
                        <td>¥{cat.revenue.toLocaleString()}</td>
                        <td>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 娱乐项目 */}
            {entertainment.length > 0 && (
              <div className="panel detailSection">
                <h3>🎮 娱乐项目</h3>
                <table className="rankingTable">
                  <thead>
                    <tr><th>#</th><th>项目</th><th>销量</th><th>收入</th></tr>
                  </thead>
                  <tbody>
                    {entertainment.map((cat, i) => (
                      <tr key={cat.category}>
                        <td>{i + 1}</td>
                        <td>{cat.category}</td>
                        <td>{cat.quantity}</td>
                        <td>¥{cat.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 卖品TOP50 */}
            <div className="panel detailSection">
              <h3>🏆 卖品TOP50</h3>
              <table className="rankingTable">
                <thead>
                  <tr><th>#</th><th>品名</th><th>类别</th><th>销量</th><th>收入</th></tr>
                </thead>
                <tbody>
                  {(data.items || []).slice(0, 50).map((item, i) => (
                    <tr key={item.item_name}>
                      <td>{i + 1}</td>
                      <td>{item.item_name}</td>
                      <td>{item.category}</td>
                      <td>{item.quantity}</td>
                      <td>¥{item.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!data && !error && !loading && <div className="emptyState">点击"手动刷新"加载数据</div>}

        {/* 库存预警 */}
        <InventoryAlert className="panel" />
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
        .statsGrid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .statCard {
          padding: 16px;
          background: rgba(54, 214, 255, 0.05);
          border: 1px solid rgba(54, 214, 255, 0.15);
          border-radius: 8px;
        }
        .statLabel {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .statValue {
          font-size: 20px;
          font-weight: 600;
          color: var(--text);
        }
        .categoryFilter {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .categoryBtn {
          padding: 6px 12px;
          background: rgba(54, 214, 255, 0.1);
          border: 1px solid rgba(54, 214, 255, 0.2);
          border-radius: 16px;
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .categoryBtn:hover {
          background: rgba(54, 214, 255, 0.2);
        }
        .categoryBtn.active {
          background: var(--cyan);
          color: #000;
          border-color: var(--cyan);
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
      `}</style>
    </>
  );
}
