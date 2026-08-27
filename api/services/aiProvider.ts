import type { ResolvedAiConfig } from './aiConfig.js';

export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderChatInput = { messages: ProviderMessage[]; maxTokens?: number };

export interface AiProvider {
  test(config: ResolvedAiConfig, signal?: AbortSignal): Promise<void>;
  stream(input: ProviderChatInput, config: ResolvedAiConfig, signal: AbortSignal): AsyncIterable<string>;
}

export function createOpenAiCompatibleProvider(fetchImpl: typeof fetch = fetch): AiProvider {
  async function request(input: ProviderChatInput, config: ResolvedAiConfig, signal: AbortSignal, stream: boolean) {
    const response = await fetchImpl(chatUrl(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: input.messages,
        stream,
        temperature: 0.2,
        max_tokens: input.maxTokens ?? 1200,
      }),
      signal,
    });
    if (!response.ok) {
      const message = (await response.text()).slice(0, 240).replace(/(?:sk-[\w-]+)/g, '[密钥已隐藏]');
      throw new Error(`AI_PROVIDER_ERROR:${response.status}:${message || '供应商请求失败'}`);
    }
    return response;
  }

  return {
    async test(config, signal) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 15_000));
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      try {
        await request({ messages: [{ role: 'user', content: '只回复 OK' }], maxTokens: 8 }, config, combined, false);
      } finally {
        clearTimeout(timeout);
      }
    },
    async *stream(input, config, signal) {
      const response = await request(input, config, signal, true);
      if (!response.body) throw new Error('AI_PROVIDER_ERROR:供应商未返回流');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
          if (!data || data === '[DONE]') continue;
          try {
            const payload = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const content = payload.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Ignore provider keep-alive frames that are not completion JSON.
          }
        }
        if (done) break;
      }
    },
  };
}

function chatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}
