import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, unwrapApiArray, unwrapApiObject } from "../../lib/apiEnvelope";
import { toBilliardsSummary, toCinemaSummary, toMahjongSummary } from "../../lib/businessAdapters";
import { fetchCollectHistory, fetchDataQuality, runCollect } from "../../lib/dashboardApi";
import type { CollectPlatformResult } from "../../types/dashboard";

interface DataSourceQuality {
  name: string;
  business_type: string;
  last_update: string;
  status: "ok" | "warning" | "error";
  freshness: "fresh" | "delayed" | "stale";
  data_range: string;
  warnings: string[];
  suggestions: string[];
  metrics?: Record<string, number | string>;
}

interface DataQualityReport {
  generated_at: string;
  overall_status: "ok" | "warning" | "error";
  sources: DataSourceQuality[];
  summary: {
    total_sources: number;
    ok: number;
    warning: number;
    error: number;
  };
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  ok: { bg: "bg-green-900/40", text: "text-green-400", border: "border-green-700", label: "✅ 正常" },
  warning: { bg: "bg-yellow-900/40", text: "text-yellow-400", border: "border-yellow-700", label: "⚠️ 警告" },
  error: { bg: "bg-red-900/40", text: "text-red-400", border: "border-red-700", label: "❌ 异常" },
};

const FRESHNESS_MAP: Record<string, { color: string; label: string }> = {
  fresh: { color: "text-green-400", label: "新鲜" },
  delayed: { color: "text-yellow-400", label: "延迟" },
  stale: { color: "text-red-400", label: "过期" },
};

type UnknownRecord = Record<string, unknown>;

export default function DataQualityPage() {
  const [report, setReport] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [collectResults, setCollectResults] = useState<CollectPlatformResult[]>([]);
  const [collectUpdatedAt, setCollectUpdatedAt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [res, history] = await Promise.all([
        fetchDataQuality(),
        fetchCollectHistory(1).catch(() => null),
      ]);
      const payload = unwrapApiObject(res, { sources: [], overall_status: "error" as const });
      const sources = unwrapApiArray<unknown>(payload.sources).map(normalizeSourceQuality);
      const latestRun = history?.data?.[0];
      setReport({
        generated_at: typeof (res as { time?: unknown }).time === "string" ? (res as { time: string }).time : new Date().toISOString(),
        overall_status: statusValue(payload.overall_status),
        sources,
        summary: {
          total_sources: sources.length,
          ok: sources.filter((src) => src.status === "ok").length,
          warning: sources.filter((src) => src.status === "warning").length,
          error: sources.filter((src) => src.status === "error").length,
        },
      });
      if (latestRun) {
        setCollectResults(unwrapApiArray<CollectPlatformResult>(latestRun.platform_results));
        setCollectUpdatedAt(latestRun.created_at);
      }
    } catch (e: any) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runManualCollect = useCallback(async () => {
    if (collecting) return;
    setCollecting(true);
    try {
      const result = await runCollect();
      setCollectResults(unwrapApiArray<CollectPlatformResult>(result.data.platform_results));
      setCollectUpdatedAt(result.time);
      await refresh();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e));
    } finally {
      setCollecting(false);
    }
  }, [collecting, refresh]);

  return (
    <>
      <Head>
        <title>数据可信度 · Ops Dashboard</title>
      </Head>
      <main className="min-h-screen bg-gray-900 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-blue-400 hover:underline text-sm">← 返回主页</Link>
            <h1 className="text-2xl font-bold mt-2">📊 数据可信度报告</h1>
            <p className="text-gray-400 text-sm mt-1">各数据源的健康状态、新鲜度与建议</p>
          </div>
          <div className="flex gap-2">
            <button onClick={refresh} disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
              🔄 刷新
            </button>
            <button onClick={runManualCollect} disabled={collecting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm disabled:opacity-50">
              {collecting ? "采集中..." : "手动采集"}
            </button>
          </div>
        </div>

        {/* Loading / Error */}
        {loading && <div className="text-center text-gray-400 py-20">加载中…</div>}
        {error && <div className="text-center text-red-400 py-20">{error}</div>}

        {/* Summary Bar */}
        {report?.summary && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold">{report.summary.total_sources}</div>
              <div className="text-gray-400 text-sm">数据源总数</div>
            </div>
            <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-800">
              <div className="text-3xl font-bold text-green-400">{report.summary.ok}</div>
              <div className="text-gray-400 text-sm">正常</div>
            </div>
            <div className="bg-yellow-900/30 rounded-xl p-4 text-center border border-yellow-800">
              <div className="text-3xl font-bold text-yellow-400">{report.summary.warning}</div>
              <div className="text-gray-400 text-sm">警告</div>
            </div>
            <div className="bg-red-900/30 rounded-xl p-4 text-center border border-red-800">
              <div className="text-3xl font-bold text-red-400">{report.summary.error}</div>
              <div className="text-gray-400 text-sm">异常</div>
            </div>
          </div>
        )}

        {/* Report time */}
        {report?.generated_at && (
          <p className="text-gray-500 text-xs mb-4">报告生成时间：{new Date(report.generated_at).toLocaleString("zh-CN")}</p>
        )}

        {collectResults.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">最近一次手动采集结果</h2>
                <p className="text-gray-400 text-xs mt-1">
                  {collectUpdatedAt ? `更新时间：${new Date(collectUpdatedAt).toLocaleString("zh-CN")}` : "刚刚更新"}
                </p>
              </div>
              <span className="text-xs text-gray-500">显示每个平台的状态、耗时和重试情况</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {collectResults.map((item) => (
                <div key={item.platform} className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <strong>{platformLabel(item.platform)}</strong>
                    <span className={collectStatusColor(item.status)}>{collectStatusLabel(item.status)}</span>
                  </div>
                  <div className="space-y-1 text-sm text-gray-300">
                    <div>耗时：{item.duration_ms} ms</div>
                    <div>记录数：{item.records_count}</div>
                    <div>重试：{item.retried ? `是（${item.retry_count} 次）` : "否"}</div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">{item.message || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Source Cards */}
        {report?.sources && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {report.sources.map((src, idx) => {
              const sc = STATUS_COLORS[src.status] || STATUS_COLORS.ok;
              const freshness = FRESHNESS_MAP[src.freshness] || FRESHNESS_MAP.stale;
              return (
                <div key={idx} className={`rounded-xl shadow-lg p-6 border ${sc.border} ${sc.bg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">{src.name}</h2>
                    <span className={`text-sm font-medium ${sc.text}`}>{sc.label}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">业务类型</span>
                      <span>{src.business_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">最后更新</span>
                      <span>{src.last_update ? new Date(src.last_update).toLocaleString("zh-CN") : "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">数据新鲜度</span>
                      <span className={freshness.color}>{freshness.label}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">数据范围</span>
                      <span>{src.data_range || "—"}</span>
                    </div>

                    {/* Warnings */}
                    {src.warnings?.length > 0 && (
                      <div className="mt-3 p-3 bg-yellow-900/20 rounded-lg">
                        <div className="text-yellow-400 text-xs font-semibold mb-1">⚠️ 警告</div>
                        {src.warnings.map((w, i) => (
                          <p key={i} className="text-yellow-300/80 text-xs">{w}</p>
                        ))}
                      </div>
                    )}

                    {/* Suggestions */}
                    {src.suggestions?.length > 0 && (
                      <div className="mt-2 p-3 bg-blue-900/20 rounded-lg">
                        <div className="text-blue-400 text-xs font-semibold mb-1">💡 建议</div>
                        {src.suggestions.map((s, i) => (
                          <p key={i} className="text-blue-300/80 text-xs">{s}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function normalizeSourceQuality(src: unknown): DataSourceQuality {
  const record = isRecord(src) ? src : {};
  const businessType = textValue(record.business_type);
  const snapshot = isRecord(record.snapshot) ? record.snapshot : {};
  const summary =
    businessType === "cinema"
      ? toCinemaSummary({ status: "ok", ...snapshot })
      : businessType === "billiards"
        ? toBilliardsSummary({ status: "ok", ...snapshot })
        : businessType === "mahjong"
          ? toMahjongSummary({ status: "ok", ...snapshot })
          : null;
  const metrics = isMetrics(record.metrics)
    ? record.metrics
    : summary
      ? {
        revenue: summary.revenue,
        orders: summary.orders,
        usage_rate: summary.utilizationRate ?? 0,
        customer_count: summary.customers,
      }
      : undefined;

  return {
    name: textValue(record.name),
    business_type: businessType,
    last_update: textValue(record.last_update, record.last_updated),
    status: statusValue(record.status),
    freshness: freshnessValue(record.freshness),
    data_range: textValue(record.data_range, record.snapshot_date),
    warnings: unwrapApiArray<string>(record.warnings),
    suggestions: unwrapApiArray<string>(record.suggestions),
    metrics,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetrics(value: unknown): value is Record<string, number | string> {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => typeof item === "number" || typeof item === "string");
}

function textValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function statusValue(value: unknown): DataSourceQuality["status"] {
  if (value === "ok" || value === "warning" || value === "error") return value;
  if (value === "normal") return "ok";
  return "error";
}

function freshnessValue(value: unknown): DataSourceQuality["freshness"] {
  if (value === "fresh" || value === "delayed" || value === "stale") return value;
  return "stale";
}

function platformLabel(platform: CollectPlatformResult["platform"]): string {
  return {
    xiaotie: "台球",
    wu_laoban: "棋牌",
    qgcloud: "轻购云",
  }[platform];
}

function collectStatusLabel(status: CollectPlatformResult["status"]): string {
  if (status === "success") return "成功";
  if (status === "skipped") return "跳过";
  if (status === "token_invalid") return "Token失效";
  if (status === "failed") return "失败";
  return status;
}

function collectStatusColor(status: CollectPlatformResult["status"]): string {
  if (status === "success") return "text-green-400";
  if (status === "skipped") return "text-yellow-400";
  if (status === "token_invalid" || status === "failed") return "text-red-400";
  return "text-gray-300";
}
