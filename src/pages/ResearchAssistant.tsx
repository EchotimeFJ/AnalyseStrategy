import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useAiChat, type ChatSession } from '@/hooks/useAiChat';
import type { AiStatus, TodayOverview } from '@/types';
import { Layout } from '@/components/Layout';
import { AiConfigDialog } from '@/components/AiConfigDialog';
import { ErrorBlock, LoadingBlock } from '@/components/ui';
import { AssistantMessage } from '@/components/assistant/AssistantMessage';
import { ChatComposer } from '@/components/assistant/ChatComposer';

const prompts = [
  { title: '最新报告速览', prompt: '今天是多少号？请分析最新报告里最值得关注的内容，并说明报告库更新到哪一天。' },
  { title: '买入股票清单', prompt: '汇总最新报告中明确写了买入、增持或首选的股票，按公司列出理由、催化剂和风险。' },
  { title: '机构共同看好', prompt: '最近一周有哪些公司同时被多家机构看好？请比较观点并标注来源。' },
  { title: '风险与催化剂', prompt: '汇总最近一周报告中的主要催化剂和风险，按重要性排序。' },
];

export default function ResearchAssistant() {
  const status = useAsyncData(() => apiGet<AiStatus>('/api/ai/status'), []);
  const overview = useAsyncData(() => apiGet<TodayOverview>('/api/overview'), []);
  const chat = useAiChat();
  const [question, setQuestion] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [security, setSecurity] = useState('');
  const [institution, setInstitution] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowRef = useRef(true);
  const activeSession = chat.sessions.find((session) => session.id === chat.activeSessionId) ?? chat.sessions[0];
  const scope = useMemo(() => {
    const securityValue = security.trim();
    return {
      from: from || undefined,
      to: to || undefined,
      securityKey: securityValue && /\.[a-z]{1,3}$/i.test(securityValue) ? `code:${securityValue.toUpperCase()}` : undefined,
      institution: institution.trim() || undefined,
    };
  }, [from, to, security, institution]);
  const activeFilterCount = Object.values(scope).filter(Boolean).length;

  useEffect(() => {
    if (!shouldFollowRef.current || !scrollRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: chat.phase === 'generating' ? 'auto' : 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chat.messages, chat.phase]);

  function ask(value = question) {
    if (!status.data?.configured || !value.trim() || chat.streaming) return;
    shouldFollowRef.current = true;
    setQuestion('');
    void chat.send(value, scope);
  }

  if (status.loading) return <Layout><LoadingBlock label="正在准备研究助手…" /></Layout>;
  if (status.error) return <Layout><ErrorBlock message={status.error} /></Layout>;

  return (
    <Layout>
      <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[640px] max-w-[1360px] gap-4 lg:h-[calc(100dvh-4rem)]">
        <div className="hidden w-[258px] shrink-0 lg:block">
          <ConversationRail
            sessions={chat.sessions}
            activeSessionId={chat.activeSessionId}
            configured={Boolean(status.data?.configured)}
            provider={status.data?.providerName || ''}
            model={status.data?.model || ''}
            onNew={chat.newChat}
            onSelect={chat.selectSession}
            onDelete={chat.deleteSession}
            onConfig={() => setConfigOpen(true)}
          />
        </div>

        {historyOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setHistoryOpen(false)} aria-label="关闭会话列表" />
            <div className="assistant-drawer-enter relative h-full w-[86vw] max-w-[320px] p-3">
              <ConversationRail
                sessions={chat.sessions}
                activeSessionId={chat.activeSessionId}
                configured={Boolean(status.data?.configured)}
                provider={status.data?.providerName || ''}
                model={status.data?.model || ''}
                onNew={() => { chat.newChat(); setHistoryOpen(false); }}
                onSelect={(id) => { chat.selectSession(id); setHistoryOpen(false); }}
                onDelete={chat.deleteSession}
                onConfig={() => { setConfigOpen(true); setHistoryOpen(false); }}
                onClose={() => setHistoryOpen(false)}
              />
            </div>
          </div>
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <header className="relative z-10 border-b border-slate-200 bg-white/90 px-3 py-3 backdrop-blur-xl sm:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <button type="button" onClick={() => setHistoryOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 lg:hidden" aria-label="打开会话列表"><Menu className="h-4 w-4" /></button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md"><Sparkles className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">{activeSession?.title || '研究助手'}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${status.data?.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {status.data?.configured ? `${status.data.providerName} · ${status.data.model}` : '等待配置 AI 服务'}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => setFiltersOpen((value) => !value)} className={`relative flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${filtersOpen || activeFilterCount ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`} aria-expanded={filtersOpen} aria-label="检索范围">
                  <SlidersHorizontal className="h-4 w-4" /><span className="hidden sm:inline">检索范围</span>
                  {activeFilterCount ? <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] text-white">{activeFilterCount}</span> : null}
                </button>
                <button type="button" onClick={() => setConfigOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="配置研究助手"><Settings2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className={`assistant-filter-grid ${filtersOpen ? 'assistant-filter-grid-open' : ''}`} aria-hidden={!filtersOpen}>
              <div className="pt-3">
                <div className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
                  <FilterField label="开始日期"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} disabled={!filtersOpen} /></FilterField>
                  <FilterField label="结束日期"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} disabled={!filtersOpen} /></FilterField>
                  <FilterField label="公司代码"><input value={security} onChange={(event) => setSecurity(event.target.value)} placeholder="如 1768.HK" disabled={!filtersOpen} /></FilterField>
                  <FilterField label="研究机构"><input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="如 高盛" disabled={!filtersOpen} /></FilterField>
                  {activeFilterCount ? (
                    <button type="button" tabIndex={filtersOpen ? 0 : -1} onClick={() => { setFrom(''); setTo(''); setSecurity(''); setInstitution(''); }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 sm:col-span-2 xl:col-span-4 xl:justify-self-end">
                      <X className="h-3.5 w-3.5" />清除范围
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          <div
            ref={scrollRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              shouldFollowRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 140;
            }}
            className="assistant-scrollbar flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-7"
          >
            <div className="mx-auto flex min-h-full max-w-4xl flex-col">
              {!chat.messages.length ? (
                <EmptyAssistant
                  configured={Boolean(status.data?.configured)}
                  latestDate={overview.loading ? '正在读取' : overview.data?.latestDate || '暂不可用'}
                  onPrompt={(prompt) => ask(prompt)}
                  onConfig={() => setConfigOpen(true)}
                />
              ) : (
                <div className="space-y-6 pb-4">
                  {chat.messages.map((message) => (
                    <AssistantMessage
                      key={message.id}
                      message={message}
                      phase={message.pending ? chat.phase : 'idle'}
                      onRetry={() => void chat.retry(message.id, scope)}
                      onStop={chat.stop}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <ChatComposer
            value={question}
            onChange={setQuestion}
            onSubmit={() => ask()}
            streaming={chat.streaming}
            onStop={chat.stop}
            disabled={!status.data?.configured}
          />
        </section>
      </div>
      <AiConfigDialog open={configOpen} status={status.data} onClose={() => setConfigOpen(false)} onSaved={(next) => status.setData(next)} />
    </Layout>
  );
}

function EmptyAssistant({
  configured,
  latestDate,
  onPrompt,
  onConfig,
}: {
  configured: boolean;
  latestDate: string;
  onPrompt: (prompt: string) => void;
  onConfig: () => void;
}) {
  return (
    <div className="my-auto flex flex-1 flex-col items-center justify-center py-6 text-center sm:py-10">
      <div className="assistant-hero-orb"><Bot className="h-8 w-8" /></div>
      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 shadow-sm">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />报告库最新：{latestDate}
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">想从报告里了解什么？</h1>
      <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">我会先找到相关原文，再为你整理买入观点、变化、催化剂和风险。每个结论都能回到报告核对。</p>
      {configured ? (
        <div className="mt-7 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
          {prompts.map((item) => (
            <button key={item.title} type="button" onClick={() => onPrompt(item.prompt)} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg">
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>{item.title}</span><Sparkles className="h-4 w-4 text-blue-500 opacity-60 transition group-hover:opacity-100" /></span>
              <span className="mt-2 block text-xs leading-5 text-slate-500">{item.prompt}</span>
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={onConfig} className="mt-7 min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20">配置 AI 服务</button>
      )}
    </div>
  );
}

function ConversationRail({
  sessions,
  activeSessionId,
  configured,
  provider,
  model,
  onNew,
  onSelect,
  onDelete,
  onConfig,
  onClose,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  configured: boolean;
  provider: string;
  model: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onConfig: () => void;
  onClose?: () => void;
}) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white/95 p-3 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between px-1 py-1">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">Research AI</div><div className="mt-1 text-base font-semibold text-slate-950">研究助手</div></div>
        {onClose ? <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-label="关闭"><PanelLeftClose className="h-4 w-4" /></button> : null}
      </div>
      <button type="button" onClick={onNew} className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5">
        <MessageSquarePlus className="h-4 w-4" />新对话
      </button>
      <div className="mt-4 flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400"><span>最近对话</span><span>{sessions.length}/12</span></div>
      <div className="assistant-scrollbar mt-2 flex-1 space-y-1 overflow-y-auto pr-1">
        {sessions.map((session) => (
          <div key={session.id} className={`group relative rounded-xl transition ${session.id === activeSessionId ? 'bg-blue-50' : 'hover:bg-slate-100'}`}>
            <button type="button" onClick={() => onSelect(session.id)} className="min-h-14 w-full px-3 py-2.5 pr-10 text-left">
              <span className={`block truncate text-xs font-semibold ${session.id === activeSessionId ? 'text-blue-700' : 'text-slate-700'}`}>{session.title}</span>
              <span className="mt-1 block text-[10px] text-slate-400">{formatSessionTime(session.updatedAt)}</span>
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onDelete(session.id); }} className="absolute right-1.5 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 opacity-100 transition hover:bg-white hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100" aria-label={`删除会话 ${session.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />{configured ? 'AI 服务正常' : 'AI 尚未配置'}</div>
        {configured ? <div className="mt-2 truncate text-[10px] text-slate-500">{provider} · {model}</div> : null}
        <button type="button" onClick={onConfig} className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600"><Settings2 className="h-3.5 w-3.5" />全局配置</button>
      </div>
    </aside>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) {
  return <label><span className="mb-1.5 block text-[10px] font-semibold text-slate-500">{label}</span><div className="[&_input]:min-h-10 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-xs [&_input]:outline-none [&_input]:focus:border-blue-400">{children}</div></label>;
}

function formatSessionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
