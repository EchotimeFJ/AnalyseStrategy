import assert from 'node:assert/strict';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import { createOpenAiCompatibleProvider } from '../api/services/aiProvider';
import { buildAiCacheKey, createAiService } from '../api/services/aiService';

const config = {
  providerId: 'custom' as const, providerName: 'Mock', baseUrl: 'https://mock.example/v1', model: 'mock-model', apiKey: 'sk-secret',
  timeoutMs: 5_000, dailyTokenBudget: 100_000, maxConcurrency: 2,
};
let capturedAuthorization = '';
const provider = createOpenAiCompatibleProvider(async (_input, init) => {
  capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
  return new Response(
    'data: {"choices":[{"delta":{"content":"有来源"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"的回答"}}]}\n\n' +
    'data: [DONE]\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
});

const report = buildReportFromMarkdown({
  id: '2026-08-26', filePath: '/tmp/2026-08-26.md',
  markdown: '# 中金\n\n鸣鸣很忙 (1768.HK)\n维持买入评级，目标价 8.20 港元。\n风险：同店销售放缓。',
});
const opinions = extractOpinions(report);
const service = createAiService({
  configStore: { resolve: async () => config, getPublic: async () => ({ configured: true }) },
  provider,
  getIndex: async () => ({ reports: [report], opinions, version: 'v1' }),
});

const prepared = await service.prepareChat({ question: '鸣鸣很忙有什么风险？', scope: { securityKey: 'code:1768.HK' }, ip: '127.0.0.1' });
assert.equal(prepared.sources.length, 1);
let answer = '';
for await (const delta of prepared.stream) answer += delta;
assert.equal(answer, '有来源的回答');
assert.equal(capturedAuthorization, 'Bearer sk-secret');

assert.notEqual(
  buildAiCacheKey('v1', config, '同一个问题', {}),
  buildAiCacheKey('v1', { ...config, providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }, '同一个问题', {}),
  '切换服务商后不能命中旧服务商的回答缓存',
);

const unconfigured = createAiService({
  configStore: { resolve: async () => null, getPublic: async () => ({ configured: false }) },
  provider,
  getIndex: async () => ({ reports: [report], opinions, version: 'v1' }),
});
await assert.rejects(
  unconfigured.prepareChat({ question: '问题', scope: {}, ip: '127.0.0.1' }),
  /AI_NOT_CONFIGURED/,
);
await assert.rejects(
  service.prepareChat({ question: '问'.repeat(2001), scope: {}, ip: '127.0.0.2' }),
  /QUESTION_TOO_LONG/,
);

console.log('ai service tests passed');
