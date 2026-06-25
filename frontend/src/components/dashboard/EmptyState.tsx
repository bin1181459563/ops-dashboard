/**
 * EmptyState 组件 - 空状态显示
 * 当没有数据时显示友好的空状态提示
 */
import React from "react";

interface EmptyStateProps {
  /** 图标（emoji或文字） */
  icon?: string;
  /** 标题 */
  title: string;
  /** 描述 */
  description?: string;
  /** 自定义类名 */
  className?: string;
}

export default function EmptyState({ 
  icon = "📭", 
  title, 
  description,
  className = "" 
}: EmptyStateProps) {
  return (
    <div className={`emptyState${className ? ` ${className}` : ""}`}>
      <div className="emptyIcon">{icon}</div>
      <div className="emptyTitle">{title}</div>
      {description && <p className="emptyDesc">{description}</p>}
    </div>
  );
}
