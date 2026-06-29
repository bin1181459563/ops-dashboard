# Daily Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard-native daily briefing that generates tomorrow's staff message from schedule, cinema, handover, inventory, and employee performance data.

**Architecture:** Backend owns data gathering and message formatting in a small service, exposed through one FastAPI route. Frontend renders the generated message and provides refresh/copy controls. Inventory and employee performance rules are kept in pure helpers with tests.

**Tech Stack:** Python FastAPI, SQLite, Next.js React TypeScript, existing dashboard API wrapper.

---

### Task 1: Backend Briefing Rules

**Files:**
- Create: `backend/app/services/daily_briefing.py`
- Test: `backend/tests/test_daily_briefing.py`

- [ ] **Step 1: Write failing tests**
  - Verify inventory alerts use current dashboard thresholds and only return active alert rows.
  - Verify employee performance keeps only 邓晓阗、刘柯鑫、曹丽梅、韩亚琳, drops missing employees, and formats package/activity as counts.

- [ ] **Step 2: Run tests and see failure**
  - Run: `cd backend && pytest tests/test_daily_briefing.py -q`
  - Expected: import error because `app.services.daily_briefing` does not exist.

- [ ] **Step 3: Implement helpers**
  - Add pure helpers for `build_inventory_alert_lines`, `filter_employee_performance`, and `build_employee_lines`.

- [ ] **Step 4: Run tests and see pass**
  - Run: `cd backend && pytest tests/test_daily_briefing.py -q`
  - Expected: all tests pass.

### Task 2: Backend API Route

**Files:**
- Create: `backend/app/api/routes/daily_briefing.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add route**
  - Add `GET /api/operations/daily-briefing?date=YYYY-MM-DD` that returns sections and final message text.

- [ ] **Step 2: Register route**
  - Import and include the router in `create_app`.

- [ ] **Step 3: Smoke test route**
  - Run: `curl -sS 'http://localhost:8000/api/operations/daily-briefing?date=2026-06-29'`
  - Expected: JSON payload with `message`.

### Task 3: Frontend Page

**Files:**
- Modify: `frontend/src/lib/dashboardApi.ts`
- Modify: `frontend/src/components/dashboard/SideNav.tsx`
- Create: `frontend/src/pages/dashboard/daily-briefing.tsx`

- [ ] **Step 1: Add API client type/function**
  - Add `fetchDailyBriefing(date?: string)`.

- [ ] **Step 2: Add page**
  - Render date picker, refresh button, copy button, and final message preview.

- [ ] **Step 3: Add navigation**
  - Add “每日简报” under dashboard navigation.

- [ ] **Step 4: Verify frontend types**
  - Run: `cd frontend && npm run typecheck`
  - Expected: no TypeScript errors from the new page.

### Task 4: Final Verification

- [ ] **Step 1: Run backend targeted tests**
  - Run: `cd backend && pytest tests/test_daily_briefing.py -q`

- [ ] **Step 2: Run frontend typecheck**
  - Run: `cd frontend && npm run typecheck`

- [ ] **Step 3: Fetch live briefing**
  - Run: `curl -sS 'http://localhost:8000/api/operations/daily-briefing?date=2026-06-29'`
  - Expected: text includes corrected inventory and employee-performance rules.
