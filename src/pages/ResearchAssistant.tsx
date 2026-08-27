import { FormEvent, useState } from 'react';
import { Bot, Eraser, Send, Settings2, Square } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useAiChat, type ChatMessage } from '@/hooks/useAiChat';
import type { AiSource, AiStatus } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { AiConfigDialog } from '@/components/AiConfigDialog';
import { Badge, ErrorBlock, LoadingBlock } from '@/components/ui';
import { buildReportLink } from '@/lib/reportLinks';

const prompts = [
  '总结最近一周新增的买入观点，并按公司归类',
  '哪些公司同时被多家机构看好？请说明来源',
  '汇总最近报告中的主要风险和催化剂',
];

export default function ResearchAssistant() {
  const status = useAsyncData(() => apiGet<AiStatus>('/api/ai/status'), []);
  const chat = useAiChat();
  const [question, setQuestion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [security, setSecurity] = useState('');
  const [institution, setInstitution] = useState('');
  const [configOpen, setConfigOpen] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!status.data?.configured || !question.trim()) return;
    const securityKey = security.trim() && /\.[a-z]{1,3}$/i.test(security.trim()) ? `code:${security.trim().toUpperCase()}` : undefined;
    void chat.send(question, { from, to, securityKey, institution: institution.trim() || undefined });
    setQuestion('');
  }

  return (
    <Layout>
      <PageHeader eyebrow="Research Assistant" title="研究助手" description="AI 能力集中在这里：先检索当前已索引报告，再依据来源回答。未配置或服务异常时，不影响其他页面。" />
      {status.loading ? <LoadingBlock label="正在检查 AI 配置…" /> : null}
      {status.error ? <ErrorBlock message={status.error} /> : null}
      {status.data ? (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className={`rounded-2xl border p-4 ${status.data.configured ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center justify-between gap-3"><Badge tone={status.data.configured ? 'green' : 'amber'}>{status.data.configured ? 'AI 已配置' : 'AI 未配置'}</Badge><button onClick={() => setConfigOpen(true)} className="min-h-10 min-w-10 rounded-full bg-white p-2.5" aria-label="配置研究助手"><Settings2 className="h-4 w-4" /></button></div>
              <div className="mt-3 text-sm font-semibold text-slate-900">{status.data.model || '等待配置模型'}</div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{status.data.configured ? `${status.data.providerName} · ${status.data.apiKeyMask}` : '基础研究功能完全可用；配置后再启用问答。'}</p>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-500">检索范围（可选）</div>
              <div className="mt-3 space-y-3">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" aria-label="开始日期" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" aria-label="结束日期" />
                <input value={security} onChange={(e) => setSecurity(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="公司代码，如 1768.HK" />
                <input value={institution} onChange={(e) => setInstitution(e.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="机构，如 中金" />
              </div>
            </section>
            {chat.messages.length ? <button onClick={chat.clear} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600"><Eraser className="h-4 w-4" />清空本地会话</button> : null}
          </aside>

          <section className="flex min-h-[620px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex-1 space-y-5 overflow-auto p-4 sm:p-6">
              {!chat.messages.length ? (
                <div className="mx-auto flex min-h-[390px] max-w-2xl flex-col items-center justify-center text-center">
                  <div className="rounded-2xl bg-blue-50 p-4 text-blue-700"><Bot className="h-8 w-8" /></div>
                  <h2 className="mt-5 text-xl font-semibold text-slate-950">问报告库，而不是问空气</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-500">回答只使用当前服务器已索引的 Strategy 报告，并在下方列出可点击来源。</p>
                  <div className="mt-5 grid w-full gap-2">{prompts.map((prompt) => <button key={prompt} disabled={!status.data.configured} onClick={() => setQuestion(prompt)} className="min-h-12 rounded-xl border border-slate-200 px-4 text-left text-sm text-slate-700 transition hover:border-blue-300 disabled:opacity-50">{prompt}</button>)}</div>
                </div>
              ) : chat.messages.map((message) => <Message key={message.id} message={message} />)}
              {chat.error ? <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{chat.error}</p> : null}
            </div>
            <form onSubmit={submit} className="border-t border-slate-200 bg-slate-50/70 p-3 sm:p-4">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} className="min-h-12 flex-1 resize-none px-2 py-2 text-sm leading-6 outline-none" placeholder={status.data.configured ? '输入问题，Shift+Enter 换行' : '请先配置 AI 服务'} disabled={!status.data.configured} />
                {chat.streaming ? <button type="button" onClick={chat.stop} className="min-h-11 min-w-11 rounded-xl bg-rose-100 p-3 text-rose-700" aria-label="停止生成"><Square className="h-4 w-4" /></button> : <button disabled={!status.data.configured || !question.trim()} className="min-h-11 min-w-11 rounded-xl bg-blue-600 p-3 text-white disabled:opacity-40" aria-label="发送问题"><Send className="h-4 w-4" /></button>}
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">AI 可能理解错误，请通过来源回到原文核对；不构成投资建议。</p>
            </form>
          </section>
        </div>
      ) : null}
      <AiConfigDialog open={configOpen} status={status.data} onClose={() => setConfigOpen(false)} onSaved={(next) => status.setData(next)} />
    </Layout>
  );
}

function Message({ message }: { message: ChatMessage }) {
  return (
    <div className={message.role === 'user' ? 'ml-auto max-w-2xl' : 'mr-auto max-w-3xl'}>
      <div className={`rounded-2xl p-4 text-sm leading-7 ${message.role === 'user' ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
        <div className="whitespace-pre-wrap">{message.content || (message.pending ? '正在阅读相关报告…' : '')}</div>
        {message.pending ? <span className="mt-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" /> : null}
      </div>
      {message.sources?.length ? <SourceList sources={message.sources} /> : null}
    </div>
  );
}

function SourceList({ sources }: { sources: AiSource[] }) {
  return <div className="mt-2 flex flex-wrap gap-2">{sources.map((source, index) => <Link key={source.id} to={buildReportLink({ reportId: source.reportId, lineNumber: source.lineNumber, highlightTerms: [source.securityName ?? ''].filter(Boolean) })} title={source.excerpt} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700">[{index + 1}] {source.date} · {source.institution} · 第 {source.lineNumber} 行</Link>)}</div>;
}
