const baseUrl = process.env.PAGE_BASE_URL || "http://localhost:9100";

const pages = [
  "/dashboard",
  "/dashboard/customer",
  "/dashboard/customer-wake-up",
  "/dashboard/concession-recommendations",
  "/dashboard/screening-suggestions",
  "/dashboard/reports",
  "/dashboard/revenue-forecast",
  "/dashboard/cross-business",
  "/dashboard/billiards",
  "/dashboard/mahjong",
  "/dashboard/cinema",
  "/dashboard/data-quality",
  "/dashboard/alerts",
];

const badKeywords = [
  "Internal Server Error",
  "Application error",
  "ChunkLoadError",
  "TypeError",
  "ReferenceError",
  "Unhandled Runtime Error",
];

let failed = false;

for (const path of pages) {
  const url = `${baseUrl}${path}`;
  try {
    const response = await fetch(url, { redirect: "follow" });
    const text = await response.text();
    const hits = badKeywords.filter((keyword) => text.includes(keyword));
    const ok = response.status === 200 && hits.length === 0;
    if (ok) {
      console.log(`PASS ${path} ${response.status}`);
    } else {
      failed = true;
      console.log(`FAIL ${path} ${response.status}${hits.length ? ` keywords=${hits.join(",")}` : ""}`);
    }
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL ${path} fetch_failed ${message}`);
  }
}

process.exit(failed ? 1 : 0);
