interface TopBarProps {
  currentTime: Date | null;
  status: string;
  source: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}

export function TopBar({ currentTime, status, source, refreshing, onRefresh }: TopBarProps) {
  return (
    <header className="topBar">
      <div>
        <div className="eyebrow">翡翠城经营数据中枢</div>
        <h1>实时运营驾驶舱</h1>
      </div>
      <div className="topMeta">
        <div className="clock">{currentTime ? currentTime.toLocaleString("zh-CN", { hour12: false }) : "--"}</div>
        <div className={`statusPill status-${status}`}>系统状态：{status}</div>
        <div className="sourcePill">数据源：{source}</div>
        <button className="refreshButton" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? "刷新中..." : "手动刷新"}
        </button>
      </div>
    </header>
  );
}
