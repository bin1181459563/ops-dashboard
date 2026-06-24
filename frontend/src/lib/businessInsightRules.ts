import type { BusinessAlert } from "./businessAlertRules";
import type { BusinessSummary, BusinessType } from "./businessAdapters";

export type BusinessInsightPriority = "high" | "medium" | "low";
export type BusinessInsightCategory = "revenue" | "orders" | "utilization" | "data" | "customer" | "promotion" | "system";

export interface BusinessInsight {
  id: string;
  businessType: BusinessType;
  businessName: string;
  priority: BusinessInsightPriority;
  category: BusinessInsightCategory;
  title: string;
  problem: string;
  reason: string;
  actions: string[];
  expectedEffect?: string;
  relatedAlertIds?: string[];
  createdAt: string;
  priorityScore: number;
}

const PRIORITY_ORDER: Record<BusinessInsightPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function generateBusinessInsights(input: {
  summaries: BusinessSummary[];
  alerts: BusinessAlert[];
}): BusinessInsight[] {
  if (!input.summaries.length && !input.alerts.length) return [];
  const summaryMap = new Map(input.summaries.map((summary) => [summary.businessType, summary]));
  const insights: BusinessInsight[] = [];

  for (const alert of dedupeAlerts(input.alerts)) {
    const summary = summaryMap.get(alert.businessType);
    const insight = insightFromAlert(alert, summary);
    if (insight) insights.push(insight);
  }

  return dedupeAndRankInsights(insights);
}

function insightFromAlert(alert: BusinessAlert, summary?: BusinessSummary): BusinessInsight | null {
  if (alert.category === "data" || alert.category === "system") {
    return buildInsight(alert, {
      priority: alert.level === "danger" ? "high" : "medium",
      category: "system",
      title: `${alert.businessName}数据同步检查`,
      problem: alert.level === "danger" ? `${alert.businessName}当前数据源异常，经营判断可能不完整。` : `${alert.businessName}当前经营数据为空或不完整。`,
      reason: alert.message || "系统暂时没有拿到稳定的经营数据。",
      actions: dataActions(alert.businessType),
      expectedEffect: "先恢复数据可信度，再判断真实经营表现。",
      priorityScore: alert.priorityScore,
    });
  }

  if (alert.category === "revenue") {
    return buildInsight(alert, {
      priority: alert.level === "danger" ? "high" : "medium",
      category: "revenue",
      title: `${alert.businessName}收入核查`,
      problem: `${alert.businessName}当前收入为 0 或明显偏空。`,
      reason: "收入为空会影响日报、排班和活动判断，需要先确认是真实无收入还是数据未同步。",
      actions: revenueActions(alert.businessType),
      expectedEffect: "明确收入为空的原因，避免日报和经营判断失真。",
      priorityScore: alert.priorityScore,
    });
  }

  if (alert.category === "orders") {
    return buildInsight(alert, {
      priority: "high",
      category: "orders",
      title: `${alert.businessName}订单数据核查`,
      problem: `${alert.businessName}存在收入但订单数为 0。`,
      reason: "收入和订单不匹配，可能影响客流、转化和员工动作判断。",
      actions: ordersActions(alert.businessType),
      expectedEffect: "让收入、订单和现场经营记录对齐。",
      priorityScore: alert.priorityScore + 4,
    });
  }

  if (alert.category === "utilization") {
    return buildInsight(alert, {
      priority: alert.businessType === "cinema" ? "medium" : "high",
      category: "utilization",
      title: `${alert.businessName}低峰利用率提升`,
      problem: `${alert.businessName}当前利用率偏低，空闲资源较多。`,
      reason: summary?.utilizationRate != null ? `当前利用率约 ${(summary.utilizationRate * 100).toFixed(0)}%，需要用低峰活动提高使用效率。` : "当前利用率低于预期，需要用低峰活动提高使用效率。",
      actions: utilizationActions(alert.businessType),
      expectedEffect: "提升低峰时段资源使用率，并带动会员复购和现场消费。",
      priorityScore: alert.priorityScore + businessPriorityBoost(alert.businessType),
    });
  }

  if (alert.category === "customer") {
    return buildInsight(alert, {
      priority: "low",
      category: "customer",
      title: `${alert.businessName}客单价提升`,
      problem: `${alert.businessName}当前客单价偏低。`,
      reason: summary?.avgOrderValue != null ? `当前客单价约 ${summary.avgOrderValue.toFixed(2)} 元，套餐和附加消费仍有提升空间。` : "套餐和附加消费仍有提升空间。",
      actions: customerActions(alert.businessType),
      expectedEffect: "提高单客消费贡献，减少只靠客流增长带来的压力。",
      priorityScore: alert.priorityScore - 12,
    });
  }

  return null;
}

function buildInsight(alert: BusinessAlert, payload: Omit<BusinessInsight, "id" | "businessType" | "businessName" | "relatedAlertIds" | "createdAt">): BusinessInsight {
  return {
    id: `${alert.businessType}-${payload.category}-${alert.id}`,
    businessType: alert.businessType,
    businessName: alert.businessName,
    relatedAlertIds: [alert.id],
    createdAt: new Date().toISOString(),
    ...payload,
    actions: normalizeActions(payload.actions),
  };
}

function dedupeAndRankInsights(insights: BusinessInsight[]): BusinessInsight[] {
  const deduped = new Map<string, BusinessInsight>();
  for (const insight of insights) {
    const key = dedupeKey(insight);
    const existing = deduped.get(key);
    if (!existing || existing.priorityScore < insight.priorityScore) {
      deduped.set(key, insight);
    }
  }

  const byBusiness = new Map<BusinessType, BusinessInsight[]>();
  for (const insight of deduped.values()) {
    const list = byBusiness.get(insight.businessType) || [];
    list.push(insight);
    byBusiness.set(insight.businessType, list);
  }

  const result: BusinessInsight[] = [];
  for (const list of byBusiness.values()) {
    list.sort(compareInsights);
    result.push(...list.slice(0, 3));
  }

  return result.sort(compareInsights);
}

function dedupeKey(insight: BusinessInsight): string {
  return `${insight.businessType}-${insight.category}-${normalizeText(insight.title)}`;
}

function compareInsights(a: BusinessInsight, b: BusinessInsight): number {
  const scoreDiff = b.priorityScore - a.priorityScore;
  if (scoreDiff !== 0) return scoreDiff;
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.title.localeCompare(b.title);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function businessPriorityBoost(businessType: BusinessType): number {
  return businessType === "cinema" ? 6 : businessType === "mahjong" ? 4 : 2;
}

function dedupeAlerts(alerts: BusinessAlert[]): BusinessAlert[] {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = `${alert.businessType}-${alert.category}-${alert.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeActions(actions: string[]): string[] {
  return actions.filter(Boolean).slice(0, 4).length >= 2 ? actions.filter(Boolean).slice(0, 4) : ["确认今日经营数据是否完整", "安排负责人跟进并在日报中记录原因"];
}

function dataActions(businessType: BusinessType): string[] {
  if (businessType === "cinema") {
    return ["检查今日 Excel 是否已导入", "确认凤凰云智导出文件是否包含今日数据", "如果确实未营业，在日报中标记原因"];
  }
  return ["检查第三方平台登录状态和数据同步状态", "确认今日订单和收入是否能在平台后台看到", "重新采集一次数据并观察是否恢复"];
}

function revenueActions(businessType: BusinessType): string[] {
  if (businessType === "cinema") {
    return ["检查今日 Excel 是否已导入", "核对票房、卖品和会员消费是否包含今日数据", "如果确实未营业，在日报中标记原因"];
  }
  if (businessType === "mahjong") {
    return ["核对今日房间预约和实收金额", "检查平台后台是否有已完成订单", "让门店记录今日无收入原因"];
  }
  return ["确认今日是否真实无收入", "检查平台后台订单和实收金额", "必要时在日报中标记无收入原因"];
}

function ordersActions(businessType: BusinessType): string[] {
  if (businessType === "mahjong") {
    return ["检查無老板后台订单列表是否正常", "核对今日房间预约和实收金额", "把异常情况记录给数据负责人跟进"];
  }
  if (businessType === "cinema") {
    return ["核对今日场次和票房是否一致", "检查票房报表是否缺少场次数据", "补传正确的影院经营报表"];
  }
  return ["核对订单列表和实收金额是否一致", "检查平台后台订单统计是否正常", "把异常情况记录给数据负责人跟进"];
}

function utilizationActions(businessType: BusinessType): string[] {
  if (businessType === "billiards") {
    return ["设置 14:00-17:00 低峰 2 小时套餐", "让前台主动推荐团购用户加钟", "在朋友圈或微信群推今日空台优惠"];
  }
  if (businessType === "mahjong") {
    return ["设置白天特价房或连开优惠", "给近期老客发送预约提醒", "让店员优先推荐空闲包间时段"];
  }
  if (businessType === "cinema") {
    return ["优化低峰场次排片", "设计工作日下午场套餐联动", "把卖品套餐和低峰场活动一起推广"];
  }
  return ["设置低峰时段活动", "主动触达近期老客", "检查现场推荐话术是否到位"];
}

function customerActions(businessType: BusinessType): string[] {
  if (businessType === "cinema") {
    return ["组合电影票和卖品套餐", "推荐会员充值或次卡活动", "让员工在检票和卖品区主动推荐加购"];
  }
  return ["设计套餐组合提高单次消费", "推荐会员充值或储值活动", "优化员工推荐话术，增加加购提醒"];
}
