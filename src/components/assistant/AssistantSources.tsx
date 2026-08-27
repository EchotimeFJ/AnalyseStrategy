import { useState } from 'react';
import { BookOpenText, ChevronDown, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { buildReportLink } from '@/lib/reportLinks';
import type { AiSource } from '@/types';

export function AssistantSources({ sources }: { sources: AiSource[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100"
      >
        <span className="flex items-center gap-2"><BookOpenText className="h-4 w-4 text-blue-600" />参考了 {sources.length} 处报告原文</span>
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`assistant-source-grid ${open ? 'assistant-source-grid-open' : ''}`} aria-hidden={!open}>
        <div className="space-y-2 border-t border-slate-200 p-2.5">
          {sources.map((source, index) => (
            <Link
              key={source.id}
              tabIndex={open ? 0 : -1}
              to={buildReportLink({
                reportId: source.reportId,
                lineNumber: source.lineNumber,
                highlightTerms: [source.securityName ?? undefined],
              })}
              className="group flex min-h-14 items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-lg bg-blue-50 text-[11px] font-bold text-blue-700">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-slate-800">{source.securityName || '报告观点'} · {source.institution}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{source.date} · 第 {source.lineNumber} 行</span>
              </span>
              <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
