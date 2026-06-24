import { CinemaTrendChart, buildCinemaTrendOption } from "./CinemaTrendChart";
import type { CinemaTrendItem } from "../../lib/dashboardApi";

const trend: CinemaTrendItem[] = [
  {
    date: "2026-06-19",
    box_office: 9855,
    revenue: 12498.1,
    customer_count: 322,
    screenings: 56,
    occupancy_rate: 0.082,
  },
];

const option = buildCinemaTrendOption(trend);
option.series.map((series) => series.name);

export function CinemaTrendChartContract() {
  return <CinemaTrendChart trend7d={trend} trend30d={trend} />;
}
