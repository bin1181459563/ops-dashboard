/**
 * 审计日志页面
 * 显示系统操作记录与统计
 * 使用统一样式系统（浅色主题）
 */
import Head from "next/head";
import { useCallback, useEffect, useState } from "react";
import { fetchAuditLogs, fetchAuditStats } from "../../lib/dashboardApi";
import {
  AppShell,
  PageHeader,
  MetricCard,
  SectionCard,
  StatusBadge,
  FilterBar,
  DataTable,
  EmptyState,
} from "../../components/dashboard";

interface AuditLog {
  id: number;
  action: string;
  target: string;
  user: string;
  status: "success" | "failed" | "pending";
  detail?: string;
  ip?: string;
  created_at: string;
}

interface AuditStats {
  total_logs: number;
  by_action: Record<string, number>;
  by_status: Record<string, number>;
  recent_7d: number;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}

/** 状态映射到 StatusBadge 状态 */
const STATUS_MAP: Record<string, "success" | "error" | "warning"> = {
  success: "success",
  failed: "error",
  pending: "warning",
};

/** 状态中文标签 */
const STATUS_LABELS: Record<string, string> = {
  success: "✅ 成功",
  failed: "❌ 失败",
  pending: "⏳ 待处理",
};

/** 操作图标 */
const ACTION_ICONS: Record<string, string> = {
  login: "🔑",
  logout: "🚪",
  create: "➕",
  update: "✏️",
  delete: "🗑️",
  export: "📤",
  import: "📥",
  collect: "🔄",
  query: "🔍",
};

export default function AuditPage() {
  const [logsData, setLogsData] = useState<AuditLogsResponse | null>(null);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (actionFilter) params.action = actionFilter;
      if (statusFilter) params.status = statusFilter;

      const [logsRes, statsRes] = await Promise.all([
        fetchAuditLogs(params),
        fetchAuditStats(),
      ]);
      setLogsData(logsRes.data ?? logsRes);
      setStats(statsRes.data ?? statsRes);
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const totalPages = logsData ? Math.ceil(logsData.total / pageSize) : 1;
  const actionOptions = stats ? Object.keys(stats.by_action) : [];
  const statusOptions = ["success", "failed", "pending"];

  // 简单柱状图数据
  const maxByAction = stats ? Math.max(...Object.values(stats.by_action), 1) : 1;

  // 表格列配置
  const columns = [
    {
      key: "created_at",
      title: "时间",
      render: (value: string) => new Date(value).toLocaleString("zh-CN"),
    },
    {
      key: "action",
      title: "操作",
      render: (value: string) => (
        <span>
          <span className="mr-1">{ACTION_ICONS[value] || "📋"}</span>
          {value}
        </span>
      ),
    },
    { key: "target", title: "目标" },
    { key: "user", title: "用户" },
    {
      key: "status",
      title: "状态",
      render: (value: string) => (
        <StatusBadge status={STATUS_MAP[value] || "warning"}>
          {STATUS_LABELS[value] || value}
        </StatusBadge>
      ),
    },
    {
      key: "ip",
      title: "IP",
      render: (value: string) => value || "—",
    },
    {
      key: "detail",
      title: "详情",
      render: (value: string) => (
        <span className="max-w-[200px] truncate block">{value || "—"}</span>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>审计日志 · 翡翠城经营驾驶舱</title>
      </Head>
      <AppShell currentPage="/dashboard/audit">
        {/* 页面头部 */}
        <PageHeader
          title="📝 审计日志"
          description="系统操作记录与统计"
          actions={
            <button onClick={refresh} disabled={loading} className="btn btnSecondary">
              🔄 刷新
            </button>
          }
        />

        {/* 统计卡片 */}
        {stats && (
          <div className="metricGrid">
            <MetricCard
              label="日志总数"
              value={stats.total_logs}
              icon="📝"
            />
            <MetricCard
              label="近 7 天"
              value={stats.recent_7d}
            />
            <MetricCard
              label="成功"
              value={stats.by_status?.success || 0}
              trendDirection="positive"
            />
            <MetricCard
              label="失败"
              value={stats.by_status?.failed || 0}
              trendDirection="negative"
            />
          </div>
        )}

        {/* 操作类型分布 */}
        {stats?.by_action && Object.keys(stats.by_action).length > 0 && (
          <SectionCard title="📊 操作类型分布">
            <div className="space-y-2">
              {Object.entries(stats.by_action)
                .sort(([, a], [, b]) => b - a)
                .map(([action, count]) => (
                  <div key={action} className="flex items-center gap-3">
                    <span className="text-sm w-20 text-right text-gray-500">
                      {ACTION_ICONS[action] || "📋"} {action}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full flex items-center justify-end pr-2"
                        style={{ width: `${Math.max((count / maxByAction) * 100, 8)}%` }}
                      >
                        <span className="text-xs text-white font-medium">{count}</span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </SectionCard>
        )}

        {/* 筛选栏 */}
        <FilterBar>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部操作</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{ACTION_ICONS[a] || "📋"} {a}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
          </select>
          {(actionFilter || statusFilter) && (
            <button
              onClick={() => { setActionFilter(""); setStatusFilter(""); setPage(1); }}
              className="btn btnSecondary"
            >
              ✕ 清除筛选
            </button>
          )}
        </FilterBar>

        {/* 加载/错误状态 */}
        {loading && <div className="loadingState">加载中…</div>}
        {error && <div className="errorState"><div className="errorIcon">⚠️</div><div className="errorTitle">{error}</div></div>}

        {/* 日志表格 */}
        {logsData && !loading && (
          <SectionCard title="操作日志" subtitle={`共 ${logsData.total} 条记录`}>
            <DataTable
              columns={columns}
              data={logsData.logs}
              rowKey={(record) => record.id.toString()}
              emptyText="暂无日志"
            />
          </SectionCard>
        )}

        {/* 分页 */}
        {logsData && logsData.total > pageSize && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="btn btnSecondary"
            >
              ← 上一页
            </button>
            <span className="text-gray-500 text-sm px-3">
              第 {page} / {totalPages} 页（共 {logsData.total} 条）
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="btn btnSecondary"
            >
              下一页 →
            </button>
          </div>
        )}

        {/* 空状态 */}
        {!loading && !error && logsData && logsData.logs.length === 0 && (
          <EmptyState
            icon="📝"
            title="暂无日志"
            description="没有找到匹配的操作记录"
          />
        )}
      </AppShell>
    </>
  );
}
