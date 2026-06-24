import { toBilliardsSummary, toBusinessSummaries, toCinemaSummary, toMahjongSummary, toQgcloudSummary } from "../lib/businessAdapters";

const cinema = toCinemaSummary({
  status: "ok",
  today: {
    revenue: 309900,
    screenings: 64,
    customer_count: 441,
    occupancy_rate: 0.46,
    avg_order_value: 702.72,
    last_import_time: "2026-06-20T12:00:00+08:00",
  },
});

const billiards = toBilliardsSummary({
  status: "ok",
  summary_today: { revenue: 648320.5, order_count: 1842, user_count: 0, new_user_count: 0 },
  busy_count: 23,
  total_count: 30,
});

const mahjong = toMahjongSummary({
  status: "ok",
  summary_today: { revenue: 328540, order_count: 1176, user_count: 842, new_user_count: 112 },
  active_orders: 12,
  total_rooms: 16,
});

const qgcloud = toQgcloudSummary({
  status: "ok",
  revenue: 1200,
  orders: 24,
  updated_at: "2026-06-20T12:00:00+08:00",
});

const summaries = toBusinessSummaries({ cinema: cinema.raw, billiards: billiards.raw, mahjong: mahjong.raw, qgcloud: qgcloud.raw });

cinema.revenue.toFixed(0);
cinema.utilizationRate?.toFixed(2);
billiards.orders.toFixed(0);
mahjong.customers.toFixed(0);
qgcloud.displayName.length;
summaries.length;

export function BusinessAdaptersContract() {
  return null;
}
