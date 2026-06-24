import { useEffect, useRef, useState } from "react";
import { fetchRevenueTrend, type TrendDataPoint } from "../../lib/dashboardApi";

export function RevenueTrendChart() {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [trends, setTrends] = useState<Record<string, TrendDataPoint[]>>({});
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchRevenueTrend(undefined, days)
      .then((data) => setTrends(data.trends))
      .catch(() => setTrends({}));
  }, [days]);

  useEffect(() => {
    if (!chartRef.current) return;
    let disposed = false;
    let chart: { dispose: () => void; setOption: (option: object) => void; resize: () => void } | null = null;

    async function render() {
      const echarts = await import("echarts");
      if (!chartRef.current || disposed) return;
      chart = echarts.init(chartRef.current);

      const xiaotieData = trends.xiaotie || [];
      const wuLaobanData = trends.wu_laoban || [];

      // 合并所有日期
      const allDates = Array.from(
        new Set([
          ...xiaotieData.map((d) => d.date),
          ...wuLaobanData.map((d) => d.date),
        ])
      ).sort();

      // 构建数据映射
      const xiaotieMap = new Map(xiaotieData.map((d) => [d.date, d.value]));
      const wuLaobanMap = new Map(wuLaobanData.map((d) => [d.date, d.value]));

      chart.setOption({
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          formatter: (params: Array<{ seriesName: string; value: number; axisValue: string }>) => {
            let result = `<div style="font-size:12px">${params[0].axisValue}</div>`;
            params.forEach((p) => {
              result += `<div>${p.seriesName}: ¥${p.value?.toLocaleString() || 0}</div>`;
            });
            return result;
          },
        },
        legend: {
          data: ["台球", "棋牌"],
          textStyle: { color: "#8fb3c9" },
          top: 0,
          right: 0,
        },
        grid: { left: 60, right: 18, top: 36, bottom: 30 },
        xAxis: {
          type: "category",
          data: allDates.map((d) => formatDate(d)),
          axisLine: { lineStyle: { color: "#31506a" } },
          axisLabel: { color: "#8fb3c9" },
        },
        yAxis: {
          type: "value",
          axisLabel: {
            color: "#8fb3c9",
            formatter: (value: number) => `¥${value}`,
          },
          splitLine: { lineStyle: { color: "rgba(118, 164, 190, .16)" } },
        },
        series: [
          {
            name: "台球",
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 6,
            data: allDates.map((d) => xiaotieMap.get(d) || 0),
            lineStyle: { color: "#36d6ff", width: 3 },
            itemStyle: { color: "#36d6ff" },
            areaStyle: { color: "rgba(54, 214, 255, .12)" },
          },
          {
            name: "棋牌",
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 6,
            data: allDates.map((d) => wuLaobanMap.get(d) || 0),
            lineStyle: { color: "#7de58a", width: 3 },
            itemStyle: { color: "#7de58a" },
            areaStyle: { color: "rgba(125, 229, 138, .10)" },
          },
        ],
      });
    }

    render();
    const resize = () => chart?.resize();
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [trends]);

  const hasData = (trends.xiaotie?.length || 0) > 0 || (trends.wu_laoban?.length || 0) > 0;

  return (
    <section className="panel chartPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">收入趋势</span>
          <h2>台球 vs 棋牌</h2>
        </div>
        <div className="chartControls">
          <button
            className={`chartControl ${days === 7 ? "active" : ""}`}
            onClick={() => setDays(7)}
          >
            7天
          </button>
          <button
            className={`chartControl ${days === 30 ? "active" : ""}`}
            onClick={() => setDays(30)}
          >
            30天
          </button>
        </div>
      </div>
      <div ref={chartRef} className="chartCanvas" />
      {!hasData && <div className="chartEmpty">暂无历史收入数据</div>}
    </section>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
