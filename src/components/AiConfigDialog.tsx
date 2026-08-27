import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { apiPost, apiPut } from '@/lib/api';
import { buildAiConfigInput } from '@/lib/aiConfigForm';
import type { AiProviderPreset, AiStatus } from '@/types';

const providerNotes: Partial<Record<AiStatus['providerId'], string>> = {
  deepseek: '使用 DeepSeek 当前 V4 模型名称和官方 Chat Completions 地址。',
  mimo: '默认是按量 API；Token Plan 用户请把基础地址替换为控制台提供的专属 BASE_URL。',
  openrouter: '默认自动选模，也可以输入任意 author/model 或最新别名。',
  custom: '适用于其他兼容 OpenAI Chat Completions 的服务。',
};

export function AiConfigDialog({ open, status, onClose, onSaved }: { open: boolean; status: AiStatus | null; onClose: () => void; onSaved: (status: AiStatus) => void }) {
  const [providerId, setProviderId] = useState<AiStatus['providerId']>('custom');
  const [providerName, setProviderName] = useState('OpenAI compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [adminToken, setAdminToken] = useState('');
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
      await apiPost('/api/ai/config/test', input, undefined, headers);
      setMessage('连接测试成功，可以保存。');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }

  async function save() {
    setBusy('save'); setMessage('');
    try {
      const next = await apiPut<AiStatus>('/api/ai/config', input, headers);
      setApiKey(''); setAdminToken(''); onSaved(next); onClose();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="研究助手全局配置">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><KeyRound className="h-4 w-4" />服务器级全局配置</div><h2 className="mt-2 text-2xl font-semibold text-slate-950">配置研究助手</h2><p className="mt-2 text-sm leading-6 text-slate-500">保存后所有访问者共享 AI 能力；聊天历史仍只保存在各自浏览器。</p></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-slate-100 p-3" aria-label="关闭"><X className="h-5 w-5" /></button></div>
        <div className="mt-6">
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
          <Field label="模型"><><input list={`provider-models-${providerId}`} value={model} onChange={(e) => setModel(e.target.value)} placeholder={selectedPreset?.defaultModel || '输入模型名称'} /><datalist id={`provider-models-${providerId}`}>{selectedPreset?.models.map((modelName) => <option key={modelName} value={modelName} />)}</datalist></></Field>
          <Field label="API 基础地址" wide><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></Field>
          <Field label={`API Key ${status?.apiKeyMask ? `（当前 ${status.apiKeyMask}）` : ''}`} wide><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status?.configured ? '留空则保留现有密钥' : '输入 API Key'} autoComplete="new-password" /></Field>
          <Field label="管理员密码" wide><input type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="输入网站管理员密码" autoComplete="current-password" /></Field>
          <p className="-mt-2 text-xs leading-5 text-slate-500 sm:col-span-2">仅在测试、保存或修改全站 AI 配置时需要；普通访客使用研究助手无需填写。</p>
        </div>
        {!status?.canPersist ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">服务器尚未设置 AI_CONFIG_SECRET，不能在网页保存密钥；可以先使用服务器环境变量配置。</p> : null}
        {message ? <p className={`mt-4 rounded-xl p-3 text-sm ${message.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onClose} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold">取消</button><button disabled={Boolean(busy)} onClick={() => void test()} className="min-h-11 rounded-xl border border-blue-200 px-5 text-sm font-semibold text-blue-700 disabled:opacity-50">{busy === 'test' ? '测试中…' : '测试连接'}</button><button disabled={Boolean(busy) || !status?.canPersist} onClick={() => void save()} className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy === 'save' ? '保存中…' : '保存全局配置'}</button></div>
      </div>
    </div>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactElement<{ className?: string }> }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-2 block text-xs font-semibold text-slate-600">{label}</span>{/* inputs share one accessible visual treatment */}<div className="[&_input]:min-h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:text-sm [&_input]:outline-none [&_input]:focus:border-blue-400">{children}</div></label>;
}
