import { useEffect, useState } from "react";
import {
  fetchWuLaobanDetail,
  type RoomInfo,
  type RevenueBreakdown,
} from "../../lib/dashboardApi";

interface WuLaobanDetailModalProps {
  open: boolean;
  onClose: () => void;
}

export function WuLaobanDetailModal({ open, onClose }: WuLaobanDetailModalProps) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [activeOrders, setActiveOrders] = useState(0);
  const [totalRooms, setTotalRooms] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchWuLaobanDetail()
      .then((data) => {
        setRooms(data.rooms || []);
        setBreakdown(data.revenue_breakdown || null);
        setActiveOrders(data.active_orders || 0);
        setTotalRooms(data.total_rooms || 0);
      })
      .catch(() => {
        setRooms([]);
        setBreakdown(null);
      })
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const busyCount = rooms.filter((r) => r.status === "使用中").length;

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <h2>🀄 棋牌详情</h2>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="modalLoading">加载中...</div>
        ) : (
          <div className="modalBody">
            {/* 包间实时状态 */}
            <div className="detailSection">
              <h3>包间实时状态</h3>
              <div className="detailSummary">
                <span className="detailStat">
                  <strong>{busyCount}</strong> / {rooms.length} 使用中
                </span>
                <span className="detailStat">
                  使用率 <strong>{rooms.length > 0 ? Math.round((busyCount / rooms.length) * 100) : 0}%</strong>
                </span>
              </div>
              <div className="roomGrid">
                {rooms.map((r, i) => (
                  <div key={i} className={`roomCard ${r.status === "使用中" ? "room-busy" : "room-idle"}`}>
                    <span className="roomName">{r.name}</span>
                    <span className="roomType">{r.type}</span>
                    <span className="roomStatus">{r.status}</span>
                    {r.status === "使用中" && r.user && (
                      <span className="roomUser">👤 {r.user}</span>
                    )}
                    {r.status === "使用中" && r.remaining_min > 0 && (
                      <span className="roomRemaining">⏱ {r.remaining_min}分钟</span>
                    )}
                    {r.today_orders > 0 && (
                      <span className="roomOrders">今日{r.today_orders}单</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 收入构成 */}
            {breakdown && breakdown.total > 0 && (
              <div className="detailSection">
                <h3>今日收入构成</h3>
                <div className="breakdownTotal">
                  总收入 <strong>¥{breakdown.total}</strong>
                </div>
                <div className="breakdownList">
                  {breakdown.wechat > 0 && (
                    <div className="breakdownRow">
                      <span className="breakdownLabel">微信支付</span>
                      <div className="breakdownBar">
                        <div
                          className="breakdownBarFill breakdown-wechat"
                          style={{ width: `${(breakdown.wechat / breakdown.total) * 100}%` }}
                        />
                      </div>
                      <span className="breakdownValue">¥{breakdown.wechat}</span>
                    </div>
                  )}
                  {breakdown.alipay > 0 && (
                    <div className="breakdownRow">
                      <span className="breakdownLabel">支付宝</span>
                      <div className="breakdownBar">
                        <div
                          className="breakdownBarFill breakdown-alipay"
                          style={{ width: `${(breakdown.alipay / breakdown.total) * 100}%` }}
                        />
                      </div>
                      <span className="breakdownValue">¥{breakdown.alipay}</span>
                    </div>
                  )}
                  {breakdown.meituan > 0 && (
                    <div className="breakdownRow">
                      <span className="breakdownLabel">美团</span>
                      <div className="breakdownBar">
                        <div
                          className="breakdownBarFill breakdown-meituan"
                          style={{ width: `${(breakdown.meituan / breakdown.total) * 100}%` }}
                        />
                      </div>
                      <span className="breakdownValue">¥{breakdown.meituan}</span>
                    </div>
                  )}
                  {breakdown.cash > 0 && (
                    <div className="breakdownRow">
                      <span className="breakdownLabel">现金</span>
                      <div className="breakdownBar">
                        <div
                          className="breakdownBarFill breakdown-cash"
                          style={{ width: `${(breakdown.cash / breakdown.total) * 100}%` }}
                        />
                      </div>
                      <span className="breakdownValue">¥{breakdown.cash}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
