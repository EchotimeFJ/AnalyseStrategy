import assert from 'node:assert/strict';
import { createConfigDrafts } from '../src/lib/aiConfigDrafts';
import type { AiConfigFormValues } from '../src/lib/aiConfigForm';
import type { AiSavedProfile } from '../src/types';

const drafts = createConfigDrafts();
const deep: AiConfigFormValues = { providerId: 'deepseek', providerName: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'draft-deep-key' };
const mimo = { id: 'mimo' as const, name: 'MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', defaultModel: 'mimo-v2.5-pro', models: [] };
const deepPreset = { id: 'deepseek' as const, name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'different-default', models: [] };
const switched = drafts.provider(deep, mimo, []);
switched.apiKey = 'draft-mimo-key';
assert.deepEqual(drafts.provider(switched, deepPreset, []), deep, 'switching tabs retains the unsaved key and custom model');
assert.equal(drafts.provider(deep, mimo, []).apiKey, 'draft-mimo-key');
assert.equal(drafts.select(deep, { ...deep, model: 'new-model', apiKey: '' }).apiKey, '', 'new models do not borrow keys');
const saved: AiSavedProfile = { ...deep, id: 'saved', apiKeyMask: '••••1234' };
const fresh = createConfigDrafts().provider(switched, deepPreset, [saved]);
assert.equal(fresh.model, 'deepseek-flash', 'provider selection loads the saved model rather than its preset');
assert.equal(fresh.apiKey, '', 'masked saved credentials never become input values');
console.log('AI configuration draft switching tests passed');
