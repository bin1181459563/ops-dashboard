from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class LlmNotConfigured(RuntimeError):
    pass


class LlmCallError(RuntimeError):
    pass


def chat_completion(messages: list[dict[str, str]]) -> dict[str, str]:
    base_url = settings.ai_llm_base_url.strip()
    api_key = settings.ai_llm_api_key.strip()
    model = settings.ai_llm_model.strip()
    if not base_url or not api_key or not model:
        raise LlmNotConfigured("大模型接口还没有配置完整。")

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        with httpx.Client(timeout=settings.ai_llm_timeout_seconds) as client:
            response = client.post(_chat_completions_url(base_url), headers=headers, json=payload)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise LlmCallError(f"大模型接口返回异常：HTTP {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise LlmCallError(f"无法连接大模型接口：{exc}") from exc

    data = response.json()
    answer = _extract_answer(data)
    if not answer:
        raise LlmCallError("大模型接口没有返回可展示的回答。")
    return {"answer": answer, "model": model}


def _chat_completions_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    if normalized.endswith("/chat/completions"):
        return normalized
    return f"{normalized}/chat/completions"


def _extract_answer(data: dict[str, Any]) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    text = choices[0].get("text") if isinstance(choices[0], dict) else None
    return text.strip() if isinstance(text, str) else ""
