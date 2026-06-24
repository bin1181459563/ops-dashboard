import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, unwrapApiArray, unwrapApiObject } from "../../lib/apiEnvelope";
import { generateBusinessAlerts } from "../../lib/businessAlertRules";
import { toOverviewBusinessSummaries } from "../../lib/businessAdapters";
import { fetchOverview } from "../../lib/dashboardApi";
import { fetchAiAnomalies } from "../../lib/dashboardApi";

interface AnomalyItem {
  id?: string;
  business_line: string;
  metric: string;
  current_value: number;
  baseline_value: number;
  change_rate: number;
  direction: "positive" | "negative";
  confidence: number;
  ai_suggestion: string;
  detected_at: string;
  severity?: "high" | "medium" | "low";
}

interface AnomaliesResponse {
  generated_at: string;
  anomalies: AnomalyItem[];
  summary?: {
    total: number;
    positive: number;
    negative: number;
  };
}

const SEVERITY_STYLES: Record<string, { bg: string; badge: string; border: string }> = {
  high: { bg: "bg-red-900/30", badge: "bg-red-600", border: "border-red-700" },
  medium: { bg: "bg-yellow-900/30", badge: "bg-yellow-600", border: "border-yellow-700" },
  low: { bg: "bg-blue-900/30", badge: "bg-blue-600", border: "border-blue-700" },
};

export default function AlertsPage() {
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [businessAlerts, setBusinessAlerts] = useState<ReturnType<typeof generateBusinessAlerts>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [anomaliesRes, overviewRes] = await Promise.allSettled([fetchAiAnomalies(), fetchOverview()] as const);
      const res = anomaliesRes.status === "fulfilled" ? anomaliesRes.value : undefined;
      const overview = overviewRes.status === "fulfilled" ? overviewRes.value.data : undefined;
      if (!res) throw new Error(anomaliesRes.status === "rejected" ? String(anomaliesRes.reason) : "获取预警失败");
      const payload = unwrapApiObject(res, { anomalies: [] as unknown[] });
      const items = unwrapApiArray<unknown>(payload.anomalies);
      setData({
        generated_at: res.time,
        anomalies: items.map(normalizeAnomaly),
        summary: { total: items.length, positive: items.filter((x) => isRecord(x) && x.direction === "positive").length, negative: items.filter((x) => isRecord(x) && x.direction === "negative").length },
      });
      setBusinessAlerts(generateBusinessAlerts(overview ? toOverviewBusinessSummaries(overview) : []).slice(0, 5));
    } catch (e: any) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = data?.anomalies?.filter((a) => {
    if (filter === "all") return true;
    return a.direction === filter;
  }) || [];

  // Sort: negative first (more urgent), then by confidence desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "negative" ? -1 : 1;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const formatRate = (v: number) => {
    const pct = (v * 100).toFixed(1);
    return v >= 0 ? `+${pct}%` : `${pct}%`;
  };

  const formatValue = (v: number) => {
    if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return v.toLocaleString("zh-CN");
  };

  return (
    <>
      <Head>
        <title>AI 预警 · Ops Dashboard</title>
      </Head>
      <main className="min-h-screen bg-gray-900 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-blue-400 hover:underline text-sm">← 返回主页</Link>
            <h1 className="text-2xl font-bold mt-2">🔔 AI 异常预警</h1>
            <p className="text-gray-400 text-sm mt-1">
              基于 AI 分析的业务异常检测
              {data?.generated_at && (
                <span className="ml-2">· 分析时间 {new Date(data.generated_at).toLocaleString("zh-CN")}</span>
              )}
            </p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
            🔄 刷新
          </button>
        </div>

        {/* Summary */}
        {data?.summary && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold">{data.summary.total}</div>
              <div className="text-gray-400 text-sm">异常总数</div>
            </div>
            <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-800">
              <div className="text-3xl font-bold text-green-400">{data.summary.positive}</div>
              <div className="text-gray-400 text-sm">📈 正向异常（增长）</div>
            </div>
            <div className="bg-red-900/30 rounded-xl p-4 text-center border border-red-800">
              <div className="text-3xl font-bold text-red-400">{data.summary.negative}</div>
              <div className="text-gray-400 text-sm">📉 负向异常（下降）</div>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(["all", "negative", "positive"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}>
              {f === "all" ? "全部" : f === "negative" ? "📉 负向异常" : "📈 正向异常"}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && <div className="text-center text-gray-400 py-20">加载中…</div>}
        {error && <div className="text-center text-red-400 py-20">{error}</div>}

        {!loading && !error && businessAlerts.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {businessAlerts.map((item) => (
              <div key={`${item.businessType}-${item.id}`} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <strong className="text-white">{item.title}</strong>
                  <span className={`text-xs px-2 py-0.5 rounded text-white ${item.level === "danger" ? "bg-red-600" : item.level === "warning" ? "bg-yellow-600" : "bg-blue-600"}`}>
                    {item.level === "danger" ? "高" : item.level === "warning" ? "中" : "低"}
                  </span>
                </div>
                <p className="text-sm text-gray-300">{item.businessName} · {item.message}</p>
                <p className="text-xs text-blue-300 mt-2">{item.suggestion}</p>
              </div>
            ))}
          </div>
        )}

        {/* Anomaly Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {sorted.map((item, idx) => {
            const severity = item.severity || (Math.abs(item.change_rate) > 0.5 ? "high" : Math.abs(item.change_rate) > 0.2 ? "medium" : "low");
            const style = SEVERITY_STYLES[severity];
            const isNegative = item.direction === "negative";

            return (
              <div key={item.id || idx} className={`rounded-xl shadow-lg p-6 border ${style.border} ${style.bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{isNegative ? "📉" : "📈"}</span>
                    <div>
                      <h2 className="text-lg font-semibold">{item.metric}</h2>
                      <p className="text-gray-400 text-xs">{item.business_line}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${style.badge}`}>
                      {severity === "high" ? "高" : severity === "medium" ? "中" : "低"}
                    </span>
                    {item.confidence > 0 && (
                      <span className="text-xs text-gray-400">
                        置信度 {(item.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">当前值</div>
                    <div className="text-xl font-bold">{formatValue(item.current_value)}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">基准值</div>
                    <div className="text-xl font-bold text-gray-300">{formatValue(item.baseline_value)}</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">变化率</div>
                    <div className={`text-xl font-bold ${isNegative ? "text-red-400" : "text-green-400"}`}>
                      {formatRate(item.change_rate)}
                    </div>
                  </div>
                </div>

                {/* AI Suggestion */}
                {item.ai_suggestion && (
                  <div className="p-3 bg-gray-800/60 rounded-lg">
                    <div className="text-blue-400 text-xs font-semibold mb-1">🤖 AI 建议</div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{item.ai_suggestion}</p>
                  </div>
                )}

                {/* Detected time */}
                {item.detected_at && (
                  <p className="text-gray-500 text-xs mt-3">
                    检测时间：{new Date(item.detected_at).toLocaleString("zh-CN")}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {!loading && sorted.length === 0 && businessAlerts.length === 0 && (
          <div className="text-center text-gray-500 py-20">暂无异常数据</div>
        )}
      </main>
    </>
  );
}

function normalizeAnomaly(value: unknown): AnomalyItem {
  const item = isRecord(value) ? value : {};
  return {
    id: stringValue(item.id),
    business_line: stringValue(item.business_type, item.business_line),
    metric: stringValue(item.title, item.metric),
    current_value: numberValue(item.current_value),
    baseline_value: numberValue(item.baseline_value),
    change_rate: numberValue(item.change_rate),
    direction: item.direction === "positive" ? "positive" : "negative",
    confidence: numberValue(item.confidence),
    ai_suggestion: stringValue(item.ai_suggestion),
    detected_at: stringValue(item.detected_at),
    severity: item.severity === "high" || item.severity === "medium" || item.severity === "low" ? item.severity : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}
