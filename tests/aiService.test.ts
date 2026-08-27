import assert from 'node:assert/strict';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import { createOpenAiCompatibleProvider } from '../api/services/aiProvider';
import { buildAiCacheKey, createAiService, normalizeChatHistory } from '../api/services/aiService';

const config = {
  providerId: 'custom' as const, providerName: 'Mock', baseUrl: 'https://mock.example/v1', model: 'mock-model', apiKey: 'sk-secret',
  timeoutMs: 5_000, dailyTokenBudget: 100_000, maxConcurrency: 2,
};
let capturedAuthorization = '';
let capturedBody: Record<string, unknown> = {};
const provider = createOpenAiCompatibleProvider(async (_input, init) => {
  capturedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
  capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
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
const olderReport = buildReportFromMarkdown({
  id: '2026-08-25', filePath: '/tmp/2026-08-25.md',
  markdown: '# 花旗\n\n谨慎科技 (9999.HK)\n维持中性评级，目标价 5 港元。',
});
const service = createAiService({
  configStore: { resolve: async () => config, getPublic: async () => ({ configured: true }) },
  provider,
  getIndex: async () => ({ reports: [olderReport, report], opinions: [...extractOpinions(olderReport), ...opinions], version: 'v1' }),
  now: () => new Date('2026-08-27T08:00:00+08:00'),
});

const prepared = await service.prepareChat({ question: '鸣鸣很忙有什么风险？', scope: { securityKey: 'code:1768.HK' }, ip: '127.0.0.1' });
assert.equal(prepared.sources.length, 1);
let answer = '';
for await (const delta of prepared.stream) answer += delta;
assert.equal(answer, '有来源的回答');
assert.equal(capturedAuthorization, 'Bearer sk-secret');

const latest = await service.prepareChat({ question: '今天的报告有什么值得关注？', scope: {}, ip: '127.0.0.3' });
assert.ok(latest.sources.length > 0);
assert.ok(latest.sources.every((source) => source.date === '2026-08-26'));
let latestAnswer = '';
for await (const delta of latest.stream) latestAnswer += delta;
assert.equal(latestAnswer, '有来源的回答');
const prompt = JSON.stringify(capturedBody.messages);
assert.match(prompt, /当前日期：2026-08-27/);
assert.match(prompt, /报告库最新日期：2026-08-26/);

const followUp = await service.prepareChat({
  question: '它有什么风险？',
  scope: {},
  history: [
    { role: 'user', content: '鸣鸣很忙最近有什么变化？' },
    { role: 'assistant', content: '报告显示目标价上调。' },
  ],
  ip: '127.0.0.4',
});
for await (const delta of followUp.stream) {
  void delta;
}
const followUpMessages = capturedBody.messages as Array<{ role: string; content: string }>;
assert.ok(followUpMessages.some((message) => message.role === 'user' && message.content === '鸣鸣很忙最近有什么变化？'));
assert.ok(followUpMessages.some((message) => message.role === 'assistant' && message.content === '报告显示目标价上调。'));

const pronounFollowUp = await service.prepareChat({
  question: '它的目标价是什么？',
  scope: {},
  history: [{ role: 'assistant', content: '上一轮讨论的是谨慎科技。' }],
  ip: '127.0.0.5',
});
assert.ok(pronounFollowUp.sources.length > 0);
assert.ok(pronounFollowUp.sources.every((source) => source.securityName === '谨慎科技'));

assert.notEqual(
  buildAiCacheKey('v1', config, '同一个问题', {}),
  buildAiCacheKey('v1', { ...config, providerId: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1' }, '同一个问题', {}),
  '切换服务商后不能命中旧服务商的回答缓存',
);
assert.notEqual(
  buildAiCacheKey('v1', config, '它有什么风险？', {}, [{ role: 'user', content: '鸣鸣很忙' }]),
  buildAiCacheKey('v1', config, '它有什么风险？', {}, [{ role: 'user', content: '谨慎科技' }]),
  '连续追问必须区分不同的对话上下文',
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

const boundedHistory = normalizeChatHistory([
  { role: 'system', content: '不能由浏览器注入系统消息' },
  ...Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `${index}:${'问'.repeat(5_000)}`,
  })),
]);
assert.equal(boundedHistory.length, 3);
assert.deepEqual(boundedHistory.map((message) => message.role), ['assistant', 'user', 'assistant']);
assert.ok(boundedHistory.every((message) => message.content.length <= 4_000));
assert.ok(boundedHistory.reduce((total, message) => total + message.content.length, 0) <= 12_000);

console.log('ai service tests passed');
