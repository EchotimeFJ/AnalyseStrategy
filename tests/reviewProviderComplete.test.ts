import assert from 'node:assert/strict';
import { createOpenAiCompatibleProvider } from '../api/services/aiProvider';
import type { ResolvedAiConfig } from '../api/services/aiConfig';

const bodies: Array<Record<string, unknown>> = [];
const provider = createOpenAiCompatibleProvider(async (_input, init) => {
  bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
  return new Response(JSON.stringify({
    id: 'cmpl-review', model: 'deepseek-test',
    choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19, completion_tokens_details: { reasoning_tokens: 0 } },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
const config = (providerId: string, reviewThinking: 'disabled' | 'low' = 'disabled') => ({
  providerId, providerName: providerId, baseUrl: `https://${providerId}.example/v1`, model: 'review-model', apiKey: 'sk-review',
  timeoutMs: 10_000, dailyTokenBudget: 100_000, maxConcurrency: 1, reviewThinking,
}) as ResolvedAiConfig;

const completion = await provider.complete?.({ messages: [{ role: 'user', content: 'review' }], maxTokens: 800 }, config('deepseek'), new AbortController().signal);
assert.deepEqual(completion, {
  content: '{"ok":true}', finishReason: 'stop', usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19, reasoningTokens: 0 }, id: 'cmpl-review', model: 'deepseek-test',
});
assert.deepEqual(bodies[0].thinking, { type: 'disabled' });

await provider.complete?.({ messages: [{ role: 'user', content: 'review' }], maxTokens: 800 }, config('deepseek', 'low'), new AbortController().signal);
assert.deepEqual(bodies[1].thinking, { type: 'enabled' });
assert.equal(bodies[1].reasoning_effort, 'low');

await assert.rejects(() => provider.complete?.({ messages: [{ role: 'user', content: 'review' }] }, config('mimo', 'low'), new AbortController().signal), /MiMo.*暂不支持.*low/);

await provider.complete?.({ messages: [{ role: 'user', content: 'review' }], maxTokens: 800, responseFormat: 'json_object' }, config('mimo'), new AbortController().signal);
assert.deepEqual(bodies[2].thinking, { type: 'disabled' }, 'MiMo defaults to thinking unless the request explicitly disables it');
assert.equal(bodies[2].max_completion_tokens, 800);
assert.deepEqual(bodies[2].response_format, { type: 'json_object' });

console.log('review provider complete tests passed');
