import { generateBusinessAlerts } from "../lib/businessAlertRules";
import type { BusinessSummary } from "../lib/businessAdapters";

const emptyResult = generateBusinessAlerts([]);

const emptySummary: BusinessSummary = {
  businessType: "cinema",
  displayName: "影院",
  revenue: 0,
  orders: 0,
  customers: 0,
  utilizationRate: null,
  avgOrderValue: null,
  status: "empty",
  statusMessage: "未导入",
};

const errorSummary: BusinessSummary = {
  ...emptySummary,
  status: "error",
  statusMessage: "接口异常",
};

const revenueZeroSummary: BusinessSummary = {
  ...emptySummary,
  status: "normal",
  revenue: 0,
  orders: 12,
};

const ordersZeroSummary: BusinessSummary = {
  ...emptySummary,
  status: "normal",
  revenue: 120,
  orders: 0,
};

const utilizationLowSummary: BusinessSummary = {
  ...emptySummary,
  status: "normal",
  revenue: 120,
  orders: 12,
  utilizationRate: 0.19,
};

const avgOrderLowSummary: BusinessSummary = {
  ...emptySummary,
  status: "normal",
  revenue: 12,
  orders: 2,
  avgOrderValue: 9,
};
const noisySummary: BusinessSummary = {
  ...emptySummary,
  businessType: "billiards",
  displayName: "台球",
  status: "normal",
  revenue: 0,
  orders: 0,
  customers: 2,
  utilizationRate: 0.1,
  avgOrderValue: 6,
};

const emptyAlerts = generateBusinessAlerts([emptySummary]);
const errorAlerts = generateBusinessAlerts([errorSummary]);
const revenueZeroAlerts = generateBusinessAlerts([revenueZeroSummary]);
const ordersZeroAlerts = generateBusinessAlerts([ordersZeroSummary]);
const utilizationLowAlerts = generateBusinessAlerts([utilizationLowSummary]);
const avgOrderLowAlerts = generateBusinessAlerts([avgOrderLowSummary]);
const dedupedAlerts = generateBusinessAlerts([noisySummary, noisySummary]);

emptyResult.length;
emptyAlerts[0].title.length;
errorAlerts[0].level;
errorAlerts[0].priorityScore.toFixed(0);
revenueZeroAlerts[0].suggestion.length;
ordersZeroAlerts[0].metric;
utilizationLowAlerts[0].value?.toFixed(2);
avgOrderLowAlerts[0].message.length;
dedupedAlerts.length <= 3;
dedupedAlerts[0].priorityScore >= dedupedAlerts[dedupedAlerts.length - 1].priorityScore;

export function BusinessAlertRulesContract() {
  return null;
}
