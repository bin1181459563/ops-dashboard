import Head from "next/head";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader, SectionCard } from "../../components/dashboard";
import { getDashboardErrorMessage } from "../../components/dashboard/DashboardStatePanel";
import { fetchDailyBriefing, fetchDailyBriefingImage, type DailyBriefingResponse } from "../../lib/dashboardApi";

export default function DailyBriefingPage() {
  const [targetDate, setTargetDate] = useState(() => offsetDate(1));
  const [data, setData] = useState<DailyBriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchDailyBriefing(targetDate);
      setData(result);
    } catch (e: unknown) {
      setError(getDashboardErrorMessage(e, "简报生成失败"));
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const message = data?.message || "";
  const linesCount = useMemo(() => message.split("\n").filter(Boolean).length, [message]);

  const copyMessage = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const generateImage = async () => {
    setImageLoading(true);
    setError("");
    try {
      const blob = await fetchDailyBriefingImage(targetDate);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(blob));
    } catch (e: unknown) {
      setError(getDashboardErrorMessage(e, "图片生成失败"));
    } finally {
      setImageLoading(false);
    }
  };

  return (
    <>
      <Head><title>每日简报 · 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/daily-briefing">
        <PageHeader
          title="📣 每日班前简报"
          description="生成可直接发员工群的明日班次、影讯、交接、库存、活动和员工业绩"
          actions={
            <>
              <input
                className="dateInput"
                type="date"
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                style={{ height: 40, padding: "0 10px", border: "1px solid #d1d5db", borderRadius: 6 }}
              />
              <button onClick={copyMessage} disabled={!message} className={`btn ${copied ? "btnPrimary" : "btnSecondary"}`}>
                {copied ? "✅ 已复制" : "📋 复制"}
              </button>
              <button onClick={generateImage} disabled={imageLoading} className="btn btnSecondary">
                {imageLoading ? "生图中..." : "🖼️ 生图"}
              </button>
              <button onClick={refresh} disabled={loading} className="btn btnPrimary">
                {loading ? "生成中..." : "生成简报"}
              </button>
            </>
          }
        />

        {error && <div className="errorBanner">{error}</div>}
        {data?.warnings?.length ? (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 14px",
              border: "1px solid #facc15",
              borderRadius: 8,
              background: "#fefce8",
              color: "#854d0e",
              fontSize: 14,
            }}
          >
            <strong>数据提示：</strong>{data.warnings.join("；")}
          </div>
        ) : null}

        <div className="metricGrid">
          <SummaryCard label="目标日期" value={data?.target_date || targetDate} />
          <SummaryCard label="交接任务" value={data?.sections.handover.length ?? 0} />
          <SummaryCard label="库存预警" value={data?.sections.inventory.length ?? 0} />
          <SummaryCard label="业绩人员" value={data?.sections.employees.length ?? 0} />
        </div>

        <SectionCard title="文字版简报">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, color: "#6b7280", fontSize: 13 }}>
            <span>{loading ? "正在生成..." : data ? `${linesCount} 行，可直接复制到微信` : "暂无简报"}</span>
            {data?.generated_on && <span>生成日期 {data.generated_on}</span>}
          </div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              lineHeight: 1.8,
              fontSize: 15,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 16,
              background: "#fbfcfa",
              color: "#1f2937",
              minHeight: 360,
            }}
          >
            {message || (loading ? "生成中..." : "请选择日期后生成简报")}
          </pre>
        </SectionCard>

        {imageUrl && (
          <SectionCard
            title="图片版简报"
            actions={
              <a href={imageUrl} download={`daily-briefing-${targetDate}.png`} className="btn btnPrimary">
                下载图片
              </a>
            }
          >
            <div style={{ display: "flex", justifyContent: "center", background: "#eef2f7", borderRadius: 8, padding: 16 }}>
              <img
                src={imageUrl}
                alt="每日班前简报图片"
                style={{ width: "100%", maxWidth: 540, height: "auto", borderRadius: 12, boxShadow: "0 12px 30px rgba(15, 23, 42, 0.16)" }}
              />
            </div>
          </SectionCard>
        )}
      </AppShell>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metricCard">
      <span className="metricLabel">{label}</span>
      <strong className="metricValue">{value}</strong>
    </div>
  );
}

function offsetDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
