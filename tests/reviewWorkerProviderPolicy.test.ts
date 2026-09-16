import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { createReviewStore } from '../api/services/reviewStore';
import { createReviewWorker } from '../api/services/reviewWorker';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'review-provider-policy-'));
const config = {
  providerId: 'deepseek' as const, providerName: 'DeepSeek', model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com/v1', apiKey: 'deepseek-secret', timeoutMs: 1_000,
  dailyTokenBudget: 10_000, maxConcurrency: 1, reviewTimeoutMs: 120_000,
  reviewMaxTokens: 8_000, reviewThinking: 'disabled' as const,
};
const store = createReviewStore(root);
const report = buildReportFromMarkdown({ id: 'report', filePath: '/reports/report.md', markdown: '# 花旗\n\n腾讯（0700.HK，买入）。' });
let calls = 0;
const worker = createReviewWorker({
  store,
  resolve: async () => config,
  resolveProfile: async () => { throw new Error('legacy profile must not be resolved'); },
  ignorePinnedConfig: true,
  process: async (_report, resolved) => { calls += 1; return { result: { model: resolved.model }, partial: false }; },
  publish: async () => undefined,
});
try {
  const synced = await store.sync([report]);
  const job = synced[0].source.jobId;
  await store.transaction(state => {
    state.jobs[job].pin = {
      profileId: 'a'.repeat(64), model: 'old-openai-model', configRef: 'old-config',
      settings: { reviewTimeoutMs: 5_000, reviewMaxTokens: 1_000, reviewThinking: 'disabled' },
    };
  });
  await worker.wake();
  const state = await store.read();
  const completed = state.jobs[job];
  assert.equal(calls, 1);
  assert.equal(completed.status, 'succeeded');
  assert.equal(completed.pin?.model, 'deepseek-flash', 'legacy queued pins are replaced by the fixed automated provider');
} finally {
  await worker.stop();
  await fs.rm(root, { recursive: true, force: true });
}
console.log('review worker provider policy tests passed');
