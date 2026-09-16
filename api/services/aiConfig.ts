import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { writeAtomicJson } from './atomicJson.js';
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
  reviewTimeoutMs?: number;
  reviewMaxTokens?: number;
  reviewThinking?: 'disabled' | 'low';
};

export type ResolvedAiConfig = Required<Omit<AiConfigInput, 'providerId' | 'reviewTimeoutMs' | 'reviewMaxTokens' | 'reviewThinking'>> & Pick<AiConfigInput, 'reviewTimeoutMs' | 'reviewMaxTokens' | 'reviewThinking'> & { providerId: AiProviderId };

type StoredAiConfig = Omit<ResolvedAiConfig, 'apiKey'> & {
  apiKeyEncrypted: EncryptedValue;
  apiKeyTail: string;
  updatedAt: string;
};
type ConfigFile = { version: 2; activeProfileId: string; profiles: StoredAiConfig[] };
export function profileId(config: Pick<ResolvedAiConfig, 'providerId' | 'baseUrl' | 'model'>) {
  return createHash('sha256').update(JSON.stringify([config.providerId, normalizeBaseUrl(config.baseUrl), config.model.trim()])).digest('hex');
}

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
  const adminToken = options.adminToken ?? (env.ADMIN_TOKEN || env.AI_CONFIG_ADMIN_TOKEN || '');

  async function readFile(): Promise<ConfigFile | null> {
    try {
      const value = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      if (value.version === 2 && Array.isArray(value.profiles)) return value;
      if (!value.apiKeyEncrypted || !value.baseUrl || !value.model) throw new Error('AI_CONFIG_INVALID');
      value.providerId = normalizeProviderId(value.providerId || inferAiProviderId(value.baseUrl, value.providerName));
      return { version: 2, activeProfileId: profileId(value), profiles: [value] };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
  async function readStored() {
    const file = await readFile();
    return file?.profiles.find(profile => profileId(profile) === file.activeProfileId) ?? null;
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
      reviewTimeoutMs: numberValue(undefined, stored?.reviewTimeoutMs, 120_000, 3_000, 180_000),
      reviewMaxTokens: numberValue(undefined, stored?.reviewMaxTokens, 8_000, 1_000, 16_000),
      reviewThinking: stored?.reviewThinking ?? (providerId === 'openrouter' ? 'low' : 'disabled'),
    };
  }

  async function getPublic() {
    const config = await resolve();
    const file = await readFile();
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
      reviewTimeoutMs: config?.reviewTimeoutMs ?? 120_000,
      reviewMaxTokens: config?.reviewMaxTokens ?? 8_000,
      reviewThinking: config?.reviewThinking ?? 'disabled',
      canPersist: Boolean(secret),
      adminProtected: Boolean(adminToken),
      providerPresets: AI_PROVIDER_PRESETS,
      overriddenFields: ['AI_PROVIDER_ID', 'AI_PROVIDER_NAME', 'AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'].filter(key => Boolean(env[key])),
      profiles: (file?.profiles ?? []).map(profile => ({ id: profileId(profile), providerId: profile.providerId, providerName: profile.providerName, baseUrl: profile.baseUrl, model: profile.model, reviewTimeoutMs: profile.reviewTimeoutMs ?? 120_000, reviewMaxTokens: profile.reviewMaxTokens ?? 8_000, reviewThinking: profile.reviewThinking ?? (profile.providerId === 'openrouter' ? 'low' : 'disabled'), apiKeyMask: `••••${profile.apiKeyTail}` })),
      activeProfileId: file?.activeProfileId ?? null,
    };
  }

  let saving: Promise<void> = Promise.resolve();
  function save(input: AiConfigInput, token: string, activate = true): Promise<void> {
    const job = saving.then(() => saveProfile(input, token, activate));
    saving = job.catch(() => undefined);
    return job;
  }
  async function saveProfile(input: AiConfigInput, token: string, activate: boolean): Promise<void> {
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
      reviewTimeoutMs: candidate.reviewTimeoutMs,
      reviewMaxTokens: candidate.reviewMaxTokens,
      reviewThinking: candidate.reviewThinking,
      updatedAt: new Date().toISOString(),
    };
    const previous = await readFile();
    const id = profileId(stored);
    await persist({ version: 2, activeProfileId: activate ? id : previous?.activeProfileId ?? '', profiles: [...(previous?.profiles ?? []).filter(profile => profileId(profile) !== id), stored] });
  }
  async function persist(file: ConfigFile) {
    // Retain the original encrypted single-profile file for migration recovery.
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (!raw.version) await fs.copyFile(filePath, `${filePath}.v1.bak`, constants.COPYFILE_EXCL);
    } catch (error) {
      if (!['ENOENT', 'EEXIST'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
    await writeAtomicJson(filePath, file);
  }
  function activate(id: string, token: string): Promise<void> {
    const job = saving.then(async () => {
      assertAdminToken(token, adminToken);
      if (['AI_PROVIDER_ID', 'AI_PROVIDER_NAME', 'AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'].some(key => env[key])) throw new Error('AI_CONFIG_ENV_LOCKED');
      const file = await readFile();
      const target = file?.profiles.find(profile => profileId(profile) === id);
      if (!file || !target) throw new Error('AI_PROFILE_NOT_FOUND');
      if (!secret) throw new Error('AI_CONFIG_SECRET 未配置');
      decryptSecret(target.apiKeyEncrypted, secret);
      const current = await resolve();
      // Switching only selects saved credentials; shared resource limits stay
      // at their currently effective values across model changes.
      const selected = current ? { ...target, timeoutMs: current.timeoutMs, dailyTokenBudget: current.dailyTokenBudget, maxConcurrency: current.maxConcurrency } : target;
      await persist({ ...file, activeProfileId: id, profiles: file.profiles.map(profile => profile === target ? selected : profile) });
    });
    saving = job.catch(() => undefined);
    return job;
  }

  async function preview(input: AiConfigInput, token: string): Promise<ResolvedAiConfig> {
    assertAdminToken(token, adminToken);
    if (input.reviewThinking !== undefined && !['disabled', 'low'].includes(input.reviewThinking)) throw new Error('AI_CONFIG_INVALID');
    const existing = await resolve();
    const providerId = normalizeProviderId(input.providerId || inferAiProviderId(input.baseUrl, input.providerName));
    const preset = getAiProviderPreset(providerId);
    const baseUrl = input.baseUrl.trim() || preset.baseUrl;
    if (!baseUrl) throw new Error('请填写 API 基础地址');
    const model = input.model.trim() || preset.defaultModel;
    if (!model) throw new Error('请填写模型名称');
    const id = profileId({ providerId, baseUrl, model });
    const saved = (await readFile())?.profiles.find(profile => profileId(profile) === id);
    const matching = saved && secret ? decryptSecret(saved.apiKeyEncrypted, secret) : existing && profileId(existing) === id ? existing.apiKey : '';
    const apiKey = input.apiKey?.trim() || matching || '';
    if (!apiKey) throw new Error('请填写 API Key');
    return {
      providerId,
      providerName: providerId === 'custom' ? input.providerName.trim() || preset.name : preset.name,
      baseUrl: normalizeBaseUrl(baseUrl),
      model,
      apiKey,
      timeoutMs: numberValue(input.timeoutMs, existing?.timeoutMs, 45_000, 3_000, 180_000),
      dailyTokenBudget: numberValue(input.dailyTokenBudget, existing?.dailyTokenBudget, 500_000, 1_000, 50_000_000),
      maxConcurrency: numberValue(input.maxConcurrency, existing?.maxConcurrency, 2, 1, 20),
      reviewTimeoutMs: numberValue(input.reviewTimeoutMs, saved?.reviewTimeoutMs, 120_000, 3_000, 180_000),
      reviewMaxTokens: numberValue(input.reviewMaxTokens, saved?.reviewMaxTokens, 8_000, 1_000, 16_000),
      reviewThinking: input.reviewThinking ?? saved?.reviewThinking ?? (providerId === 'openrouter' ? 'low' : 'disabled'),
    };
  }

  async function resolveProfile(id: string): Promise<ResolvedAiConfig | null> {
    const current = await resolve();
    if (current && profileId(current) === id) return current;
    const stored = (await readFile())?.profiles.find(item => profileId(item) === id);
    if (!stored || !secret) return null;
    return {
      providerId: stored.providerId, providerName: stored.providerName,
      baseUrl: stored.baseUrl, model: stored.model,
      apiKey: decryptSecret(stored.apiKeyEncrypted, secret),
      timeoutMs: current?.timeoutMs ?? stored.timeoutMs,
      dailyTokenBudget: current?.dailyTokenBudget ?? stored.dailyTokenBudget,
      maxConcurrency: current?.maxConcurrency ?? stored.maxConcurrency,
      reviewTimeoutMs: stored.reviewTimeoutMs, reviewMaxTokens: stored.reviewMaxTokens,
      reviewThinking: stored.reviewThinking,
    };
  }
  /** Resolve an automated-review provider without changing the website's selection. */
  async function resolveProvider(providerId: AiProviderId): Promise<ResolvedAiConfig | null> {
    const file = await readFile();
    const matches = (file?.profiles ?? []).filter(profile => profile.providerId === providerId);
    const stored = matches.find(profile => profileId(profile) === file?.activeProfileId)
      ?? matches.slice().sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')))[0];
    if (stored && secret) {
      // Keep shared operational limits from the currently effective config,
      // while using this provider's own credentials and review settings.
      const current = await resolve();
      return {
        providerId: stored.providerId, providerName: stored.providerName,
        baseUrl: stored.baseUrl, model: stored.model,
        apiKey: decryptSecret(stored.apiKeyEncrypted, secret),
        timeoutMs: current?.timeoutMs ?? stored.timeoutMs,
        dailyTokenBudget: current?.dailyTokenBudget ?? stored.dailyTokenBudget,
        maxConcurrency: current?.maxConcurrency ?? stored.maxConcurrency,
        reviewTimeoutMs: stored.reviewTimeoutMs, reviewMaxTokens: stored.reviewMaxTokens,
        reviewThinking: stored.reviewThinking,
      };
    }
    const environment = await resolve();
    return environment?.providerId === providerId ? environment : null;
  }
  return { getPublic, resolve, resolveProfile, resolveProvider, preview, save, activate };
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
