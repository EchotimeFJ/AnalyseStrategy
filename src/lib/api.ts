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

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(resolveApiPath(path));
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `请求失败: ${path}`);
  }
  return payload.data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `请求失败: ${path}`);
  }
  return payload.data;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(resolveApiPath(path), { method: 'DELETE' });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `请求失败: ${path}`);
  }
  return payload.data;
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
