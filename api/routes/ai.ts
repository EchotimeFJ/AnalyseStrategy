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
  await aiConfigStore.save(req.body as AiConfigInput, adminToken(req));
  res.json({ success: true, data: await aiService.status() });
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

function aiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const [code, ...parts] = raw.split(':');
  const known = ['AI_NOT_CONFIGURED', 'AI_RATE_LIMIT', 'AI_BUSY', 'AI_DAILY_BUDGET', 'AI_NO_EVIDENCE', 'QUESTION_REQUIRED', 'QUESTION_TOO_LONG', 'QUESTION_INVALID'].includes(code);
  const message = known ? parts.join(':') : '研究助手暂时不可用，请稍后重试';
  const status = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'AI_RATE_LIMIT' ? 429 : code === 'AI_BUSY' ? 429 : code === 'AI_DAILY_BUDGET' ? 429 : 400;
  return { code: known ? code : 'AI_REQUEST_FAILED', message: message || '研究助手请求失败', status };
}

export default router;
