from threading import Lock
from datetime import datetime
from time import perf_counter
from typing import Any

from app.core.database import DashboardRepository
from app.models.schemas import AlertRecord
from app.services.aggregator import aggregate_wu_laoban, aggregate_xiaotie, aggregate_qgcloud
from app.services.alerts import evaluate_alerts
from app.services.collectors.wu_laoban import collect_wu_laoban_raw
from app.services.collectors.xiaotie import collect_xiaotie_raw
from app.services.collectors.qgcloud import collect_qgcloud_raw
from httpx import ConnectError


class CollectionJob:
    def __init__(self, repository: DashboardRepository) -> None:
        self.repository = repository
        self._lock = Lock()

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


def _duration_ms(start_tick: float) -> int:
    return int((perf_counter() - start_tick) * 1000)


def _is_token_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return isinstance(exc, PermissionError) or "401" in text or "token" in text or "authorization" in text


def _platform_name(platform: str) -> str:
    return {"xiaotie": "台球", "wu_laoban": "棋牌", "qgcloud": "售卖机"}.get(platform, platform)


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
