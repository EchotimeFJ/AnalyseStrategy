import assert from 'node:assert/strict';
import * as providerModule from '../api/services/aiProvider';
import { createAiConfigStore, type AiConfigInput, type ResolvedAiConfig } from '../api/services/aiConfig';

type ProviderPreset = {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
};

const getPreset = (providerModule as unknown as {
  getAiProviderPreset?: (id: string) => ProviderPreset;
}).getAiProviderPreset;

assert.equal(typeof getPreset, 'function', 'native provider presets must be available');
assert.deepEqual(getPreset?.('deepseek'), {
  id: 'deepseek',
  name: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  defaultModel: 'deepseek-v4-pro',
  models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
});
assert.equal(getPreset?.('mimo').baseUrl, 'https://api.xiaomimimo.com/v1');
assert.equal(getPreset?.('mimo').defaultModel, 'mimo-v2.5-pro');
assert.equal(getPreset?.('openrouter').baseUrl, 'https://openrouter.ai/api/v1');
assert.equal(getPreset?.('openrouter').defaultModel, 'openrouter/auto');

type CapturedRequest = { url: string; headers: Headers; body: Record<string, unknown> };
const captures: CapturedRequest[] = [];
const provider = providerModule.createOpenAiCompatibleProvider(async (input, init) => {
  captures.push({
    url: String(input),
    headers: new Headers(init?.headers),
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  });
  return new Response('{"choices":[{"message":{"content":"OK"}}]}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

function config(providerId: string, baseUrl: string, model: string): ResolvedAiConfig {
  return {
    providerId,
    providerName: providerId,
    baseUrl,
    model,
    apiKey: 'sk-native-test',
    timeoutMs: 5_000,
    dailyTokenBudget: 10_000,
    maxConcurrency: 1,
  } as ResolvedAiConfig;
}

await provider.test(config('deepseek', 'https://api.deepseek.com', 'deepseek-v4-pro'));
assert.equal(captures.at(-1)?.url, 'https://api.deepseek.com/chat/completions');
assert.equal(captures.at(-1)?.headers.get('Authorization'), 'Bearer sk-native-test');
assert.equal(captures.at(-1)?.body.max_tokens, 8);

await provider.test(config('mimo', 'https://api.xiaomimimo.com/v1', 'mimo-v2.5-pro'));
assert.equal(captures.at(-1)?.headers.get('api-key'), 'sk-native-test');
assert.equal(captures.at(-1)?.headers.has('Authorization'), false);
assert.equal(captures.at(-1)?.body.max_completion_tokens, 8);
assert.equal(captures.at(-1)?.body.temperature, 1);
assert.equal(captures.at(-1)?.body.top_p, 0.95);

await provider.test(config('openrouter', 'https://openrouter.ai/api/v1', 'openrouter/auto'));
assert.equal(captures.at(-1)?.headers.get('Authorization'), 'Bearer sk-native-test');
assert.equal(captures.at(-1)?.headers.get('HTTP-Referer'), 'https://fustar.top/analyse-strategy/');
assert.equal(captures.at(-1)?.headers.get('X-OpenRouter-Title'), 'AnalyseStrategy');

const store = createAiConfigStore({ filePath: '/tmp/not-used-ai-provider-test.json', secret: 'secret', adminToken: 'admin', env: {} });
const unconfiguredStatus = await store.getPublic();
assert.equal(unconfiguredStatus.configured, false);
assert.equal(unconfiguredStatus.providerId, 'openai');
assert.equal(unconfiguredStatus.baseUrl, 'https://api.openai.com/v1');
assert.equal(unconfiguredStatus.model, 'gpt-4.1-mini');
let deepSeekPreview: ResolvedAiConfig | undefined;
try {
  deepSeekPreview = await store.preview({
    providerId: 'deepseek', providerName: '', baseUrl: '', model: '', apiKey: 'sk-deepseek',
  } as AiConfigInput, 'admin');
} catch {
  // The red test reaches this branch until native defaults are implemented.
}
assert.equal(deepSeekPreview?.providerName, 'DeepSeek');
assert.equal(deepSeekPreview?.baseUrl, 'https://api.deepseek.com');
assert.equal(deepSeekPreview?.model, 'deepseek-v4-pro');

console.log('ai provider adapter tests passed');
