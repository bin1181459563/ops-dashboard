import type { CSSProperties, ReactNode } from "react";

type DashboardState = "loading" | "error" | "empty";

interface DashboardStatePanelProps {
  state: DashboardState;
  title: string;
  description?: string;
  action?: ReactNode;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

const STATE_ICON: Record<DashboardState, string> = {
  loading: "⏳",
  error: "!",
  empty: "∅",
};

export function DashboardStatePanel({
  state,
  title,
  description,
  action,
  onRetry,
  retryLabel = "重新加载",
  compact = false,
  className,
  style,
}: DashboardStatePanelProps) {
  const classes = ["dashboardStatePanel", `dashboardStatePanel-${state}`, compact ? "dashboardStatePanel-compact" : "", className || ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role={state === "error" ? "alert" : "status"} aria-live="polite" style={style}>
      <div className="dashboardStateIcon" aria-hidden="true">{STATE_ICON[state]}</div>
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {action ? <div className="dashboardStateAction">{action}</div> : null}
        {state === "error" && onRetry ? (
          <div className="dashboardStateAction">
            <button className="dashboardStateRetry" onClick={onRetry}>{retryLabel}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function getDashboardErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return normalizeErrorMessage(error.message, fallback);
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return normalizeErrorMessage(message, fallback);
  }
  return fallback;
}

function normalizeErrorMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (/timeout|timed out|exceeded/i.test(trimmed)) return "接口响应较慢，请稍后刷新重试。";
  if (/network error/i.test(trimmed)) return "无法连接后端服务，请确认服务已启动。";
  if (/request failed with status code 5\d\d/i.test(trimmed)) return "后端服务暂时不可用，请稍后刷新重试。";
  return trimmed;
}
