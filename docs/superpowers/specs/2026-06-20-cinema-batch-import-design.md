# 影院批量导入设计规格

## 目标

完成 `PROJECT_HANDOVER.md` 里的 TASK 2：影院上传面板支持一次选择多个凤凰云智 Excel/CSV 报表，并由系统自动按正确顺序导入。

## 范围

本规格只处理“影院批量导入”。

包含：
- 新增后端接口 `POST /api/cinema/import-batch`。
- 复用现有影院报表解析和快照合并逻辑。
- 根据报表类型自动排序后再保存。
- 返回每个文件的成功或失败结果。
- 前端影院上传面板支持多文件选择，并调用批量接口。
- 导入完成后自动刷新影院数据。

不包含：
- 影院 ECharts 趋势图升级。
- 凤凰云智自动采集。
- 小铁 token 续期。
- 会员消费详情前端恢复。

## 当前上下文

现在的单文件导入流程是：

1. `frontend/src/pages/dashboard/cinema.tsx` 只能选择一个文件。
2. `frontend/src/lib/dashboardApi.ts#importCinemaExcel()` 调用 `/api/cinema/import-excel`。
3. `backend/app/api/routes/cinema.py#import_cinema_excel()` 读取一个 `UploadFile`。
4. `backend/app/services/cinema_excel.py#parse_cinema_file()` 识别报表类型。
5. `backend/app/services/cinema_excel.py#save_cinema_import()` 保存快照，并和同一天已有数据合并。

必须保留的现有行为：
- 影片排名表不能覆盖营运综合报表里的票房、人次、场次等核心汇总。
- 卖品明细和会员明细要合并进同一天影院快照。
- 重复导入同一张卖品或会员报表时，不能把明细重复累加。
- 原来的单文件导入接口继续保留，避免影响已有用法。

## 后端设计

在 `backend/app/api/routes/cinema.py` 新增 `POST /api/cinema/import-batch`。

请求格式：
- 使用 multipart form。
- 字段名为 `files`。
- 支持一个或多个文件。
- 支持格式与现有单文件接口一致：`.xlsx`、`.xls`、`.csv`。

处理流程：

1. 读取每个上传文件的内容。
2. 用现有 `parse_cinema_file(file_bytes, file_name)` 解析每个文件。
3. 解析成功的文件按报表类型排序：
   - `operations`：10，营运综合报表
   - `film_ranking`：20，影片成绩排名表
   - `concession_detail`：30，卖品销售明细
   - `member_detail`：40，会员卡明细
   - `generic`：90，通用报表
4. 按排序后的顺序逐个调用 `save_cinema_import(repository, parsed)`。
5. 每个文件都写一条同步日志，保持和现有单文件导入一致。
6. 某个文件解析或保存失败时，只记录该文件失败，继续处理其他文件。

成功响应示例：

```json
{
  "status": "ok",
  "message": "批量导入完成：4 成功，0 失败",
  "data_source": "excel",
  "success_count": 4,
  "failed_count": 0,
  "results": [
    {
      "status": "ok",
      "file_name": "影院营运综合报表2026-06-01至2026-06-20.csv",
      "report_type": "operations",
      "report_note": "营运综合报表用于写入每日票房、人次、场次、卖品等核心经营数据。",
      "missing_fields": [],
      "imported_dates": ["2026-06-20"],
      "snapshot": {
        "date": "2026-06-20",
        "revenue": 1966.1,
        "box_office": 1910,
        "concession_revenue": 56.1,
        "customer_count": 63,
        "orders": 45,
        "usage_rate": 0.0196,
        "avg_order_value": 31.21
      }
    }
  ]
}
```

如果全部文件都失败，返回 HTTP 400：

```json
{
  "detail": {
    "status": "failed",
    "message": "批量导入失败：0 成功，N 失败",
    "data_source": "excel",
    "success_count": 0,
    "failed_count": N,
    "results": []
  }
}
```

这样前端可以区分“部分成功”和“全部失败”：一个坏文件不会导致整批文件都被视为失败。

## 前端设计

修改 `frontend/src/lib/dashboardApi.ts`：
- 新增 `CinemaBatchImportResult` 类型。
- 新增 `importCinemaBatch(files: File[]): Promise<CinemaBatchImportResult>`。
- 保留现有 `importCinemaExcel(file)`，继续支持单文件接口。

修改 `frontend/src/pages/dashboard/cinema.tsx`：
- 上传输入框增加 `multiple`。
- `handleFile` 收集所有选中文件。
- 不管选择一个还是多个文件，都调用新的批量接口，让界面只处理一种返回结构。
- 导入后显示批量结果摘要：
  - 成功数量和失败数量。
  - 实际处理顺序下的成功文件列表。
  - 失败文件列表和错误原因。
- 缺失字段提示继续保留，但改为从所有成功结果中汇总。
- 无论完全成功、部分成功还是失败，都在请求结束后刷新影院概览、详情和卖品数据。

## 错误处理

后端：
- 不支持的文件格式、无法识别表头、缺少日期、解析异常，都作为单个文件失败处理。
- 单个文件失败不阻断其他文件导入。
- 全部失败时返回 HTTP 400。
- 部分成功时返回 HTTP 200，并设置 `status: "partial"`。

前端：
- HTTP 200 且 `status: "partial"` 时显示为警告，不当作致命错误。
- HTTP 400 全部失败时显示在现有错误提示条里。
- 每次导入结束后都清空文件选择框。

## 测试计划

后端测试：
- 乱序上传四类报表，确认返回顺序是：营运综合、影片排名、卖品明细、会员明细。
- 批量导入时，影片排名表不会覆盖营运综合报表里的核心汇总。
- 某个文件失败时，其他有效文件仍然成功导入，并返回每个文件的结果。
- 全部失败时返回 HTTP 400，并写入失败日志。

前端验证：
- 文件选择器可以一次选择多个文件。
- 上传面板能显示批量导入摘要。
- 导入完成后影院数据会自动刷新。

## 验收标准

- 用户可以一次选择四张凤凰云智报表。
- 后端能忽略用户选择顺序，按正确顺序处理。
- 混合导入后，影院每日快照仍然正确。
- 用户能看清哪些文件成功、哪些文件失败。
- 原有单文件导入能力不受影响。
