"""
影院利润/毛利 + 库存/损耗 API 路由。
POST /cinema/finance/import       上传财务报表（自动识别类型）
POST /cinema/finance/import-batch 批量上传多个财务报表
GET  /cinema/finance/profit       查询利润毛利概览
GET  /cinema/finance/inventory    查询库存+进销存概览
"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, UploadFile, File

from app.services.cinema_finance import (
    FinanceImportError,
    detect_finance_file_type,
    parse_finance_file,
    save_finance_import,
    get_profit_overview,
    get_inventory_overview,
)

router = APIRouter()


@router.post("/cinema/finance/import")
async def import_finance_excel(request: Request, file: UploadFile = File(...)) -> dict:
    """上传单个财务报表（自动识别利润/进销存/库存）"""
    repository = request.app.state.repository
    started_at = datetime.now().astimezone()
    file_name = file.filename or "unknown"

    try:
        file_bytes = await file.read()
        parsed = parse_finance_file(file_bytes, file_name)
        record_count = save_finance_import(repository, parsed)
        finished_at = datetime.now().astimezone()

        # 记录导入日志
        repository.save_sync_log(
            platform="fenghuang_finance",
            business_type="cinema",
            store_id="cinema_feicuicheng",
            status="success",
            message=f"财务报表导入成功（{parsed['file_type']}）",
            file_name=file_name,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=int((finished_at - started_at).total_seconds() * 1000),
            records_count=record_count,
        )

        return {
            "status": "ok",
            "message": f"财务报表导入成功",
            "file_name": file_name,
            "file_type": parsed["file_type"],
            "batch_id": parsed["batch_id"],
            "date_range": parsed.get("date_range", ""),
            "record_count": record_count,
        }
    except FinanceImportError as exc:
        _log_failed(repository, started_at, file_name, str(exc))
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        message = f"导入失败：{exc}"
        _log_failed(repository, started_at, file_name, message)
        raise HTTPException(status_code=400, detail=message) from exc


@router.post("/cinema/finance/import-batch")
async def import_finance_batch(request: Request, files: list[UploadFile] = File(...)) -> dict:
    """批量上传多个财务报表（自动识别每个文件类型）"""
    repository = request.app.state.repository
    success_results: list[dict] = []
    failed_results: list[dict] = []

    for upload in files:
        started_at = datetime.now().astimezone()
        file_name = upload.filename or "unknown"
        try:
            file_bytes = await upload.read()
            parsed = parse_finance_file(file_bytes, file_name)
            record_count = save_finance_import(repository, parsed)
            finished_at = datetime.now().astimezone()

            repository.save_sync_log(
                platform="fenghuang_finance",
                business_type="cinema",
                store_id="cinema_feicuicheng",
                status="success",
                message=f"财务报表导入成功（{parsed['file_type']}）",
                file_name=file_name,
                started_at=started_at,
                finished_at=finished_at,
                duration_ms=int((finished_at - started_at).total_seconds() * 1000),
                records_count=record_count,
            )

            success_results.append({
                "status": "ok",
                "file_name": file_name,
                "file_type": parsed["file_type"],
                "batch_id": parsed["batch_id"],
                "date_range": parsed.get("date_range", ""),
                "record_count": record_count,
            })
        except FinanceImportError as exc:
            _log_failed(repository, started_at, file_name, str(exc))
            failed_results.append({
                "status": "failed",
                "file_name": file_name,
                "error": str(exc),
                "message": str(exc),
            })
        except Exception as exc:
            message = f"导入失败：{exc}"
            _log_failed(repository, started_at, file_name, message)
            failed_results.append({
                "status": "failed",
                "file_name": file_name,
                "error": message,
                "message": message,
            })

    success_count = len(success_results)
    failed_count = len(failed_results)
    status = "ok" if failed_count == 0 else "partial" if success_count else "failed"

    payload = {
        "status": status,
        "message": f"批量导入完成：{success_count} 成功，{failed_count} 失败",
        "success_count": success_count,
        "failed_count": failed_count,
        "results": [*success_results, *failed_results],
    }
    if success_count == 0:
        raise HTTPException(status_code=400, detail=payload)
    return payload


@router.get("/cinema/finance/profit")
def get_profit_data(request: Request) -> dict:
    """查询利润毛利概览"""
    return get_profit_overview(request.app.state.repository)


@router.get("/cinema/finance/inventory")
def get_inventory_data(request: Request) -> dict:
    """查询库存+进销存概览"""
    return get_inventory_overview(request.app.state.repository)


def _log_failed(repository, started_at: datetime, file_name: str, message: str) -> None:
    finished_at = datetime.now().astimezone()
    repository.save_sync_log(
        platform="fenghuang_finance",
        business_type="cinema",
        store_id="cinema_feicuicheng",
        status="failed",
        message=message,
        file_name=file_name,
        started_at=started_at,
        finished_at=finished_at,
        duration_ms=int((finished_at - started_at).total_seconds() * 1000),
        records_count=0,
    )
