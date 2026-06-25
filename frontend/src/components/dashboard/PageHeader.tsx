/**
 * PageHeader 组件 - 页面头部
 * 包含标题、描述和操作按钮区
 */
import React, { ReactNode } from "react";

interface PageHeaderProps {
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description?: string;
  /** 右侧操作区（按钮等） */
  actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="pageHeader">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="topControls">{actions}</div>}
    </div>
  );
}
