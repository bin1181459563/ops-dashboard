import { unwrapApiData } from "./apiEnvelope";
import type { OverviewData } from "../types/dashboard";

export type BusinessType = "cinema" | "billiards" | "mahjong" | "qgcloud";
export type BusinessStatus = "normal" | "warning" | "error" | "empty" | "unknown";

export interface BusinessSummary {
  businessType: BusinessType;
  displayName: string;
  revenue: number;
  orders: number;
  customers: number;
  utilizationRate: number | null;
  avgOrderValue: number | null;
  trend?: number[];
  updatedAt?: string | null;
  status: BusinessStatus;
  statusMessage?: string;
  raw?: unknown;
}

type UnknownRecord = Record<string, unknown>;

const BUSINESS_NAMES: Record<BusinessType, string> = {
  cinema: "影院",
  billiards: "台球",
  mahjong: "棋牌",
  qgcloud: "轻购云",
};

const EMPTY_STATUS_MESSAGES: Record<BusinessType, string> = {
  cinema: "未导入",
  billiards: "暂无数据",
  mahjong: "暂无数据",
  qgcloud: "暂无数据",
};

export function toCinemaSummary(raw: unknown): BusinessSummary {
  const record = toRecord(raw);
  const today = toRecord(record.today);
  const status = stringValue(record.status, today.status);
  const revenue = numberValue(today.revenue, record.revenue);
  const orders = numberValue(today.screenings, record.screenings, record.orders, record.order_count);
  const customers = numberValue(today.customer_count, record.customer_count, record.customers, record.attendance);
  const avgOrderValue = nullableNumber(today.avg_order_value, record.avg_order_value, average(revenue, customers || orders));

  return {
    businessType: "cinema",
    displayName: BUSINESS_NAMES.cinema,
    revenue: status === "ok" ? revenue : 0,
    orders: status === "ok" ? orders : 0,
    customers: status === "ok" ? customers : 0,
    utilizationRate: status === "ok" ? utilizationValue(today.occupancy_rate, record.occupancy_rate, record.usage_rate) : null,
    avgOrderValue: status === "ok" ? avgOrderValue : null,
    trend: trendValues(record.trend, record.box_office_trend_7d, record.box_office_trend_30d),
    updatedAt: stringValue(today.last_import_time, record.last_import_time, record.updated_at, record.time, today.date, record.date),
    status: status === "ok" ? inferActiveStatus(revenue, orders, customers) : status === "error" ? "error" : "empty",
    statusMessage: stringValue(record.message) || (status === "ok" ? undefined : EMPTY_STATUS_MESSAGES.cinema),
    raw,
  };
}

export function toBilliardsSummary(raw: unknown): BusinessSummary {
  const record = toRecord(raw);
  const today = toRecord(record.summary_today);
  const status = stringValue(record.status, record.sync_status);
  const revenue = numberValue(today.revenue, today.total_revenue, record.revenue, record.total_revenue);
  const orders = numberValue(today.order_count, today.orders, record.orders, record.order_count);
  const customers = numberValue(today.face_count, today.member_count, record.customer_count, record.customers, orders);
  const totalCount = nullableNumber(record.total_count);
  const busyCount = nullableNumber(record.busy_count);

  return buildVenueSummary({
    businessType: "billiards",
    raw,
    record,
    status,
    revenue,
    orders,
    customers,
    utilizationRate: utilizationValue(record.usage_rate, ratio(busyCount, totalCount)),
    avgOrderValue: nullableNumber(record.avg_order_value, average(revenue, orders)),
    trend: trendValues(record.trend, record.revenue_trend, record.daily_trend),
    updatedAt: stringValue(record.last_update, record.last_updated, record.updated_at, record.time),
  });
}

export function toMahjongSummary(raw: unknown): BusinessSummary {
  const record = toRecord(raw);
  const today = toRecord(record.summary_today);
  const status = stringValue(record.status, record.sync_status);
  const revenue = numberValue(today.revenue, record.revenue, record.total_revenue);
  const orders = numberValue(today.order_count, record.orders, record.order_count, record.active_orders);
  const customers = numberValue(today.user_count, record.customer_count, record.customers, orders);
  const totalRooms = nullableNumber(record.total_rooms);
  const activeOrders = nullableNumber(record.active_orders);

  return buildVenueSummary({
    businessType: "mahjong",
    raw,
    record,
    status,
    revenue,
    orders,
    customers,
    utilizationRate: utilizationValue(record.usage_rate, ratio(activeOrders, totalRooms)),
    avgOrderValue: nullableNumber(record.avg_order_value, average(revenue, orders)),
    trend: trendValues(record.trend, record.revenue_trend, record.daily_trend),
    updatedAt: stringValue(record.last_update, record.last_updated, record.updated_at, record.time),
  });
}

export function toQgcloudSummary(raw: unknown): BusinessSummary {
  const record = toRecord(raw);
  const status = stringValue(record.status, record.sync_status);
  const revenue = numberValue(record.revenue, record.amount, record.today_amount);
  const orders = numberValue(record.orders, record.count, record.today_count);

  return buildVenueSummary({
    businessType: "qgcloud",
    raw,
    record,
    status,
    revenue,
    orders,
    customers: 0,
    utilizationRate: null,
    avgOrderValue: nullableNumber(record.avg_order_value, average(revenue, orders)),
    trend: trendValues(record.trend, record.revenue_trend),
    updatedAt: stringValue(record.last_update, record.last_updated, record.updated_at, record.time),
  });
}

export function toBusinessSummaries(input: {
  cinema?: unknown;
  billiards?: unknown;
  mahjong?: unknown;
  qgcloud?: unknown;
}): BusinessSummary[] {
  const summaries = [
    toBilliardsSummary(input.billiards),
    toMahjongSummary(input.mahjong),
    toCinemaSummary(input.cinema),
  ];
  if (input.qgcloud !== undefined) summaries.push(toQgcloudSummary(input.qgcloud));
  return summaries;
}

export function toOverviewBusinessSummaries(overview?: OverviewData): BusinessSummary[] {
  return toBusinessSummaries({
    billiards: {
      ...(overview?.platforms.xiaotie || {}),
      status: overview?.source_status?.xiaotie?.status,
      message: overview?.source_status?.xiaotie?.message,
    },
    mahjong: {
      ...(overview?.platforms.wu_laoban || {}),
      status: overview?.source_status?.wu_laoban?.status,
      message: overview?.source_status?.wu_laoban?.message,
    },
    cinema: overview?.cinema,
  });
}

function buildVenueSummary(input: {
  businessType: BusinessType;
  raw: unknown;
  record: UnknownRecord;
  status: string;
  revenue: number;
  orders: number;
  customers: number;
  utilizationRate: number | null;
  avgOrderValue: number | null;
  trend?: number[];
  updatedAt?: string | null;
}): BusinessSummary {
  const status = statusFromRecord(input.status, input.record, input.revenue, input.orders, input.customers);
  return {
    businessType: input.businessType,
    displayName: BUSINESS_NAMES[input.businessType],
    revenue: input.revenue,
    orders: input.orders,
    customers: input.customers,
    utilizationRate: input.utilizationRate,
    avgOrderValue: input.avgOrderValue,
    trend: input.trend,
    updatedAt: input.updatedAt,
    status,
    statusMessage: statusMessage(input.businessType, status, input.status, input.record),
    raw: input.raw,
  };
}

function toRecord(raw: unknown): UnknownRecord {
  const unwrapped = unwrapApiData<unknown>(raw, {});
  if (isRecord(unwrapped)) return unwrapped;
  return {};
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(...values: unknown[]): number {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null) return parsed;
  }
  return 0;
}

function nullableNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function utilizationValue(...values: unknown[]): number | null {
  const value = nullableNumber(...values);
  if (value === null) return null;
  if (value > 1 && value <= 100) return value / 100;
  return Math.max(0, Math.min(1, value));
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

function average(total: number, count: number): number | null {
  if (count <= 0) return null;
  return total / count;
}

function trendValues(...values: unknown[]): number[] | undefined {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    const trend = value
      .map((item) => {
        if (isRecord(item)) return nullableNumber(item.revenue, item.value, item.amount, item.box_office);
        return nullableNumber(item);
      })
      .filter((item): item is number => item !== null);
    if (trend.length) return trend;
  }
  return undefined;
}

function statusFromRecord(status: string, record: UnknownRecord, revenue: number, orders: number, customers: number): BusinessStatus {
  if (["error", "failed", "sync_failed"].includes(status)) return "error";
  if (["token_invalid", "not_connected", "skipped", "placeholder"].includes(status)) return "warning";
  if (["not_imported", "no_data", "empty"].includes(status)) return "empty";
  if (status === "ok" || status === "normal" || status === "success") return inferActiveStatus(revenue, orders, customers);
  if (Object.keys(record).length === 0) return "empty";
  return inferActiveStatus(revenue, orders, customers);
}

function inferActiveStatus(revenue: number, orders: number, customers: number): BusinessStatus {
  return revenue > 0 || orders > 0 || customers > 0 ? "normal" : "empty";
}

function statusMessage(businessType: BusinessType, status: BusinessStatus, rawStatus: string, record: UnknownRecord): string | undefined {
  const message = stringValue(record.message, record.error, record.error_reason, record.sync_message);
  if (message) return message;
  if (rawStatus === "token_invalid") return "token 失效";
  if (rawStatus === "sync_failed" || rawStatus === "failed") return "同步异常";
  if (status === "empty") return EMPTY_STATUS_MESSAGES[businessType];
  if (status === "error") return "数据异常";
  return undefined;
}
