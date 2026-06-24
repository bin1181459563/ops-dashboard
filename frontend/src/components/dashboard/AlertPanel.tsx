import type { AlertItem } from "../../types/dashboard";

interface AlertPanelProps {
  alerts?: AlertItem[];
}

export function AlertPanel({ alerts }: AlertPanelProps) {
  const rows = alerts || [];
  return (
    <section className="panel alertPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">异常</span>
          <h2>经营预警</h2>
        </div>
      </div>
      <div className="alertList">
        {rows.length === 0 ? (
          <div className="emptyState">暂无异常</div>
        ) : (
          rows.map((item, index) => (
            <div className={`alertItem level-${item.level}`} key={`${item.alert_type}-${item.time}-${index}`}>
              <span>{alertLabel(item.alert_type)}</span>
              <strong>{item.message}</strong>
              <time>{new Date(item.time).toLocaleTimeString("zh-CN", { hour12: false })}</time>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function alertLabel(type: string) {
  const labels: Record<string, string> = {
    low_usage: "空置异常",
    usage_low: "使用率偏低",
    usage_drop: "利用率下降",
    revenue_drop: "收入异常",
    token_invalid: "token失效",
    sync_failed: "同步失败",
    stale_data: "数据过旧",
  };
  return labels[type] || type;
}
