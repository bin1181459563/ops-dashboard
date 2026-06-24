from fastapi import APIRouter, Request

from app.models.schemas import ApiEnvelope
from app.services.cinema_excel import cinema_status
from app.services.collectors.xiaotie import check_xiaotie_token
from app.services.collectors.wu_laoban import check_wu_laoban_token

router = APIRouter()


@router.get("/data-sources/status")
def data_sources_status(request: Request) -> ApiEnvelope:
    repository = request.app.state.repository
    wu_status = check_wu_laoban_token()
    xiaotie_status = check_xiaotie_token()
    wu_log = repository.latest_sync_log_for_platform("wu_laoban")
    xiaotie_log = repository.latest_sync_log_for_platform("xiaotie")

    return ApiEnvelope(
        data={
            "platforms": [
                {
                    "platform": "wu_laoban",
                    "business_type": "mahjong",
                    "status": "ok" if wu_status.get("valid") else "sync_failed",
                    "data_source": "api",
                    "last_sync_time": repository.last_successful_sync_time("wu_laoban"),
                    "message": "正常" if wu_status.get("valid") else wu_status.get("error") or _log_message(wu_log, "棋牌同步失败"),
                },
                {
                    "platform": "xiaotie",
                    "business_type": "billiards",
                    "status": "ok" if xiaotie_status.get("valid") else "token_invalid",
                    "data_source": "api",
                    "last_sync_time": repository.last_successful_sync_time("xiaotie"),
                    "token_status": "valid" if xiaotie_status.get("valid") else "invalid",
                    "message": "正常" if xiaotie_status.get("valid") else "小铁 token 已失效，请重新抓取",
                    "error_reason": None if xiaotie_status.get("valid") else xiaotie_status.get("error") or _log_message(xiaotie_log, "token 已失效"),
                },
                cinema_status(repository),
            ]
        },
        source="api",
    )


def _log_message(log: dict | None, fallback: str) -> str:
    if not log:
        return fallback
    return log.get("message") or fallback
