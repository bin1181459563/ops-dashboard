/**
 * AI 预警页面
 * 显示 AI 分析的业务异常检测结果
 * 使用统一样式系统（浅色主题）
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage, unwrapApiArray, unwrapApiObject } from "../../lib/apiEnvelope";
import { generateBusinessAlerts } from "../../lib/businessAlertRules";
import { toOverviewBusinessSummaries } from "../../lib/businessAdapters";
import { fetchOverview } from "../../lib/dashboardApi";
import { fetchAiAnomalies } from "../../lib/dashboardApi";
import {
  AppShell,
  PageHeader,
  MetricCard,
  CapsuleGroup,
  SectionCard,
  StatusBadge,
  EmptyState,
} from "../../components/dashboard";

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

/** 严重程度映射到状态 */
const SEVERITY_STATUS: Record<string, "error" | "warning" | "info"> = {
  high: "error",
  medium: "warning",
  low: "info",
};

/** 严重程度中文标签 */
const SEVERITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/** 筛选选项 */
const FILTER_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "negative", label: "📉 负向异常" },
  { value: "positive", label: "📈 正向异常" },
];

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

  // 排序：负向优先（更紧急），然后按置信度降序
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
        <title>AI 预警 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/alerts">
        {/* 页面头部 */}
        <PageHeader
          title="🔔 AI 异常预警"
          description={`基于 AI 分析的业务异常检测${data?.generated_at ? ` · 分析时间 ${new Date(data.generated_at).toLocaleString("zh-CN")}` : ""}`}
          actions={
            <button onClick={refresh} disabled={loading} className="btn btnSecondary">
              🔄 刷新
            </button>
          }
        />

        {/* 统计卡片 */}
        {data?.summary && (
          <div className="metricGrid">
            <MetricCard
              label="异常总数"
              value={data.summary.total}
              icon="🔔"
            />
            <MetricCard
              label="📈 正向异常（增长）"
              value={data.summary.positive}
              trendDirection="positive"
            />
            <MetricCard
              label="📉 负向异常（下降）"
              value={data.summary.negative}
              trendDirection="negative"
            />
          </div>
        )}

        {/* 筛选按钮 */}
        <CapsuleGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
        />

        {/* 加载/错误状态 */}
        {loading && <div className="loadingState">加载中…</div>}
        {error && <div className="errorState"><div className="errorIcon">⚠️</div><div className="errorTitle">{error}</div></div>}

        {/* 业务预警列表 */}
        {!loading && !error && businessAlerts.length > 0 && (
          <SectionCard title="业务预警" subtitle="基于经营数据的智能预警">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {businessAlerts.map((item) => (
                <div key={`${item.businessType}-${item.id}`} className="actionCard">
                  <div className="actionIcon">
                    {item.level === "danger" ? "🚨" : item.level === "warning" ? "⚠️" : "ℹ️"}
                  </div>
                  <div className="actionContent">
                    <div className="actionTitle">{item.title}</div>
                    <p className="actionDesc">{item.businessName} · {item.message}</p>
                    <p className="text-xs text-blue-600 mt-2">{item.suggestion}</p>
                  </div>
                  <StatusBadge status={item.level === "danger" ? "error" : item.level === "warning" ? "warning" : "info"}>
                    {item.level === "danger" ? "高" : item.level === "warning" ? "中" : "低"}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 异常卡片列表 */}
        {!loading && !error && sorted.length > 0 && (
          <SectionCard title="异常详情" subtitle={`共 ${sorted.length} 条异常`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {sorted.map((item, idx) => {
                const severity = item.severity || (Math.abs(item.change_rate) > 0.5 ? "high" : Math.abs(item.change_rate) > 0.2 ? "medium" : "low");
                const status = SEVERITY_STATUS[severity];
                const isNegative = item.direction === "negative";

                return (
                  <div key={item.id || idx} className="sectionCard">
                    <div className="sectionHeader">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{isNegative ? "📉" : "📈"}</span>
                        <div>
                          <div className="sectionTitle">{item.metric}</div>
                          <div className="sectionSubtitle">{item.business_line}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status}>
                          {SEVERITY_LABELS[severity]}
                        </StatusBadge>
                        {item.confidence > 0 && (
                          <span className="text-xs text-gray-500">
                            置信度 {(item.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="metricGrid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                      <div className="metricCard">
                        <div className="metricLabel">当前值</div>
                        <div className="metricValue">{formatValue(item.current_value)}</div>
                      </div>
                      <div className="metricCard">
                        <div className="metricLabel">基准值</div>
                        <div className="metricValue">{formatValue(item.baseline_value)}</div>
                      </div>
                      <div className="metricCard">
                        <div className="metricLabel">变化率</div>
                        <div className={`metricValue ${isNegative ? "text-red-500" : "text-green-500"}`}>
                          {formatRate(item.change_rate)}
                        </div>
                      </div>
                    </div>

                    {/* AI 建议 */}
                    {item.ai_suggestion && (
                      <div className="actionCard mt-4">
                        <div className="actionIcon">🤖</div>
                        <div className="actionContent">
                          <div className="actionTitle">AI 建议</div>
                          <p className="actionDesc whitespace-pre-wrap">{item.ai_suggestion}</p>
                        </div>
                      </div>
                    )}

                    {/* 检测时间 */}
                    {item.detected_at && (
                      <p className="text-xs text-gray-500 mt-3">
                        检测时间：{new Date(item.detected_at).toLocaleString("zh-CN")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* 空状态 */}
        {!loading && sorted.length === 0 && businessAlerts.length === 0 && (
          <EmptyState
            icon="✅"
            title="暂无异常数据"
            description="所有业务指标正常运行"
          />
        )}
      </AppShell>
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
