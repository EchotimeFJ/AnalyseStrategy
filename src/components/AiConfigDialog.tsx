import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, X } from 'lucide-react';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { buildAiConfigInput, type AiConfigFormValues } from '@/lib/aiConfigForm';
import { configIdentity, createConfigDrafts } from '@/lib/aiConfigDrafts';
import { aiConfigRequest } from '@/lib/aiConfigRequest';
import type { AiProviderPreset, AiStatus, AiSavedProfile } from '@/types';

const providerNotes: Partial<Record<AiStatus['providerId'], string>> = {
  deepseek: '填写服务商支持的模型 ID；已保存配置会保留你填写的模型名称。',
  mimo: '默认是按量 API；Token Plan 用户请把基础地址替换为控制台提供的专属 BASE_URL。',
  openrouter: '默认自动选模，也可以输入任意 author/model 或最新别名。',
  custom: '适用于其他兼容 OpenAI Chat Completions 的服务。',
};

export type AiConfigAccess = { settings: AiStatus; token: string };
type Props = { open: boolean; status: AiStatus | null; access?: AiConfigAccess | null; onAuthorized?: (settings: AiStatus, token: string) => void; onClose: () => void; onSaved: (status: AiStatus) => void };

export function AiConfigDialog(props: Props) {
  const [password, setPassword] = useState(props.access?.token ?? '');
  const [settings, setSettings] = useState<AiStatus | null>(props.access?.settings ?? null);
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
    try {
      const next = await aiConfigRequest(signal => apiGet<AiStatus>('/api/ai/config', signal, { 'X-AI-Admin-Token': password }), 'verify');
      setSettings(next); props.onAuthorized?.(next, password);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return createPortal(settings ? <ConfigEditor {...props} status={settings} initialAdminToken={password} onSettings={next => { setSettings(next); props.onAuthorized?.(next, password); }} /> : (
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

function ConfigEditor({ open, status, onClose, onSaved, initialAdminToken, onSettings }: Props & { initialAdminToken: string; onSettings: (settings: AiStatus) => void }) {
  const [form, setForm] = useState<AiConfigFormValues>(() => ({ providerId: status?.providerId ?? 'custom', providerName: status?.providerName ?? '', baseUrl: status?.baseUrl ?? '', model: status?.model ?? '', apiKey: '' }));
  const { providerId, providerName, baseUrl, model, apiKey } = form;
  const drafts = useRef(createConfigDrafts());
  const [adminToken, setAdminToken] = useState(initialAdminToken);
  const [busy, setBusy] = useState<'test' | 'save' | 'switch' | ''>('');
  const [message, setMessage] = useState('');

  if (!open) return null;
  const providerPresets = status?.providerPresets ?? [];
  const selectedPreset = providerPresets.find((provider) => provider.id === providerId);
  const input = buildAiConfigInput({ providerId, providerName, baseUrl, model, apiKey });
  const headers = { 'X-AI-Admin-Token': adminToken };
  const matchingProfile = status?.profiles?.find(profile => configIdentity(profile) === configIdentity(form));
  function selectProfile(profile: AiSavedProfile) {
    setForm(drafts.current.select(form, { providerId: profile.providerId, providerName: profile.providerName, baseUrl: profile.baseUrl, model: profile.model, apiKey: '' })); setMessage('');
  }

  function selectProvider(provider: AiProviderPreset) {
    if (provider.id === providerId) return;
    setForm(drafts.current.provider(form, provider, status?.profiles ?? []));
    setMessage('');
  }
  function changeIdentity(patch: Partial<Pick<AiConfigFormValues, 'baseUrl' | 'model'>>) {
    setForm(drafts.current.select(form, { ...form, ...patch, apiKey: '' })); setMessage('');
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
      const next = await aiConfigRequest(signal => apiPut<AiStatus>('/api/ai/config', { ...input, activate: false }, headers, signal), 'save');
      const clean = { ...form, apiKey: '' }; drafts.current.remember(clean); setForm(clean);
      onSettings(next); onSaved(next); setMessage('配置保存成功，当前模型未切换。');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }
  async function activate() {
    if (!matchingProfile || apiKey) return;
    setBusy('switch'); setMessage('');
    try {
      const next = await aiConfigRequest(signal => apiPost<AiStatus>('/api/ai/active-profile', { profileId: matchingProfile.id }, signal, headers), 'save');
      onSettings(next); onSaved(next); setMessage('模型切换成功，已使用该配置独立保存的 Key。');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="研究助手全局配置">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
        <fieldset disabled={Boolean(busy)} className="contents">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><KeyRound className="h-4 w-4" />服务器级全局配置</div><h2 className="mt-2 text-2xl font-semibold text-slate-950">配置研究助手</h2><p className="mt-2 text-sm leading-6 text-slate-500">保存后所有访问者共享 AI 能力；聊天历史仍只保存在各自浏览器。</p></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-slate-100 p-3" aria-label="关闭配置窗口"><X className="h-5 w-5" /></button></div>
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
          {providerId === 'custom' ? <Field label="服务商名称"><input value={providerName} onChange={(e) => setForm({ ...form, providerName: e.target.value })} /></Field> : null}
          <Field label="模型"><><input list={`provider-models-${providerId}`} value={model} onChange={(e) => changeIdentity({ model: e.target.value })} placeholder={selectedPreset?.defaultModel || '输入模型名称'} /><datalist id={`provider-models-${providerId}`}>{selectedPreset?.models.map((modelName) => <option key={modelName} value={modelName} />)}</datalist></></Field>
          <Field label="API 基础地址" wide><input value={baseUrl} onChange={(e) => changeIdentity({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" /></Field>
          <Field label={`API Key ${apiKey ? '（新输入，尚未保存）' : matchingProfile?.apiKeyMask ? `（此配置已保存 ${matchingProfile.apiKeyMask}）` : '（新配置需填写）'}`} wide><input type="password" value={apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={matchingProfile ? '留空保留此配置的 Key' : '输入此配置专用的 API Key'} autoComplete="new-password" /></Field>
          <p className="text-xs text-slate-500 sm:col-span-2">各配置独立保存 Key。切换服务商会保留本次未保存输入；请分别保存，关闭窗口后未保存输入会清除。切换全站模型不需要重新填写 Key。</p>
          <Field label="管理员密码" wide><input type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="输入网站管理员密码" autoComplete="current-password" /></Field>
          <p className="-mt-2 text-xs leading-5 text-slate-500 sm:col-span-2">仅在测试、保存或修改全站 AI 配置时需要；普通访客使用研究助手无需填写。</p>
        </div>
        {!status?.canPersist ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">服务器尚未设置 AI_CONFIG_SECRET，不能在网页保存密钥；可以先使用服务器环境变量配置。</p> : null}
        {status?.overriddenFields?.length ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">以下项目由服务器环境变量固定：{status.overriddenFields.join('、')}。请先在服务器移除对应覆盖设置，再使用网页保存配置。</p> : null}
        {message ? <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${message.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-2"><button onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold">关闭</button><button onClick={() => void test()} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700">{busy === 'test' ? '测试中…' : '测试连接'}</button><button disabled={!status?.canPersist || Boolean(status?.overriddenFields?.length)} onClick={() => void save()} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy === 'save' ? '保存中…' : '保存配置'}</button><button disabled={!matchingProfile || Boolean(apiKey) || Boolean(status?.overriddenFields?.length)} onClick={() => void activate()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === 'switch' ? '切换中…' : '使用已保存配置'}</button></div>
        </fieldset>
      </div>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactElement<{ className?: string }> }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>{/* inputs share one accessible visual treatment */}<div className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:focus:border-blue-400">{children}</div></label>;
}
