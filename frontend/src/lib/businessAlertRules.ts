import type { BusinessSummary, BusinessType, BusinessStatus } from "./businessAdapters";

export type BusinessAlertLevel = "info" | "warning" | "danger";
export type BusinessAlertCategory = "data" | "revenue" | "orders" | "utilization" | "customer" | "system";

export interface BusinessAlert {
  id: string;
  businessType: BusinessType;
  businessName: string;
  level: BusinessAlertLevel;
  category: BusinessAlertCategory;
  title: string;
  message: string;
  suggestion: string;
  metric?: string;
  value?: number | null;
  createdAt: string;
  priorityScore: number;
}

const LEVEL_ORDER: Record<BusinessAlertLevel, number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

export function generateBusinessAlerts(summaries: BusinessSummary[]): BusinessAlert[] {
  if (!summaries.length) return [];
  const alerts: BusinessAlert[] = [];
  for (const summary of summaries) {
    alerts.push(...alertsForSummary(summary));
  }
  return dedupeAndSortAlerts(alerts);
}

function alertsForSummary(summary: BusinessSummary): BusinessAlert[] {
  const createdAt = new Date().toISOString();
  const alerts: BusinessAlert[] = [];

  if (isErrorBusiness(summary.status)) {
    alerts.push(buildAlert(summary, {
      id: "data-error",
      level: "danger",
      category: "system",
      title: "数据源异常",
      message: "当前业务数据源异常，可能存在接口失败或 token 失效。",
      suggestion: "检查接口状态、token 是否失效，或稍后重新采集。",
      metric: "status",
      value: null,
      createdAt,
      priorityScore: 100,
    }));
    return alerts;
  }

  if (summary.status === "warning") {
    alerts.push(buildAlert(summary, {
      id: "data-warning",
      level: "warning",
      category: "system",
      title: "数据源需要处理",
      message: summary.statusMessage || "当前业务数据源存在异常提示。",
      suggestion: "检查接口状态、token 是否失效，或稍后重新采集。",
      metric: "status",
      value: null,
      createdAt,
      priorityScore: 72,
    }));
  }

  if (isEmptyBusiness(summary)) {
    alerts.push(buildAlert(summary, {
      id: "data-empty",
      level: "info",
      category: "data",
      title: "暂无经营数据",
      message: "当前业务没有可用于判断的经营数据。",
      suggestion: "检查数据是否已导入，或确认第三方平台是否正常返回。",
      metric: "status",
      value: null,
      createdAt,
      priorityScore: 28,
    }));
    return alerts;
  }

  if (summary.revenue <= 0) {
    alerts.push(buildAlert(summary, {
      id: "revenue-zero",
      level: "warning",
      category: "revenue",
      title: "今日收入为 0",
      message: "当前业务收入为 0。",
      suggestion: "确认是否真实无收入，或检查订单/票房数据是否正常同步。",
      metric: "revenue",
      value: summary.revenue,
      createdAt,
      priorityScore: 78,
    }));
  }

  if (summary.orders <= 0 && summary.revenue > 0) {
    alerts.push(buildAlert(summary, {
      id: "orders-zero",
      level: "warning",
      category: "orders",
      title: "订单数据异常",
      message: "收入存在但订单为 0。",
      suggestion: "请检查订单字段或接口返回，确认是否存在字段映射问题。",
      metric: "orders",
      value: summary.orders,
      createdAt,
      priorityScore: 88,
    }));
  }

  if (summary.utilizationRate != null && summary.utilizationRate < 0.2) {
    alerts.push(buildAlert(summary, {
      id: "utilization-low",
      level: "warning",
      category: "utilization",
      title: "利用率偏低",
      message: `当前利用率为 ${(summary.utilizationRate * 100).toFixed(0)}%。`,
      suggestion: "可考虑低峰时段活动、团购曝光或员工主动推荐。",
      metric: "utilizationRate",
      value: summary.utilizationRate,
      createdAt,
      priorityScore: utilizationScore(summary.utilizationRate),
    }));
  }

  if (summary.avgOrderValue != null && summary.avgOrderValue < 10) {
    alerts.push(buildAlert(summary, {
      id: "avg-order-low",
      level: "info",
      category: "customer",
      title: "客单价偏低",
      message: `当前客单价为 ${summary.avgOrderValue.toFixed(2)} 元。`,
      suggestion: "可检查套餐、卖品、会员活动是否有提升空间。",
      metric: "avgOrderValue",
      value: summary.avgOrderValue,
      createdAt,
      priorityScore: avgOrderScore(summary.avgOrderValue),
    }));
  }

  return alerts;
}

function buildAlert(summary: BusinessSummary, payload: Omit<BusinessAlert, "businessType" | "businessName">): BusinessAlert {
  return {
    businessType: summary.businessType,
    businessName: summary.displayName,
    ...payload,
    id: `${summary.businessType}-${payload.id}`,
  };
}

function dedupeAndSortAlerts(alerts: BusinessAlert[]): BusinessAlert[] {
  const deduped = new Map<string, BusinessAlert>();
  for (const alert of alerts) {
    const key = dedupeKey(alert);
    const existing = deduped.get(key);
    if (!existing || existing.priorityScore < alert.priorityScore) {
      deduped.set(key, alert);
    }
  }

  const byBusiness = new Map<BusinessType, BusinessAlert[]>();
  for (const alert of deduped.values()) {
    const list = byBusiness.get(alert.businessType) || [];
    list.push(alert);
    byBusiness.set(alert.businessType, list);
  }

  const result: BusinessAlert[] = [];
  for (const list of byBusiness.values()) {
    list.sort(compareAlerts);
    result.push(...list.slice(0, 3));
  }

  return result.sort(compareAlerts);
}

function dedupeKey(alert: BusinessAlert): string {
  const normalized = normalizeTitle(alert.title);
  const family = normalized.includes("revenue")
    ? "revenue"
    : normalized.includes("order")
      ? "orders"
      : normalized.includes("utilization")
        ? "utilization"
        : normalized.includes("data")
          ? "data"
          : normalized.includes("客单")
            ? "customer"
            : alert.category;
  return `${alert.businessType}-${family}-${alert.category}`;
}

function compareAlerts(a: BusinessAlert, b: BusinessAlert): number {
  const scoreDiff = b.priorityScore - a.priorityScore;
  if (scoreDiff !== 0) return scoreDiff;
  const levelDiff = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  if (levelDiff !== 0) return levelDiff;
  return a.title.localeCompare(b.title);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, "");
}

function utilizationScore(rate: number | null): number {
  if (rate == null) return 60;
  if (rate < 0.1) return 92;
  if (rate < 0.2) return 84;
  return 72;
}

function avgOrderScore(value: number | null): number {
  if (value == null) return 48;
  if (value < 5) return 92;
  if (value < 10) return 78;
  return 66;
}

function isErrorBusiness(status: BusinessStatus): boolean {
  return status === "error";
}

function isEmptyBusiness(summary: BusinessSummary): boolean {
  if (summary.status === "empty") return true;
  return summary.revenue <= 0 && summary.orders <= 0 && summary.customers <= 0;
}
