/**
 * SectionCard 组件 - 区域卡片容器
 * 通用的内容卡片，包含标题和内容区
 */
import React, { ReactNode } from "react";

interface SectionCardProps {
  /** 卡片标题 */
  title: string;
  /** 副标题/描述 */
  subtitle?: string;
  /** 右侧操作区 */
  actions?: ReactNode;
  /** 卡片内容 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export default function SectionCard({ title, subtitle, actions, children, className = "" }: SectionCardProps) {
  return (
    <div className={`sectionCard${className ? ` ${className}` : ""}`}>
      <div className="sectionHeader">
        <div>
          <div className="sectionTitle">{title}</div>
          {subtitle && <div className="sectionSubtitle">{subtitle}</div>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
      {children}
    </div>
  );
}
