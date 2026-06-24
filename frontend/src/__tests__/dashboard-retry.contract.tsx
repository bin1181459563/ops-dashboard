import { DashboardStatePanel } from "../components/dashboard/DashboardStatePanel";

export function DashboardRetryContract() {
  return (
    <DashboardStatePanel
      state="error"
      title="加载失败"
      description="请稍后重试。"
      onRetry={() => undefined}
      retryLabel="重新加载"
    />
  );
}
