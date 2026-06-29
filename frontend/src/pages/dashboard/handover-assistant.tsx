import Head from "next/head";
import { AppShell, PageHeader, SectionCard } from "../../components/dashboard";

const HANDOVER_URL = "http://localhost:4173";

export default function HandoverAssistantPage() {
  return (
    <>
      <Head><title>交接助手 · 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/handover-assistant">
        <PageHeader
          title="🗂️ 影院交接助手"
          description="日常交接、包场、活动和任务提醒"
          actions={
            <a className="btn btnPrimary" href={HANDOVER_URL} target="_blank" rel="noreferrer">
              新窗口打开
            </a>
          }
        />

        <SectionCard title="交接助手">
          <iframe
            title="影院交接助手"
            src={HANDOVER_URL}
            style={{
              width: "100%",
              height: "calc(100vh - 220px)",
              minHeight: 720,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#fff",
            }}
          />
        </SectionCard>
      </AppShell>
    </>
  );
}
