/**
 * SideNav 组件 - 左侧导航栏
 * 只包含一级经营入口，详情页通过页面内容内的链接进入
 * 支持折叠功能和当前页面高亮
 */
import React from "react";
import Link from "next/link";

interface NavItem {
  /** 页面路径 */
  href: string;
  /** 显示标签 */
  label: string;
  /** 图标（emoji或文字） */
  icon: string;
}

/** 导航列表配置 */
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "今日经营中心", icon: "📊" },
  { href: "/dashboard/reports", label: "AI 报告", icon: "📋" },
  { href: "/dashboard/daily-briefing", label: "每日简报", icon: "📣" },
  { href: "/dashboard/handover-assistant", label: "交接助手", icon: "🗂️" },
  { href: "/dashboard/procurement-reimbursement", label: "采购报销", icon: "🧾" },
  { href: "/dashboard/customer-wake-up", label: "客户唤醒", icon: "💤" },
  { href: "/dashboard/screening-suggestions", label: "排片建议", icon: "🎬" },
  { href: "/dashboard/revenue-forecast", label: "收入预测", icon: "📈" },
  { href: "/dashboard/cross-business", label: "多业务联动", icon: "🔗" },
  { href: "/dashboard/data-quality", label: "数据可信度", icon: "✅" },
];

interface SideNavProps {
  /** 当前页面路径 */
  currentPage: string;
  /** 是否折叠 */
  collapsed: boolean;
  /** 切换折叠状态 */
  onToggle: () => void;
}

export default function SideNav({ currentPage, collapsed, onToggle }: SideNavProps) {
  const activeHref = NAV_ITEMS.find((item) => (
    currentPage === item.href ||
    (item.href !== "/dashboard" && currentPage.startsWith(`${item.href}/`))
  ))?.href || "/dashboard";

  return (
    <aside className="sideRail">
      {/* 品牌标识 */}
      <div className="brandLockup">
        <span className="brandMark">S</span>
        <strong>翡翠城经营</strong>
      </div>

      {/* 导航列表 */}
      <nav className="navStack">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === activeHref;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`navItem${isActive ? " active" : ""}`}
            >
              <span>{item.icon}</span>
              <span className="navLabel">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 折叠按钮 */}
      <button className="collapseMenu" onClick={onToggle}>
        {collapsed ? "展开" : "收起"}
      </button>
    </aside>
  );
}
