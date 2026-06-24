from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


Platform = Literal["xiaotie", "wu_laoban", "qgcloud", "cinema", "fenghuang"]
DataSource = Literal["api", "mock", "mixed", "none"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UnifiedMetric(BaseModel):
    platform: Literal["xiaotie", "wu_laoban", "qgcloud"]
    store_id: str = "feicuicheng"
    revenue: float = 0
    orders: int = 0
    usage_rate: float = Field(default=0, ge=0)
    time: datetime = Field(default_factory=utc_now)
    source: Literal["api", "mock"] = "mock"


class AlertRecord(BaseModel):
    platform: Literal["xiaotie", "wu_laoban", "qgcloud"]
    store_id: str = "feicuicheng"
    alert_type: Literal["low_usage", "usage_low", "usage_drop", "revenue_drop", "token_invalid", "sync_failed", "stale_data"]
    message: str
    level: Literal["info", "warning", "critical"] = "warning"
    time: datetime = Field(default_factory=utc_now)


class ApiEnvelope(BaseModel):
    data: object
    time: datetime = Field(default_factory=utc_now)
    source: DataSource = "api"


class CinemaPlaceholder(BaseModel):
    platform: Literal["cinema"] = "cinema"
    status: Literal["placeholder"] = "placeholder"
    note: str = "future integration only"
