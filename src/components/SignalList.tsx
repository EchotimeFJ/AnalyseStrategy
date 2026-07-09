import { Link } from 'react-router-dom';
import type { SignalItem, TargetChange, TargetMention } from '@/types';
import { Badge } from '@/components/ui';

export function MentionCard({ mention }: { mention: TargetMention }) {
  return (
    <Link
      to={`/reports?id=${encodeURIComponent(mention.reportId)}`}
      className="block rounded-2xl border border-slate-200 bg-white/70 p-4 transition hover:border-amber-300 hover:shadow-md"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="amber">{mention.date}</Badge>
        <Badge tone="blue">{mention.institution}</Badge>
        {mention.rating ? <Badge tone="green">{mention.rating}</Badge> : null}
        {mention.targetPrice ? <Badge tone="slate">目标价 {mention.targetPrice}</Badge> : null}
      </div>
      <div className="mt-3 font-medium text-slate-950">{mention.targetName}</div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{mention.excerpt}</p>
    </Link>
  );
}

export function SignalCard({ item }: { item: SignalItem }) {
  const tone = item.type === 'risk' ? 'red' : item.type === 'catalyst' ? 'green' : 'blue';
  return (
    <Link
      to={`/reports?id=${encodeURIComponent(item.reportId)}`}
      className="block rounded-2xl border border-slate-200 bg-white/70 p-4 transition hover:border-sky-300 hover:shadow-md"
    >
      <div className="flex flex-wrap gap-2">
        <Badge tone={tone}>{labelForSignal(item.type)}</Badge>
        <Badge tone="slate">{item.date}</Badge>
        <Badge tone="blue">{item.institution}</Badge>
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-950">{item.title}</div>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>
    </Link>
  );
}

export function ChangeRow({ change }: { change: TargetChange }) {
  return (
    <Link
      to={`/reports?id=${encodeURIComponent(change.reportId)}`}
      className="grid gap-3 rounded-2xl border border-slate-200 bg-white/70 p-4 text-sm transition hover:border-amber-300 hover:shadow-md md:grid-cols-[120px_1fr_160px]"
    >
      <div>
        <div className="font-semibold text-slate-950">{change.date}</div>
        <div className="mt-1 text-xs text-slate-500">{change.institution}</div>
      </div>
      <div>
        <div className="font-semibold text-slate-950">{change.targetName}</div>
        <div className="mt-1 text-slate-600">
          {change.previousRating || '-'} → {change.currentRating || '-'}
        </div>
      </div>
      <div>
        <Badge tone="amber">{change.changeType}</Badge>
        <div className="mt-2 text-xs text-slate-500">
          {change.previousTargetPrice || '-'} → {change.currentTargetPrice || '-'}
        </div>
      </div>
    </Link>
  );
}

function labelForSignal(type: SignalItem['type']) {
  const labels = {
    catalyst: '催化剂',
    risk: '风险',
    valuation: '估值',
    financial: '财务',
    macro: '宏观',
  };
  return labels[type];
}
