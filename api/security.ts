import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export const requireAdmin: RequestHandler = (req, res, next) => {
  const expected = process.env.ADMIN_TOKEN || process.env.AI_CONFIG_ADMIN_TOKEN || '';
  const supplied = req.header('X-Admin-Token') || req.header('X-AI-Admin-Token') || '';
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({ success: false, error: { code: 'ADMIN_REQUIRED', message: '此操作仅限管理员' } });
    return;
  }
  next();
};

export function requestLimit(limit: number) {
  return rateLimit({
    windowMs: 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    // By default forwarding headers are intentionally ignored. A trusted local
    // reverse proxy may be enabled explicitly, and must overwrite these headers.
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后再试' } });
    },
  });
}

export const validateQuery: RequestHandler = (req, res, next) => {
  if (Object.keys(req.query).length > 12 || Object.values(req.query).some((value) => typeof value !== 'string' || value.length > 500)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: '查询条件过长或格式不正确' } });
    return;
  }
  next();
};

// Apply to all public JSON, including pre-compressed cached responses. Paths are
// operational metadata, never report content. Keep the internal index intact.
const privateFields = new Set(['sourceDir', 'filePath', 'strategyDir', 'stdout', 'stderr', 'apiKeyMask', 'baseUrl', 'timeoutMs', 'dailyTokenBudget', 'maxConcurrency', 'canPersist', 'adminProtected', 'providerPresets', 'overriddenFields', 'profiles', 'activeProfileId', 'usage']);
export function publicJsonReplacer(key: string, value: unknown): unknown {
  return privateFields.has(key) ? undefined : value;
}

export function publicData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, publicJsonReplacer)) as T;
}
