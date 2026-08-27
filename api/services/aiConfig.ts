import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { decryptSecret, encryptSecret, maskApiKey, type EncryptedValue } from './secretStore.js';
import {
  AI_PROVIDER_PRESETS,
  getAiProviderPreset,
  inferAiProviderId,
  type AiProviderId,
} from './aiProvider.js';

export type AiConfigInput = {
  providerId?: AiProviderId | string;
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  dailyTokenBudget?: number;
  maxConcurrency?: number;
};

export type ResolvedAiConfig = Required<Omit<AiConfigInput, 'providerId'>> & { providerId: AiProviderId };

type StoredAiConfig = Omit<ResolvedAiConfig, 'apiKey'> & {
  apiKeyEncrypted: EncryptedValue;
  apiKeyTail: string;
  updatedAt: string;
};

type AiConfigStoreOptions = {
  filePath?: string;
  secret?: string;
  adminToken?: string;
  env?: Record<string, string | undefined>;
};

const DEFAULT_FILE = path.join(process.cwd(), 'data', 'runtime', 'ai-config.json');

export function createAiConfigStore(options: AiConfigStoreOptions = {}) {
  const filePath = options.filePath ?? DEFAULT_FILE;
  const env = options.env ?? process.env;
  const secret = options.secret ?? env.AI_CONFIG_SECRET ?? '';
  const adminToken = options.adminToken ?? env.AI_CONFIG_ADMIN_TOKEN ?? '';

  async function readStored(): Promise<StoredAiConfig | null> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8')) as StoredAiConfig;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function resolve(): Promise<ResolvedAiConfig | null> {
    const stored = await readStored();
    const apiKey = env.AI_API_KEY || (stored && secret ? decryptSecret(stored.apiKeyEncrypted, secret) : '');
    const baseUrl = env.AI_BASE_URL || stored?.baseUrl || '';
    const model = env.AI_MODEL || stored?.model || '';
    if (!apiKey || !baseUrl || !model) return null;
    const providerId = normalizeProviderId(
      env.AI_PROVIDER_ID || stored?.providerId || inferAiProviderId(baseUrl, env.AI_PROVIDER_NAME || stored?.providerName),
    );
    return {
      providerId,
      providerName: env.AI_PROVIDER_NAME || stored?.providerName || getAiProviderPreset(providerId).name,
      baseUrl,
      model,
      apiKey,
      timeoutMs: numberValue(env.AI_TIMEOUT_MS, stored?.timeoutMs, 45_000, 3_000, 180_000),
      dailyTokenBudget: numberValue(env.AI_DAILY_TOKEN_BUDGET, stored?.dailyTokenBudget, 500_000, 1_000, 50_000_000),
      maxConcurrency: numberValue(env.AI_MAX_CONCURRENCY, stored?.maxConcurrency, 2, 1, 20),
    };
  }

  async function getPublic() {
    const config = await resolve();
    const defaultPreset = getAiProviderPreset('openai');
    return {
      configured: Boolean(config),
      providerId: config?.providerId ?? defaultPreset.id,
      providerName: config?.providerName ?? defaultPreset.name,
      baseUrl: config?.baseUrl ?? defaultPreset.baseUrl,
      model: config?.model ?? defaultPreset.defaultModel,
      apiKeyMask: config ? maskApiKey(config.apiKey) : '',
      timeoutMs: config?.timeoutMs ?? 45_000,
      dailyTokenBudget: config?.dailyTokenBudget ?? 500_000,
      maxConcurrency: config?.maxConcurrency ?? 2,
      canPersist: Boolean(secret),
      adminProtected: Boolean(adminToken),
      providerPresets: AI_PROVIDER_PRESETS,
    };
  }

  async function save(input: AiConfigInput, token: string): Promise<void> {
    const candidate = await preview(input, token);
    if (!secret) throw new Error('AI_CONFIG_SECRET 未配置，不能持久化 API Key');
    const stored: StoredAiConfig = {
      providerId: candidate.providerId,
      providerName: candidate.providerName,
      baseUrl: candidate.baseUrl,
      model: candidate.model,
      apiKeyEncrypted: encryptSecret(candidate.apiKey, secret),
      apiKeyTail: candidate.apiKey.slice(-4),
      timeoutMs: candidate.timeoutMs,
      dailyTokenBudget: candidate.dailyTokenBudget,
      maxConcurrency: candidate.maxConcurrency,
      updatedAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(stored, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
  }

  async function preview(input: AiConfigInput, token: string): Promise<ResolvedAiConfig> {
    assertAdminToken(token, adminToken);
    const existing = await resolve();
    const providerId = normalizeProviderId(input.providerId || inferAiProviderId(input.baseUrl, input.providerName));
    const preset = getAiProviderPreset(providerId);
    const providerChanged = Boolean(existing && existing.providerId !== providerId);
    const apiKey = input.apiKey?.trim() || (!providerChanged ? existing?.apiKey : '') || '';
    if (!apiKey) throw new Error('请填写 API Key');
    const model = input.model.trim() || preset.defaultModel;
    if (!model) throw new Error('请填写模型名称');
    const baseUrl = input.baseUrl.trim() || preset.baseUrl;
    if (!baseUrl) throw new Error('请填写 API 基础地址');
    return {
      providerId,
      providerName: providerId === 'custom' ? input.providerName.trim() || preset.name : preset.name,
      baseUrl: normalizeBaseUrl(baseUrl),
      model,
      apiKey,
      timeoutMs: numberValue(input.timeoutMs, undefined, 45_000, 3_000, 180_000),
      dailyTokenBudget: numberValue(input.dailyTokenBudget, undefined, 500_000, 1_000, 50_000_000),
      maxConcurrency: numberValue(input.maxConcurrency, undefined, 2, 1, 20),
    };
  }

  return { getPublic, resolve, preview, save };
}

function normalizeProviderId(value: string): AiProviderId {
  return AI_PROVIDER_PRESETS.some((provider) => provider.id === value)
    ? value as AiProviderId
    : 'custom';
}

export const aiConfigStore = createAiConfigStore();

function assertAdminToken(input: string, expected: string) {
  if (!expected) throw new Error('AI_CONFIG_ADMIN_TOKEN 未配置');
  const left = Buffer.from(input);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('管理员密码错误，请检查后重试');
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API 基础地址仅支持 HTTP/HTTPS');
  return url.toString().replace(/\/$/, '');
}

function numberValue(value: unknown, fallback: number | undefined, defaultValue: number, min: number, max: number) {
  const parsed = Number(value ?? fallback ?? defaultValue);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : defaultValue;
}
