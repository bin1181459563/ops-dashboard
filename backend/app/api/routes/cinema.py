from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File

from app.services.cinema_excel import (
    BUSINESS_TYPE,
    PLATFORM,
    STORE_ID,
    CinemaImportError,
    cinema_detail,
    cinema_overview,
    parse_cinema_file,
    save_cinema_import,
)

router = APIRouter()

REPORT_IMPORT_PRIORITY = {
    "operations": 10,
    "film_ranking": 20,
    "concession_detail": 30,
    "member_detail": 40,
    "generic": 90,
}


@router.post("/cinema/import-excel")
async def import_cinema_excel(request: Request, file: UploadFile = File(...)) -> dict:
    repository = request.app.state.repository
    started_at = datetime.now().astimezone()
    file_name = file.filename or "unknown"
    try:
        file_bytes = await file.read()
        parsed = parse_cinema_file(file_bytes, file_name)
        save_cinema_import(repository, parsed)
        finished_at = datetime.now().astimezone()
        repository.save_sync_log(
            platform=PLATFORM,
            business_type=BUSINESS_TYPE,
            store_id=STORE_ID,
            status="success",
            message="凤凰云智 Excel 导入成功",
            file_name=file_name,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((finished_at - started_at).total_seconds() * 1000),
            records_count=len(parsed["snapshots"]),
        )
        return {
            "status": "ok",
            "message": "凤凰云智 Excel 导入成功",
            "data_source": "excel",
            "file_name": file_name,
            "report_type": parsed["report_type"],
            "report_note": parsed["report_note"],
            "missing_fields": parsed["missing_fields"],
            "snapshot": _public_snapshot(parsed["snapshot"]),
            "films": parsed["films"],
            "imported_dates": [snapshot["date"] for snapshot in parsed["snapshots"]],
        }
    except CinemaImportError as exc:
        _log_failed_import(repository, started_at, file_name, str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        message = f"导入失败：{exc}"
        _log_failed_import(repository, started_at, file_name, message)
        raise HTTPException(status_code=400, detail=message) from exc


@router.post("/cinema/import-batch")
async def import_cinema_batch(request: Request, files: list[UploadFile] = File(...)) -> dict:
    repository = request.app.state.repository
    parsed_items: list[dict] = []
    failed_results: list[dict] = []

    for upload in files:
        started_at = datetime.now().astimezone()
        file_name = upload.filename or "unknown"
        try:
            file_bytes = await upload.read()
            parsed = parse_cinema_file(file_bytes, file_name)
            parsed_items.append(
                {
                    "file_name": file_name,
                    "parsed": parsed,
                    "started_at": started_at,
                }
            )
        except CinemaImportError as exc:
            message = str(exc)
            _log_failed_import(repository, started_at, file_name, message)
            failed_results.append(_failed_result(file_name, message))
        except Exception as exc:
            message = f"导入失败：{exc}"
            _log_failed_import(repository, started_at, file_name, message)
            failed_results.append(_failed_result(file_name, message))

    parsed_items.sort(
        key=lambda item: (
            REPORT_IMPORT_PRIORITY.get(item["parsed"].get("report_type"), REPORT_IMPORT_PRIORITY["generic"]),
            item["file_name"],
        )
    )

    success_results: list[dict] = []
    for item in parsed_items:
        parsed = item["parsed"]
        file_name = item["file_name"]
        started_at = item["started_at"]
        try:
            save_cinema_import(repository, parsed)
            finished_at = datetime.now().astimezone()
            repository.save_sync_log(
                platform=PLATFORM,
                business_type=BUSINESS_TYPE,
                store_id=STORE_ID,
                status="success",
                message="凤凰云智 Excel 批量导入成功",
                file_name=file_name,
                started_at=started_at,
                finished_at=finished_at,
                duration_ms=int((finished_at - started_at).total_seconds() * 1000),
                records_count=len(parsed["snapshots"]),
            )
            success_results.append(_success_result(parsed))
        except CinemaImportError as exc:
            message = str(exc)
            _log_failed_import(repository, started_at, file_name, message)
            failed_results.append(_failed_result(file_name, message, parsed.get("report_type")))
        except Exception as exc:
            message = f"导入失败：{exc}"
            _log_failed_import(repository, started_at, file_name, message)
            failed_results.append(_failed_result(file_name, message, parsed.get("report_type")))

    success_count = len(success_results)
    failed_count = len(failed_results)
    status = "ok" if failed_count == 0 else "partial" if success_count else "failed"
    payload = {
        "status": status,
        "message": f"批量导入完成：{success_count} 成功，{failed_count} 失败" if success_count else f"批量导入失败：0 成功，{failed_count} 失败",
        "data_source": "excel",
        "success_count": success_count,
        "failed_count": failed_count,
        "results": [*success_results, *failed_results],
    }
    if success_count == 0:
        raise HTTPException(status_code=400, detail=payload)
    return payload


@router.get("/cinema/overview")
def get_cinema_overview(
    request: Request,
    date: str | None = Query(default=None),
    days: int = Query(default=1, ge=1, le=366),
    start_date: str | None = Query(default=None),
) -> dict:
    return cinema_overview(request.app.state.repository, target_date=date, days=days, start_date=start_date)


@router.get("/cinema/detail")
def get_cinema_detail(
    request: Request,
    date: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=366),
    start_date: str | None = Query(default=None),
) -> dict:
    return cinema_detail(request.app.state.repository, target_date=date, days=days, start_date=start_date)


def _log_failed_import(repository, started_at: datetime, file_name: str, message: str) -> None:
    finished_at = datetime.now().astimezone()
    repository.save_sync_log(
        platform=PLATFORM,
        business_type=BUSINESS_TYPE,
        store_id=STORE_ID,
        status="failed",
        message=message,
        file_name=file_name,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=int((finished_at - started_at).total_seconds() * 1000),
        records_count=0,
    )


def _public_snapshot(snapshot: dict) -> dict:
    return {
        "date": snapshot["date"],
        "revenue": snapshot["revenue"],
        "box_office": snapshot["box_office"],
        "concession_revenue": snapshot["concession_revenue"],
        "customer_count": snapshot["customer_count"],
        "orders": snapshot["orders"],
        "usage_rate": snapshot["usage_rate"],
        "avg_order_value": snapshot["avg_order_value"],
    }


def _success_result(parsed: dict) -> dict:
    return {
        "status": "ok",
        "message": "凤凰云智 Excel 导入成功",
        "data_source": "excel",
        "file_name": parsed["file_name"],
        "report_type": parsed["report_type"],
        "report_note": parsed["report_note"],
        "missing_fields": parsed["missing_fields"],
        "snapshot": _public_snapshot(parsed["snapshot"]),
        "films": parsed["films"],
        "imported_dates": [snapshot["date"] for snapshot in parsed["snapshots"]],
    }


def _failed_result(file_name: str, message: str, report_type: str | None = None) -> dict:
    return {
        "status": "failed",
        "file_name": file_name,
        "report_type": report_type,
        "error": message,
        "message": message,
    }
