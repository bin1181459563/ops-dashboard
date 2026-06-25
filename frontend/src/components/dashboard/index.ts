/**
 * Dashboard 公共组件统一导出
 * 所有 dashboard 页面都从这里导入组件
 */

export { default as AppShell } from "./AppShell";
export { default as SideNav } from "./SideNav";
export { default as PageHeader } from "./PageHeader";
export { default as SectionCard } from "./SectionCard";
export { default as MetricCard } from "./MetricCard";
export { default as StatusBadge, getStatusLabel } from "./StatusBadge";
export { default as EmptyState } from "./EmptyState";
export { default as FilterBar, CapsuleGroup } from "./FilterBar";
export { default as DataTable } from "./DataTable";
