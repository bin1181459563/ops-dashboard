import Head from "next/head";
import { AppShell, PageHeader, SectionCard } from "../../components/dashboard";

const TOOL_PATH = "/tools/procurement-reimbursement.html";

export default function ProcurementReimbursementPage() {
  return (
    <>
      <Head><title>采购报销 · 翡翠城经营驾驶舱</title></Head>
      <AppShell currentPage="/dashboard/procurement-reimbursement">
        <PageHeader
          title="🧾 影城采购报销"
          description="日常采购、发票和报销状态登记工具"
          actions={
            <a className="btn btnPrimary" href={TOOL_PATH} target="_blank" rel="noreferrer">
              新窗口打开
            </a>
          }
        />

        <SectionCard title="采购报销工具">
          <iframe
            title="影城采购报销极简版"
            src={TOOL_PATH}
            style={{
              width: "100%",
              height: "calc(100vh - 220px)",
              minHeight: 680,
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
