import { useEffect, useMemo, useRef, useState } from "react";
import type { CinemaTrendItem } from "../../lib/dashboardApi";

type TrendMode = 7 | 30;

interface CinemaTrendChartProps {
  trend7d: CinemaTrendItem[];
  trend30d: CinemaTrendItem[];
}

interface TrendSeriesOption {
  name: string;
  type: "bar" | "line";
  data: number[];
  yAxisIndex?: number;
  smooth?: boolean;
  symbol?: string;
  symbolSize?: number;
  barWidth?: string;
  lineStyle?: object;
  itemStyle?: object;
  areaStyle?: object;
}

interface TrendChartOption {
  backgroundColor: string;
  tooltip: object;
  legend: object;
  grid: object;
  xAxis: object;
  yAxis: object[];
  series: TrendSeriesOption[];
}

export function CinemaTrendChart({ trend7d, trend30d }: CinemaTrendChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<TrendMode>(7);
  const data = useMemo(() => (mode === 7 ? trend7d : trend30d), [mode, trend7d, trend30d]);

  useEffect(() => {
    if (!chartRef.current) return;
    let disposed = false;
    let chart: { dispose: () => void; setOption: (option: object) => void; resize: () => void } | null = null;

    async function render() {
      const echarts = await import("echarts");
      if (!chartRef.current || disposed) return;
      chart = echarts.init(chartRef.current);
      chart.setOption(buildCinemaTrendOption(data));
    }

    render();
    const resize = () => chart?.resize();
    window.addEventListener("resize", resize);
    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [data]);

  return (
    <section className="panel chartPanel cinemaTrendChartPanel">
      <div className="panelHeader">
        <div>
          <span className="eyebrow">票房趋势</span>
          <h2>票房 · 人次 · 场次</h2>
        </div>
        <div className="chartControls">
          <button className={`chartControl ${mode === 7 ? "active" : ""}`} onClick={() => setMode(7)}>
            7天
          </button>
          <button className={`chartControl ${mode === 30 ? "active" : ""}`} onClick={() => setMode(30)}>
            30天
          </button>
        </div>
      </div>
      <div ref={chartRef} className="chartCanvas cinemaTrendChartCanvas" />
      {!data.length && <div className="chartEmpty">暂无影院趋势数据</div>}
    </section>
  );
}

export function buildCinemaTrendOption(data: CinemaTrendItem[]): TrendChartOption {
  const dates = data.map((item) => formatShortDate(item.date));
  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      formatter: (params: Array<{ seriesName: string; value: number; axisValue: string; dataIndex: number }>) => {
        const item = data[params[0]?.dataIndex || 0];
        if (!item) return "";
        return [
          `<div style="font-size:12px;margin-bottom:4px">${item.date}</div>`,
          `<div>票房：¥${formatNumber(item.box_office)}</div>`,
          `<div>观影人次：${formatNumber(item.customer_count)}</div>`,
          `<div>场次：${formatNumber(item.screenings)}</div>`,
          `<div>上座率：${Math.round(Number(item.occupancy_rate || 0) * 100)}%</div>`,
        ].join("");
      },
    },
    legend: {
      data: ["票房", "观影人次", "场次"],
      textStyle: { color: "#8fb3c9" },
      top: 0,
      right: 0,
    },
    grid: { left: 62, right: 62, top: 42, bottom: 34 },
    xAxis: {
      type: "category",
      data: dates,
      axisLine: { lineStyle: { color: "#31506a" } },
      axisLabel: { color: "#8fb3c9" },
    },
    yAxis: [
      {
        type: "value",
        name: "票房",
        axisLabel: { color: "#8fb3c9", formatter: (value: number) => `¥${formatCompact(value)}` },
        nameTextStyle: { color: "#8fb3c9" },
        splitLine: { lineStyle: { color: "rgba(118, 164, 190, .16)" } },
      },
      {
        type: "value",
        name: "人次 / 场次",
        axisLabel: { color: "#8fb3c9" },
        nameTextStyle: { color: "#8fb3c9" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "票房",
        type: "bar",
        data: data.map((item) => Number(item.box_office || 0)),
        barWidth: "44%",
        itemStyle: {
          color: "#f0b940",
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: "观影人次",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbol: "circle",
        symbolSize: 7,
        data: data.map((item) => Number(item.customer_count || 0)),
        lineStyle: { color: "#36d6ff", width: 3 },
        itemStyle: { color: "#36d6ff" },
        areaStyle: { color: "rgba(54, 214, 255, .10)" },
      },
      {
        name: "场次",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        data: data.map((item) => Number(item.screenings || 0)),
        lineStyle: { color: "#7de58a", width: 2, type: "dashed" },
        itemStyle: { color: "#7de58a" },
      },
    ],
  };
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function formatCompact(value: number) {
  const number = Number(value || 0);
  return number >= 10000 ? `${Math.round(number / 10000)}万` : `${Math.round(number)}`;
}
