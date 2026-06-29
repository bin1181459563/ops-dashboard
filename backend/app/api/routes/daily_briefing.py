from datetime import date, datetime, timedelta

from fastapi import APIRouter, Query, Request, Response

from app.services.daily_briefing import build_briefing, render_briefing_image_png

router = APIRouter()


@router.get("/operations/daily-briefing")
def daily_briefing(
    request: Request,
    date_str: str | None = Query(default=None, alias="date", description="简报目标日期 YYYY-MM-DD"),
) -> dict:
    target_date = _parse_target_date(date_str)
    return build_briefing(request.app.state.repository, target_date)


@router.get("/operations/daily-briefing/image")
def daily_briefing_image(
    request: Request,
    date_str: str | None = Query(default=None, alias="date", description="简报目标日期 YYYY-MM-DD"),
) -> Response:
    target_date = _parse_target_date(date_str)
    briefing = build_briefing(request.app.state.repository, target_date)
    image = render_briefing_image_png(briefing["message"])
    filename = f"daily-briefing-{target_date.isoformat()}.png"
    return Response(
        content=image,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


def _parse_target_date(value: str | None) -> date:
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return date.today() + timedelta(days=1)
