from pathlib import Path

from mitmproxy import http


TOKEN_FILE = Path.home() / ".hermes" / "workspace" / "xiaotie-token.txt"
TARGET_HOST = "table-api.xironiot.com"


def request(flow: http.HTTPFlow) -> None:
    if flow.request.pretty_host != TARGET_HOST:
        return

    authorization = flow.request.headers.get("Authorization", "").strip()
    if not authorization:
        return

    if not authorization.startswith("Motern "):
        print("[xiaotie] 捕获到 Authorization，但不是 Motern token，已忽略")
        return

    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    old_token = TOKEN_FILE.read_text(encoding="utf-8").strip() if TOKEN_FILE.exists() else ""
    TOKEN_FILE.write_text(authorization, encoding="utf-8")

    changed = "已更新" if authorization != old_token else "与现有 token 相同"
    print(f"[xiaotie] {changed}: 写入 {TOKEN_FILE}，长度 {len(authorization)}")
    print(f"[xiaotie] 请求: {flow.request.method} {flow.request.path}")
