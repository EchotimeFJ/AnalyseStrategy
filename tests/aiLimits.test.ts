import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import { createAiService } from '../api/services/aiService';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-limits-'));
const usageFile = path.join(root, 'usage.json');
const config = { providerId: 'custom' as const, providerName: 'Test', baseUrl: 'https://example.invalid', model: 'test', apiKey: 'test', timeoutMs: 1000, maxConcurrency: 1, dailyTokenBudget: 100_000 };
const report = buildReportFromMarkdown({ id: '2026-09-07', filePath: '/test.md', markdown: '# 中金\n\n测试公司 (1234.HK)\n买入，目标价 10 港元。' });
const index = { reports: [report], opinions: extractOpinions(report), version: 'test' };
const store = { resolve: async () => config, getPublic: async () => ({ configured: true }) };
const provider = { test: async () => {}, async *stream() { yield '回答'; } };
let release!: () => void;
const gate = new Promise<void>((resolve) => { release = resolve; });
let entered!: () => void;
const started = new Promise<void>((resolve) => { entered = resolve; });
const service = createAiService({ configStore: store, provider, usageFile, getIndex: async () => { entered(); await gate; return index; } });
try {
  const first = service.prepareChat({ question: '测试公司的风险？', scope: {}, ip: 'one' });
  await started;
  setTimeout(release, 25);
  await assert.rejects(service.prepareChat({ question: '测试公司的观点？', scope: {}, ip: 'two' }), /AI_BUSY/, 'concurrency must be reserved before awaiting retrieval');
  release();
  const prepared = await first;
  for await (const text of prepared.stream) assert.equal(text, '回答');
  const usage = (await service.status()).usage.estimatedTokens;
  assert.ok(usage > 0);
  const restarted = createAiService({ configStore: store, provider, usageFile, getIndex: async () => index });
  assert.equal((await restarted.status()).usage.estimatedTokens, usage, 'restart must retain consumed allowance');
  config.dailyTokenBudget = usage;
  await assert.rejects(restarted.prepareChat({ question: '测试公司的目标价？', scope: {}, ip: 'three' }), /AI_DAILY_BUDGET/);

  // A paid upstream request must count even if it ends with an error.
  config.dailyTokenBudget = 100_000;
  const failing = createAiService({ configStore: store, provider: { test: async () => {}, async *stream() { yield '部分'; throw new Error('upstream failure'); } }, usageFile, getIndex: async () => index });
  const failed = await failing.prepareChat({ question: '测试公司买入理由？', scope: {}, ip: 'four' });
  await assert.rejects(async () => { for await (const text of failed.stream) void text; }, /upstream failure/);
  assert.ok((await failing.status()).usage.estimatedTokens > usage);
  const nextDay = createAiService({ configStore: store, provider, usageFile, getIndex: async () => index, now: () => new Date(Date.now() + 86_400_000) });
  assert.equal((await nextDay.status()).usage.estimatedTokens, 0);
} finally {
  release();
  await fs.rm(root, { recursive: true, force: true });
}
console.log('AI limits tests passed');
