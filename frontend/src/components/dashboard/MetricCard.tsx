/**
 * MetricCard 组件 - 指标卡片
 * 用于显示关键业务指标，支持图标、数值、标签和趋势
 */
import React from "react";

interface MetricCardProps {
  /** 指标标签 */
  label: string;
  /** 指标数值 */
  value: string | number;
  /** 趋势描述（如 "+12%"） */
  trend?: string;
  /** 趋势方向 */
  trendDirection?: "positive" | "negative" | "neutral";
  /** 图标（emoji或文字） */
  icon?: string;
  /** 自定义类名 */
  className?: string;
  /** 补充说明 */
  description?: string;
}

export default function MetricCard({ 
  label, 
  value, 
  trend, 
  trendDirection = "neutral",
  icon,
  description,
  className = "" 
}: MetricCardProps) {
  // 格式化数值显示
  const displayValue = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className={`metricCard${className ? ` ${className}` : ""}`}>
      {icon && <div className="metricIcon">{icon}</div>}
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{displayValue}</div>
      {description && (
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
          {description}
        </div>
      )}
      {trend && (
        <div className={`metricTrend ${trendDirection}`}>
          {trendDirection === "positive" && "↑ "}
          {trendDirection === "negative" && "↓ "}
          {trend}
        </div>
      )}
    </div>
  );
}
