import assert from 'node:assert/strict';
import { buildAiConfigInput, DEFAULT_AI_REVIEW_CONFIG, normalizeAiReviewConfig, type AiConfigFormValues } from '../src/lib/aiConfigForm';
import { createConfigDrafts } from '../src/lib/aiConfigDrafts';
import type { AiSavedProfile } from '../src/types';

assert.deepEqual(normalizeAiReviewConfig({}), DEFAULT_AI_REVIEW_CONFIG, '复核配置缺省值应稳定');
assert.deepEqual(normalizeAiReviewConfig({ reviewTimeoutMs: 1, reviewMaxTokens: 99_999, reviewThinking: 'low' }), {
  reviewTimeoutMs: 3_000,
  reviewMaxTokens: 16_000,
  reviewThinking: 'low',
});

const configured: AiConfigFormValues = {
  providerId: 'deepseek',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'sk-review',
  reviewTimeoutMs: 30_000,
  reviewMaxTokens: 4_000,
  reviewThinking: 'low',
};
assert.deepEqual(buildAiConfigInput(configured), {
  providerId: 'deepseek',
  providerName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: 'sk-review',
  reviewTimeoutMs: 30_000,
  reviewMaxTokens: 4_000,
  reviewThinking: 'low',
});

const drafts = createConfigDrafts();
const profileA: AiSavedProfile = { ...configured, id: 'profile-a', apiKeyMask: '••••view' };
const profileB: AiSavedProfile = {
  ...configured,
  id: 'profile-b',
  providerId: 'mimo',
  providerName: 'MiMo',
  baseUrl: 'https://api.xiaomimimo.com/v1',
  model: 'mimo-v2.5-pro',
  reviewTimeoutMs: 180_000,
  reviewMaxTokens: 16_000,
  reviewThinking: 'disabled',
  apiKeyMask: '••••mimo',
};
const presetA = { id: 'deepseek' as const, name: 'DeepSeek', baseUrl: profileA.baseUrl, defaultModel: profileA.model, models: [] };
const presetB = { id: 'mimo' as const, name: 'MiMo', baseUrl: profileB.baseUrl, defaultModel: profileB.model, models: [] };
const current = { ...configured, apiKey: '' };
assert.deepEqual(drafts.provider(current, presetA, [profileA]).reviewTimeoutMs, 30_000);
assert.deepEqual(drafts.provider(current, presetA, [profileA]).reviewMaxTokens, 4_000);
const selectedB = drafts.provider(current, presetB, [profileA, profileB]);
assert.deepEqual({ reviewTimeoutMs: selectedB.reviewTimeoutMs, reviewMaxTokens: selectedB.reviewMaxTokens, reviewThinking: selectedB.reviewThinking }, {
  reviewTimeoutMs: 180_000,
  reviewMaxTokens: 16_000,
  reviewThinking: 'disabled',
}, '切换 profile 应带出该 profile 自己的复核配置');

console.log('AI review configuration UI logic tests passed');
