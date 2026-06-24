import { generateBusinessInsights } from "../lib/businessInsightRules";
import type { BusinessAlert } from "../lib/businessAlertRules";
import type { BusinessSummary } from "../lib/businessAdapters";

const baseSummary: BusinessSummary = {
  businessType: "billiards",
  displayName: "台球",
  revenue: 1200,
  orders: 24,
  customers: 18,
  utilizationRate: 0.18,
  avgOrderValue: 50,
  status: "normal",
};

const baseAlert: BusinessAlert = {
  id: "billiards-utilization-low",
  businessType: "billiards",
  businessName: "台球",
  level: "warning",
  category: "utilization",
  title: "利用率偏低",
  message: "当前利用率为 18%。",
  suggestion: "可考虑低峰时段活动、团购曝光或员工主动推荐。",
  metric: "utilizationRate",
  value: 0.18,
  createdAt: "2026-06-24T10:00:00+08:00",
  priorityScore: 84,
};

const emptyInsights = generateBusinessInsights({ summaries: [], alerts: [] });
const dataInsights = generateBusinessInsights({
  summaries: [{ ...baseSummary, businessType: "cinema", displayName: "影院", status: "error" }],
  alerts: [
    { ...baseAlert, id: "cinema-data-error", businessType: "cinema", businessName: "影院", level: "danger", category: "system", title: "数据源异常" },
    { ...baseAlert, id: "cinema-data-error-dup", businessType: "cinema", businessName: "影院", level: "danger", category: "data", title: "数据源异常" },
  ],
});
const revenueInsights = generateBusinessInsights({
  summaries: [baseSummary],
  alerts: [{ ...baseAlert, category: "revenue", title: "今日收入为 0" }],
});
const ordersInsights = generateBusinessInsights({
  summaries: [baseSummary],
  alerts: [{ ...baseAlert, category: "orders", title: "订单数据异常" }],
});
const billiardsInsights = generateBusinessInsights({ summaries: [baseSummary], alerts: [baseAlert] });
const mahjongInsights = generateBusinessInsights({
  summaries: [{ ...baseSummary, businessType: "mahjong", displayName: "棋牌" }],
  alerts: [{ ...baseAlert, id: "mahjong-utilization-low", businessType: "mahjong", businessName: "棋牌" }],
});
const cinemaInsights = generateBusinessInsights({
  summaries: [{ ...baseSummary, businessType: "cinema", displayName: "影院" }],
  alerts: [{ ...baseAlert, id: "cinema-utilization-low", businessType: "cinema", businessName: "影院" }],
});
const customerInsights = generateBusinessInsights({
  summaries: [baseSummary],
  alerts: [{ ...baseAlert, category: "customer", title: "客单价偏低" }],
});
const sortedInsights = generateBusinessInsights({
  summaries: [
    { ...baseSummary, businessType: "cinema", displayName: "影院", revenue: 0, orders: 0, customers: 0, status: "empty" },
    { ...baseSummary, businessType: "mahjong", displayName: "棋牌", revenue: 0, orders: 0, customers: 0, status: "error" },
  ],
  alerts: [
    { ...baseAlert, id: "cinema-revenue-zero", businessType: "cinema", businessName: "影院", category: "revenue", title: "今日收入为 0", level: "warning" },
    { ...baseAlert, id: "mahjong-data-error", businessType: "mahjong", businessName: "棋牌", category: "system", title: "数据源异常", level: "danger" },
  ],
});
const deterministicTieInsights = generateBusinessInsights({
  summaries: [
    { ...baseSummary, businessType: "billiards", displayName: "台球", revenue: 0, orders: 0, customers: 0, status: "empty" },
    { ...baseSummary, businessType: "mahjong", displayName: "棋牌", revenue: 0, orders: 0, customers: 0, status: "empty" },
    { ...baseSummary, businessType: "cinema", displayName: "影院", revenue: 0, orders: 0, customers: 0, status: "empty" },
  ],
  alerts: [
    { ...baseAlert, id: "billiards-data-empty", businessType: "billiards", businessName: "台球", category: "data", title: "暂无经营数据", level: "info", priorityScore: 28 },
    { ...baseAlert, id: "mahjong-data-empty", businessType: "mahjong", businessName: "棋牌", category: "data", title: "暂无经营数据", level: "info", priorityScore: 28 },
    { ...baseAlert, id: "cinema-data-empty", businessType: "cinema", businessName: "影院", category: "data", title: "暂无经营数据", level: "info", priorityScore: 28 },
  ],
});

emptyInsights.length;
dataInsights[0].priorityScore.toFixed(0);
revenueInsights[0].title.length;
ordersInsights[0].actions.length;
billiardsInsights[0].actions[0].length;
mahjongInsights[0].actions[0].length;
cinemaInsights[0].actions[0].length;
customerInsights[0].reason.length;
sortedInsights[0].priorityScore >= sortedInsights[sortedInsights.length - 1].priorityScore;
dataInsights.length <= 2;
deterministicTieInsights.map((item) => item.businessType).join(",") === "billiards,mahjong,cinema";

export function BusinessInsightRulesContract() {
  return null;
}
