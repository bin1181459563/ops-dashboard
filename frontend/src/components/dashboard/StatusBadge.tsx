/**
 * StatusBadge 组件 - 状态标签
 * 用于显示各种状态（成功/警告/错误/信息）
 */
import React, { ReactNode } from "react";

type BadgeStatus = "success" | "warning" | "error" | "info";

interface StatusBadgeProps {
  /** 状态类型 */
  status: BadgeStatus;
  /** 标签内容 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
}

/** 状态映射到中文标签 */
const STATUS_LABELS: Record<BadgeStatus, string> = {
  success: "正常",
  warning: "警告",
  error: "异常",
  info: "信息",
};

export default function StatusBadge({ status, children, className = "" }: StatusBadgeProps) {
  return (
    <span className={`statusBadge ${status}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

/** 根据状态获取对应的中文标签 */
export function getStatusLabel(status: BadgeStatus): string {
  return STATUS_LABELS[status];
}
