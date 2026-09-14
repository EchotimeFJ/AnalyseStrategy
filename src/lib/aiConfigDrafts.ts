import type { AiProviderPreset, AiSavedProfile } from '@/types';
import type { AiConfigFormValues } from './aiConfigForm';

export function configIdentity(value: Pick<AiConfigFormValues, 'providerId' | 'baseUrl' | 'model'>) {
  let address = value.baseUrl.trim();
  try { address = new URL(address).toString().replace(/\/$/, ''); } catch { /* Keep partially edited input distinct. */ }
  return JSON.stringify([value.providerId, address, value.model.trim()]);
}

export function createConfigDrafts() {
  const drafts = new Map<string, AiConfigFormValues>();
  const lastByProvider = new Map<string, string>();
  function remember(form: AiConfigFormValues) {
    const id = configIdentity(form);
    drafts.set(id, { ...form }); lastByProvider.set(form.providerId, id);
  }
  function select(form: AiConfigFormValues, target: AiConfigFormValues) {
    remember(form);
    const next = { ...(drafts.get(configIdentity(target)) ?? target) };
    remember(next);
    return next;
  }
  return {
    remember,
    select,
    provider(form: AiConfigFormValues, preset: AiProviderPreset, profiles: AiSavedProfile[]) {
      remember(form);
      const draft = drafts.get(lastByProvider.get(preset.id) ?? '');
      if (draft) return { ...draft };
      const saved = profiles.filter(profile => profile.providerId === preset.id).at(-1);
      return select(form, saved ? { providerId: saved.providerId, providerName: saved.providerName, baseUrl: saved.baseUrl, model: saved.model, apiKey: '' }
        : { providerId: preset.id, providerName: preset.name, baseUrl: preset.baseUrl, model: preset.defaultModel, apiKey: '' });
    },
  };
}
