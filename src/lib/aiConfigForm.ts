import type { AiReviewThinking, AiStatus } from '@/types';

export const DEFAULT_AI_REVIEW_CONFIG = {
  reviewTimeoutMs: 120_000,
  reviewMaxTokens: 8_000,
  reviewThinking: 'disabled' as AiReviewThinking,
};

export type AiReviewConfigValues = {
  reviewTimeoutMs?: number;
  reviewMaxTokens?: number;
  reviewThinking?: AiReviewThinking;
};

export type AiConfigFormValues = AiReviewConfigValues & {
  providerId: AiStatus['providerId'];
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function normalizeAiReviewConfig(values: AiReviewConfigValues): Required<AiReviewConfigValues> {
  return {
    reviewTimeoutMs: boundedInteger(values.reviewTimeoutMs, DEFAULT_AI_REVIEW_CONFIG.reviewTimeoutMs, 3_000, 180_000),
    reviewMaxTokens: boundedInteger(values.reviewMaxTokens, DEFAULT_AI_REVIEW_CONFIG.reviewMaxTokens, 1_000, 16_000),
    reviewThinking: values.reviewThinking === 'low' ? 'low' : 'disabled',
  };
}

export function buildAiConfigInput(values: AiConfigFormValues) {
  const { providerId, providerName, baseUrl, model, apiKey } = values;
  const input = { providerId, providerName, baseUrl, model, apiKey };
  const hasReviewConfig = values.reviewTimeoutMs !== undefined || values.reviewMaxTokens !== undefined || values.reviewThinking !== undefined;
  return hasReviewConfig ? { ...input, ...normalizeAiReviewConfig(values) } : input;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
