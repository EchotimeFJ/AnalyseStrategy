import type { ApiResponse } from '@/types';
import { APP_BASE_PATH } from '@/lib/appPaths';

export function resolveApiPath(path: string, basePath = getDefaultBasePath()): string {
  if (/^(?:[a-z]+:)?\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const normalizedBasePath = normalizeBasePath(basePath);

  if (!normalizedBasePath || normalizedPath === normalizedBasePath || normalizedPath.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPath;
  }

  return `${normalizedBasePath}${normalizedPath}`;
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export async function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export async function apiPut<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiPath(path), init);
  const text = await response.text();
  let payload: ApiResponse<T> | null = null;
  try {
    payload = text ? JSON.parse(text) as ApiResponse<T> : null;
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    throw new Error(getApiErrorMessage(payload, response.status));
  }
  return payload.data;
}

export function getApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return `服务返回异常（${status}）`;
}

export function queryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function getDefaultBasePath() {
  if (import.meta.env?.DEV) {
    return '/';
  }

  return import.meta.env?.BASE_URL ?? APP_BASE_PATH;
}

function normalizeBasePath(basePath: string) {
  if (!basePath || basePath === '/') {
    return '';
  }

  let normalized = basePath.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}
