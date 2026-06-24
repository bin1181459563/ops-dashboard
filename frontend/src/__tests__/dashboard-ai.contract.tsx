import DashboardPage, { buildAiTasks, buildAiInsights, getBusinessCards } from "../pages/dashboard";
import type { OverviewData, AlertItem } from "../types/dashboard";

const overview = {
  store_id: "feicuicheng",
  total_revenue: 1286760.5,
  total_orders: 3658,
  included_platforms: ["xiaotie", "wu_laoban", "cinema"],
  excluded_platforms: [],
  platforms: {
    xiaotie: { revenue: 648320.5, orders: 1842, usage_rate: 0.92, source: "api" },
    wu_laoban: { revenue: 328540, orders: 1176, usage_rate: 0.74, source: "api" },
  },
  cinema: {
    status: "ok",
    data_source: "excel",
    date: "2026-06-20",
    revenue: 309900,
    box_office: 260000,
    concession_revenue: 49900,
    customer_count: 441,
    screenings: 64,
    occupancy_rate: 0.46,
    avg_order_value: 702.72,
    last_import_time: "2026-06-20T12:00:00+08:00",
    message: "凤凰云智 Excel 已导入",
  },
  alerts: [],
} satisfies OverviewData;

const alerts: AlertItem[] = [
  {
    platform: "xiaotie",
    store_id: "feicuicheng",
    alert_type: "token_invalid",
    message: "小铁 token 已失效，请重新抓取 token 后更新。",
    level: "critical",
    time: "2026-06-20T12:00:00+08:00",
  },
];

const cards = getBusinessCards(overview);
const insights = buildAiInsights(overview, alerts, "棋牌今日订单偏低，建议跟进。");
const tasks = buildAiTasks(overview, alerts);

cards.map((card) => card.label);
insights.map((item) => item.title);
tasks.map((task) => task.action);

export function DashboardAiContract() {
  return <DashboardPage />;
}
