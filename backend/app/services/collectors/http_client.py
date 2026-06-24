from __future__ import annotations

import ssl
from typing import Any

import httpx

DEFAULT_TIMEOUT_SECONDS = 15
DEFAULT_ATTEMPTS = 2


def get_json_with_retry(
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    verify: ssl.SSLContext | bool | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    attempts: int = DEFAULT_ATTEMPTS,
) -> dict[str, Any]:
    last_error: Exception | None = None
    retry_count = 0
    for attempt in range(attempts):
        try:
            with httpx.Client(timeout=timeout_seconds, verify=verify) as client:
                response = client.get(url, headers=headers, params=params)
                response.raise_for_status()
                get_json_with_retry.last_meta = {"retried": retry_count > 0, "retry_count": retry_count}
                return response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401 or attempt >= attempts - 1:
                get_json_with_retry.last_meta = {"retried": retry_count > 0, "retry_count": retry_count}
                raise
            last_error = exc
            retry_count += 1
        except (httpx.TimeoutException, httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError, OSError) as exc:
            if attempt >= attempts - 1:
                get_json_with_retry.last_meta = {"retried": retry_count > 0, "retry_count": retry_count}
                raise
            last_error = exc
            retry_count += 1

    if last_error is not None:
        raise last_error
    raise RuntimeError("get_json_with_retry failed without exception")


get_json_with_retry.last_meta = {"retried": False, "retry_count": 0}
