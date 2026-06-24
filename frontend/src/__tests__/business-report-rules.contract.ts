import { buildBusinessReportSections, formatBusinessReportText } from "../lib/businessReportRules";
import type { BusinessInsight } from "../lib/businessInsightRules";

const insight: BusinessInsight = {
  id: "billiards-utilization-billiards-utilization-low",
  businessType: "billiards",
  businessName: "台球",
  priority: "high",
  category: "utilization",
  title: "台球低峰利用率提升",
  problem: "台球当前利用率偏低，空闲资源较多。",
  reason: "当前利用率约 18%，需要用低峰活动提高使用效率。",
  actions: ["设置 14:00-17:00 低峰 2 小时套餐", "让前台主动推荐团购用户加钟"],
  expectedEffect: "提升低峰时段资源使用率。",
  relatedAlertIds: ["billiards-utilization-low"],
  createdAt: "2026-06-24T10:00:00+08:00",
  priorityScore: 86,
};

const sections = buildBusinessReportSections({
  reportType: "daily",
  reportDate: "2026-06-24",
  summary: { total_revenue: 1280, total_orders: 32, total_customers: 18 },
  businesses: [
    { name: "台球", venue: "台球", revenue: 800, orders: 20, customers: 12, changeLabel: "+12%" },
    { name: "影院", venue: "影院", revenue: 480, orders: 12, customers: 6, changeLabel: "-8%" },
  ],
  insights: [insight],
});

const weeklyText = formatBusinessReportText({
  reportType: "weekly",
  reportDate: "2026-06-24",
  summary: { total_revenue: 1280, total_orders: 32, total_customers: 18 },
  businesses: [],
  insights: [insight],
  baseReport: "原始周报",
});

const emptyText = formatBusinessReportText({
  reportType: "monthly",
  reportDate: "",
  summary: {},
  businesses: [],
  insights: [],
});

sections.title.length;
sections.headline.length;
sections.actionTitle.length;
sections.highlights.length;
sections.focusIssues[0].length;
sections.actions[0].length;
weeklyText.includes("经营周报");
weeklyText.includes("重点经营问题");
weeklyText.includes("原始周报");
emptyText.includes("经营月报");

export function BusinessReportRulesContract() {
  return null;
}
