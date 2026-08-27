import { useEffect, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { apiPost, apiPut } from '@/lib/api';
import type { AiStatus } from '@/types';

export function AiConfigDialog({ open, status, onClose, onSaved }: { open: boolean; status: AiStatus | null; onClose: () => void; onSaved: (status: AiStatus) => void }) {
  const [providerName, setProviderName] = useState('OpenAI compatible');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [adminToken, setAdminToken] = useState('');
  const [timeoutMs, setTimeoutMs] = useState(45_000);
  const [dailyTokenBudget, setDailyTokenBudget] = useState(500_000);
  const [maxConcurrency, setMaxConcurrency] = useState(2);
  const [busy, setBusy] = useState<'test' | 'save' | ''>('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!status) return;
    setProviderName(status.providerName || 'OpenAI compatible');
    setBaseUrl(status.baseUrl || 'https://api.openai.com/v1');
    setModel(status.model || '');
    setTimeoutMs(status.timeoutMs || 45_000);
    setDailyTokenBudget(status.dailyTokenBudget || 500_000);
    setMaxConcurrency(status.maxConcurrency || 2);
  }, [status]);

  if (!open) return null;
  const input = { providerName, baseUrl, model, apiKey, timeoutMs, dailyTokenBudget, maxConcurrency };
  const headers = { 'X-AI-Admin-Token': adminToken };

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
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="服务商"><input value={providerName} onChange={(e) => setProviderName(e.target.value)} /></Field>
          <Field label="模型"><input value={model} onChange={(e) => setModel(e.target.value)} placeholder="例如 gpt-4.1-mini" /></Field>
          <Field label="API 基础地址" wide><input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" /></Field>
          <Field label={`API Key ${status?.apiKeyMask ? `（当前 ${status.apiKeyMask}）` : ''}`} wide><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status?.configured ? '留空则保留现有密钥' : '输入 API Key'} autoComplete="new-password" /></Field>
          <Field label="超时（毫秒）"><input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))} /></Field>
          <Field label="最大并发"><input type="number" value={maxConcurrency} onChange={(e) => setMaxConcurrency(Number(e.target.value))} /></Field>
          <Field label="每日 Token 预算"><input type="number" value={dailyTokenBudget} onChange={(e) => setDailyTokenBudget(Number(e.target.value))} /></Field>
          <Field label="配置管理令牌"><input type="password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} autoComplete="off" /></Field>
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
