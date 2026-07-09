import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-slate-200/70 bg-white/78 p-5 shadow-sm backdrop-blur ${className}`}>
      {(title || eyebrow || action) && (
        <div className="mb-4 flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            {eyebrow ? <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">{eyebrow}</div> : null}
            {title ? <h2 className="text-lg font-semibold text-slate-950">{title}</h2> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value?: string | number; hint?: string }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-stone-50 p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value ?? '-'}</div>
      {hint ? <div className="mt-2 text-xs leading-5 text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'amber' | 'green' | 'red' }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function LoadingBlock({ label = '正在整理报告索引...' }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-[28px] border border-dashed border-slate-300 bg-white/60 text-slate-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p> : null}
    </div>
  );
}
