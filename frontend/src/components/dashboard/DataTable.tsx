/**
 * DataTable 组件 - 数据表格
 * 统一的表格样式，支持排序和自定义列
 */
import React, { ReactNode } from "react";

interface Column<T> {
  /** 列标识 */
  key: string;
  /** 列标题 */
  title: string;
  /** 自定义渲染 */
  render?: (value: any, record: T, index: number) => ReactNode;
  /** 对齐方式 */
  align?: "left" | "center" | "right";
  /** 列宽度 */
  width?: string | number;
}

interface DataTableProps<T> {
  /** 列配置 */
  columns: Column<T>[];
  /** 数据源 */
  data: T[];
  /** 行键 */
  rowKey?: (record: T) => string;
  /** 自定义类名 */
  className?: string;
  /** 空状态提示 */
  emptyText?: string;
}

export default function DataTable<T extends Record<string, any>>({ 
  columns, 
  data, 
  rowKey,
  className = "",
  emptyText = "暂无数据"
}: DataTableProps<T>) {
  if (!data || data.length === 0) {
    return (
      <div className="emptyState">
        <div className="emptyIcon">📭</div>
        <div className="emptyTitle">{emptyText}</div>
      </div>
    );
  }

  return (
    <table className={`dataTable${className ? ` ${className}` : ""}`}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th 
              key={col.key} 
              style={{ 
                textAlign: col.align || "left",
                width: col.width 
              }}
            >
              {col.title}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((record, index) => {
          const key = rowKey ? rowKey(record) : index.toString();
          return (
            <tr key={key}>
              {columns.map((col) => (
                <td 
                  key={col.key} 
                  style={{ textAlign: col.align || "left" }}
                >
                  {col.render 
                    ? col.render(record[col.key], record, index) 
                    : record[col.key]}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
