import type { AiStatus } from '@/types';

export type AiConfigFormValues = {
  providerId: AiStatus['providerId'];
  providerName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export function buildAiConfigInput(values: AiConfigFormValues) {
  const { providerId, providerName, baseUrl, model, apiKey } = values;
  return { providerId, providerName, baseUrl, model, apiKey };
}
