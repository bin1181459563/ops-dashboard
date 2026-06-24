import type { ApiEnvelope, MockDashboardPayload, OrderSnapshot } from "../../types/dashboard";

interface OrderFeedProps {
  orders?: MockDashboardPayload["orders"];
  snapshots?: ApiEnvelope<OrderSnapshot[]>;
}

export function OrderFeed({ orders, snapshots }: OrderFeedProps) {
  const snapshotRows = snapshots?.data || [];
  const summaryRows = orders?.data || [];
  return (
    <section className="panel orderPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">订单流</span>
          <h2>实时订单快照</h2>
        </div>
        <span className="panelHint">{snapshotRows.length ? "真实订单" : "汇总兜底"}</span>
      </div>
      <div className="orderList">
        {snapshotRows.length > 0 ? (
          snapshotRows.map((item, index) => (
            <div className="orderItem orderSnapshotItem" key={`${item.platform}-${item.time}-${index}`}>
              <span className={`platformTag tag-${item.platform}`}>{platformName(item.platform)}</span>
              <strong>{item.title}</strong>
              <span className="orderMeta">{item.status} · {item.detail}</span>
              <span className="orderAmount">{item.amount > 0 ? currency(item.amount) : "未支付"}</span>
              <time>{formatTime(item.time)}</time>
            </div>
          ))
        ) : summaryRows.length === 0 ? (
          <div className="emptyState">暂无真实订单数据</div>
        ) : (
          summaryRows.map((item, index) => (
            <div className="orderItem" key={`${item.platform}-${item.time}-${index}`}>
              <span className={`platformTag tag-${item.platform}`}>{platformName(item.platform)}</span>
              <strong>{item.orders} 单</strong>
              <time>{formatTime(item.time)}</time>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function platformName(platform: string) {
  return platform === "xiaotie" ? "台球" : "棋牌";
}

function currency(value: number) {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", { hour12: false });
}
