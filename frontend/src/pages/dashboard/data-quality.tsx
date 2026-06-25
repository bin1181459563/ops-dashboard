/**
 * 数据质量页面
 * 显示各数据源的健康状态、新鲜度与建议
 * 使用统一样式系统（浅色主题）
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, unwrapApiArray, unwrapApiObject } from "../../lib/apiEnvelope";
import { toBilliardsSummary, toCinemaSummary, toMahjongSummary } from "../../lib/businessAdapters";
import { fetchCollectHistory, fetchDataQuality, runCollect } from "../../lib/dashboardApi";
import type { CollectPlatformResult } from "../../types/dashboard";
import {
  AppShell,
  PageHeader,
  MetricCard,
  SectionCard,
  StatusBadge,
  EmptyState,
} from "../../components/dashboard";

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

/** 状态映射到 StatusBadge 状态 */
const STATUS_MAP: Record<string, "success" | "warning" | "error"> = {
  ok: "success",
  warning: "warning",
  error: "error",
};

/** 状态中文标签 */
const STATUS_LABELS: Record<string, string> = {
  ok: "✅ 正常",
  warning: "⚠️ 警告",
  error: "❌ 异常",
};

/** 新鲜度映射到颜色 */
const FRESHNESS_COLORS: Record<string, string> = {
  fresh: "text-green-500",
  delayed: "text-yellow-500",
  stale: "text-red-500",
};

/** 新鲜度中文标签 */
const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "新鲜",
  delayed: "延迟",
  stale: "过期",
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
        <title>数据可信度 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/data-quality">
        {/* 页面头部 */}
        <PageHeader
          title="📊 数据可信度报告"
          description="各数据源的健康状态、新鲜度与建议"
          actions={
            <>
              <button onClick={refresh} disabled={loading} className="btn btnSecondary">
                🔄 刷新
              </button>
              <button onClick={runManualCollect} disabled={collecting} className="btn btnPrimary">
                {collecting ? "采集中..." : "手动采集"}
              </button>
            </>
          }
        />

        {/* 加载/错误状态 */}
        {loading && <div className="loadingState">加载中…</div>}
        {error && <div className="errorState"><div className="errorIcon">⚠️</div><div className="errorTitle">{error}</div></div>}

        {/* 统计卡片 */}
        {report?.summary && (
          <div className="metricGrid">
            <MetricCard
              label="数据源总数"
              value={report.summary.total_sources}
              icon="📊"
            />
            <MetricCard
              label="正常"
              value={report.summary.ok}
              trendDirection="positive"
            />
            <MetricCard
              label="警告"
              value={report.summary.warning}
              trendDirection="neutral"
            />
            <MetricCard
              label="异常"
              value={report.summary.error}
              trendDirection="negative"
            />
          </div>
        )}

        {/* 报告时间 */}
        {report?.generated_at && (
          <p className="text-xs text-gray-500 mb-4">报告生成时间：{new Date(report.generated_at).toLocaleString("zh-CN")}</p>
        )}

        {/* 最近采集结果 */}
        {collectResults.length > 0 && (
          <SectionCard
            title="最近一次手动采集结果"
            subtitle={collectUpdatedAt ? `更新时间：${new Date(collectUpdatedAt).toLocaleString("zh-CN")}` : "刚刚更新"}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {collectResults.map((item) => (
                <div key={item.platform} className="actionCard">
                  <div className="actionIcon">
                    {item.platform === "xiaotie" ? "🎱" : item.platform === "wu_laoban" ? "🀄" : "🛒"}
                  </div>
                  <div className="actionContent">
                    <div className="actionTitle">{platformLabel(item.platform)}</div>
                    <div className="actionDesc">
                      <div>耗时：{item.duration_ms} ms</div>
                      <div>记录数：{item.records_count}</div>
                      <div>重试：{item.retried ? `是（${item.retry_count} 次）` : "否"}</div>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">{item.message || "—"}</p>
                  </div>
                  <StatusBadge status={item.status === "success" ? "success" : item.status === "skipped" ? "warning" : "error"}>
                    {collectStatusLabel(item.status)}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 数据源卡片 */}
        {report?.sources && report.sources.length > 0 ? (
          <SectionCard title="数据源详情" subtitle={`共 ${report.sources.length} 个数据源`}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {report.sources.map((src, idx) => {
                const status = STATUS_MAP[src.status] || "error";
                const freshness = src.freshness || "stale";

                return (
                  <div key={idx} className="sectionCard">
                    <div className="sectionHeader">
                      <div className="sectionTitle">{src.name}</div>
                      <StatusBadge status={status}>
                        {STATUS_LABELS[src.status]}
                      </StatusBadge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">业务类型</span>
                        <span>{src.business_type}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">最后更新</span>
                        <span>{src.last_update ? new Date(src.last_update).toLocaleString("zh-CN") : "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">数据新鲜度</span>
                        <span className={FRESHNESS_COLORS[freshness]}>{FRESHNESS_LABELS[freshness]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">数据范围</span>
                        <span>{src.data_range || "—"}</span>
                      </div>

                      {/* 警告 */}
                      {src.warnings?.length > 0 && (
                        <div className="mt-3 p-3 bg-yellow-50 rounded-lg">
                          <div className="text-yellow-600 text-xs font-semibold mb-1">⚠️ 警告</div>
                          {src.warnings.map((w, i) => (
                            <p key={i} className="text-yellow-700 text-xs">{w}</p>
                          ))}
                        </div>
                      )}

                      {/* 建议 */}
                      {src.suggestions?.length > 0 && (
                        <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                          <div className="text-blue-600 text-xs font-semibold mb-1">💡 建议</div>
                          {src.suggestions.map((s, i) => (
                            <p key={i} className="text-blue-700 text-xs">{s}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ) : (
          !loading && !error && (
            <EmptyState
              icon="📊"
              title="暂无数据源"
              description="请先配置数据源"
            />
          )
        )}
      </AppShell>
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
