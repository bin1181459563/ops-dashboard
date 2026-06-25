/**
 * AppShell 组件 - 驾驶舱主布局壳
 * 包含侧边栏导航和主内容区
 * 所有 dashboard 页面都使用这个组件作为外层容器
 */
import React, { ReactNode, useState } from "react";
import SideNav from "./SideNav";

interface AppShellProps {
  /** 当前页面路径，用于侧边栏高亮 */
  currentPage: string;
  /** 页面内容 */
  children: ReactNode;
  /** 是否默认折叠侧边栏 */
  defaultCollapsed?: boolean;
}

export default function AppShell({ currentPage, children, defaultCollapsed = false }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`lightDashboard${collapsed ? " navCollapsed" : ""}`}>
      {/* 侧边栏导航 */}
      <SideNav 
        currentPage={currentPage} 
        collapsed={collapsed} 
        onToggle={() => setCollapsed(!collapsed)} 
      />

      {/* 主内容区 */}
      <main className="dashboardStage">
        {children}
      </main>
    </div>
  );
}
