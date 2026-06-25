/**
 * FilterBar 组件 - 筛选栏
 * 提供统一的筛选控件样式
 */
import React, { ReactNode } from "react";

interface FilterBarProps {
  /** 筛选控件 */
  children: ReactNode;
  /** 自定义类名 */
  className?: string;
}

export default function FilterBar({ children, className = "" }: FilterBarProps) {
  return (
    <div className={`filterBar${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

/**
 * CapsuleGroup 组件 - 胶囊按钮组
 * 用于时间段切换等场景
 */
interface CapsuleGroupProps {
  /** 按钮配置 */
  options: Array<{ value: string; label: string }>;
  /** 当前选中值 */
  value: string;
  /** 切换回调 */
  onChange: (value: string) => void;
  /** 自定义类名 */
  className?: string;
}

export function CapsuleGroup({ options, value, onChange, className = "" }: CapsuleGroupProps) {
  return (
    <div className={`capsuleGroup${className ? ` ${className}` : ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          className={`capsuleBtn${value === option.value ? " active" : ""}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
