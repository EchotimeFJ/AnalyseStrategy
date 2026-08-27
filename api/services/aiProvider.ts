import type { ResolvedAiConfig } from './aiConfig.js';

export type ProviderMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ProviderChatInput = { messages: ProviderMessage[]; maxTokens?: number };
export type AiProviderId = 'openai' | 'deepseek' | 'mimo' | 'openrouter' | 'custom';
export type AiProviderPreset = {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
};

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  },
  {
    id: 'mimo',
    name: 'MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto', 'openrouter/free'],
  },
  {
    id: 'custom',
    name: '自定义兼容接口',
    baseUrl: '',
    defaultModel: '',
    models: [],
  },
];

export interface AiProvider {
  test(config: ResolvedAiConfig, signal?: AbortSignal): Promise<void>;
  stream(input: ProviderChatInput, config: ResolvedAiConfig, signal: AbortSignal): AsyncIterable<string>;
}

export function getAiProviderPreset(value: string | undefined): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((provider) => provider.id === value)
    ?? AI_PROVIDER_PRESETS.find((provider) => provider.id === 'custom')!;
}

export function inferAiProviderId(baseUrl = '', providerName = ''): AiProviderId {
  const value = `${baseUrl} ${providerName}`.toLowerCase();
  if (value.includes('deepseek')) return 'deepseek';
  if (value.includes('xiaomimimo') || value.includes('mimo')) return 'mimo';
  if (value.includes('openrouter')) return 'openrouter';
  if (value.includes('api.openai.com') || providerName.trim().toLowerCase() === 'openai') return 'openai';
  return 'custom';
}

export function createOpenAiCompatibleProvider(fetchImpl: typeof fetch = fetch): AiProvider {
  async function request(input: ProviderChatInput, config: ResolvedAiConfig, signal: AbortSignal, stream: boolean) {
    const providerId = config.providerId ?? inferAiProviderId(config.baseUrl, config.providerName);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json',
    };
    if (providerId === 'mimo') {
      headers['api-key'] = config.apiKey;
    } else {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://fustar.top/analyse-strategy/';
      headers['X-OpenRouter-Title'] = 'AnalyseStrategy';
    }

    const body: Record<string, unknown> = {
      model: config.model,
      messages: input.messages,
      stream,
      temperature: providerId === 'mimo' ? 1 : 0.2,
    };
    if (providerId === 'mimo') {
      body.top_p = 0.95;
      body.max_completion_tokens = input.maxTokens ?? 2400;
    } else {
      body.max_tokens = input.maxTokens ?? 2400;
    }
    if (stream && providerId === 'openrouter') {
      body.reasoning = { effort: 'low', exclude: true };
    }

    const response = await fetchImpl(chatUrl(config.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
      const firstBudget = input.maxTokens ?? 2400;
      const attempts = [firstBudget, Math.max(3600, firstBudget)];
      let lastFinishReason = '';
      for (let attempt = 0; attempt < attempts.length; attempt += 1) {
        const response = await request({ ...input, maxTokens: attempts[attempt] }, config, signal, true);
        if (!response.body) throw new Error('AI_PROVIDER_ERROR:供应商未返回流');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let contentChars = 0;
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
            if (!data || data === '[DONE]') continue;
            let payload: {
              error?: { code?: string | number; message?: string };
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            try {
              payload = JSON.parse(data) as typeof payload;
            } catch {
              continue;
            }
            if (payload.error) {
              const providerMessage = sanitizeProviderMessage(payload.error.message ?? '供应商流式请求失败');
              throw new Error(`AI_PROVIDER_ERROR:${payload.error.code ?? 'stream'}:${providerMessage}`);
            }
            const choice = payload.choices?.[0];
            const content = choice?.delta?.content;
            if (choice?.finish_reason) lastFinishReason = choice.finish_reason;
            if (content) {
              contentChars += content.length;
              yield content;
            }
          }
          if (done) break;
        }
        if (contentChars > 0) return;
      }
      const reason = lastFinishReason === 'length' ? '模型推理耗尽了输出额度' : '模型没有返回可见正文';
      throw new Error(`AI_EMPTY_COMPLETION:${reason}，已自动重试仍未恢复，请更换模型或稍后重试`);
    },
  };
}

function sanitizeProviderMessage(value: string) {
  return value.slice(0, 240).replace(/(?:sk-[\w-]+)/g, '[密钥已隐藏]');
}

function chatUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}
