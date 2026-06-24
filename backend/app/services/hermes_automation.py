from __future__ import annotations

import re
import subprocess
from datetime import datetime
from typing import Any

from app.core.config import settings


def build_automation_prompt(task_type: str, title: str, venue: str, custom_prompt: str | None = None) -> str:
    if custom_prompt:
        return custom_prompt.strip()
    return "\n".join(
        [
            "你是翡翠城 AI 管理系统的 Hermes 自动化任务助手。",
            "请根据任务目标执行可完成的后台动作；如果需要登录、外部权限或人工确认，请清楚说明卡点。",
            "执行过程中不要编造结果；完成后用中文给出简短执行摘要、产出文件或下一步建议。",
            "",
            f"任务类型：{task_type}",
            f"任务标题：{title}",
            f"场馆范围：{venue}",
            "",
            "优先使用本机已有脚本和工作区：/Users/Zhuanz/.hermes/workspace，以及当前项目：/Users/Zhuanz/Desktop/codex/ops-dashboard。",
        ]
    )


def execute_automation_task(repository, task_id: int) -> None:
    task = repository.automation_task_by_id(task_id)
    if not task:
        return
    started = datetime.now().astimezone()
    repository.update_automation_task(task_id, status="running", started_at=started)
    try:
        output = run_hermes_prompt(task["prompt"])
        finished = datetime.now().astimezone()
        repository.update_automation_task(
            task_id,
            status=output["status"],
            result=output.get("result"),
            error=output.get("error"),
            hermes_session_id=output.get("session_id"),
            finished_at=finished,
            duration_ms=int((finished - started).total_seconds() * 1000),
        )
    except Exception as exc:
        finished = datetime.now().astimezone()
        repository.update_automation_task(
            task_id,
            status="failed",
            error=str(exc),
            finished_at=finished,
            duration_ms=int((finished - started).total_seconds() * 1000),
        )


def run_hermes_prompt(prompt: str) -> dict[str, Any]:
    command = [
        settings.hermes_command,
        "--oneshot",
        prompt,
        "--model",
        settings.hermes_model,
        "--accept-hooks",
    ]
    completed = subprocess.run(
        command,
        cwd="/Users/Zhuanz/Desktop/codex/ops-dashboard",
        capture_output=True,
        text=True,
        timeout=settings.hermes_timeout_seconds,
        check=False,
    )
    output = (completed.stdout or "").strip()
    error = (completed.stderr or "").strip()
    session_id = _extract_session_id(output) or _extract_session_id(error)
    if completed.returncode != 0:
        return {
            "status": "failed",
            "result": output[-4000:] if output else None,
            "error": error[-4000:] or f"Hermes 退出码：{completed.returncode}",
            "session_id": session_id,
        }
    return {
        "status": "success",
        "result": output[-8000:] if output else "Hermes 已执行完成，但没有返回文本。",
        "session_id": session_id,
    }


def _extract_session_id(text: str) -> str | None:
    match = re.search(r"session[_ -]?id[:=]\s*([A-Za-z0-9_.-]+)", text, re.IGNORECASE)
    return match.group(1) if match else None
