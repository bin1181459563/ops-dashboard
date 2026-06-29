# Fenghuang Collection Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Fenghuang BI detail collection complete and auditable by adding BI pagination, failed-date backfill, and post-write consistency checks.

**Architecture:** Add a reusable BI pagination helper in the Fenghuang collector, keep backfill state in a lightweight SQLite table managed by `DashboardRepository`, and run cinema snapshot validation inside `CollectionJob` immediately after writing `daily_snapshots`. Failed validation should warn without blocking snapshot writes.

**Tech Stack:** Python, FastAPI service code, SQLite repository, pytest.

---

### Task 1: BI Pagination

**Files:**
- Modify: `backend/app/services/collectors/fenghuang.py`
- Test: `backend/tests/test_fenghuang_collector.py`

- [ ] Add tests proving a BI endpoint with `totalItems` greater than `pageSize` fetches page 2 and merges `data.list`.
- [ ] Add tests proving all existing parsed summaries still come from page 1.
- [ ] Implement `_bi_post_all_pages(path, body, token, max_pages=100)`.
- [ ] Switch `collect_schedule_detail`, `collect_goods_detail`, `collect_member_open_card`, `collect_member_recharge`, and `collect_member_payment` to use `_bi_post_all_pages`.
- [ ] Run `python3 -m pytest tests/test_fenghuang_collector.py -q`.

### Task 2: Backfill Queue

**Files:**
- Modify: `backend/app/core/database.py`
- Modify: `backend/app/tasks/collect_job.py`
- Test: `backend/tests/test_database.py`
- Test: `backend/tests/test_collect_job.py`

- [ ] Add repository tests for enqueueing, querying, retrying, succeeding, and exhausting a Fenghuang backfill date.
- [ ] Add `collection_backfills` table with a unique key on `(platform, business_type, store_id, target_date)`.
- [ ] Add repository methods: `enqueue_collection_backfill`, `due_collection_backfills`, `mark_collection_backfill_succeeded`, and `mark_collection_backfill_failed`.
- [ ] Add collection job tests proving a failed scheduled Fenghuang collection queues the date, and the next scheduled run tries due backfills before yesterday.
- [ ] Implement backfill processing in `CollectionJob.run_yesterday()`.
- [ ] Run `python3 -m pytest tests/test_database.py tests/test_collect_job.py -q`.

### Task 3: Snapshot Consistency Checks

**Files:**
- Modify: `backend/app/tasks/collect_job.py`
- Test: `backend/tests/test_collect_job.py`

- [ ] Add tests for passing validation and warning validation when summary values differ from detail totals.
- [ ] Implement `_validate_fenghuang_snapshot(raw)` with 0.02 yuan tolerance.
- [ ] After writing Fenghuang `daily_snapshots`, save sync log as `success` when clean, or `success_with_warnings` plus warning alert when mismatched.
- [ ] Include validation metadata under `raw_json.validation` so downstream pages can inspect the mismatch.
- [ ] Run `python3 -m pytest tests/test_collect_job.py -q`.

### Task 4: Full Verification

**Files:**
- No additional files expected.

- [ ] Run `python3 -m pytest -q`.
- [ ] Restart `ops-backend` with PM2.
- [ ] Confirm `ops-backend` is online and listening on port 8000.
