import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { buildAiConfigInput } from '@/lib/aiConfigForm';
import { aiConfigRequest } from '@/lib/aiConfigRequest';
import type { AiProviderPreset, AiStatus, AiSavedProfile } from '@/types';

const providerNotes: Partial<Record<AiStatus['providerId'], string>> = {
  deepseek: '使用 DeepSeek 当前 V4 模型名称和官方 Chat Completions 地址。',
  mimo: '默认是按量 API；Token Plan 用户请把基础地址替换为控制台提供的专属 BASE_URL。',
  openrouter: '默认自动选模，也可以输入任意 author/model 或最新别名。',
  custom: '适用于其他兼容 OpenAI Chat Completions 的服务。',
};

type Props = { open: boolean; status: AiStatus | null; onClose: () => void; onSaved: (status: AiStatus) => void };

export function AiConfigDialog(props: Props) {
  const [password, setPassword] = useState('');
  const [settings, setSettings] = useState<AiStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = props.onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', escape); previous?.focus(); };
  }, [close]);
  if (!props.open) return null;
  async function unlock() {
    setBusy(true); setError('');
    try { setSettings(await aiConfigRequest(signal => apiGet<AiStatus>('/api/ai/config', signal, { 'X-AI-Admin-Token': password }), 'verify')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return createPortal(settings ? <ConfigEditor {...props} status={settings} initialAdminToken={password} /> : (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="AI 配置管理员验证">
      <form onSubmit={event => { event.preventDefault(); void unlock(); }} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-950">AI 配置</h2>
        <p className="mt-2 text-sm text-slate-500">输入管理员密码后，可修改全站研究助手的模型和接口。</p>
        <div className="mt-5"><Field label="管理员密码"><input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></Field></div>
        {error ? <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={props.onClose} className="min-h-11 rounded-xl border px-4">取消</button><button disabled={busy || !password} className="min-h-11 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">{busy ? '验证中…' : '进入配置'}</button></div>
      </form>
    </div>
  ), document.body);
}

function ConfigEditor({ open, status, onClose, onSaved, initialAdminToken }: Props & { initialAdminToken: string }) {
  const [providerId, setProviderId] = useState<AiStatus['providerId']>('custom');
  const [providerName, setProviderName] = useState('OpenAI compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [adminToken, setAdminToken] = useState(initialAdminToken);
  const [busy, setBusy] = useState<'test' | 'save' | ''>('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!status) return;
    setProviderId(status.providerId || 'custom');
    setProviderName(status.providerName || 'OpenAI compatible');
    setBaseUrl(status.baseUrl || 'https://api.openai.com/v1');
    setModel(status.model || '');
  }, [status]);

  if (!open) return null;
  const providerPresets = status?.providerPresets ?? [];
  const selectedPreset = providerPresets.find((provider) => provider.id === providerId);
  const input = buildAiConfigInput({ providerId, providerName, baseUrl, model, apiKey });
  const headers = { 'X-AI-Admin-Token': adminToken };
  const matchingProfile = status?.profiles?.find(profile => profile.providerId === providerId && profile.model === model.trim() && normalizeAddress(profile.baseUrl) === normalizeAddress(baseUrl));
  function selectProfile(profile: AiSavedProfile) {
    setProviderId(profile.providerId); setProviderName(profile.providerName);
    setBaseUrl(profile.baseUrl); setModel(profile.model); setApiKey(''); setMessage('');
  }

  function selectProvider(provider: AiProviderPreset) {
    if (provider.id === providerId) return;
    setProviderId(provider.id);
    setProviderName(provider.name);
    setBaseUrl(provider.baseUrl);
    setModel(provider.defaultModel);
    setApiKey('');
    setMessage('');
  }

  async function test() {
    setBusy('test'); setMessage('');
    try {
      await aiConfigRequest(signal => apiPost('/api/ai/config/test', input, signal, headers), 'test');
      setMessage('连接测试成功，可以保存。');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }

  async function save() {
    setBusy('save'); setMessage('');
    try {
      const next = await aiConfigRequest(signal => apiPut<AiStatus>('/api/ai/config', input, headers, signal), 'save');
      setApiKey(''); setAdminToken(''); onSaved(next); onClose();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="研究助手全局配置">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><KeyRound className="h-4 w-4" />服务器级全局配置</div><h2 className="mt-2 text-2xl font-semibold text-slate-950">配置研究助手</h2><p className="mt-2 text-sm leading-6 text-slate-500">保存后所有访问者共享 AI 能力；聊天历史仍只保存在各自浏览器。</p></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-slate-100 p-3" aria-label="关闭"><X className="h-5 w-5" /></button></div>
        <div className="mt-6">
          {status?.profiles?.length ? <label className="mb-5 block text-sm text-slate-600">已保存的配置<select aria-label="已保存的配置" value={matchingProfile?.id ?? ''} onChange={event => { const profile = status.profiles?.find(item => item.id === event.target.value); if (profile) selectProfile(profile); }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="" disabled>新配置</option>{status.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.providerName} · {profile.model} · {profile.baseUrl}{profile.id === status.activeProfileId ? '（正在使用）' : ''}</option>)}</select></label> : null}
          <div className="mb-2 text-xs font-semibold text-slate-600">服务商</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {providerPresets.map((provider) => (
              <button
                key={provider.id}
                type="button"
                aria-pressed={provider.id === providerId}
                onClick={() => selectProvider(provider)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${provider.id === providerId ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}
              >
                {provider.name}
              </button>
            ))}
          </div>
          {providerNotes[providerId] ? <p className="mt-2 text-xs leading-5 text-slate-500">{providerNotes[providerId]}</p> : null}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {providerId === 'custom' ? <Field label="服务商名称"><input value={providerName} onChange={(e) => setProviderName(e.target.value)} /></Field> : null}
          <Field label="模型"><><input list={`provider-models-${providerId}`} value={model} onChange={(e) => { setModel(e.target.value); setApiKey(''); setMessage(''); }} placeholder={selectedPreset?.defaultModel || '输入模型名称'} /><datalist id={`provider-models-${providerId}`}>{selectedPreset?.models.map((modelName) => <option key={modelName} value={modelName} />)}</datalist></></Field>
          <Field label="API 基础地址" wide><input value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setApiKey(''); setMessage(''); }} placeholder="https://api.openai.com/v1" /></Field>
          <Field label={`API Key ${matchingProfile?.apiKeyMask ? `（此配置 ${matchingProfile.apiKeyMask}）` : '（新配置需填写）'}`} wide><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={matchingProfile ? '留空保留此配置的 Key' : '输入此配置专用的 API Key'} autoComplete="new-password" /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">每个服务商、接口地址和模型组合分别保存 Key。切换已保存配置不会立即影响全站；保存并启用后才生效。</p>
          <Field label="管理员密码" wide><input type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="输入网站管理员密码" autoComplete="current-password" /></Field>
          <p className="-mt-2 text-xs leading-5 text-slate-500 sm:col-span-2">仅在测试、保存或修改全站 AI 配置时需要；普通访客使用研究助手无需填写。</p>
        </div>
        {!status?.canPersist ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">服务器尚未设置 AI_CONFIG_SECRET，不能在网页保存密钥；可以先使用服务器环境变量配置。</p> : null}
        {status?.overriddenFields?.length ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">以下项目由服务器环境变量固定：{status.overriddenFields.join('、')}。请先在服务器移除对应覆盖设置，再使用网页保存配置。</p> : null}
        {message ? <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${message.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold">取消</button><button disabled={Boolean(busy)} onClick={() => void test()} className="min-h-11 rounded-xl border border-blue-200 px-5 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy === 'test' ? '测试中…' : '测试连接'}</button><button disabled={Boolean(busy) || !status?.canPersist || Boolean(status?.overriddenFields?.length)} onClick={() => void save()} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy === 'save' ? '保存中…' : '保存并启用'}</button></div>
      </div>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactElement<{ className?: string }> }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>{/* inputs share one accessible visual treatment */}<div className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:focus:border-blue-400">{children}</div></label>;
}

function normalizeAddress(value: string) {
  try { return new URL(value.trim()).toString().replace(/\/$/, ''); } catch { return value.trim(); }
}
