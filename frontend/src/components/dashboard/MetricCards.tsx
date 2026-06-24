import Link from "next/link";
import type { CinemaOverview, OverviewData } from "../../types/dashboard";

interface MetricCardsProps {
  overview?: OverviewData;
}

export function MetricCards({ overview }: MetricCardsProps) {
  const xiaotie = overview?.platforms.xiaotie;
  const wuLaoban = overview?.platforms.wu_laoban;
  const cinema: CinemaOverview | undefined = overview?.cinema;
  const xiaotieStatus = overview?.source_status?.xiaotie;
  const wuLaobanStatus = overview?.source_status?.wu_laoban;
  const included = overview?.included_platforms?.map(platformName).join("、") || "暂无";
  const excluded = overview?.excluded_platforms
    ?.map((platform) => `${platformName(platform)}${overview.source_status?.[platform]?.message ? `：${overview.source_status[platform].message}` : ""}`)
    .join("；") || "无";

  return (
    <section className="metricGrid">
      <MetricCard
        label="总收入"
        value={overview ? currency(overview.total_revenue) : "暂无数据"}
        caption={`已计入：${included}｜未计入：${excluded}`}
        tone="gold"
      />
      <Link href="/dashboard/billiards" style={{ textDecoration: "none", color: "inherit" }}>
        <MetricCard
          label="台球收入"
          value={xiaotieStatus?.status === "token_invalid" ? "token失效" : xiaotie ? currency(xiaotie.revenue || 0) : "暂无数据"}
          caption={
            xiaotieStatus?.status === "token_invalid"
              ? "异常：小铁 token 已失效，请重新抓取 token 后更新。"
              : xiaotie
                ? `真实数据 · 利用率 ${percent(xiaotie.usage_rate || 0)} · 订单 ${xiaotie.orders || 0}`
                : "暂无真实数据"
          }
          tone="cyan"
          invalid={xiaotieStatus?.status === "token_invalid"}
          clickable
        />
      </Link>
      <Link href="/dashboard/mahjong" style={{ textDecoration: "none", color: "inherit" }}>
        <MetricCard
          label="棋牌收入"
          value={wuLaoban ? currency(wuLaoban.revenue || 0) : wuLaobanStatus?.status === "sync_failed" ? "同步异常" : "暂无数据"}
          caption={
            wuLaoban
              ? `${wuLaoban.source === "api" ? "真实数据" : "占位"} · 利用率 ${percent(wuLaoban.usage_rate || 0)} · 订单 ${wuLaoban.orders || 0}`
              : wuLaobanStatus?.message || "暂无真实数据"
          }
          tone="green"
          invalid={wuLaobanStatus?.status === "sync_failed"}
          clickable
        />
      </Link>
      <Link href="/dashboard/cinema" style={{ textDecoration: "none", color: "inherit" }}>
        <MetricCard
          label="影院"
          value={cinema?.status === "ok" ? currency(cinema.revenue) : "未导入"}
          caption={
            cinema?.status === "ok"
              ? `票房 ${currency(cinema.box_office)} · 人次 ${cinema.customer_count} · 上座率 ${percent(cinema.occupancy_rate)}`
              : "请上传凤凰云智 Excel"
          }
          tone={cinema?.status === "ok" ? "gold" : "muted"}
          invalid={cinema?.status === "error"}
          clickable
        />
      </Link>
    </section>
  );
}

function MetricCard({
  label,
  value,
  caption,
  tone,
  invalid = false,
  clickable = false,
}: {
  label: string;
  value: string;
  caption: string;
  tone: string;
  invalid?: boolean;
  clickable?: boolean;
}) {
  return (
    <article
      className={`metricCard tone-${tone} ${invalid ? "metricCard-invalid" : ""} ${clickable ? "metricCard-clickable" : ""}`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{caption}</em>
      {clickable && <span className="metricCardHint">点击查看详情 →</span>}
    </article>
  );
}

function currency(value: number) {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function platformName(platform: string) {
  return {
    wu_laoban: "棋牌",
    xiaotie: "台球",
    cinema: "影院",
    fenghuang: "影院",
  }[platform] || platform;
}
