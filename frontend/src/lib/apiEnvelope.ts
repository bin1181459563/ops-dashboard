type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function hasData(value: unknown): value is UnknownRecord & { data: unknown } {
  return isRecord(value) && "data" in value;
}

function isEnvelopeLike(value: unknown): value is UnknownRecord & { data: unknown } {
  if (!hasData(value)) return false;
  if ("success" in value) return Boolean((value as { success?: unknown }).success);
  if ("code" in value) return (value as { code?: unknown }).code === 0;
  return true;
}

export function unwrapApiData<T>(response: unknown, fallback: T): T {
  if (Array.isArray(response) || isRecord(response)) {
    if (Array.isArray(response)) return response as T;
    if (isEnvelopeLike(response)) return (response as { data: T }).data;
    return response as T;
  }
  return fallback;
}

export function unwrapApiDataOr<T>(response: unknown, fallback?: T): T | unknown {
  if (arguments.length === 1) {
    if (Array.isArray(response)) return response;
    if (isRecord(response)) {
      if (isEnvelopeLike(response)) return (response as { data: unknown }).data;
      return response;
    }
    return response;
  }
  return unwrapApiData(response, fallback as T);
}

export function isApiRecord(value: unknown): value is UnknownRecord {
  return isRecord(value);
}

export function unwrapApiArray<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (isEnvelopeLike(response) && Array.isArray((response as { data?: unknown }).data)) {
    return (response as { data: T[] }).data;
  }
  if (isRecord(response) && Array.isArray((response as { items?: unknown }).items)) {
    return (response as { items: T[] }).items;
  }
  return [];
}

export function unwrapApiObject<T extends object>(response: unknown, fallback: T): T {
  if (isRecord(response) && !Array.isArray(response)) {
    if (isEnvelopeLike(response) && isRecord((response as { data?: unknown }).data)) {
      return (response as { data: T }).data;
    }
    return response as T;
  }
  return fallback;
}

export function getApiErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return normalizeMessage(error);
  if (error instanceof Error && error.message) return normalizeMessage(error.message);
  if (isRecord(error)) {
    const directMessage = error.message;
    if (typeof directMessage === "string" && directMessage.trim()) return normalizeMessage(directMessage);
    const detail = error.detail;
    if (typeof detail === "string" && detail.trim()) return normalizeMessage(detail);
    if (isRecord(detail) && typeof detail.message === "string" && detail.message.trim()) return normalizeMessage(detail.message);
  }
  return "加载失败，请稍后重试。";
}

function normalizeMessage(message: string): string {
  const trimmed = message.trim();
  if (/timeout|timed out|exceeded/i.test(trimmed)) return "接口响应较慢，请稍后重试。";
  if (/network error/i.test(trimmed)) return "无法连接后端服务，请确认服务已启动。";
  if (/request failed with status code 5\d\d/i.test(trimmed)) return "后端服务暂时不可用，请稍后重试。";
  return trimmed;
}
