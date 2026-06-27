import axios from "axios";
import { unwrapApiArray, unwrapApiData, unwrapApiObject } from "./apiEnvelope";
import type { AiAnomaly, AlertItem, ApiEnvelope, CinemaOverview, CollectHistoryRun, CollectRunResult, DailyReport, DataSourcesStatus, DataQualitySummary, MockDashboardPayload, OrderSnapshot, OverviewData } from "../types/dashboard";

// 动态获取API基础地址（支持局域网访问）
// 注意：必须在运行时获取，不能在build时静态计算
let _cachedApiBase: string | null = null;
function getApiBase(): string {
  // 如果有环境变量，直接用
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envBase) return envBase;
  
  // 如果在浏览器端，用当前hostname
  if (typeof window !== "undefined") {
    if (!_cachedApiBase) {
      _cachedApiBase = `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return _cachedApiBase;
  }
  
  // SSR fallback
  return "http://localhost:8000";
}
export const DATA_MODE = (process.env.NEXT_PUBLIC_DATA_MODE || "mock") as "mock" | "api";

let mockCache: MockDashboardPayload | null = null;

async function getMock(): Promise<MockDashboardPayload> {
  if (mockCache) return mockCache;
  const response = await axios.get<MockDashboardPayload>("/mock/dashboard.json");
  mockCache = response.data;
  return mockCache;
}

async function getApi<T>(path: string): Promise<ApiEnvelope<T>> {
  const response = await axios.get<ApiEnvelope<T>>(`${getApiBase()}${path}`);
  return response.data;
}

export async function fetchOverview(): Promise<ApiEnvelope<OverviewData>> {
  if (DATA_MODE === "mock") return (await getMock()).overview;
  return getApi<OverviewData>("/api/overview");
}

export async function fetchRevenue(): Promise<MockDashboardPayload["revenue"]> {
  if (DATA_MODE === "mock") return (await getMock()).revenue;
  return getApi("/api/revenue/realtime");
}

export async function fetchOrders(): Promise<MockDashboardPayload["orders"]> {
  if (DATA_MODE === "mock") return (await getMock()).orders;
  return getApi("/api/orders/realtime");
}

export async function fetchOrderSnapshots(): Promise<ApiEnvelope<OrderSnapshot[]>> {
  if (DATA_MODE === "mock") {
    const mock = await getMock();
    return {
      data: (mock.orders.data || []).map((item) => ({
        platform: item.platform,
        business_type: item.platform === "xiaotie" ? "billiards" : "mahjong",
        title: item.platform === "xiaotie" ? "台球订单汇总" : "棋牌订单汇总",
        amount: 0,
        status: `${item.orders} 单`,
        time: item.time,
        source: "api",
        detail: item.source === "mock" ? "占位" : "真实数据",
      })),
      time: mock.orders.time,
      source: mock.orders.source,
    };
  }
  return getApi<OrderSnapshot[]>("/api/orders/snapshots");
}

export async function fetchUsage(): Promise<MockDashboardPayload["usage"]> {
  if (DATA_MODE === "mock") return (await getMock()).usage;
  return getApi("/api/usage/realtime");
}

export async function fetchAlerts(): Promise<ApiEnvelope<AlertItem[]>> {
  if (DATA_MODE === "mock") return (await getMock()).alerts;
  return getApi<AlertItem[]>("/api/alerts");
}

export async function fetchDataSourcesStatus(): Promise<ApiEnvelope<DataSourcesStatus>> {
  if (DATA_MODE === "mock") {
    return {
      data: {
        platforms: [
          {
            platform: "wu_laoban",
            business_type: "mahjong",
            status: "ok",
            data_source: "api",
            last_sync_time: null,
            message: "真实 API 数据",
          },
          {
            platform: "xiaotie",
            business_type: "billiards",
            status: "token_invalid",
            data_source: "api",
            last_sync_time: null,
            message: "小铁 token 已失效，请重新抓取",
            token_status: "invalid",
          },
          {
            platform: "fenghuang",
            business_type: "cinema",
            status: "not_imported",
            data_source: "excel",
            last_sync_time: null,
            message: "暂未导入",
          },
        ],
      },
      time: new Date().toISOString(),
      source: "mock",
    };
  }
  return getApi<DataSourcesStatus>("/api/data-sources/status");
}

export async function fetchDailyReport(): Promise<ApiEnvelope<DailyReport>> {
  if (DATA_MODE === "mock") {
    return {
      data: {
        report: "AI 经营日报\n\n当前为前端占位模式，请切换 API 模式查看基于真实采集数据的日报。",
        source: "rule_template",
        snapshots_count: 0,
      },
      time: new Date().toISOString(),
      source: "mock",
    };
  }
  return getApi<DailyReport>("/api/ai/daily-report");
}

export interface AiChatAnswer {
  answer: string;
  source: "llm" | "fallback" | "not_configured" | "empty";
  model: string;
  error?: string;
}

export async function askAiAssistant(question: string): Promise<ApiEnvelope<AiChatAnswer>> {
  const response = await axios.post<ApiEnvelope<AiChatAnswer>>(`${getApiBase()}/api/ai/chat`, { question });
  return response.data;
}

export interface AutomationTask {
  id: number;
  task_type: string;
  title: string;
  venue: string;
  prompt: string;
  status: "queued" | "running" | "success" | "failed" | string;
  result?: string | null;
  error?: string | null;
  hermes_session_id?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
}

export async function createAutomationTask(payload: { task_type: string; title: string; venue: string; prompt?: string }): Promise<ApiEnvelope<AutomationTask>> {
  const response = await axios.post<ApiEnvelope<AutomationTask>>(`${getApiBase()}/api/automation/tasks`, payload);
  return response.data;
}

export async function fetchAutomationTasks(): Promise<ApiEnvelope<{ tasks: AutomationTask[] }>> {
  return getApi<{ tasks: AutomationTask[] }>("/api/automation/tasks");
}

export async function fetchDataQualitySummary(): Promise<ApiEnvelope<DataQualitySummary>> {
  if (DATA_MODE === "mock") {
    return {
      data: {
        sources: [
          { 
            name: "凤凰云智(影院)", 
            platform: "fenghuang", 
            business_type: "cinema",
            data_source: "excel_upload",
            status: "normal", 
            status_label: "正常",
            freshness: "fresh",
            freshness_label: "今日已导入",
            last_update: new Date().toISOString(), 
            last_updated: new Date().toISOString(),
            minutes_ago: 5,
            snapshot_date: new Date().toISOString().split('T')[0],
            token_valid: true,
            token_error: null,
            sync_status: "success",
            sync_message: "正常",
            snapshot: { revenue: 495.6, orders: 1, usage_rate: 0.0563, customer_count: 10 }
          },
          { 
            name: "小铁(台球)", 
            platform: "xiaotie", 
            business_type: "billiards",
            data_source: "api",
            status: "normal", 
            status_label: "正常",
            freshness: "fresh",
            freshness_label: "实时",
            last_update: new Date().toISOString(), 
            last_updated: new Date().toISOString(),
            minutes_ago: 0,
            snapshot_date: new Date().toISOString().split('T')[0],
            token_valid: true,
            token_error: null,
            sync_status: "success",
            sync_message: "正常",
            snapshot: { revenue: 169.5, orders: 18, usage_rate: 0.1538, customer_count: 0 }
          },
          { 
            name: "無老板(棋牌)", 
            platform: "wu_laoban", 
            business_type: "mahjong",
            data_source: "api",
            status: "normal", 
            status_label: "正常",
            freshness: "fresh",
            freshness_label: "实时",
            last_update: new Date().toISOString(), 
            last_updated: new Date().toISOString(),
            minutes_ago: 0,
            snapshot_date: new Date().toISOString().split('T')[0],
            token_valid: true,
            token_error: null,
            sync_status: "success",
            sync_message: "正常",
            snapshot: { revenue: 176.8, orders: 21, usage_rate: 0.0, customer_count: 0 }
          },
        ],
        overall_status: "normal",
      },
      time: new Date().toISOString(),
      source: "mock",
    };
  }
  
  const response = await axios.get<any>(`${getApiBase()}/api/data-quality/summary`);
  const apiData = unwrapApiObject(response.data, { sources: [], overall_status: "error" as const });
  return {
    data: {
      sources: unwrapApiArray(apiData.sources),
      overall_status: typeof apiData.overall_status === "string" ? apiData.overall_status : "error",
    },
    time: new Date().toISOString(),
    source: "api",
  };
}

export async function fetchAiAnomalies(): Promise<ApiEnvelope<AiAnomaly[]>> {
  if (DATA_MODE === "mock") {
    return {
      data: [
        { id: "1", platform: "xiaotie", business_type: "台球", title: "台球收入异常下降", change_rate: -0.23, direction: "negative", confidence: 0.92, detected_at: new Date().toISOString(), severity: "high" },
        { id: "2", platform: "wu_laoban", business_type: "棋牌", title: "棋牌客流增长显著", change_rate: 0.35, direction: "positive", confidence: 0.88, detected_at: new Date().toISOString(), severity: "medium" },
        { id: "3", platform: "fenghuang", business_type: "影院", title: "影院卖品占比波动", change_rate: -0.15, direction: "negative", confidence: 0.75, detected_at: new Date().toISOString(), severity: "low" },
      ],
      time: new Date().toISOString(),
      source: "mock",
    };
  }
  
  const response = await getApi<unknown>("/api/ai/anomalies");
  const responseData = unwrapApiObject(response, { warnings: [] as unknown[], analyzed_at: new Date().toISOString() });
  const warnings = unwrapApiArray<{
    business_type?: string;
    title?: string;
    conclusion?: string;
    confidence?: number;
    evidence?: string[];
  }>(responseData.warnings);
  const anomalies: AiAnomaly[] = warnings.map((w, index) => {
    let changeRate = 0;
    const evidence = unwrapApiArray<string>(w.evidence);
    for (const e of evidence) {
      if (e.includes("变化幅度")) {
        const match = e.match(/(-?\d+\.?\d*)%/);
        if (match) {
          changeRate = parseFloat(match[1]) / 100;
        }
      }
    }

    const direction = changeRate >= 0 ? "positive" : "negative";
    const confidence = typeof w.confidence === "number" ? w.confidence : 0;
    const severity = confidence >= 0.9 ? "high" : confidence >= 0.8 ? "medium" : "low";
    
    return {
      id: String(index + 1),
      platform: w.business_type === "billiards" ? "xiaotie" : w.business_type === "mahjong" ? "wu_laoban" : "fenghuang",
      business_type: w.business_type === "billiards" ? "台球" : w.business_type === "mahjong" ? "棋牌" : "影院",
      title: w.title || w.conclusion || "异常预警",
      change_rate: changeRate,
      direction: direction,
      confidence,
      detected_at: typeof responseData.analyzed_at === "string" ? responseData.analyzed_at : new Date().toISOString(),
      severity: severity,
    };
  });
  
  return {
    data: anomalies,
    time: typeof responseData.analyzed_at === "string" ? responseData.analyzed_at : new Date().toISOString(),
    source: "api",
  };
}

export interface CinemaFilmMetric {
  film_name: string;
  film_box_office: number;
  film_attendance: number;
}

export type CinemaReportType = "operations" | "film_ranking" | "concession_detail" | "member_detail" | "generic";

export interface CinemaImportResult {
  status: "ok";
  message: string;
  data_source: "excel";
  file_name: string;
  report_type: CinemaReportType;
  report_note: string;
  missing_fields: string[];
  snapshot: {
    date: string;
    revenue: number;
    box_office: number;
    concession_revenue: number;
    customer_count: number;
    orders: number;
    usage_rate: number;
    avg_order_value: number;
  };
  films: CinemaFilmMetric[];
  imported_dates: string[];
}

export interface CinemaImportFailure {
  status: "failed";
  file_name: string;
  report_type?: CinemaReportType | null;
  error: string;
  message: string;
}

export type CinemaBatchImportItem = CinemaImportResult | CinemaImportFailure;

export interface CinemaBatchImportResult {
  status: "ok" | "partial" | "failed";
  message: string;
  data_source: "excel";
  success_count: number;
  failed_count: number;
  results: CinemaBatchImportItem[];
}

export interface CinemaTrendItem {
  date: string;
  box_office: number;
  revenue: number;
  customer_count: number;
  screenings: number;
  occupancy_rate: number;
}

export interface CinemaImportLog {
  file_name: string | null;
  import_time: string | null;
  status: "success" | "failed" | string;
  error_reason?: string | null;
  message?: string | null;
}

export interface CinemaDetail {
  status: "ok" | "not_imported" | "no_data";
  data_source?: "excel";
  date?: string;
  today?: {
    date: string;
    revenue: number;
    box_office: number;
    concession_revenue: number;
    customer_count: number;
    screenings: number;
    occupancy_rate: number;
    avg_order_value: number;
    last_import_time: string;
  };
  box_office_trend_7d?: CinemaTrendItem[];
  box_office_trend_30d?: CinemaTrendItem[];
  film_box_office_ranking?: CinemaFilmMetric[];
  film_attendance_ranking?: CinemaFilmMetric[];
  screening_analysis?: Array<{ date: string; screenings: number; occupancy_rate: number }>;
  recent_imports?: CinemaImportLog[];
  missing_fields?: string[];
  message: string;
}

export async function fetchCinemaOverview(date?: string, days: number = 1, startDate?: string): Promise<CinemaOverview> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("days", String(days));
  if (startDate) params.set("start_date", startDate);
  const suffix = params.toString() ? `?${params}` : "";
  const response = await axios.get<CinemaOverview>(`${getApiBase()}/api/cinema/overview${suffix}`);
  return unwrapApiObject(response.data, response.data);
}

export async function fetchCinemaDetail(date?: string, days: number = 30, startDate?: string): Promise<CinemaDetail> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("days", String(days));
  if (startDate) params.set("start_date", startDate);
  const response = await axios.get<CinemaDetail>(`${getApiBase()}/api/cinema/detail?${params}`);
  return unwrapApiObject(response.data, response.data);
}

export interface ConcessionDetail {
  status: "ok" | "no_data";
  date_range?: { start: string | null; end: string | null; days: number };
  summary?: { total_revenue: number; total_quantity: number; avg_daily_revenue: number };
  categories?: Array<{ category: string; quantity: number; revenue: number; items: number }>;
  items?: Array<{ item_name: string; category: string; quantity: number; revenue: number }>;
  daily_trend?: Array<{ date: string; revenue: number; items_count: number }>;
}

export async function fetchConcessionDetail(date?: string, days: number = 30, category?: string, startDate?: string): Promise<ConcessionDetail> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("days", String(days));
  if (startDate) params.set("start_date", startDate);
  if (category) params.set("category", category);
  const response = await axios.get<ConcessionDetail>(`${getApiBase()}/api/cinema/concession?${params}`);
  return unwrapApiObject(response.data, response.data);
}

/* 会员消费详情 */ 
export interface MemberDetail {
  status: "ok" | "no_data";
  date_range?: { start: string | null; end: string | null; days: number };
  summary?: { total_amount: number; avg_daily_amount: number };
  categories?: Array<{ category: string; amount: number; items: number }>;
  items?: Array<{ product_name: string; product_type: string; amount: number; count: number }>;
  daily_trend?: Array<{ date: string; revenue: number; items_count: number }>;
}

export async function fetchMemberDetail(date?: string, days: number = 30, category?: string): Promise<MemberDetail> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("days", String(days));
  if (category) params.set("category", category);
  const response = await axios.get<MemberDetail>(`${getApiBase()}/api/cinema/member?${params}`);
  return unwrapApiObject(response.data, response.data);
}

export async function importCinemaExcel(file: File): Promise<CinemaImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await axios.post<CinemaImportResult>(`${getApiBase()}/api/cinema/import-excel`, formData);
  return response.data;
}

export async function importCinemaBatch(files: File[]): Promise<CinemaBatchImportResult> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await axios.post<CinemaBatchImportResult>(`${getApiBase()}/api/cinema/import-batch`, formData);
  return response.data;
}

/* ── 客户分析 ── */

export interface RfmUser {
  name: string;
  recency: number | null;
  frequency: number;
  monetary: number;
  tier: string;
  last_date?: string;
  first_date?: string;
}

export interface RfmData {
  status: string;
  platform: string;
  period_days?: number;
  total_users: number;
  total_orders?: number;
  total_revenue?: number;
  tier_stats: Record<string, { count: number; total_amount: number; avg_frequency: number }>;
  top_users: RfmUser[];
}

export interface RepurchaseCohort {
  month: string;
  new_users: number;
  repurchased: number;
  repurchase_rate: number;
}

export interface RepurchaseData {
  status: string;
  platform: string;
  cohorts: RepurchaseCohort[];
}

export interface ConsumptionChange {
  name: string;
  this_month: number;
  last_month: number;
  change_pct: number;
  trend: string;
  this_orders: number;
  last_orders: number;
}

export interface ConsumptionTrendData {
  status: string;
  platform: string;
  this_month: string;
  last_month: string;
  trend_summary: Record<string, number>;
  total_compared: number;
  details: ConsumptionChange[];
}

export async function fetchCustomerRfm(platform: string = "mahjong", days: number = 90): Promise<RfmData> {
  const response = await axios.get<RfmData>(`${getApiBase()}/api/customer/rfm?platform=${platform}&days=${days}`);
  const data = unwrapApiObject(response.data, { status: "ok", platform, period_days: days, total_users: 0, tier_stats: {}, top_users: [] });
  return {
    ...data,
    tier_stats: unwrapApiObject(data.tier_stats, {}),
    top_users: unwrapApiArray(data.top_users),
  };
}

export async function fetchRepurchase(months: number = 6): Promise<RepurchaseData> {
  const response = await axios.get<RepurchaseData>(`${getApiBase()}/api/customer/repurchase?months=${months}`);
  const data = unwrapApiObject(response.data, { status: "ok", platform: "mahjong", cohorts: [] });
  return {
    ...data,
    cohorts: unwrapApiArray(data.cohorts),
  };
}

export async function fetchConsumptionTrend(): Promise<ConsumptionTrendData> {
  const response = await axios.get<ConsumptionTrendData>(`${getApiBase()}/api/customer/trend`);
  const data = unwrapApiObject(response.data, { status: "ok", platform: "mahjong", this_month: "", last_month: "", trend_summary: {}, total_compared: 0, details: [] });
  return {
    ...data,
    trend_summary: unwrapApiObject(data.trend_summary, {}),
    details: unwrapApiArray(data.details),
  };
}

export async function runCollect(): Promise<ApiEnvelope<CollectRunResult>> {
  const response = await axios.post<ApiEnvelope<CollectRunResult>>(`${getApiBase()}/api/collect/run`);
  return response.data;
}

export async function fetchCollectHistory(limit: number = 5): Promise<ApiEnvelope<CollectHistoryRun[]>> {
  const response = await axios.get<ApiEnvelope<CollectHistoryRun[]>>(`${getApiBase()}/api/collect/history?limit=${limit}`);
  return response.data;
}

export async function updateXiaotieToken(token: string): Promise<{ success: boolean; message: string }> {
  const response = await axios.post<{ success: boolean; message: string }>(`${getApiBase()}/api/token/xiaotie/update`, { token });
  return response.data;
}

// Token状态检查
export interface TokenStatus {
  valid: boolean;
  error: string | null;
  expires_in?: number | null;
}

export interface TokenStatusResponse {
  xiaotie: TokenStatus;
  wu_laoban: TokenStatus;
}

export async function fetchTokenStatus(): Promise<TokenStatusResponse> {
  const response = await axios.get<TokenStatusResponse>(`${getApiBase()}/api/token-status`);
  return response.data;
}

// 趋势数据
export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface TrendResponse {
  trends: Record<string, TrendDataPoint[]>;
}

export async function fetchRevenueTrend(platform?: string, days: number = 7): Promise<TrendResponse> {
  const params = new URLSearchParams();
  if (platform) params.append("platform", platform);
  params.append("days", days.toString());
  const response = await axios.get<TrendResponse>(`${getApiBase()}/api/trend/revenue?${params}`);
  return response.data;
}

export async function fetchOrdersTrend(platform?: string, days: number = 7): Promise<TrendResponse> {
  const params = new URLSearchParams();
  if (platform) params.append("platform", platform);
  params.append("days", days.toString());
  const response = await axios.get<TrendResponse>(`${getApiBase()}/api/trend/orders?${params}`);
  return response.data;
}

export interface HourlyDataPoint {
  hour: string;
  revenue: number;
}

export interface HourlyResponse {
  platform: string;
  hourly: HourlyDataPoint[];
}

export async function fetchHourlyRevenue(platform: string, date?: string): Promise<HourlyResponse> {
  const params = new URLSearchParams();
  params.append("platform", platform);
  if (date) params.append("date", date);
  const response = await axios.get<HourlyResponse>(`${getApiBase()}/api/trend/hourly?${params}`);
  return response.data;
}

// ============================================================
// 台球全量详情
// ============================================================

export interface XiaotieTable {
  name: string;
  address: string;
  status: string;
  open: boolean;
  device_type: string;
  used_time: number;
}

export interface TableRankingItem {
  address: string;
  type: number;
  type_name: string;
  order_count: number;
  revenue: number;
  time_min: number;
}

export interface MemberTopItem {
  name: string;
  phone: string;
  total_payed: number;
  order_count: number;
  avg_duration: number;
  total_hours?: number;
}

export interface HourlyDistItem {
  hour: number;
  label: string;
  orders: number;
}

export interface BalanceStatItem {
  date: string;
  balance: number;
  recharge: number;
  recharge_payed: number;
  recharge_count: number;
  consume: number;
  consume_count: number;
}

export interface CommentItem {
  content: string;
  score: number | null;
  level: number | null;
  created: string;
  created_at: string;
  user: string;
  label: string;
  table: string;
}

export interface TableExceptionItem {
  table: string;
  type: string;
  status: string;
  created: string;
  resolved: boolean;
}

export interface ComplaintItem {
  order_no: string;
  reason: string;
  status: string;
  amount: number;
  created: string;
}

export interface XiaotieFullDetail {
  tables: XiaotieTable[];
  busy_count: number;
  total_count: number;
  date_ranges: Record<string, { start: string; end: string }>;
  summary_today: {
    order_count: number;
    revenue: number;
    total_revenue: number;
    platform_income: number;
    time_min: number;
    face_count: number;
    new_face_count: number;
    member_count: number;
  };
  summary_week: {
    order_count: number;
    revenue: number;
    time_min: number;
    face_count: number;
    new_face_count: number;
    member_count: number;
    coupon_orders: number;
    lose_count: number;
  };
  summary_month: {
    order_count: number;
    revenue: number;
    time_min: number;
    face_count: number;
    new_face_count: number;
    member_count: number;
    coupon_orders: number;
    coupon_revenue: number;
    good_orders: number;
    good_revenue: number;
    lose_count: number;
    black_eight_revenue: number;
    room_revenue: number;
    snooker_revenue: number;
  };
  summary_year: {
    order_count: number;
    revenue: number;
    time_min: number;
    face_count: number;
  };
  summary_last_year: {
    order_count: number;
    revenue: number;
    time_min: number;
    face_count: number;
  };
  comparison: {
    yesterday: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_month_same_day: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    day_before: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_week: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_month_week: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    week_before_last: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_month: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_year_month: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_last_month: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_year_month_full: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_year: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
    last_year_to_today: { revenue: number; total_revenue: number; date_range?: { start: string; end: string } };
  };
  daily_avg: {
    order_count: number;
    revenue: number;
    time_min: number;
  };
  table_ranking_today: TableRankingItem[];
  table_ranking_week: TableRankingItem[];
  table_ranking_month: TableRankingItem[];
  table_ranking_year: TableRankingItem[];
  member_top_today: MemberTopItem[];
  member_top_week: MemberTopItem[];
  member_top: MemberTopItem[];
  member_top_year: MemberTopItem[];
  member_top_all: MemberTopItem[];
  // 按时长排序
  member_top_today_by_hours: MemberTopItem[];
  member_top_week_by_hours: MemberTopItem[];
  member_top_month_by_hours: MemberTopItem[];
  member_top_year_by_hours: MemberTopItem[];
  member_top_all_by_hours: MemberTopItem[];
  vip: {
    vip_count: number;
    balance: number;
    total_payed: number;
    total_give: number;
  };
  hourly_distribution: HourlyDistItem[];
  operate_summary: {
    face_count: number;
    new_face_count: number;
    member_count: number;
    new_member_count: number;
    goods_revenue: number;
    lose_count: number;
  };
  balance_stats: BalanceStatItem[];
  comments: CommentItem[];
  table_exceptions: TableExceptionItem[];
  complaints: ComplaintItem[];
  vending?: {
    available: boolean;
    today_amount: number;
    today_count?: number;
    month_amount: number;
    month_count?: number;
    month_margin?: string;
    year_amount: number;
    year_count?: number;
    year_margin?: string;
    goods?: { name: string; count: number; amount: number; proportion: string }[];
  };
  error?: string;
}

export async function fetchXiaotieFullDetail(): Promise<XiaotieFullDetail> {
  const response = await axios.get<XiaotieFullDetail>(`${getApiBase()}/api/detail/xiaotie`);
  return unwrapApiObject(response.data, response.data);
}

/** 从数据库读取台球详情（秒开），用于首页优先渲染 */
export async function fetchXiaotieDbDetail(): Promise<XiaotieFullDetail> {
  const response = await axios.get<XiaotieFullDetail>(`${getApiBase()}/api/db/xiaotie`);
  return response.data;
}

export type TableInfo = XiaotieTable;
export interface XiaotieHourlyItem {
  hour: string;
  revenue: number;
  orders: number;
}

export async function fetchXiaotieDetail(): Promise<XiaotieFullDetail> {
  return fetchXiaotieFullDetail();
}

export async function fetchXiaotieHourly(): Promise<{ hourly: XiaotieHourlyItem[] }> {
  const detail = await fetchXiaotieFullDetail();
  return {
    hourly: (detail.hourly_distribution || []).map((item) => ({
      hour: item.label,
      revenue: 0,
      orders: item.orders,
    })),
  };
}

// ============================================================
// 棋牌全量详情
// ============================================================

export interface MahjongRoom {
  name: string;
  type: string;
  status: string;
  user: string;
  time_range: string;
  remaining_min: number;
  today_orders: number;
  today_revenue: number;
}

export interface RevenueBreakdown {
  total: number;
  wechat: number;
  alipay: number;
  meituan: number;
  cash: number;
  other: number;
  member_card: number;
  group_buy: number;
}

export interface PlaceRankingItem {
  name: string;
  type: string;
  orders: number;
  revenue: number;
}

export interface MahjongUserRankingItem {
  name: string;
  total_time: string;
  money: number;
  check_num?: number;
}

export interface WuLaobanFullDetail {
  rooms: MahjongRoom[];
  active_orders: number;
  total_rooms: number;
  revenue_today: RevenueBreakdown;
  revenue_month: RevenueBreakdown;
  revenue_year: RevenueBreakdown;
  // 经营统计（6个维度）
  summary_today: { revenue: number; order_count: number; user_count: number; new_user_count: number };
  summary_week: { revenue: number; order_count: number; user_count: number; new_user_count: number };
  summary_month: { revenue: number; order_count: number; user_count: number; new_user_count: number };
  summary_year: { revenue: number; order_count: number; user_count: number; new_user_count: number };
  // 环比数据
  comparison: {
    yesterday: { revenue: number; order_count: number; user_count: number; new_user_count: number };
    last_week: { revenue: number; order_count: number; user_count: number; new_user_count: number };
    last_month: { revenue: number; order_count: number; user_count: number; new_user_count: number };
    last_year_month: { revenue: number; order_count: number; user_count: number; new_user_count: number };
    last_year_same_day: { revenue: number; order_count: number; user_count: number; new_user_count: number };
    last_year: { revenue: number; order_count: number; user_count: number; new_user_count: number };
  };
  // 包间排名（今日/本月/本年）
  place_ranking_today: PlaceRankingItem[];
  place_ranking_month: PlaceRankingItem[];
  place_ranking_year: PlaceRankingItem[];
  // 订单统计详情（日/周/月/年）
  order_stats: {
    today: { order_count: number; user_count: number; new_user_count: number; rebuy_count: number; first_count: number; first_price_avg: number; rebuy_price_avg: number; first_time_avg: number; rebuy_time_avg: number };
    week: { order_count: number; user_count: number; new_user_count: number; rebuy_count: number; first_count: number; first_price_avg: number; rebuy_price_avg: number; first_time_avg: number; rebuy_time_avg: number };
    month: { order_count: number; user_count: number; new_user_count: number; rebuy_count: number; first_count: number; first_price_avg: number; rebuy_price_avg: number; first_time_avg: number; rebuy_time_avg: number };
    year: { order_count: number; user_count: number; new_user_count: number; rebuy_count: number; first_count: number; first_price_avg: number; rebuy_price_avg: number; first_time_avg: number; rebuy_time_avg: number };
  };
  // 用户排行榜（本周/本月/总榜）
  user_ranking_week: MahjongUserRankingItem[];
  user_ranking_month: MahjongUserRankingItem[];
  user_ranking_total: MahjongUserRankingItem[];
  // 储值卡
  deposit_cards: { name: string; price: number; sale_num: number; status: number }[];
  deposit_card_orders: { time: string; user: string; card_name: string; price: number }[];
  // 充值订单
  deposit_orders: { time: string; user: string; pay_price: number; package: string; status: string }[];
  // 优惠券
  coupons: { name: string; price: number; vip_price: number; origin_price: number; sale_num: number; type_name: string; status: number }[];
  // 美团团购
  meituan_goods: { title: string; price: number; market_price: number; status_name: string; coupon_name: string }[];
  error?: string;
}

export async function fetchWuLaobanFullDetail(): Promise<WuLaobanFullDetail> {
  const response = await axios.get<WuLaobanFullDetail>(`${getApiBase()}/api/detail/wu_laoban`);
  return unwrapApiObject(response.data, response.data);
}

/** 从数据库读取棋牌详情（秒开），用于首页优先渲染 */
export async function fetchWuLaobanDbDetail(): Promise<WuLaobanFullDetail> {
  const response = await axios.get<WuLaobanFullDetail>(`${getApiBase()}/api/db/wu_laoban`);
  return response.data;
}

export type RoomInfo = MahjongRoom;

export async function fetchWuLaobanDetail(): Promise<WuLaobanFullDetail & { revenue_breakdown: RevenueBreakdown }> {
  const detail = await fetchWuLaobanFullDetail();
  return { ...detail, revenue_breakdown: detail.revenue_today };
}

// ============================================================
// 数据可信度
// ============================================================
export async function fetchDataQuality(): Promise<ApiEnvelope<any>> {
  return getApi("/api/data-quality");
}

// ============================================================
// AI 异常预警
// ============================================================
// ============================================================
// AI 周报
// ============================================================
export async function fetchAiWeeklyReport(): Promise<ApiEnvelope<any>> {
  return getApi("/api/ai/weekly-report");
}

// ============================================================
// 审计日志
// ============================================================
export async function fetchAuditLogs(params?: Record<string, string | number>): Promise<ApiEnvelope<any>> {
  const query = params ? "?" + new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString() : "";
  return getApi(`/api/audit/logs${query}`);
}

export async function fetchAuditStats(): Promise<ApiEnvelope<any>> {
  return getApi("/api/audit/stats");
}

// ============================================================
// 客户唤醒
// ============================================================
export interface WakeUpCustomer {
  name: string;
  platform: string;
  platform_key: "billiards" | "mahjong" | string;
  last_consume_date: string;
  total_amount: number;
  order_count: number;
  order_hours?: number;
  days_since_last: number;
  category: "vip" | "normal" | "dormant" | "new" | "low" | string;
  category_label: string;
  phone?: string;
  tier?: string;
  suggestion?: string;
}

export interface CustomerWakeUpData {
  status: string;
  summary: {
    total_customers: number;
    vip_count: number;
    normal_count: number;
    dormant_count: number;
    new_count: number;
    low_count?: number;
    vip_total_amount: number;
    dormant_total_amount: number;
  };
  vip_customers: WakeUpCustomer[];
  normal_customers: WakeUpCustomer[];
  dormant_customers: WakeUpCustomer[];
  all_customers: WakeUpCustomer[];
}

export async function fetchCustomerWakeUp(): Promise<CustomerWakeUpData> {
  const response = await axios.get<CustomerWakeUpData>(`${getApiBase()}/api/customer/wake-up`);
  const data = unwrapApiObject(response.data, { status: "ok", summary: { total_customers: 0, vip_count: 0, normal_count: 0, dormant_count: 0, new_count: 0, vip_total_amount: 0, dormant_total_amount: 0 }, vip_customers: [], normal_customers: [], dormant_customers: [], all_customers: [] });
  return {
    ...data,
    vip_customers: unwrapApiArray(data.vip_customers),
    normal_customers: unwrapApiArray(data.normal_customers),
    dormant_customers: unwrapApiArray(data.dormant_customers),
    all_customers: unwrapApiArray(data.all_customers),
  };
}

// ============================================================
// 员工AI教练
// ============================================================
export interface EmployeeCoachItem {
  name: string;
  rank: number;
  total_score: number;
  strengths: string[];
  weaknesses: string[];
  training_suggestions: string[];
  is_manager?: boolean; // 主管标识，不计入团队统计
  // 绩效原始数据（透传自 /api/cinema/employee-performance）
  package_detail: Record<string, { count: number; amount: number }>;
  package_count: number;
  package_amount: number;
  activity_count: number;
  activity_amount: number;
  recharge_count: number;
  recharge_amount: number;
  open_count: number;
  total_count: number;
  total_amount: number;
  // 班次信息
  shift: 'morning' | 'evening'; // 班次：morning=早班，evening=晚班
  work_days: number; // 工作天数
  efficiency: number; // 人均效率（销售额/班次观影人次）
  shift_attendance: number; // 该员工工作日的班次总观影人次
}

export interface EmployeeCoachData {
  status: string;
  employees: EmployeeCoachItem[];
  team_summary: {
    total_employees: number;
    avg_score: number;
    top_performer: string;
    needs_attention: string[];
  };
  shift_summary?: {
    morning_total: number; // 早班总观影人次
    evening_total: number; // 晚班总观影人次
    total: number;
  };
  ai_insights: string[];
}

/**
 * 复用 /api/cinema/employee-performance 数据，在前端计算分数和建议
 */
export async function fetchEmployeeCoach(startDate?: string, endDate?: string): Promise<EmployeeCoachData> {
  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  const suffix = params.toString() ? `?${params}` : "";
  const response = await axios.get<any>(`${getApiBase()}/api/cinema/employee-performance${suffix}`);
  const raw = response.data;
  if (raw.status !== 'ok' || !raw.employees?.length) {
    return { status: 'no_data', employees: [], team_summary: { total_employees: 0, avg_score: 0, top_performer: '-', needs_attention: [] }, ai_insights: [] };
  }

  const emps = raw.employees as any[];

  // 主管名单：保留显示但不计入团队统计/评分/排名
  const MANAGER_NAMES = new Set(['杨高峰', '谢显彬', '张莎', '刘馨悦']);
  const regular = emps.filter(e => !MANAGER_NAMES.has(e.name));
  const n = regular.length || 1;

  // 均值（仅非主管）
  const avg = (field: string) => regular.reduce((s, e) => s + (e[field] || 0), 0) / n;
  const avgAmount = avg('total_amount');
  const avgRecharge = avg('recharge_amount');
  const avgOpen = avg('open_count');

  // 综合得分（0-100），max值仅从非主管取
  const maxAmount = Math.max(...regular.map(e => e.total_amount || 0), 1);
  const maxRecharge = Math.max(...regular.map(e => e.recharge_amount || 0), 1);
  const maxOpen = Math.max(...regular.map(e => e.open_count || 0), 1);
  const maxPkgCount = Math.max(...regular.map(e => e.package_count || 0), 1);

  const calcScore = (e: any) => Math.round(
    ((e.total_amount || 0) / maxAmount) * 40 +
    ((e.package_count || 0) / maxPkgCount) * 25 +
    ((e.recharge_amount || 0) / maxRecharge) * 20 +
    ((e.open_count || 0) / maxOpen) * 15
  );

  // 生成教练数据（全部员工，主管标记 is_manager）
  const isManager = (name: string) => MANAGER_NAMES.has(name);
  const employees: EmployeeCoachItem[] = emps.map((e: any) => {
    const totalScore = isManager(e.name) ? 0 : calcScore(e); // 主管不计分
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const training: string[] = [];

    // 强弱项判断（仅非主管）
    if (!isManager(e.name)) {
      if (e.total_amount >= avgAmount * 1.2) strengths.push('总销售额领先');
      else if (e.total_amount < avgAmount * 0.8) { weaknesses.push('总销售额偏低'); training.push('加强卖品知识培训，熟悉所有品类和价格'); }

      if (e.recharge_amount > avgRecharge * 1.2) strengths.push('充值业绩突出');
      else if (e.recharge_amount < avgRecharge * 0.5 && e.total_amount > 0) { weaknesses.push('充值业绩偏低'); training.push('主动推荐会员充值优惠，强调长期省钱'); }

      if (e.open_count > avgOpen * 1.2) strengths.push('开卡转化率高');
      else if (e.open_count < avgOpen * 0.5 && e.total_amount > 0) { weaknesses.push('开卡数偏少'); training.push('每位新顾客都推荐开会员卡，强调会员专属折扣'); }

      if (strengths.length === 0) strengths.push('整体表现稳定');
      if (training.length === 0) training.push('保持当前状态，挑战更高目标');
    }

    return {
      name: e.name,
      rank: 0, // 后续重排
      total_score: totalScore,
      strengths,
      weaknesses,
      training_suggestions: training,
      is_manager: isManager(e.name),
      package_detail: e.package_detail || {},
      package_count: e.package_count || 0,
      package_amount: e.package_amount || 0,
      activity_count: e.activity_count || 0,
      activity_amount: e.activity_amount || 0,
      recharge_count: e.recharge_count || 0,
      recharge_amount: e.recharge_amount || 0,
      open_count: e.open_count || 0,
      total_count: e.total_count || 0,
      total_amount: e.total_amount || 0,
      shift: e.shift || 'morning',
      work_days: e.work_days || 0,
      efficiency: e.efficiency || 0,
      shift_attendance: e.shift_attendance || 0,
    };
  });

  // 非主管按得分降序，主管排末尾
  const regularEmployees = employees.filter(e => !e.is_manager).sort((a, b) => b.total_score - a.total_score);
  const managerEmployees = employees.filter(e => e.is_manager);
  const sortedEmployees = [...regularEmployees, ...managerEmployees];

  // 非主管编号，主管 rank=-1
  regularEmployees.forEach((e, i) => { e.rank = i + 1; });
  managerEmployees.forEach(e => { e.rank = -1; });

  const topPerformer = regularEmployees[0]?.name || '-';
  const avgScore = Math.round(regularEmployees.reduce((s, e) => s + e.total_score, 0) / (regularEmployees.length || 1) * 10) / 10;
  const needsAttention = regularEmployees.filter(e => e.total_score < avgScore * 0.7).map(e => e.name);

  // AI洞察（仅基于非主管）
  const insights: string[] = [];
  const bestPkg = [...regularEmployees].sort((a, b) => b.package_count - a.package_count)[0];
  if (bestPkg) insights.push(`套餐销量最高：${bestPkg.name}（${bestPkg.package_count}单），可作为团队培训标杆`);
  const lowRecharge = regularEmployees.filter(e => e.recharge_amount < avgRecharge * 0.5 && e.total_amount > 0);
  if (lowRecharge.length > 0) insights.push(`${lowRecharge.map(e => e.name).join('、')}充值业绩偏低，建议专项培训`);
  const noActivity = regularEmployees.filter(e => e.activity_count === 0 && e.total_amount > 0);
  if (noActivity.length > 0) insights.push(`${noActivity.map(e => e.name).join('、')}暂无活动套餐销售，建议推广活动产品`);
  if (regularEmployees.length > 0) insights.push(`团队人均销售额¥${Math.round(avgAmount)}，综合得分${avgScore}分`);

  // 班次观影人次汇总
  const shiftSummary = raw.shift_summary || { morning_total: 0, evening_total: 0, total: 0 };

  return {
    status: 'ok',
    employees: sortedEmployees,
    team_summary: { total_employees: regularEmployees.length, avg_score: avgScore, top_performer: topPerformer, needs_attention: needsAttention },
    shift_summary: shiftSummary,
    ai_insights: insights,
  };
}

// ============================================================
// 排片建议
// ============================================================
export interface ScreeningTimeSlot {
  time_slot: string;
  occupancy_rate: number;
  box_office: number;
  attendance: number;
  screening_count: number;
  avg_per_screening: number;
}

export interface ScreeningSuggestion {
  category: string;
  title: string;
  detail: string;
  suggestion: string;
  priority: "high" | "medium" | "low" | string;
  film_name?: string;
  suggested_slots?: string[];
  reason?: string;
  expected_improvement?: string;
}

export interface ScreeningWeekdayAnalysis {
  weekday: string;
  avg_box_office: number;
  avg_customers: number;
  avg_screenings: number;
  sample_days: number;
}

export interface ScreeningFilmRanking {
  name: string;
  total_box_office: number;
  total_attendance: number;
  days_shown: number;
  avg_daily_box: number;
}

export interface ScreeningSuggestionsData {
  status: string;
  period: string;
  title?: string;
  conclusion?: string;
  evidence?: string[];
  confidence?: number;
  time_slots: ScreeningTimeSlot[];
  suggestions: ScreeningSuggestion[];
  suggested_actions?: string[];
  weekday_analysis?: ScreeningWeekdayAnalysis[];
  film_ranking?: ScreeningFilmRanking[];
  summary?: {
    total_screenings?: number;
    avg_occupancy?: number;
    peak_slot?: string;
    low_slot?: string;
    total_box_office?: number;
    total_concession?: number;
    total_customers?: number;
  };
  historical_comparison?: Array<{ date: string; screenings: number; occupancy: number; box_office: number }>;
}

export async function fetchScreeningSuggestions(): Promise<ScreeningSuggestionsData> {
  const response = await axios.get<ScreeningSuggestionsData>(`${getApiBase()}/api/cinema/screening-suggestions`);
  const data = unwrapApiObject(response.data, {
    status: "ok",
    period: "",
    time_slots: [],
    suggestions: [],
    weekday_analysis: [],
    film_ranking: [],
    historical_comparison: [],
  });
  return {
    ...data,
    time_slots: unwrapApiArray(data.time_slots),
    suggestions: unwrapApiArray(data.suggestions),
    weekday_analysis: unwrapApiArray(data.weekday_analysis),
    film_ranking: unwrapApiArray(data.film_ranking),
    historical_comparison: unwrapApiArray(data.historical_comparison),
  };
}

// ============================================================
// 卖品推荐
// ============================================================
export interface ConcessionHotItem {
  item_name: string;
  category: string;
  quantity: number;
  revenue: number;
  trend: "up" | "down" | "stable";
  trend_pct: number;
}

export interface ConcessionCombo {
  name: string;
  items: string[];
  price: number;
  expected_revenue: number;
  reason: string;
}

export interface ConcessionRecommendationSuggestion {
  category: string;
  title: string;
  detail: string;
  suggestion: string;
  priority: "high" | "medium" | "low" | string;
  potential_impact?: string;
}

export interface ConcessionCategoryBreakdown {
  category: string;
  amount: number;
  count: number;
}

export interface ConcessionHotCombination {
  items: string[];
  count: number;
  total_amount: number;
  avg_amount?: number;
}

export interface ConcessionRecommendationsData {
  status: string;
  title?: string;
  conclusion?: string;
  evidence?: string[];
  hot_items?: ConcessionHotItem[];
  cold_items?: ConcessionHotItem[];
  combos?: ConcessionCombo[];
  pricing_suggestions?: Array<{ item: string; current_price: number; suggested_price: number; reason: string }>;
  summary?: {
    total_sku: number;
    hot_count: number;
    cold_count: number;
    avg_daily_revenue: number;
  };
  category_breakdown?: ConcessionCategoryBreakdown[];
  hot_combinations?: ConcessionHotCombination[];
  suggestions?: ConcessionRecommendationSuggestion[];
  suggested_actions?: string[];
  confidence?: number;
  message?: string;
}

export async function fetchConcessionRecommendations(): Promise<ConcessionRecommendationsData> {
  const response = await axios.get<ConcessionRecommendationsData>(`${getApiBase()}/api/concession/recommendations`);
  const data = unwrapApiObject(response.data, { status: "ok", hot_items: [], cold_items: [], combos: [], pricing_suggestions: [], category_breakdown: [], hot_combinations: [], suggestions: [], suggested_actions: [] });
  return {
    ...data,
    hot_items: unwrapApiArray(data.hot_items),
    cold_items: unwrapApiArray(data.cold_items),
    combos: unwrapApiArray(data.combos),
    pricing_suggestions: unwrapApiArray(data.pricing_suggestions),
    category_breakdown: unwrapApiArray(data.category_breakdown),
    hot_combinations: unwrapApiArray(data.hot_combinations),
    suggestions: unwrapApiArray(data.suggestions),
    suggested_actions: unwrapApiArray(data.suggested_actions),
  };
}

// ============================================================
// 收入预测 v2（多模型集成 + 外部特征）
// ============================================================
export interface RevenueForecast {
  status: string;
  generated_at: string;
  external_data?: {
    weather?: {
      code: number;
      text: string;
      temp: number;
      is_rainy: boolean;
    } | null;
    maoyan_boxoffice?: {
      today_box_office: number;
      today_audience: number;
      movie_count: number;
      movies: Array<{
        name: string;
        box: number;
        rate: number;
      }>;
    } | null;
  };
  forecasts: Array<{
    business: string;
    key: string;
    status: string;
    data_days?: number;
    total_revenue?: number;
    avg_daily_revenue?: number;
    recent_7d_avg?: number;
    recent_3d_avg?: number;
    std_dev?: number;
    max_day?: { date: string; revenue: number };
    min_day?: { date: string; revenue: number };
    trend?: string;
    trend_label?: string;
    confidence?: string;
    confidence_score?: number;
    predictions_3d?: Array<{
      date: string;
      weekday: string;
      predicted: number;
      range_low: number;
      range_high: number;
      confidence: string;
      predicted_audience?: number;  // 影院预测人次
      cinema_box?: number;  // 影院预测票房（万元）
      factors: {
        holiday_type: string;
        holiday_boost: number;
        weather_boost: number;
        is_weekend: boolean;
        is_holiday: boolean;
        weather_text?: string;
        weather_temp?: number;
      };
    }>;
    predictions_30d_total?: number;
    predictions_30d_range?: {
      low: number;
      high: number;
    };
    weekday_averages?: Record<string, number>;
  }>;
  xgboost_predictions?: Record<string, Array<{
    date: string;
    predicted: number;
    predicted_revenue: number;
    weekday: string;
    range_low: number;
    range_high: number;
    confidence: string;
    model: string;
  }>>;
  summary?: {
    total_3d_prediction: number;
    total_3d_range?: {
      low: number;
      high: number;
    };
    total_30d_prediction: number;
    total_30d_range?: {
      low: number;
      high: number;
    };
  };
}

export async function fetchRevenueForecast(): Promise<RevenueForecast> {
  const response = await axios.get<RevenueForecast>(`${getApiBase()}/api/ai/revenue-forecast`);
  const data = unwrapApiObject(response.data, { status: "ok", generated_at: new Date().toISOString(), forecasts: [], summary: { total_3d_prediction: 0, total_30d_prediction: 0 } });
  return {
    ...data,
    forecasts: unwrapApiArray(data.forecasts),
  };
}

// ============================================================
// 多业务联动分析
// ============================================================
export interface CrossBusinessData {
  status: string;
  generated_at: string;
  summary: Record<string, {
    name: string;
    data_days?: number;
    total_revenue?: number;
    avg_daily?: number;
    status?: string;
  }>;
  total_revenue_30d: number;
  weekday_patterns: Record<string, Record<string, { avg_revenue: number }>>;
  suggestions: Array<{
    id: string;
    priority: string;
    category: string;
    title: string;
    description: string;
    action: string;
    expected_impact: string;
    data_basis: string;
  }>;
}

export async function fetchCrossBusiness(): Promise<CrossBusinessData> {
  const response = await axios.get<CrossBusinessData>(`${getApiBase()}/api/ai/cross-business`);
  const data = unwrapApiObject(response.data, { status: "ok", generated_at: new Date().toISOString(), summary: {}, total_revenue_30d: 0, weekday_patterns: {}, suggestions: [] });
  return {
    ...data,
    summary: unwrapApiObject(data.summary, {}),
    weekday_patterns: unwrapApiObject(data.weekday_patterns, {}),
    suggestions: unwrapApiArray(data.suggestions),
  };
}

// ============================================================
// 月报
// ============================================================
export async function fetchAiMonthlyReport(): Promise<ApiEnvelope<any>> {
  return getApi("/api/ai/monthly-report");
}

// ============================================================
// 利润毛利 + 库存损耗
// ============================================================

/** 利润毛利概览 */
export interface ProfitCategory {
  category: string;
  revenue: number;
  cost: number;
  profit: number;
  quantity: number;
  items: number;
  margin: number;
}

export interface ProfitItem {
  item_code: string;
  item_name: string;
  product_type: string;
  category: string;
  sub_category: string;
  unit: string;
  sales_quantity: number;
  sales_amount: number;
  return_quantity: number;
  return_amount: number;
  net_quantity: number;
  net_amount: number;
  avg_price: number;
  cost_amount: number;
  avg_cost_price: number;
  profit_amount: number;
  profit_rate: number;
}

export interface ProfitOverview {
  status: "ok" | "not_imported";
  message?: string;
  batch_id?: string;
  date_range?: string;
  summary?: {
    total_revenue: number;
    total_cost: number;
    total_profit: number;
    overall_margin: number;
    item_count: number;
  };
  categories?: ProfitCategory[];
  product_types?: Array<{
    product_type: string;
    revenue: number;
    cost: number;
    profit: number;
    quantity: number;
    margin: number;
  }>;
  top_profit_items?: ProfitItem[];
  bottom_items?: ProfitItem[];
  batches?: Array<{
    import_batch: string;
    date_range: string;
    item_count: number;
    total_revenue: number;
    total_profit: number;
    imported_at: string;
  }>;
}

export async function fetchProfitOverview(): Promise<ProfitOverview> {
  const response = await axios.get<ProfitOverview>(`${getApiBase()}/api/cinema/finance/profit`);
  return response.data;
}

/** 库存+进销存概览 */
export interface InventoryCategory {
  category: string;
  stock_cost: number;
  stock_qty: number;
  pos_value: number;
  items: number;
}

export interface InventoryItem {
  item_code: string;
  item_name: string;
  category: string;
  stock_quantity: number;
  stock_cost: number;
  pos_price: number;
}

export interface MovementCategory {
  category: string;
  opening: number;
  purchase: number;
  return: number;
  loss: number;
  sales_qty: number;
  sales_cost: number;
  closing: number;
}

export interface MovementItem {
  item_code: string;
  item_name: string;
  category: string;
  sub_category: string;
  unit: string;
  opening_qty: number;
  opening_amount: number;
  purchase_qty: number;
  purchase_amount: number;
  return_qty: number;
  return_amount: number;
  transfer_in_qty: number;
  transfer_in_amount: number;
  transfer_out_qty: number;
  outbound_qty: number;
  outbound_amount: number;
  loss_qty: number;
  loss_amount: number;
  sales_qty: number;
  sales_cost: number;
  inventory_profit_qty: number;
  inventory_profit_amount: number;
  closing_qty: number;
  closing_amount: number;
  loss_diff_pct: number;
  avg_cost: number;
}

export interface InventoryOverview {
  status: "ok" | "not_imported";
  message?: string;
  inventory?: {
    batch_id: string;
    summary: {
      total_stock_cost: number;
      total_stock_qty: number;
      total_pos_value: number;
      item_count: number;
      potential_margin: number;
    };
    categories: InventoryCategory[];
    items: InventoryItem[];
  };
  movement?: {
    batch_id: string;
    date_range: string;
    summary: {
      opening_amount: number;
      purchase_amount: number;
      return_amount: number;
      loss_amount: number;
      sales_qty: number;
      sales_cost: number;
      closing_amount: number;
      inventory_profit_amount: number;
      item_count: number;
    };
    categories: MovementCategory[];
    loss_items: MovementItem[];
    items: MovementItem[];
  };
  inventory_batches?: Array<{
    import_batch: string;
    item_count: number;
    total_stock: number;
    total_cost: number;
    imported_at: string;
  }>;
  movement_batches?: Array<{
    import_batch: string;
    date_range: string;
    item_count: number;
    total_loss: number;
    total_sales_qty: number;
    imported_at: string;
  }>;
}

export async function fetchInventoryOverview(): Promise<InventoryOverview> {
  const response = await axios.get<InventoryOverview>(`${getApiBase()}/api/cinema/finance/inventory`);
  return response.data;
}

/** 批量导入财务报表 */
export interface FinanceImportResult {
  status: "ok" | "partial" | "failed";
  message: string;
  success_count: number;
  failed_count: number;
  results: Array<{
    status: string;
    file_name: string;
    file_type?: string;
    batch_id?: string;
    date_range?: string;
    record_count?: number;
    error?: string;
    message?: string;
  }>;
}

export async function importFinanceBatch(files: File[]): Promise<FinanceImportResult> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const response = await axios.post<FinanceImportResult>(`${getApiBase()}/api/cinema/finance/import-batch`, formData);
  return response.data;
}

/** 会员消费分析 */
export interface MemberAnalysis {
  status: "ok" | "no_data";
  message?: string;
  source?: string;
  summary: {
    total_members: number;
    total_amount: number;
    total_count: number;
    avg_per_member: number;
    avg_per_visit: number;
  };
  frequency_distribution: Record<string, number>;
  avg_amount_distribution: Record<string, number>;
  channel_stats: Record<string, number>;
  top_members: MemberDetail[];
  all_members: MemberDetail[];
}

export interface MemberDetail {
  member_id: string;
  card_type: string;
  total_amount: number;
  total_count: number;
  avg_amount: number;
  ticket_amount: number;
  ticket_count: number;
  concession_amount: number;
  concession_count: number;
  first_time: string | null;
  last_time: string | null;
  channels: string[];
  top_products: Array<{ name: string; amount: number }>;
}

export async function fetchMemberAnalysis(days: number = 30): Promise<MemberAnalysis> {
  const response = await axios.get<MemberAnalysis>(`${getApiBase()}/api/cinema/member-analysis`, {
    params: { days },
  });
  return response.data;
}

/** 库存预警配置 */
export interface InventoryAlertConfig {
  thresholds: Record<string, number>;
  default_threshold: number;
  excluded_products: string[];
}

/** 库存预警项 */
export interface InventoryAlertItem {
  item_name: string;
  category: string;
  stock_quantity: number;
  threshold: number;
  shortage: number;
  stock_cost: number;
  pos_price: number;
}

/** 库存预警响应 */
export interface InventoryAlertResponse {
  status: "ok" | "no_data";
  message?: string;
  date?: string;
  file?: string;
  summary: {
    total_items: number;
    alert_items: number;
    total_shortage: number;
    alert_rate: number;
  };
  items: InventoryAlertItem[];
  config: InventoryAlertConfig;
}

/** 获取库存预警数据 */
export async function fetchInventoryAlert(): Promise<InventoryAlertResponse> {
  const response = await axios.get<InventoryAlertResponse>(`${getApiBase()}/api/cinema/inventory-alert`);
  return response.data;
}

/** 测试库存预警（从最新Excel文件读取） */
export async function testInventoryAlert(): Promise<InventoryAlertResponse> {
  const response = await axios.get<InventoryAlertResponse>(`${getApiBase()}/api/cinema/inventory-alert/test`);
  return response.data;
}

/** 获取库存预警配置 */
export async function fetchInventoryAlertConfig(): Promise<{ status: string; config: InventoryAlertConfig }> {
  const response = await axios.get(`${getApiBase()}/api/cinema/inventory-alert/config`);
  return response.data;
}

/** 更新库存预警配置 */
export async function updateInventoryAlertConfig(config: InventoryAlertConfig): Promise<{ status: string; message: string; config: InventoryAlertConfig }> {
  const response = await axios.post(`${getApiBase()}/api/cinema/inventory-alert/config`, config);
  return response.data;
}

/** 全部库存商品（含阈值/排除状态）- 前台+大仓 */
export interface AllInventoryItem {
  item_name: string;
  category: string;
  front_stock: number;     // 前台库存
  wh_stock: number;        // 大仓库存
  threshold: number;
  is_excluded: boolean;
  front_low: boolean;      // 前台是否低于阈值
  wh_empty: boolean;       // 大仓是否无货
  status: "critical" | "warning" | "ok" | "excluded";
  shortage: number;
  pos_price: number;
}

export interface AllInventoryResponse {
  status: string;
  front_file?: string;
  wh_file?: string;
  total?: number;
  items: AllInventoryItem[];
  config: InventoryAlertConfig;
}

/** 获取全部库存商品（含阈值状态） */
export async function fetchAllInventoryItems(): Promise<AllInventoryResponse> {
  const response = await axios.get<AllInventoryResponse>(`${getApiBase()}/api/cinema/inventory-alert/all-items`);
  return response.data;
}

/** 更新单个商品的阈值或排除状态 */
export async function updateSingleItemConfig(itemName: string, action: "set_threshold" | "exclude" | "include", value?: number): Promise<any> {
  const response = await axios.post(`${getApiBase()}/api/cinema/inventory-alert/config/item`, {
    item_name: itemName,
    action,
    value: value || 0,
  });
  return response.data;
}

/** 预算数据 */
export interface BudgetData {
  cinema: {
    name: string;
    monthly_target: number;
    annual_target: number;
    monthly_box_office_target: number;
    annual_box_office_target: number;
    monthly_concession_target: number;
    annual_concession_target: number;
  };
  billiards: {
    name: string;
    monthly_target: number;
    annual_target: number;
  };
  mahjong: {
    name: string;
    monthly_target: number;
    annual_target: number;
  };
}

/** 获取预算数据 */
export async function fetchBudget(): Promise<BudgetData> {
  const response = await axios.get<{ data: BudgetData }>(`${getApiBase()}/api/budget`);
  return response.data.data;
}

// 快速统计 - 首页轻量级数据
export interface QuickStatsData {
  xiaotie: {
    busy_count: number;
    total_count: number;
    summary_month: { revenue: number };
    summary_year: { revenue: number };
  } | null;
  wu_laoban: {
    active_orders: number;
    total_rooms: number;
    summary_month: { revenue: number };
    summary_year: { revenue: number };
  } | null;
  cinema: {
    summary_month: { revenue: number; customer_count: number };
    summary_year: { revenue: number; customer_count: number };
  } | null;
  has_detail_cache: boolean;
}

export async function fetchQuickStats(): Promise<QuickStatsData> {
  const response = await axios.get<QuickStatsData>(`${getApiBase()}/api/quick-stats`);
  return response.data;
}

export async function triggerDetailRefresh(): Promise<void> {
  await axios.post(`${getApiBase()}/api/detail/refresh`);
}
