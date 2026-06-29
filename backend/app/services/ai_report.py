from datetime import datetime
from typing import Any

from app.core.config import settings
from app.services.llm_client import LlmCallError, LlmNotConfigured, chat_completion


def generate_daily_report(repository) -> dict[str, Any]:
    overview_rows = repository.latest_daily_snapshots(date=datetime.now().date().isoformat())
    if not overview_rows:
        overview_rows = repository.latest_daily_snapshots(limit=10)
    latest_alerts = repository.latest_alerts(10, today_only=True)
    source_status = _source_status_from_logs(repository)

    revenue = sum(
        row.get("revenue", 0)
        for row in overview_rows
        if row.get("platform") in {"wu_laoban", "xiaotie", "fenghuang", "cinema"}
    )
    orders = sum(
        row.get("orders", 0)
        for row in overview_rows
        if row.get("platform") in {"wu_laoban", "xiaotie", "fenghuang", "cinema"}
    )
    mahjong = next((row for row in overview_rows if row.get("platform") == "wu_laoban"), None)
    xiaotie = next((row for row in overview_rows if row.get("platform") == "xiaotie"), None)
    cinema = next((row for row in overview_rows if row.get("platform") in {"fenghuang", "cinema"}), None)
    xiaotie_status = source_status["xiaotie"]
    cinema_status = _cinema_status(repository, cinema)
    report = "\n".join(
        [
            "AI 经营日报",
            "",
            "一、今日总览",
            f"已接入业务总收入：¥{revenue:.0f}",
            f"总订单数：{orders}",
            f"当前接入状态：棋牌 {source_status['wu_laoban']['status_text']}；台球 {xiaotie_status['status_text']}；影院 {cinema_status['status_text']}。",
            "",
            "二、各业务线表现",
            _mahjong_line(mahjong),
            _xiaotie_line(xiaotie, xiaotie_status),
            _cinema_line(cinema, cinema_status),
            "",
            "三、数据源状态",
            f"棋牌：{source_status['wu_laoban']['message']}",
            f"台球：{xiaotie_status['message']}",
            f"影院：{cinema_status['message']}",
            "",
            "四、异常提醒",
            _alert_lines(latest_alerts, xiaotie_status),
            "",
            "五、明日建议",
            _first_suggestion(xiaotie_status, cinema_status),
            "2. 继续观察棋牌经营数据，重点看收入和包间利用率变化。",
            "3. 结合影院票房、人次和卖品占比，优化高峰时段排片与会员运营。",
        ]
    )
    return {"report": report, "source": "rule_template", "snapshots_count": len(overview_rows)}


def answer_ai_question(repository, question: str) -> dict[str, Any]:
    normalized_question = question.strip()
    if not normalized_question:
        return {"answer": "你可以直接问我今天收入、业务贡献、影院卖品、异常任务这些问题。", "source": "empty", "model": settings.ai_llm_model}

    report = generate_daily_report(repository)["report"]
    messages = [
        {
            "role": "system",
            "content": (
                "你是翡翠城 AI 经营管理系统里的老板助手。"
                "只能基于系统给出的经营数据回答，不要编造没有出现的收入、订单、人次或比例。"
                "回答要用中文，先给结论，再给依据和建议；尽量简洁。"
            ),
        },
        {
            "role": "user",
            "content": f"经营数据上下文：\n{report}\n\n老板的问题：{normalized_question}",
        },
    ]
    try:
        result = chat_completion(messages)
        return {
            "answer": result["answer"],
            "source": "llm",
            "model": result["model"],
        }
    except LlmNotConfigured:
        return {
            "answer": "大模型接口还没有配置完整。请先在后端环境变量里配置模型地址、模型名和 API Key。",
            "source": "not_configured",
            "model": settings.ai_llm_model,
        }
    except LlmCallError as exc:
        return {
            "answer": f"大模型暂时没有正常返回，我先给你规则版判断：\n\n{_compact_rule_answer(report)}",
            "source": "fallback",
            "model": settings.ai_llm_model,
            "error": str(exc),
        }


def _source_status_from_logs(repository) -> dict[str, dict[str, str]]:
    wu_log = repository.latest_sync_log_for_platform("wu_laoban")
    xiaotie_log = repository.latest_sync_log_for_platform("xiaotie")
    return {
        "wu_laoban": _status_text(wu_log, "棋牌暂无同步日志"),
        "xiaotie": _status_text(xiaotie_log, "小铁 token 已失效，请重新抓取 token 后更新。"),
    }


def _status_text(log: dict | None, fallback: str) -> dict[str, str]:
    if not log:
        return {"status_text": "暂无数据", "message": fallback}
    if log.get("status") == "success":
        return {"status_text": "正常", "message": "正常"}
    if log.get("status") == "token_invalid":
        return {"status_text": "token 失效", "message": log.get("message") or "小铁 token 已失效，请重新抓取 token 后更新。"}
    return {"status_text": "同步失败", "message": log.get("message") or fallback}


def _cinema_status(repository, snapshot: dict | None) -> dict[str, str]:
    latest_log = repository.latest_sync_log_for_platform("fenghuang")
    if snapshot:
        return {"status_text": "正常", "message": "已从数据库读取凤凰云智经营数据"}
    if latest_log and latest_log.get("status") == "failed":
        return {"status_text": "同步失败", "message": latest_log.get("message") or "最近同步失败"}
    return {"status_text": "暂无数据", "message": "暂无影院数据库快照，当前不计入影院经营判断"}


def _mahjong_line(snapshot: dict | None) -> str:
    if not snapshot:
        return "棋牌：暂无可用快照，日报不编造收入、订单或包间利用率。"
    return (
        f"棋牌：收入 ¥{snapshot.get('revenue', 0):.0f}，订单 {snapshot.get('orders', 0)}，"
        f"包间利用率 {snapshot.get('usage_rate', 0) * 100:.0f}%，状态正常。"
    )


def _xiaotie_line(snapshot: dict | None, status: dict[str, str]) -> str:
    if not snapshot:
        return f"台球：{status['message']}，暂不分析经营表现。"
    return (
        f"台球：收入 ¥{snapshot.get('revenue', 0):.0f}，订单 {snapshot.get('orders', 0)}，"
        f"球桌利用率 {snapshot.get('usage_rate', 0) * 100:.0f}%，状态{status['status_text']}。"
    )


def _cinema_line(snapshot: dict | None, status: dict[str, str]) -> str:
    if not snapshot:
        return f"影院：{status['message']}。"
    return (
        f"影院：收入 ¥{snapshot.get('revenue', 0):.0f}，场次 {snapshot.get('orders', 0)}，"
        f"观影人次 {snapshot.get('customer_count', 0)}，上座率 {snapshot.get('usage_rate', 0) * 100:.0f}%。"
    )


def _first_suggestion(xiaotie_status: dict[str, str], cinema_status: dict[str, str]) -> str:
    if "token" in xiaotie_status["status_text"]:
        return "1. 优先恢复小铁 token，避免台球业务继续缺失。"
    if cinema_status["status_text"] != "正常":
        return "1. 优先检查凤凰云智同步和数据库快照，避免总收入和 AI 判断缺口。"
    return "1. 优先处理 AI 任务中心里的高优先级异常，保证数据源和经营动作闭环。"


def _alert_lines(alerts: list[dict], xiaotie_status: dict[str, str]) -> str:
    lines = []
    if "token" in xiaotie_status["status_text"]:
        lines.append("小铁 token 失效，需要重新抓取。")
    for alert in alerts:
        lines.append(f"{alert.get('level', 'warning')}：{alert.get('message')}")
    return "\n".join(lines) if lines else "暂无重大异常；继续观察收入、同步和使用率。"


def _compact_rule_answer(report: str) -> str:
    lines = [line for line in report.splitlines() if line.strip()]
    return "\n".join(lines[:8])
