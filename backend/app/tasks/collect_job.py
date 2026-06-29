import json
from threading import Lock
from datetime import datetime, timedelta, timezone
from time import perf_counter, time
from typing import Any

from app.core.database import DashboardRepository
from app.models.schemas import AlertRecord
from app.services.aggregator import aggregate_wu_laoban, aggregate_xiaotie, aggregate_qgcloud
from app.services.alerts import evaluate_alerts
from app.services.collectors.wu_laoban import collect_wu_laoban_raw
from app.services.collectors.xiaotie import collect_xiaotie_raw
from app.services.collectors.qgcloud import collect_qgcloud_raw
from app.services.collectors.fenghuang import collect_fenghuang_raw, get_access_token
from httpx import ConnectError


class CollectionJob:
    def __init__(self, repository: DashboardRepository) -> None:
        self.repository = repository
        self._lock = Lock()

    def run_yesterday(self) -> dict[str, Any]:
        """每天00:10调用，采集前一天的数据"""
        yesterday = datetime.now(timezone.utc).astimezone() - timedelta(days=1)
        date_str = yesterday.strftime("%Y-%m-%d")
        
        if not self._lock.acquire(blocking=False):
            return {"status": "running", "date": date_str}
        
        try:
            results = {}
            backfill_results = self._process_fenghuang_backfills()
            
            # 台球
            xiaotie_result = self._collect_xiaotie_yesterday(date_str)
            results["xiaotie"] = xiaotie_result
            
            # 棋牌
            wulaoban_result = self._collect_wulaoban_yesterday(date_str)
            results["wu_laoban"] = wulaoban_result
            
            # 影院
            fenghuang_result = self._collect_fenghuang(date_str)
            results["fenghuang"] = fenghuang_result
            self._enqueue_fenghuang_backfill_if_needed(date_str, fenghuang_result)
            
            self.repository.save_collection_run(
                status="completed",
                source="scheduled",
                metrics_count=3,
                excluded_count=0,
                platform_results=[*backfill_results, *list(results.values())],
            )
            
            return {"status": "completed", "date": date_str, "results": results, "backfills": backfill_results}
        finally:
            self._lock.release()

    def run_once(self) -> dict[str, Any]:
        if not self._lock.acquire(blocking=False):
            return {"status": "running", "source": "mixed", "metrics": [], "excluded_platforms": [], "platform_results": []}

        try:
            metrics = []
            excluded_platforms = []
            platform_results = []
            for platform, business_type, collector, aggregator in [
                ("xiaotie", "billiards", collect_xiaotie_raw, aggregate_xiaotie),
                ("wu_laoban", "mahjong", collect_wu_laoban_raw, aggregate_wu_laoban),
                ("qgcloud", "vending", collect_qgcloud_raw, aggregate_qgcloud),
            ]:
                result = self._collect_platform(platform, business_type, collector, aggregator)
                if result["metric"]:
                    metrics.append(result["metric"])
                if result["excluded"]:
                    excluded_platforms.append(result["excluded"])
                platform_results.append(result["platform_result"])

            # 凤凰云智影院（特殊处理，不使用aggregator）
            fenghuang_result = self._collect_fenghuang()
            if fenghuang_result["platform_result"]:
                platform_results.append(fenghuang_result["platform_result"])
            sources = {metric.source for metric in metrics}

            if not sources:
                source = "none"
            else:
                source = sources.pop() if len(sources) == 1 else "mixed"
            result = {
                "status": "completed",
                "source": source,
                "metrics": [metric.model_dump(mode="json") for metric in metrics],
                "excluded_platforms": excluded_platforms,
                "platform_results": platform_results,
            }
            self.repository.save_collection_run(
                status=result["status"],
                source=result["source"],
                metrics_count=len(result["metrics"]),
                excluded_count=len(result["excluded_platforms"]),
                platform_results=platform_results,
            )
            return result
        finally:
            self._lock.release()

    def _collect_platform(self, platform: str, business_type: str, collector: Any, aggregator: Any) -> dict[str, Any]:
        started = datetime.now().astimezone()
        start_tick = perf_counter()
        try:
            raw = collector()
            retry_meta = _collector_retry_meta(collector)
            if not raw:
                finished = datetime.now().astimezone()
                duration_ms = _duration_ms(start_tick)
                self.repository.save_sync_log(
                    platform=platform,
                    store_id="feicuicheng",
                    status="skipped",
                    message=f"{_platform_name(platform)}暂无可采集数据",
                    business_type=business_type,
                    started_at=started,
                    finished_at=finished,
                    duration_ms=duration_ms,
                )
                return {
                    "metric": None,
                    "excluded": {
                        "platform": platform,
                        "status": "skipped",
                        "reason": f"{_platform_name(platform)}暂无可采集数据",
                    },
                    "platform_result": _platform_result(
                        platform=platform,
                        business_type=business_type,
                        status="skipped",
                        duration_ms=duration_ms,
                        message=f"{_platform_name(platform)}暂无可采集数据",
                        retry_meta=retry_meta,
                        records_count=0,
                    ),
                }

            metric = aggregator(raw)
            self.repository.save_metric(metric)
            if business_type in {"mahjong", "billiards"}:
                self.repository.upsert_daily_snapshot(business_type, metric, raw)
            previous = self.repository.previous_metric_for_platform(metric.platform)
            alerts = evaluate_alerts(metric, previous)
            self.repository.save_alerts(alerts)
            finished = datetime.now().astimezone()
            duration_ms = _duration_ms(start_tick)
            self.repository.save_sync_log(
                platform=platform,
                store_id=metric.store_id,
                status="success",
                message="正常",
                business_type=business_type,
                started_at=started,
                finished_at=finished,
                duration_ms=duration_ms,
                records_count=1,
            )
            return {
                "metric": metric,
                "excluded": None,
                "platform_result": _platform_result(
                    platform=platform,
                    business_type=business_type,
                    status="success",
                    duration_ms=duration_ms,
                    message="正常",
                    retry_meta=retry_meta,
                    records_count=1,
                ),
            }
        except Exception as exc:
            retry_meta = _collector_retry_meta(collector)
            if _is_token_error(exc):
                status = "token_invalid"
                message = "小铁 token 已失效，请重新抓取 token 后更新。"
            elif isinstance(exc, (ConnectError, ConnectionError, ConnectionRefusedError, OSError)) or "connection" in str(exc).lower():
                status = "failed"
                message = f"{_platform_name(platform)}数据源连接失败，请检查网络或服务状态。"
            else:
                status = "failed"
                message = str(exc)
            finished = datetime.now().astimezone()
            self.repository.save_sync_log(
                platform=platform,
                store_id="feicuicheng",
                status=status,
                message=message,
                business_type=business_type,
                started_at=started,
                finished_at=finished,
                duration_ms=_duration_ms(start_tick),
            )
            self.repository.save_alerts(
                [
                    AlertRecord(
                        platform=platform,
                        store_id="feicuicheng",
                        alert_type="token_invalid" if status == "token_invalid" else "sync_failed",
                        message=message,
                        level="critical" if status == "token_invalid" else "warning",
                        time=finished,
                    )
                ]
            )
            return {
                "metric": None,
                "excluded": {
                    "platform": platform,
                    "status": status,
                    "reason": message,
                },
                "platform_result": _platform_result(
                    platform=platform,
                    business_type=business_type,
                    status=status,
                    duration_ms=_duration_ms(start_tick),
                    message=message,
                    retry_meta=retry_meta,
                    records_count=0,
                ),
            }

    def _collect_xiaotie_yesterday(self, date_str: str) -> dict[str, Any]:
        """采集小铁台球指定日期的数据"""
        start_tick = perf_counter()
        try:
            import ssl
            import httpx
            from app.services.collectors.xiaotie import get_authorization
            from app.core.config import settings
            
            authorization = get_authorization()
            if not authorization:
                return {"platform": "xiaotie", "status": "skipped", "message": "未配置token"}
            
            # 查询指定日期
            start = f"{date_str}T00:00:00+08:00"
            end = f"{date_str}T23:59:59+08:00"
            
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            
            headers = {
                "Authorization": authorization,
                "Xi-App-Id": settings.xiaotie_app_id,
                "xweb_xhr": "1",
                "User-Agent": "Mozilla/5.0 MicroMessenger/7.0.20.1781",
                "Referer": "https://servicewechat.com/",
                "Accept": "*/*",
            }
            
            with httpx.Client(timeout=15, verify=ssl_ctx) as client:
                # 汇总数据
                resp = client.get(
                    f"{settings.xiaotie_base_url}/api/system/stat/dashboards/new_summary/",
                    headers=headers,
                    params={
                        "node_id": settings.xiaotie_node_id,
                        "date_type": "1",
                        "node_type": "Site",
                        "start_date": start,
                        "end_date": end,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                result = data.get("Result", {})
                
                # 桌台状态
                resp2 = client.get(
                    f"{settings.xiaotie_base_url}/api/system/device/tables/",
                    headers=headers,
                    params={
                        "expand": "Device,PayRuleGroup.PayRules",
                        "node_id": settings.xiaotie_node_id,
                        "count": "true",
                        "limit": "50",
                    },
                )
                tables_data = resp2.json()
                tables = tables_data.get("Results", [])
                total_tables = int(tables_data.get("Count") or len(tables) or 13)
                busy_tables = sum(1 for t in tables if t.get("open"))
            
            # 计算指标
            revenue = round(result.get("order_payed", 0) / 100, 2)
            orders = result.get("order_count", 0)
            customer_count = result.get("face_count", 0)
            usage_rate = round(busy_tables / max(total_tables, 1), 4)
            avg_order_value = round(revenue / max(orders, 1), 2)
            
            raw_json = {
                "source": "scheduled",
                "summary": result,
                "tables": {"total": total_tables, "busy": busy_tables},
            }
            
            # 存入数据库
            self.repository.upsert_daily_snapshot_values(
                business_type="billiards",
                platform="xiaotie",
                store_id="feicuicheng",
                date=date_str,
                revenue=revenue,
                orders=orders,
                usage_rate=usage_rate,
                customer_count=customer_count,
                avg_order_value=avg_order_value,
                raw=raw_json,
            )
            
            duration_ms = int((perf_counter() - start_tick) * 1000)
            return {
                "platform": "xiaotie",
                "status": "success",
                "duration_ms": duration_ms,
                "records_count": 1,
            }
        except Exception as exc:
            duration_ms = int((perf_counter() - start_tick) * 1000)
            return {
                "platform": "xiaotie",
                "status": "failed",
                "duration_ms": duration_ms,
                "message": str(exc),
            }

    def _collect_wulaoban_yesterday(self, date_str: str) -> dict[str, Any]:
        """采集無老板棋牌指定日期的数据"""
        start_tick = perf_counter()
        try:
            import hashlib
            import httpx
            from app.core.config import settings
            
            # 解析日期
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            date_int = date_obj.strftime("%Y%m%d")
            
            # 生成token
            path = "/admin/stats/finance"
            ts = str(int(time() * 1000))
            raw = f"{settings.wu_laoban_base_url}{path}{ts}{settings.wu_laoban_base_url}"
            applet_token = hashlib.md5(raw.encode()).hexdigest()
            
            headers = {
                "Cookie": f"admin_token={settings.wu_laoban_admin_token}",
                "applet-token": applet_token,
                "mid": settings.wu_laoban_mid,
                "pageId": "100192",
                "timezone-offset": "28800000",
                "trace-id": f"scheduled-{ts}",
            }
            
            with httpx.Client(timeout=15, verify=False) as client:
                resp = client.get(
                    f"{settings.wu_laoban_base_url}{path}",
                    headers=headers,
                    params={
                        "timestamp_private": ts,
                        "isbrand": "0",
                        "store": settings.wu_laoban_sid,
                        "sids[]": settings.wu_laoban_sid,
                        "date1": date_int,
                        "date2": date_int,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                result = data.get("result", {})
                now_data = result.get("nowData", {})
            
            # 计算指标
            revenue = float(now_data.get("amount", 0))
            
            # 存入数据库
            self.repository.upsert_daily_snapshot_values(
                business_type="mahjong",
                platform="wu_laoban",
                store_id="feicuicheng",
                date=date_str,
                revenue=revenue,
                orders=0,  # 需要单独查询订单接口
                usage_rate=0,
                customer_count=0,
                avg_order_value=0,
                raw={"source": "scheduled", "finance": now_data},
            )
            
            duration_ms = int((perf_counter() - start_tick) * 1000)
            return {
                "platform": "wu_laoban",
                "status": "success",
                "duration_ms": duration_ms,
                "records_count": 1,
            }
        except Exception as exc:
            duration_ms = int((perf_counter() - start_tick) * 1000)
            return {
                "platform": "wu_laoban",
                "status": "failed",
                "duration_ms": duration_ms,
                "message": str(exc),
            }

    def _collect_fenghuang(self, target_date: str | None = None) -> dict[str, Any]:
        """凤凰云智影院数据采集（特殊处理）"""
        started = datetime.now().astimezone()
        start_tick = perf_counter()
        try:
            token = get_access_token()
            if not token:
                finished = datetime.now().astimezone()
                duration_ms = _duration_ms(start_tick)
                self.repository.save_sync_log(
                    platform="fenghuang",
                    store_id="cinema_feicuicheng",
                    status="skipped",
                    message="凤凰云智未配置token",
                    business_type="cinema",
                    started_at=started,
                    finished_at=finished,
                    duration_ms=duration_ms,
                )
                return {
                    "platform_result": _platform_result(
                        platform="fenghuang",
                        business_type="cinema",
                        status="skipped",
                        duration_ms=duration_ms,
                        message="凤凰云智未配置token",
                        retry_meta={"retried": False, "retry_count": 0},
                        records_count=0,
                    ),
                }

            raw = collect_fenghuang_raw(target_date=target_date)
            if not raw:
                finished = datetime.now().astimezone()
                duration_ms = _duration_ms(start_tick)
                self.repository.save_sync_log(
                    platform="fenghuang",
                    store_id="cinema_feicuicheng",
                    status="skipped",
                    message="凤凰云智暂无可采集数据",
                    business_type="cinema",
                    started_at=started,
                    finished_at=finished,
                    duration_ms=duration_ms,
                )
                return {
                    "platform_result": _platform_result(
                        platform="fenghuang",
                        business_type="cinema",
                        status="skipped",
                        duration_ms=duration_ms,
                        message="凤凰云智暂无可采集数据",
                        retry_meta={"retried": False, "retry_count": 0},
                        records_count=0,
                    ),
                }

            # 保存到daily_snapshots
            raw = self._merge_fenghuang_raw_with_existing(raw)
            validation = _validate_fenghuang_snapshot(raw)
            raw["validation"] = validation
            summary = raw.get("summary", {})
            self.repository.upsert_daily_snapshot_values(
                business_type="cinema",
                platform="fenghuang",
                store_id="cinema_feicuicheng",
                date=raw.get("date", ""),
                revenue=summary.get("revenue", 0),
                orders=summary.get("screenings", 0),  # 场次
                usage_rate=summary.get("occupancy_rate", 0),
                customer_count=summary.get("customer_count", 0),
                avg_order_value=summary.get("average_ticket_price", 0),
                raw=raw,
            )

            # 保存同步日志
            finished = datetime.now().astimezone()
            duration_ms = _duration_ms(start_tick)
            status = "success_with_warnings" if validation["status"] == "warning" else "success"
            message = _fenghuang_validation_message(validation) if validation["status"] == "warning" else "正常"
            self.repository.save_sync_log(
                platform="fenghuang",
                store_id="cinema_feicuicheng",
                status=status,
                message=message,
                business_type="cinema",
                started_at=started,
                finished_at=finished,
                duration_ms=duration_ms,
                records_count=1,
            )
            if validation["status"] == "warning":
                self.repository.save_alerts(
                    [
                        AlertRecord(
                            platform="fenghuang",
                            store_id="cinema_feicuicheng",
                            alert_type="data_validation",
                            message=message,
                            level="warning",
                            time=finished,
                        )
                    ]
                )

            return {
                "platform_result": _platform_result(
                    platform="fenghuang",
                    business_type="cinema",
                    status=status,
                    duration_ms=duration_ms,
                    message=message,
                    retry_meta={"retried": False, "retry_count": 0},
                    records_count=1,
                ),
            }
        except Exception as exc:
            if _is_token_error(exc):
                status = "token_invalid"
                message = "凤凰云智 token 已失效，请重新抓取 token 后更新。"
            elif isinstance(exc, (ConnectError, ConnectionError, ConnectionRefusedError, OSError)) or "connection" in str(exc).lower():
                status = "failed"
                message = "凤凰云智数据源连接失败，请检查网络或服务状态。"
            else:
                status = "failed"
                message = str(exc)
            finished = datetime.now().astimezone()
            self.repository.save_sync_log(
                platform="fenghuang",
                store_id="cinema_feicuicheng",
                status=status,
                message=message,
                business_type="cinema",
                started_at=started,
                finished_at=finished,
                duration_ms=_duration_ms(start_tick),
            )
            self.repository.save_alerts(
                [
                    AlertRecord(
                        platform="fenghuang",
                        store_id="cinema_feicuicheng",
                        alert_type="token_invalid" if status == "token_invalid" else "sync_failed",
                        message=message,
                        level="critical" if status == "token_invalid" else "warning",
                        time=finished,
                    )
                ]
            )
            return {
                "platform_result": _platform_result(
                    platform="fenghuang",
                    business_type="cinema",
                    status=status,
                    duration_ms=_duration_ms(start_tick),
                    message=message,
                    retry_meta={"retried": False, "retry_count": 0},
                    records_count=0,
                ),
            }

    def _process_fenghuang_backfills(self) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        due_items = self.repository.due_collection_backfills(platform="fenghuang", limit=5)
        for item in due_items:
            result = self._collect_fenghuang(item["target_date"])
            platform_result = result.get("platform_result", result)
            status = platform_result.get("status")
            results.append({
                **platform_result,
                "target_date": item["target_date"],
                "backfill": True,
            })
            if status in {"success", "success_with_warnings"}:
                self.repository.mark_collection_backfill_succeeded(item["id"])
            else:
                self.repository.mark_collection_backfill_failed(
                    item["id"],
                    message=platform_result.get("message") or "补采失败",
                    max_attempts=3,
                )
        return results

    def _enqueue_fenghuang_backfill_if_needed(self, target_date: str, result: dict[str, Any]) -> None:
        platform_result = result.get("platform_result", result)
        status = platform_result.get("status")
        if status not in {"failed", "token_invalid"}:
            return
        self.repository.enqueue_collection_backfill(
            platform="fenghuang",
            business_type="cinema",
            store_id="cinema_feicuicheng",
            target_date=target_date,
            message=platform_result.get("message"),
        )

    def _merge_fenghuang_raw_with_existing(self, incoming_raw: dict[str, Any]) -> dict[str, Any]:
        """Merge API collection with existing same-day snapshot without erasing data API does not collect."""
        snapshot_date = incoming_raw.get("date", "")
        existing = self.repository.daily_snapshot_for_date(
            "cinema",
            "fenghuang",
            "cinema_feicuicheng",
            snapshot_date,
        )
        if not existing:
            return incoming_raw

        existing_raw = _load_raw_json(existing.get("raw_json"))
        existing_summary = existing_raw.get("summary", {})
        incoming_summary = incoming_raw.get("summary", {})
        merged = {
            **existing_raw,
            **incoming_raw,
            "summary": {
                **existing_summary,
                **incoming_summary,
            },
        }

        for key in ("member_items", "rows"):
            if key in existing_raw and key not in incoming_raw:
                merged[key] = existing_raw[key]

        for key in ("films", "concession_items", "member_open_card_items", "member_recharge_items", "inventory_items"):
            if key in incoming_raw:
                merged[key] = incoming_raw[key]
            elif key in existing_raw:
                merged[key] = existing_raw[key]

        imported_reports = [
            *(existing_raw.get("imported_reports") or []),
            existing_raw.get("file_name"),
            "fenghuang_api",
        ]
        merged["imported_reports"] = sorted({item for item in imported_reports if item})
        return merged


def _load_raw_json(raw_json: Any) -> dict[str, Any]:
    if isinstance(raw_json, dict):
        return raw_json
    if isinstance(raw_json, str):
        try:
            loaded = json.loads(raw_json)
        except json.JSONDecodeError:
            return {}
        return loaded if isinstance(loaded, dict) else {}
    return {}


def _validate_fenghuang_snapshot(raw: dict[str, Any], tolerance: float = 0.02) -> dict[str, Any]:
    summary = raw.get("summary") or {}
    checks = [
        ("box_office", "films", ("box_office", "film_box_office")),
        ("concession_revenue", "concession_items", ("pay_amount", "revenue", "concession_payment")),
        ("member_consume", "member_items", ("amount",)),
        ("member_recharge_total", "member_recharge_items", ("amount", "recharge_amount")),
    ]
    issues = []
    for field, items_key, amount_keys in checks:
        if field not in summary:
            continue
        summary_total = _number(summary.get(field))
        detail_total = _sum_item_amounts(raw.get(items_key) or [], amount_keys)
        diff = round(summary_total - detail_total, 2)
        if abs(diff) > tolerance:
            issues.append({
                "field": field,
                "items_key": items_key,
                "summary_total": round(summary_total, 2),
                "detail_total": round(detail_total, 2),
                "diff": diff,
            })
    return {"status": "warning" if issues else "ok", "issues": issues}


def _sum_item_amounts(items: list[dict[str, Any]], amount_keys: tuple[str, ...]) -> float:
    total = 0.0
    for item in items:
        for key in amount_keys:
            if key in item:
                total += _number(item.get(key))
                break
    return round(total, 2)


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _fenghuang_validation_message(validation: dict[str, Any]) -> str:
    parts = []
    for issue in validation.get("issues") or []:
        parts.append(
            f"{issue['field']} 汇总 {issue['summary_total']} 元，明细 {issue['detail_total']} 元，差额 {issue['diff']} 元"
        )
    return "数据校验警告：" + "；".join(parts)


def _duration_ms(start_tick: float) -> int:
    return int((perf_counter() - start_tick) * 1000)


def _is_token_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return isinstance(exc, PermissionError) or "401" in text or "token" in text or "authorization" in text


def _platform_name(platform: str) -> str:
    return {"xiaotie": "台球", "wu_laoban": "棋牌", "qgcloud": "售卖机", "fenghuang": "影院"}.get(platform, platform)


def _collector_retry_meta(collector: Any) -> dict[str, Any]:
    meta = getattr(collector, "last_meta", None)
    if isinstance(meta, dict):
        return {
            "retried": bool(meta.get("retried")),
            "retry_count": int(meta.get("retry_count") or 0),
        }
    return {"retried": False, "retry_count": 0}


def _platform_result(
    *,
    platform: str,
    business_type: str,
    status: str,
    duration_ms: int,
    message: str,
    retry_meta: dict[str, Any],
    records_count: int,
) -> dict[str, Any]:
    return {
        "platform": platform,
        "business_type": business_type,
        "status": status,
        "message": message,
        "duration_ms": duration_ms,
        "retried": bool(retry_meta.get("retried")),
        "retry_count": int(retry_meta.get("retry_count") or 0),
        "records_count": records_count,
    }
