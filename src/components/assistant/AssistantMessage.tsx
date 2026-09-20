import { useState } from 'react';
import { AlertCircle, Bot, Check, Copy, RefreshCw, Square } from 'lucide-react';
import { createRemarkChatCitations } from '@/lib/chatCitations';
import type { ChatMessage, ChatPhase } from '@/hooks/useAiChat';
import { MarkdownContent } from '@/components/MarkdownContent';
import { AssistantSources } from './AssistantSources';

const phaseLabels: Record<Exclude<ChatPhase, 'idle'>, string> = {
  retrieving: '正在检索相关报告',
  analyzing: '已找到来源，正在分析',
  generating: '正在整理回答',
};

export function AssistantMessage({
  message,
  phase,
  onRetry,
  onStop,
}: {
  message: ChatMessage;
  phase: ChatPhase;
  onRetry: () => void;
  onStop: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (message.role === 'user') {
    return (
      <div className="assistant-message-enter ml-auto flex max-w-[88%] justify-end sm:max-w-[78%]">
        <div className="rounded-[22px] rounded-br-md bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-3 text-sm leading-7 text-white shadow-lg shadow-blue-950/10">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  const sources = message.sources ?? [];
  const activePhase = phase === 'idle' ? 'generating' : phase;

  async function copy() {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="assistant-message-enter flex max-w-4xl items-start gap-3">
      <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md sm:flex">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <MarkdownContent
            markdown={message.content}
            variant="assistant"
            className="assistant-markdown text-[15px] leading-7 text-slate-700"
            internalLinkClassName="assistant-citation"
            remarkPlugins={[createRemarkChatCitations(sources)]}
            trailing={message.pending ? <span className="assistant-stream-caret" aria-label="正在生成" /> : null}
          />
        ) : message.pending ? (
          <div className="assistant-thinking" role="status">
            <span className="assistant-thinking-orb" />
            <span>{phaseLabels[activePhase]}</span>
            <span className="assistant-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        ) : null}

        {message.error ? (
          <div className={`mt-3 flex items-start gap-2.5 rounded-2xl border p-3 text-sm ${message.failed ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div>{message.error}</div>
              <button type="button" onClick={onRetry} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm">
                <RefreshCw className="h-3.5 w-3.5" />重新生成
              </button>
            </div>
          </div>
        ) : null}

        <AssistantSources sources={sources} />

        {message.content ? (
          <div className="mt-2 flex min-h-9 items-center gap-1 text-slate-400">
            {message.pending ? (
              <button type="button" onClick={onStop} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-slate-100 hover:text-slate-700">
                <Square className="h-3.5 w-3.5" />停止
              </button>
            ) : (
              <>
                <button type="button" onClick={() => void copy()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-slate-100 hover:text-slate-700">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{copied ? '已复制' : '复制'}
                </button>
                <button type="button" onClick={onRetry} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs hover:bg-slate-100 hover:text-slate-700">
                  <RefreshCw className="h-3.5 w-3.5" />重新生成
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
