/**
 * 收入预测页面 v2
 * 多模型集成 + 外部特征（猫眼大盘/节假日/天气）
 * 展示区间预测、置信度、影响因子
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { DashboardStatePanel, getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchRevenueForecast, type RevenueForecast } from "../../lib/dashboardApi";
import {
  AppShell,
  PageHeader,
  MetricCard,
  SectionCard,
  StatusBadge,
  EmptyState,
} from "../../components/dashboard";

// ============================================================
// 常量映射
// ============================================================

/** 业态图标 */
const BIZ_ICONS: Record<string, string> = {
  billiards: "🎱",
  mahjong: "🀄",
  cinema: "🎬",
};

/** 业态颜色 */
const BIZ_COLORS: Record<string, string> = {
  billiards: "#3b82f6",
  mahjong: "#a855f7",
  cinema: "#f59e0b",
};

/** 置信度映射到 StatusBadge 状态 */
const CONFIDENCE_STATUS: Record<string, "success" | "warning" | "error"> = {
  high: "success",
  medium: "warning",
  low: "error",
};

/** 置信度中文标签 */
const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/** 趋势映射到 StatusBadge 状态 */
const TREND_STATUS: Record<string, "success" | "error" | "info"> = {
  up: "success",
  down: "error",
  stable: "info",
};

/** 假期类型中文 */
const HOLIDAY_TYPE_LABELS: Record<string, string> = {
  long_holiday: "长假",
  short_holiday: "短假",
  weekend: "周末",
  workday: "工作日",
};

/** 假期类型图标 */
const HOLIDAY_TYPE_ICONS: Record<string, string> = {
  long_holiday: "🎉",
  short_holiday: "🎊",
  weekend: "🌴",
  workday: "💼",
};

// ============================================================
// 工具函数
// ============================================================

/** 格式化金额 */
const formatMoney = (value: number): string => {
  if (value >= 10000) {
    return `¥${(value / 10000).toFixed(1)}万`;
  }
  return `¥${value.toLocaleString()}`;
};

/** 格式化区间 */
const formatRange = (low: number, high: number): string => {
  return `${formatMoney(low)} ~ ${formatMoney(high)}`;
};

/** 获取置信度颜色 */
const getConfidenceColor = (confidence: string): string => {
  return CONFIDENCE_STATUS[confidence] === "success"
    ? "#22c55e"
    : CONFIDENCE_STATUS[confidence] === "warning"
    ? "#f59e0b"
    : "#ef4444";
};

// ============================================================
// 子组件
// ============================================================

/** 影响因子标签 */
function FactorTag({ icon, label, value, boost }: {
  icon: string;
  label: string;
  value: string;
  boost: number;
}) {
  const isPositive = boost > 1;
  const isNeutral = boost === 1;
  const color = isNeutral ? "#6b7280" : isPositive ? "#22c55e" : "#ef4444";
  const boostText = isNeutral ? "" : ` ${isPositive ? "+" : ""}${Math.round((boost - 1) * 100)}%`;
  
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        borderRadius: 6,
        background: `${color}15`,
        border: `1px solid ${color}30`,
        fontSize: 12,
      }}
    >
      <span>{icon}</span>
      <span style={{ color: "#374151" }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}{boostText}</span>
    </div>
  );
}

/** 单日预测卡片 */
function DayPredictionCard({ pred, color }: {
  pred: {
    date: string;
    weekday: string;
    predicted: number;
    range_low: number;
    range_high: number;
    confidence: string;
    predicted_audience?: number;
    factors?: {
      holiday_type: string;
      holiday_boost: number;
      weather_boost: number;
      is_weekend: boolean;
      is_holiday: boolean;
      weather_text?: string;
    };
  };
  color: string;
}) {
  const factors = pred.factors;
  const holidayType = factors?.holiday_type || "";
  
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.8)",
        borderRadius: 10,
        padding: 12,
        border: `1px solid ${color}20`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* 顶部装饰条 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${color}, ${color}80)`,
        }}
      />
      
      {/* 日期和星期 */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: "#6b7280" }}>{pred.weekday}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{pred.date.slice(5)}</div>
      </div>
      
      {/* 假期类型 */}
      {holidayType && (
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>{HOLIDAY_TYPE_ICONS[holidayType] || "📅"}</span>
          <div style={{ fontSize: 10, color: "#6b7280" }}>{HOLIDAY_TYPE_LABELS[holidayType] || ""}</div>
        </div>
      )}
      
      {/* 预测值 */}
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color }}>
          {formatMoney(pred.predicted)}
        </div>
        {/* 影院预测人次 */}
        {pred.predicted_audience !== undefined && (
          <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>
            👥 {pred.predicted_audience}人次
          </div>
        )}
      </div>
      
      {/* 区间 */}
      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          color: "#9ca3af",
          padding: "4px 0",
          borderTop: "1px solid #f3f4f6",
        }}
      >
        {formatMoney(pred.range_low)} ~ {formatMoney(pred.range_high)}
      </div>
      
      {/* 置信度 */}
      <div style={{ textAlign: "center", marginTop: 4 }}>
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: getConfidenceColor(pred.confidence),
          }}
        />
      </div>
    </div>
  );
}

/** 置信区间可视化 */
function ConfidenceRange({ low, high, predicted, color }: {
  low: number;
  high: number;
  predicted: number;
  color: string;
}) {
  const range = high - low;
  const pct = range > 0 ? ((predicted - low) / range) * 100 : 50;
  
  return (
    <div style={{ position: "relative", height: 24, marginTop: 8 }}>
      {/* 背景条 */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 0,
          right: 0,
          height: 8,
          borderRadius: 4,
          background: `${color}20`,
        }}
      />
      
      {/* 区间填充 */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 0,
          width: "100%",
          height: 8,
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color}40, ${color}60, ${color}40)`,
        }}
      />
      
      {/* 预测值指示器 */}
      <div
        style={{
          position: "absolute",
          top: 2,
          left: `${pct}%`,
          transform: "translateX(-50%)",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 2px 4px ${color}40`,
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "white" }} />
      </div>
      
      {/* 标签 */}
      <div
        style={{
          position: "absolute",
          top: -12,
          left: `${pct}%`,
          transform: "translateX(-50%)",
          fontSize: 10,
          fontWeight: 600,
          color,
          whiteSpace: "nowrap",
        }}
      >
        {formatMoney(predicted)}
      </div>
      
      {/* 左右标签 */}
      <div style={{ position: "absolute", bottom: -4, left: 0, fontSize: 9, color: "#9ca3af" }}>
        {formatMoney(low)}
      </div>
      <div style={{ position: "absolute", bottom: -4, right: 0, fontSize: 9, color: "#9ca3af" }}>
        {formatMoney(high)}
      </div>
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================

export default function RevenueForecastPage() {
  const [data, setData] = useState<RevenueForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boxofficeInputs, setBoxofficeInputs] = useState<string[]>(["", "", ""]);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [batchRows, setBatchRows] = useState<{date: string, value: string}[]>([]);
  const [batchImporting, setBatchImporting] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [boxofficeSubmitting, setBoxofficeSubmitting] = useState(false);
  const [boxofficeMessage, setBoxofficeMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchRevenueForecast();
      setData(res);
    } catch (e: any) {
      setError(getDashboardErrorMessage(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // 生成过去60天日期列表（打开面板时自动填充）
  const initBatchRows = useCallback(() => {
    const rows: {date: string, value: string}[] = [];
    const today = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; // 本地时间
      rows.push({ date: dateStr, value: "" });
    }
    setBatchRows(rows);
    setBatchMessage("");
  }, []);

  // 批量导入历史数据
  const batchImport = useCallback(async () => {
    const predictions = batchRows
      .filter(r => r.value.trim() && !isNaN(parseFloat(r.value)) && parseFloat(r.value) > 0)
      .map(r => ({ date: r.date, total_box: parseFloat(r.value) }));

    if (predictions.length === 0) {
      setBatchMessage("❌ 请至少填写一天的票房数据");
      return;
    }

    setBatchImporting(true);
    setBatchMessage("");
    try {
      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/ai/boxoffice/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: predictions }),
      });
      if (resp.ok) {
        const result = await resp.json();
        setBatchMessage(`✅ 已导入${result.imported_count}天，市占率: ${result.market_share_pct}`);
        setBatchRows([]);
        setShowBatchImport(false);
        refresh();
      } else {
        setBatchMessage("❌ 导入失败");
      }
    } catch {
      setBatchMessage("❌ 网络错误");
    } finally {
      setBatchImporting(false);
    }
  }, [batchRows, refresh]);

    // 提交未来3天大盘预测
  const submitBoxoffice = useCallback(async () => {
    const hasData = boxofficeInputs.some(v => v && parseFloat(v) > 0);
    if (!hasData) {
      setBoxofficeMessage("请至少输入一天的预测数据");
      return;
    }
    setBoxofficeSubmitting(true);
    setBoxofficeMessage("");
    try {
      const predictions = boxofficeInputs.map((v, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i + 1);
        return {
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`,
          total_box: parseFloat(v) || 0,
        };
      }).filter(p => p.total_box > 0);

      const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/ai/boxoffice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ predictions }),
      });
      if (resp.ok) {
        setBoxofficeMessage("✅ 已更新");
        setBoxofficeInputs(["", "", ""]);
        refresh();
      } else {
        setBoxofficeMessage("❌ 更新失败");
      }
    } catch {
      setBoxofficeMessage("❌ 网络错误");
    } finally {
      setBoxofficeSubmitting(false);
    }
  }, [boxofficeInputs, refresh]);

  // 外部数据
  const weather = data?.external_data?.weather;
  const maoyan = data?.external_data?.maoyan_boxoffice;

  return (
    <>
      <Head>
        <title>收入预测 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/revenue-forecast">
        {/* 页面头部 */}
        <PageHeader
          title="📈 收入预测"
          description="多模型集成 + 外部特征（节假日/天气/大盘）"
          actions={
            <button onClick={refresh} disabled={loading} className="btn btnSecondary">
              {loading ? "刷新中..." : "刷新"}
            </button>
          }
        />

        {/* 未来3天大盘预测输入 */}
        <div style={{
          background: "rgba(255,255,255,0.8)",
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          border: "1px solid rgba(120,137,184,0.12)",
        }}>
          <div style={{ fontSize: 13, color: "#374151", fontWeight: 600, marginBottom: 8 }}>
            🎬 未来3天大盘预测票房（从猫眼专业版App查看）
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {[1, 2, 3].map((dayOffset) => {
              const d = new Date();
              d.setDate(d.getDate() + dayOffset);
              const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
              const weekday = ["周日","周一","周二","周三","周四","周五","周六"][d.getDay()];
              return (
                <div key={dayOffset} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", minWidth: 80 }}>
                    {dateStr.slice(5)} {weekday}
                  </span>
                  <input
                    type="number"
                    value={boxofficeInputs[dayOffset - 1] || ""}
                    onChange={(e) => {
                      const newInputs = [...boxofficeInputs];
                      newInputs[dayOffset - 1] = e.target.value;
                      setBoxofficeInputs(newInputs);
                    }}
                    placeholder="万元"
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      fontSize: 12,
                      width: 100,
                    }}
                  />
                </div>
              );
            })}
            <button
              onClick={submitBoxoffice}
              disabled={boxofficeSubmitting || boxofficeInputs.every(v => !v)}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: "#3b82f6",
                color: "white",
                border: "none",
                fontSize: 13,
                cursor: boxofficeSubmitting ? "not-allowed" : "pointer",
                opacity: boxofficeSubmitting || boxofficeInputs.every(v => !v) ? 0.5 : 1,
              }}
            >
              {boxofficeSubmitting ? "提交中..." : "更新预测"}
            </button>
            {boxofficeMessage && (
              <span style={{ fontSize: 12, color: boxofficeMessage.includes("✅") ? "#22c55e" : "#ef4444" }}>
                {boxofficeMessage}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
            <span>填入猫眼专业版预测的未来3天大盘票房（万元），系统会自动预测影院人次和票房</span>
            <button
              onClick={() => { const next = !showBatchImport; setShowBatchImport(next); if (next && batchRows.length === 0) initBatchRows(); }}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                background: "transparent",
                color: "#3b82f6",
                border: "1px solid #3b82f6",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {showBatchImport ? "收起" : "批量导入历史数据"}
            </button>
          </div>
          
          {showBatchImport && (
            <div style={{
              marginTop: 12,
              padding: 12,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}>
              <div style={{ fontSize: 12, color: "#374151", marginBottom: 4, fontWeight: 600 }}>
                导入历史大盘票房（万元）
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 8 }}>
                日期已自动填好，只需在右边填入每天的大盘票房（万元）
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f3f4f6", position: "sticky", top: 0 }}>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb", width: 120 }}>日期</th>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e5e7eb" }}>大盘票房（万元）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchRows.map((row, i) => (
                      <tr key={row.date} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                        <td style={{ padding: "4px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151", fontFamily: "monospace" }}>
                          {row.date}
                        </td>
                        <td style={{ padding: "4px 12px", borderBottom: "1px solid #f3f4f6" }}>
                          <input
                            type="number"
                            value={row.value}
                            onChange={(e) => {
                              const newRows = [...batchRows];
                              newRows[i] = { ...newRows[i], value: e.target.value };
                              setBatchRows(newRows);
                            }}
                            placeholder="如 12000"
                            style={{
                              width: "100%",
                              padding: "4px 8px",
                              border: "1px solid #d1d5db",
                              borderRadius: 4,
                              fontSize: 12,
                              outline: "none",
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={batchImport}
                  disabled={batchImporting}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 6,
                    background: "#10b981",
                    color: "white",
                    border: "none",
                    fontSize: 12,
                    cursor: batchImporting ? "not-allowed" : "pointer",
                    opacity: batchImporting ? 0.5 : 1,
                  }}
                >
                  {batchImporting ? "导入中..." : "开始导入"}
                </button>
                {batchMessage && (
                  <span style={{ fontSize: 12, color: batchMessage.includes("✅") ? "#22c55e" : "#ef4444" }}>
                    {batchMessage}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 加载/错误状态 */}
        {loading && !data && !error && (
          <DashboardStatePanel
            state="loading"
            title="正在生成收入预测"
            description="模型需要读取历史数据，首次加载可能较慢。"
            compact
            style={{ marginBottom: 16 }}
          />
        )}
        {error && (
          <DashboardStatePanel
            state="error"
            title="收入预测加载失败"
            description={error}
            onRetry={refresh}
            retryLabel="重新加载"
            compact
            style={{ marginBottom: 16 }}
          />
        )}

        {data && data.status === "ok" ? (
          <>
            {/* 外部数据概览 */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              {/* 天气 */}
              {weather && (
                <div
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: 10,
                    padding: 12,
                    border: "1px solid rgba(120,137,184,0.12)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>🌤️ 今日天气</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {weather.text} {weather.temp}°C
                  </div>
                  {weather.is_rainy && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>
                      ☔ 雨天：台球+15%，影院-5%
                    </div>
                  )}
                </div>
              )}
              
              {/* 猫眼大盘 */}
              {maoyan && (
                <div
                  style={{
                    flex: 2,
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: 10,
                    padding: 12,
                    border: "1px solid rgba(120,137,184,0.12)",
                  }}
                >
                  <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>🎬 猫眼实时大盘</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>在映影片</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {maoyan.movie_count}部
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>TOP1影片</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {maoyan.movies?.[0]?.name || "-"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>票房占比</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {(maoyan.movies?.[0]?.rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  {maoyan.movies && maoyan.movies.length > 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
                      热门：{maoyan.movies.slice(0, 5).map((m: any) => `${m.name}(${(m.rate * 100).toFixed(1)}%)`).join("、")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 总预测 */}
            <div className="metricGrid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <MetricCard
                label="未来3天预测总收入"
                value={formatMoney(data.summary?.total_3d_prediction || 0)}
                icon="📊"
                description={data.summary?.total_3d_range ? `区间：${formatRange(data.summary.total_3d_range.low, data.summary.total_3d_range.high)}` : undefined}
              />
              <MetricCard
                label="未来30天预测总收入"
                value={formatMoney(data.summary?.total_30d_prediction || 0)}
                icon="📈"
                description={data.summary?.total_30d_range ? `区间：${formatRange(data.summary.total_30d_range.low, data.summary.total_30d_range.high)}` : undefined}
              />
            </div>

            {/* 各业务预测卡片 */}
            {data.forecasts
              .filter(f => f.status === "ok")
              .sort((a, b) => {
                // 影院排最前面，然后台球、棋牌
                const order: Record<string, number> = { cinema: 0, billiards: 1, mahjong: 2 };
                return (order[a.key] ?? 99) - (order[b.key] ?? 99);
              })
              .map((forecast) => {
              const color = BIZ_COLORS[forecast.key] || "#3b82f6";
              const xgboostPreds = data.xgboost_predictions?.[forecast.key];
              
              return (
                <SectionCard
                  key={forecast.key}
                  title={`${BIZ_ICONS[forecast.key] || "📊"} ${forecast.business}`}
                >
                  {/* 趋势和置信度 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <StatusBadge status={(forecast.trend && TREND_STATUS[forecast.trend]) || "info"}>
                      {forecast.trend === "up" ? "↑" : forecast.trend === "down" ? "↓" : "→"} {forecast.trend_label}
                    </StatusBadge>
                    <StatusBadge status={CONFIDENCE_STATUS[forecast.confidence || "low"]}>
                      置信度: {CONFIDENCE_LABELS[forecast.confidence || "low"]} ({Math.round((forecast.confidence_score || 0) * 100)}%)
                    </StatusBadge>
                    <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>
                      基于{forecast.data_days}天历史数据
                    </span>
                  </div>

                  {/* 关键指标 */}
                  <div className="metricGrid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                    <div className="metricCard">
                      <div className="metricLabel">日均收入</div>
                      <div className="metricValue">{formatMoney(forecast.avg_daily_revenue || 0)}</div>
                    </div>
                    <div className="metricCard">
                      <div className="metricLabel">近7日均</div>
                      <div className="metricValue">{formatMoney(forecast.recent_7d_avg || 0)}</div>
                    </div>
                    <div className="metricCard">
                      <div className="metricLabel">波动率</div>
                      <div className="metricValue">{forecast.std_dev ? `±${formatMoney(forecast.std_dev)}` : "-"}</div>
                    </div>
                    <div className="metricCard">
                      <div className="metricLabel">最高日</div>
                      <div className="metricValue text-green-500">
                        {formatMoney(forecast.max_day?.revenue || 0)}
                      </div>
                      <div className="text-xs text-gray-500">{forecast.max_day?.date}</div>
                    </div>
                    <div className="metricCard">
                      <div className="metricLabel">30天预测</div>
                      <div className="metricValue" style={{ color }}>
                        {formatMoney(forecast.predictions_30d_total || 0)}
                      </div>
                      {forecast.predictions_30d_range && (
                        <div className="text-xs text-gray-500">
                          {formatRange(forecast.predictions_30d_range.low, forecast.predictions_30d_range.high)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 7天预测 */}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                      未来3天预测
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                      {(forecast.predictions_3d || []).map((pred, i) => (
                        <DayPredictionCard key={i} pred={pred} color={color} />
                      ))}
                    </div>
                  </div>

                  {/* XGBoost预测（如果有） */}
                  {xgboostPreds && xgboostPreds.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#8b5cf6", marginBottom: 8 }}>
                        🤖 XGBoost 预测（10天）
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                        {xgboostPreds.slice(0, 10).map((pred, i) => (
                          <DayPredictionCard key={i} pred={pred} color="#8b5cf6" />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3天置信区间总览 */}
                  {forecast.predictions_3d && forecast.predictions_3d.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                        3天置信区间
                      </div>
                      <ConfidenceRange
                        low={forecast.predictions_3d.reduce((sum, p) => sum + p.range_low, 0)}
                        high={forecast.predictions_3d.reduce((sum, p) => sum + p.range_high, 0)}
                        predicted={forecast.predictions_3d.reduce((sum, p) => sum + p.predicted, 0)}
                        color={color}
                      />
                    </div>
                  )}

                  {/* 今日影响因子 */}
                  {forecast.predictions_3d && forecast.predictions_3d[0] && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                        明日影响因子
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <FactorTag
                          icon={HOLIDAY_TYPE_ICONS[forecast.predictions_3d[0].factors.holiday_type] || "📅"}
                          label={HOLIDAY_TYPE_LABELS[forecast.predictions_3d[0].factors.holiday_type] || ""}
                          value=""
                          boost={forecast.predictions_3d[0].factors.holiday_boost}
                        />
                        {forecast.predictions_3d[0].factors.weather_text && (
                          <FactorTag
                            icon={forecast.predictions_3d[0].factors.weather_boost > 1 ? "☔" : "🌤️"}
                            label={forecast.predictions_3d[0].factors.weather_text}
                            value={`${forecast.predictions_3d[0].factors.weather_temp}°C`}
                            boost={forecast.predictions_3d[0].factors.weather_boost}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* 星期模式 */}
                  {forecast.weekday_averages && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                        星期收入分布
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                        {Object.entries(forecast.weekday_averages).map(([day, avg]) => {
                          const maxAvg = Math.max(...Object.values(forecast.weekday_averages || {}));
                          const pct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
                          return (
                            <div key={day} style={{ textAlign: "center" }}>
                              <div style={{ height: 64, display: "flex", alignItems: "flex-end", justifyContent: "center", marginBottom: 4 }}>
                                <div
                                  style={{
                                    width: 24,
                                    height: `${Math.max(pct, 5)}%`,
                                    borderRadius: "4px 4px 0 0",
                                    background: `linear-gradient(to top, ${color}80, ${color})`,
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>{day}</div>
                              <div style={{ fontSize: 10, color: "#9ca3af" }}>{formatMoney(avg)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </SectionCard>
              );
            })}
          </>
        ) : data && data.status !== "ok" ? (
          <EmptyState
            icon="📈"
            title="暂无足够历史数据"
            description="请先导入更多天的数据，再生成收入预测。"
          />
        ) : !loading && !error ? (
          <EmptyState
            icon="📈"
            title="暂无预测结果"
            description="当前没有可展示的收入预测。"
          />
        ) : null}
      </AppShell>
    </>
  );
}
