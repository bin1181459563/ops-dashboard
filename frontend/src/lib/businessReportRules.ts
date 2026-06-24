import type { BusinessInsight } from "./businessInsightRules";

type ReportType = "daily" | "weekly" | "monthly";

interface ReportBusinessItem {
  name: string;
  venue: string;
  revenue: number;
  orders: number;
  customers: number;
  changeLabel?: string;
}

interface ReportSummary {
  total_revenue?: number;
  total_orders?: number;
  total_customers?: number;
  avg_daily_revenue?: number;
}

interface BuildReportInput {
  reportType: ReportType;
  reportDate: string;
  summary: ReportSummary;
  businesses: ReportBusinessItem[];
  insights: BusinessInsight[];
  baseReport?: string;
}

export interface BusinessReportSections {
  title: string;
  headline: string;
  actionTitle: string;
  highlights: string[];
  focusIssues: string[];
  actions: string[];
}

export function buildBusinessReportSections(input: BuildReportInput): BusinessReportSections {
  const title = `翡翠城经营${reportTypeLabel(input.reportType)}`;
  const topBusiness = [...input.businesses].sort((a, b) => b.revenue - a.revenue)[0];
  const headline = topBusiness
    ? `${topBusiness.venue || topBusiness.name}当前贡献最高，收入 ${currency(topBusiness.revenue)}。`
    : "当前报告已生成，可结合经营建议安排当天动作。";

  const highlights: string[] = [];
  if ((input.summary.total_revenue || 0) > 0) highlights.push(`总收入 ${currency(input.summary.total_revenue || 0)}`);
  if ((input.summary.total_orders || 0) > 0) highlights.push(`总订单 ${input.summary.total_orders} 单`);
  if ((input.summary.total_customers || 0) > 0) highlights.push(`总客流 ${input.summary.total_customers} 人`);
  if ((input.summary.avg_daily_revenue || 0) > 0) highlights.push(`日均收入 ${currency(input.summary.avg_daily_revenue || 0)}`);
  if (topBusiness) highlights.push(`${topBusiness.name} 贡献最高`);

  const rankedInsights = rankInsights(input.insights);
  const focusIssues = rankedInsights.map((insight) => `${insight.businessName}: ${insight.problem}`).slice(0, 3);
  const actions = rankedInsights.flatMap((insight) => insight.actions.slice(0, 1)).filter(Boolean).slice(0, 3);
  if (!actions.length) {
    actions.push("持续关注收入、订单和数据同步状态", "对低峰时段提前安排活动和员工跟进");
  }

  return {
    title,
    headline,
    actionTitle: actionTitleForReportType(input.reportType),
    highlights,
    focusIssues,
    actions,
  };
}

export function formatBusinessReportText(input: BuildReportInput): string {
  const sections = buildBusinessReportSections(input);
  const lines = [sections.title];
  if (input.reportDate) lines.push(`日期: ${input.reportDate}`);
  lines.push("");
  lines.push(sections.headline);

  if (sections.highlights.length) {
    lines.push("");
    lines.push("核心摘要:");
    sections.highlights.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (sections.focusIssues.length) {
    lines.push("");
    lines.push("重点经营问题:");
    sections.focusIssues.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (sections.actions.length) {
    lines.push("");
    lines.push(`${sections.actionTitle}:`);
    sections.actions.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (input.businesses.length) {
    lines.push("");
    lines.push("业务概览:");
    input.businesses.slice(0, 3).forEach((business) => {
      const change = business.changeLabel ? ` · 变化 ${business.changeLabel}` : "";
      lines.push(`- ${business.venue || business.name}: ${currency(business.revenue)} · ${business.orders}单${change}`);
    });
  }

  if (input.insights.length) {
    lines.push("");
    lines.push("重点经营建议:");
    input.insights.slice(0, 3).forEach((insight, index) => {
      lines.push(`${index + 1}. ${insight.title}`);
      lines.push(`   问题: ${insight.problem}`);
      insight.actions.slice(0, 2).forEach((action) => lines.push(`   - ${action}`));
    });
  }

  if (input.baseReport) {
    lines.push("");
    lines.push("原始报告:");
    lines.push(input.baseReport);
  }

  return lines.join("\n");
}

function reportTypeLabel(type: ReportType): string {
  return type === "weekly" ? "周报" : type === "monthly" ? "月报" : "日报";
}

function actionTitleForReportType(type: ReportType): string {
  return type === "weekly" ? "本周重点动作" : type === "monthly" ? "本月重点动作" : "今日重点动作";
}

function rankInsights(insights: BusinessInsight[]): BusinessInsight[] {
  const deduped = new Map<string, BusinessInsight>();
  for (const insight of insights) {
    const key = `${insight.businessType}-${insight.category}-${normalizeText(insight.title)}`;
    const existing = deduped.get(key);
    if (!existing || existing.priorityScore < insight.priorityScore) {
      deduped.set(key, insight);
    }
  }

  return [...deduped.values()].sort((a, b) => b.priorityScore - a.priorityScore);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function currency(value: number): string {
  return `¥${value.toLocaleString()}`;
}
