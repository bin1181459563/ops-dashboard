import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchAuditLogs, fetchAuditStats } from "../../lib/dashboardApi";

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

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  success: { bg: "bg-green-900/40", text: "text-green-400", label: "✅ 成功" },
  failed: { bg: "bg-red-900/40", text: "text-red-400", label: "❌ 失败" },
  pending: { bg: "bg-yellow-900/40", text: "text-yellow-400", label: "⏳ 待处理" },
};

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

  // Simple bar chart data
  const maxByAction = stats ? Math.max(...Object.values(stats.by_action), 1) : 1;

  return (
    <>
      <Head>
        <title>审计日志 · Ops Dashboard</title>
      </Head>
      <main className="min-h-screen bg-gray-900 text-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-blue-400 hover:underline text-sm">← 返回主页</Link>
            <h1 className="text-2xl font-bold mt-2">📝 审计日志</h1>
            <p className="text-gray-400 text-sm mt-1">系统操作记录与统计</p>
          </div>
          <button onClick={refresh} disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm disabled:opacity-50">
            🔄 刷新
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold">{stats.total_logs}</div>
              <div className="text-gray-400 text-sm">日志总数</div>
            </div>
            <div className="bg-blue-900/30 rounded-xl p-4 text-center border border-blue-800">
              <div className="text-3xl font-bold text-blue-400">{stats.recent_7d}</div>
              <div className="text-gray-400 text-sm">近 7 天</div>
            </div>
            <div className="bg-green-900/30 rounded-xl p-4 text-center border border-green-800">
              <div className="text-3xl font-bold text-green-400">{stats.by_status?.success || 0}</div>
              <div className="text-gray-400 text-sm">成功</div>
            </div>
            <div className="bg-red-900/30 rounded-xl p-4 text-center border border-red-800">
              <div className="text-3xl font-bold text-red-400">{stats.by_status?.failed || 0}</div>
              <div className="text-gray-400 text-sm">失败</div>
            </div>
          </div>
        )}

        {/* Action Distribution Chart */}
        {stats?.by_action && Object.keys(stats.by_action).length > 0 && (
          <div className="rounded-xl shadow-lg p-6 bg-gray-800 border border-gray-700 mb-6">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">📊 操作类型分布</h2>
            <div className="space-y-2">
              {Object.entries(stats.by_action)
                .sort(([, a], [, b]) => b - a)
                .map(([action, count]) => (
                  <div key={action} className="flex items-center gap-3">
                    <span className="text-sm w-20 text-right text-gray-400">
                      {ACTION_ICONS[action] || "📋"} {action}
                    </span>
                    <div className="flex-1 bg-gray-700 rounded-full h-5 overflow-hidden">
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
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">全部操作</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{ACTION_ICONS[a] || "📋"} {a}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">全部状态</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{STATUS_STYLES[s]?.label || s}</option>
            ))}
          </select>
          {(actionFilter || statusFilter) && (
            <button onClick={() => { setActionFilter(""); setStatusFilter(""); setPage(1); }}
              className="px-3 py-2 text-sm text-gray-400 hover:text-white">
              ✕ 清除筛选
            </button>
          )}
        </div>

        {/* Loading / Error */}
        {loading && <div className="text-center text-gray-400 py-20">加载中…</div>}
        {error && <div className="text-center text-red-400 py-20">{error}</div>}

        {/* Logs Table */}
        {logsData && !loading && (
          <div className="rounded-xl shadow-lg overflow-hidden bg-gray-800 border border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                  <th className="px-4 py-3 font-medium">目标</th>
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">详情</th>
                </tr>
              </thead>
              <tbody>
                {logsData.logs.map((log) => {
                  const ss = STATUS_STYLES[log.status] || STATUS_STYLES.pending;
                  return (
                    <tr key={log.id} className="border-t border-gray-700/50 hover:bg-gray-750">
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="mr-1">{ACTION_ICONS[log.action] || "📋"}</span>
                        {log.action}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{log.target}</td>
                      <td className="px-4 py-3">{log.user}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${ss.bg} ${ss.text}`}>
                          {ss.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{log.ip || "—"}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{log.detail || "—"}</td>
                    </tr>
                  );
                })}
                {logsData.logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">暂无日志</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {logsData && logsData.total > pageSize && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm disabled:opacity-30 hover:bg-gray-700">
              ← 上一页
            </button>
            <span className="text-gray-400 text-sm px-3">
              第 {page} / {totalPages} 页（共 {logsData.total} 条）
            </span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 bg-gray-800 rounded-lg text-sm disabled:opacity-30 hover:bg-gray-700">
              下一页 →
            </button>
          </div>
        )}
      </main>
    </>
  );
}
