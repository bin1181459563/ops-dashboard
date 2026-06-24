export type Platform = "xiaotie" | "wu_laoban" | "cinema" | "fenghuang";
export type DataSource = "api" | "mock" | "mixed" | "none" | "excel";

export interface ApiEnvelope<T> {
  data: T;
  time: string;
  source: DataSource;
}

export interface CollectPlatformResult {
  platform: "xiaotie" | "wu_laoban" | "qgcloud";
  business_type: "billiards" | "mahjong" | "vending";
  status: "success" | "skipped" | "failed" | "token_invalid" | string;
  message: string;
  duration_ms: number;
  retried: boolean;
  retry_count: number;
  records_count: number;
}

export interface CollectRunResult {
  status: string;
  source: DataSource;
  metrics: PlatformMetric[];
  excluded_platforms: Array<{ platform: string; status: string; reason: string }>;
  platform_results: CollectPlatformResult[];
}

export interface CollectHistoryRun {
  id: number;
  status: string;
  source: DataSource;
  metrics_count: number;
  excluded_count: number;
  created_at: string;
  platform_results: CollectPlatformResult[];
}

export interface PlatformMetric {
  platform: Exclude<Platform, "cinema">;
  store_id: string;
  revenue: number;
  orders: number;
  usage_rate: number;
  time: string;
  source?: DataSource;
}

export interface CinemaOverview {
  status: "ok" | "not_imported" | "no_data" | "error";
  data_source: "excel";
  date: string | null;
  revenue: number;
  box_office: number;
  concession_revenue: number;
  customer_count: number;
  screenings: number;
  occupancy_rate: number;
  avg_order_value: number;
  last_import_time: string | null;
  message: string;
}

export interface AlertItem {
  platform: Exclude<Platform, "cinema">;
  store_id: string;
  alert_type: "low_usage" | "usage_low" | "usage_drop" | "revenue_drop" | "token_invalid" | "sync_failed" | "stale_data";
  message: string;
  level: "info" | "warning" | "critical";
  time: string;
}

export interface SourceStatusItem {
  status: "ok" | "token_invalid" | "sync_failed" | "not_connected" | "placeholder" | "skipped" | "failed" | "not_imported" | "error";
  data_source: "api" | "mock" | "placeholder" | "excel";
  last_sync_time: string | null;
  message: string;
  token_status?: "valid" | "invalid";
  error_reason?: string | null;
}

export interface OverviewData {
  store_id: string;
  total_revenue: number;
  total_orders?: number;
  included_platforms?: string[];
  excluded_platforms?: string[];
  source_status?: Record<string, SourceStatusItem>;
  last_sync_time?: string | null;
  platforms: Record<string, Partial<PlatformMetric>>;
  cinema: CinemaOverview;
  alerts: AlertItem[];
}

export interface DataSourcePlatformStatus extends SourceStatusItem {
  platform: "wu_laoban" | "xiaotie" | "fenghuang";
  business_type: "mahjong" | "billiards" | "cinema";
}

export interface DataSourcesStatus {
  platforms: DataSourcePlatformStatus[];
}

export interface DailyReport {
  report: string;
  source: "rule_template";
  snapshots_count: number;
}

export interface OrderSnapshot {
  platform: Exclude<Platform, "cinema">;
  business_type: "billiards" | "mahjong";
  title: string;
  amount: number;
  status: string;
  time: string;
  source: "api";
  detail: string;
}

export interface MockDashboardPayload {
  overview: ApiEnvelope<OverviewData>;
  revenue: ApiEnvelope<Array<Pick<PlatformMetric, "platform" | "store_id" | "revenue" | "time" | "source">>>;
  orders: ApiEnvelope<Array<Pick<PlatformMetric, "platform" | "store_id" | "orders" | "time" | "source">>>;
  usage: ApiEnvelope<Array<Pick<PlatformMetric, "platform" | "store_id" | "usage_rate" | "time" | "source">>>;
  alerts: ApiEnvelope<AlertItem[]>;
  orderSnapshots?: ApiEnvelope<OrderSnapshot[]>;
}

export interface DashboardState {
  overview?: ApiEnvelope<OverviewData>;
  revenue?: MockDashboardPayload["revenue"];
  orders?: MockDashboardPayload["orders"];
  usage?: MockDashboardPayload["usage"];
  alerts?: MockDashboardPayload["alerts"];
  orderSnapshots?: ApiEnvelope<OrderSnapshot[]>;
  dataSources?: ApiEnvelope<DataSourcesStatus>;
  dailyReport?: ApiEnvelope<DailyReport>;
  dataQuality?: ApiEnvelope<DataQualitySummary>;
  aiAnomalies?: ApiEnvelope<AiAnomaly[]>;
}
export interface DataSourceQuality {
  name: string;
  platform: string;
  business_type: string;
  data_source: string;
  status: "normal" | "warning" | "error";
  status_label: string;
  freshness: "fresh" | "delayed" | "stale" | "pending";
  freshness_label: string;
  freshness_note?: string;
  last_update: string | null;
  last_updated: string | null;  // 兼容旧字段
  minutes_ago: number | null;
  snapshot_date: string | null;
  token_valid: boolean;
  token_error: string | null;
  sync_status: string | null;
  sync_message: string | null;
  snapshot?: {
    revenue: number;
    orders: number;
    usage_rate: number;
    customer_count: number;
  };
  message?: string;  // 兼容旧字段
}

export interface DataQualitySummary {
  sources: DataSourceQuality[];
  overall_status: "normal" | "warning" | "error";
}

export interface AiAnomaly {
  id: string;
  platform: string;
  business_type: string;
  title: string;
  change_rate: number;
  direction: "positive" | "negative";
  confidence: number;
  detected_at: string;
  severity: "high" | "medium" | "low";
}
