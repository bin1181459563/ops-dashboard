import { DashboardStatePanel, getDashboardErrorMessage } from "../components/dashboard/DashboardStatePanel";

const timeoutMessage = getDashboardErrorMessage(new Error("timeout of 10000ms exceeded"), "加载失败");
const plainMessage = getDashboardErrorMessage({ message: "接口异常" }, "加载失败");
const fallbackMessage = getDashboardErrorMessage(null, "加载失败");

timeoutMessage.toLocaleString();
plainMessage.toLocaleString();
fallbackMessage.toLocaleString();

export function LoadingStateContract() {
  return (
    <>
      <DashboardStatePanel state="loading" title="正在加载数据" description="客户接口数据量较大，请稍候。" />
      <DashboardStatePanel state="error" title="加载失败" description="请稍后重试。" />
      <DashboardStatePanel state="empty" title="暂无数据" description="当前筛选条件下没有可展示的数据。" />
    </>
  );
}
