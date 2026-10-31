import { Router, type Request, type RequestHandler, type Response } from 'express';
import { aiConfigStore, type AiConfigInput } from '../services/aiConfig.js';
import { aiService } from '../services/aiService.js';
import { requireAdmin } from '../security.js';
import { configError } from '../services/aiConfigErrors.js';

const router = Router();

router.get('/config', requireAdmin, asyncRoute(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // Only authenticated administrators receive editable settings. This DTO
  // contains a masked key, never the resolved credential or encrypted payload.
  res.type('json').send(JSON.stringify({ success: true, data: await aiConfigStore.getPublic() }));
}, true));

router.get('/status', asyncRoute(async (_req, res) => {
  res.json({ success: true, data: await aiService.status() });
}));

router.put('/config', requireAdmin, asyncRoute(async (req, res) => {
  await aiConfigStore.save(req.body as AiConfigInput, adminToken(req), req.body.activate !== false);
  res.setHeader('Cache-Control', 'no-store');
  res.type('json').send(JSON.stringify({ success: true, data: await aiConfigStore.getPublic() }));
}, true));

router.post('/active-profile', requireAdmin, asyncRoute(async (req, res) => {
  if (typeof req.body.profileId !== 'string') throw new Error('AI_PROFILE_NOT_FOUND');
  await aiConfigStore.activate(req.body.profileId, adminToken(req));
  res.setHeader('Cache-Control', 'no-store');
  res.type('json').send(JSON.stringify({ success: true, data: await aiConfigStore.getPublic() }));
}, true));

router.post('/config/test', requireAdmin, asyncRoute(async (req, res) => {
  const config = await aiConfigStore.preview(req.body as AiConfigInput, adminToken(req));
  await aiService.provider.test(config);
  res.json({ success: true, data: { ok: true } });
}, true));

router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    const prepared = await aiService.prepareChat({
      question: String(req.body.question ?? ''),
      scope: typeof req.body.scope === 'object' && req.body.scope ? req.body.scope : {},
      history: req.body.history,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      signal: controller.signal,
    });
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sendEvent(res, 'sources', { sources: prepared.sources, cached: prepared.cached });
    for await (const delta of prepared.stream) sendEvent(res, 'delta', { text: delta });
    sendEvent(res, 'done', {});
    res.end();
  } catch (error) {
    const details = aiError(error);
    if (!res.headersSent) {
      res.status(details.status).json({ success: false, error: { code: details.code, message: details.message } });
    } else {
      sendEvent(res, 'error', { code: details.code, message: details.message });
      res.end();
    }
  }
});

function sendEvent(res: Response, event: string, value: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
}

function adminToken(req: Request) {
  return String(req.header('X-Admin-Token') || req.header('X-AI-Admin-Token') || '');
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>, admin = false): RequestHandler {
  return (req, res) => {
    void handler(req, res).catch((error) => {
      const details = admin ? configError(error) : aiError(error);
      res.setHeader('Cache-Control', 'no-store');
      res.status(details.status).json({ success: false, error: { code: details.code, message: details.message } });
    });
  };
}

export function aiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const [code, ...parts] = raw.split(':');
  if (code === 'AI_PROVIDER_ERROR') {
    const status = Number(parts[0]);
    if (/unsupported model|model.*(?:not found|not supported)|unknown model/i.test(parts.slice(1).join(':'))) return {status:502,code:'AI_MODEL_UNAVAILABLE',message:'当前模型已下线或接口不支持，请在研究助手 AI 配置中选择可用模型'};
    if (status === 401 || status === 403) return {status:502,code:'AI_KEY_INVALID',message:'模型服务密钥验证失败，请联系管理员检查该配置的 Key'};
    if (status === 402) return {status:502,code:'AI_PROVIDER_PAYMENT_REQUIRED',message:'模型服务商返回额度或付费限制，请在服务商账户检查 Key 的可用额度'};
    if (status === 429) return {status:429,code:'AI_PROVIDER_RATE_LIMIT',message:'模型服务商暂时限流，请稍后重试'};
    return {status:502,code:'AI_PROVIDER_UNAVAILABLE',message:'模型服务商暂时不可用，请稍后重试或在 AI 配置中切换模型'};
  }
  const known = ['AI_NOT_CONFIGURED', 'AI_RATE_LIMIT', 'AI_BUSY', 'AI_DAILY_BUDGET', 'AI_NO_EVIDENCE', 'QUESTION_REQUIRED', 'QUESTION_TOO_LONG', 'QUESTION_INVALID', 'AI_INCOMPLETE_COMPLETION', 'AI_STREAM_INTERRUPTED', 'AI_EMPTY_COMPLETION', 'AI_RESPONSE_BLOCKED'].includes(code);
  const message = known ? parts.join(':') : '研究助手暂时不可用，请稍后重试';
  const status = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'AI_RATE_LIMIT' ? 429 : code === 'AI_BUSY' ? 429 : code === 'AI_DAILY_BUDGET' ? 429 : 400;
  return { code: known ? code : 'AI_REQUEST_FAILED', message: message || '研究助手请求失败', status };
}

export default router;
