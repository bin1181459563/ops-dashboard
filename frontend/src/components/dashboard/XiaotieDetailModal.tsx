import { useEffect, useState } from "react";
import {
  fetchXiaotieDetail,
  fetchXiaotieHourly,
  type TableInfo,
  type XiaotieHourlyItem,
} from "../../lib/dashboardApi";

interface XiaotieDetailModalProps {
  open: boolean;
  onClose: () => void;
}

export function XiaotieDetailModal({ open, onClose }: XiaotieDetailModalProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [hourly, setHourly] = useState<XiaotieHourlyItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([fetchXiaotieDetail(), fetchXiaotieHourly()])
      .then(([detail, hourlyData]) => {
        setTables(detail.tables || []);
        setHourly(hourlyData.hourly || []);
      })
      .catch(() => {
        setTables([]);
        setHourly([]);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const busyCount = tables.filter((t) => t.open).length;
  const totalCount = tables.length;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>🎱 台球详情</h2>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modalLoading">加载中...</div>
        ) : (
          <div className="modalBody">
            {/* 球桌概览 */}
            <div className="detailSection">
              <h3>球桌状态</h3>
              <div className="detailSummary">
                <span className="detailStat">
                  <strong>{busyCount}</strong> / {totalCount} 使用中
                </span>
                <span className="detailStat">
                  利用率 <strong>{totalCount > 0 ? Math.round((busyCount / totalCount) * 100) : 0}%</strong>
                </span>
              </div>
              <div className="tableGrid">
                {tables.map((t, i) => (
                  <div key={i} className={`tableCard ${t.open ? "table-busy" : "table-idle"}`}>
                    <span className="tableName">{t.name}</span>
                    <span className="tableStatus">{t.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 时段收入 */}
            {hourly.length > 0 && (
              <div className="detailSection">
                <h3>今日时段收入</h3>
                <div className="hourlyList">
                  {hourly.map((h, i) => (
                    <div key={i} className="hourlyRow">
                      <span className="hourlyTime">{h.hour}</span>
                      <div className="hourlyBar">
                        <div
                          className="hourlyBarFill"
                          style={{
                            width: `${Math.min(100, (h.revenue / Math.max(...hourly.map((x) => x.revenue))) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="hourlyValue">¥{h.revenue}</span>
                      <span className="hourlyOrders">{h.orders}单</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
