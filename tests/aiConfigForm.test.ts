import assert from 'node:assert/strict';

const formModule = await import('../src/lib/aiConfigForm').catch(() => ({}));
const buildAiConfigInput = (formModule as {
  buildAiConfigInput?: (values: Record<string, unknown>) => Record<string, unknown>;
}).buildAiConfigInput;

assert.equal(typeof buildAiConfigInput, 'function', '配置表单需要独立构建公开输入');
assert.deepEqual(buildAiConfigInput?.({
  providerId: 'deepseek',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  apiKey: 'sk-test',
  timeoutMs: 1,
  maxConcurrency: 99,
  dailyTokenBudget: 1,
}), {
  providerId: 'deepseek',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
  apiKey: 'sk-test',
}, '公开配置表单不能提交后端运维参数');

console.log('ai config form tests passed');
