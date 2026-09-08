import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BuyReference, OpinionRecord, OpinionType, ReportOverview } from '@/types';
import { Badge, EmptyState } from '@/components/ui';
import { buildReportLink } from '@/lib/reportLinks';
import { isBuyOpinion as isBuy } from '@/lib/opinionPredicates';

type Filter = 'buy' | 'positive' | 'all' | 'change' | 'risk' | 'catalyst';

export function ReportOpinionTable({ overview }: { overview: ReportOverview }) {
  const [filter, setFilter] = useState<Filter>('buy');
  const opinions = useMemo(() => overview.opinions.filter((opinion) => matches(opinion, filter)), [filter, overview.opinions]);
  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'buy', label: `明确买入 ${overview.opinions.filter(isBuy).length}` },
    { id: 'positive', label: `积极观点 ${overview.positiveCount}` },
    { id: 'all', label: `全部 ${overview.opinions.length}` },
    { id: 'change', label: `变化 ${overview.opinions.filter((opinion) => matches(opinion, 'change')).length}` },
    { id: 'risk', label: `风险 ${overview.riskCount}` },
    { id: 'catalyst', label: `催化剂 ${overview.catalystCount}` },
  ];

  return (
    <div>
      {overview.buyCoverage ? <p className="mb-3 text-xs leading-6 text-slate-500">
        本报告已确认 {overview.buyCoverage.companyCount} 家公司的 {overview.opinions.filter(isBuy).length} 条买入评级或明确买入建议。同一公司不同市场的评级分别列出。
      </p> : null}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button key={item.id} onClick={() => setFilter(item.id)} className={`min-h-10 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition ${filter === item.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>
        ))}
      </div>
      {opinions.length ? (
        <div className="report-opinion-table overflow-hidden rounded-2xl border border-slate-200">
          <div className="report-opinion-header gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            <div>公司</div><div>机构</div><div>评级</div><div>目标价</div><div>来源</div>
          </div>
          {opinions.map((opinion) => <OpinionRow key={opinion.id} opinion={opinion} />)}
        </div>
      ) : <EmptyState title="此筛选暂无已确认观点" description="可以查看待核对原文，或切换到“全部”查看其他观点。" />}
      {overview.buyCoverage?.review.length ? <ReferenceDetails reportId={overview.reportId} items={overview.buyCoverage.review} title={`${overview.buyCoverage.review.length} 处买入相关原文尚需核对`} /> : null}
      {overview.buyCoverage?.other.length ? <ReferenceDetails reportId={overview.reportId} items={overview.buyCoverage.other} title={`${overview.buyCoverage.other.length} 处其他买入相关表述`} /> : null}
    </div>
  );
}

function OpinionRow({ opinion }: { opinion: OpinionRecord }) {
  const source = opinion.evidence[0];
  const name = opinion.sourceName ?? opinion.security.displayName;
  const highlighted = [name, opinion.security.code, opinion.security.code?.split('.')[0]].find((term) => term && source?.excerpt.includes(term));
  const highlights = [highlighted ?? (isBuy(opinion) ? '买入' : opinion.rating ?? name)];
  const sourceCode = opinion.security.code ?? opinion.security.aliases.find((alias) => /^[A-Z]{1,6}$/.test(alias));
  const link = buildReportLink({ reportId: opinion.reportId, lineNumber: source?.lineNumber, highlightTerms: highlights });
  return (
    <div className="report-opinion-row gap-3 border-t border-slate-100 p-4 first:border-t-0">
      <div className="report-opinion-company min-w-0"><Link to={link} className="break-words font-semibold text-slate-950 hover:text-blue-700">{name}</Link><div className="mt-1 break-words text-xs text-slate-500">{sourceCode ?? '原文未标明代码'}</div></div>
      <div className="text-sm text-slate-600">{opinion.institution}</div>
      <div>{opinion.ratingAlternatives?.length ? <Badge tone="amber">评级待核对</Badge> : opinion.rating ? <Badge tone={opinion.types.includes('positive') ? 'green' : 'slate'}>{opinion.rawRating ?? opinion.rating}</Badge> : <span className="text-xs text-slate-400">—</span>}
        {opinion.buyRecommendation && opinion.rating !== '买入' ? <div className="mt-1 text-xs text-slate-500">原文建议买入</div> : null}
      </div>
      <div className="text-sm text-slate-600">{opinion.targetPrice ?? '—'}</div>
      <Link to={link} className="report-opinion-source text-sm font-semibold text-blue-700 hover:text-blue-800">第 {source?.lineNumber ?? '-'} 行</Link>
    </div>
  );
}

function matches(opinion: OpinionRecord, filter: Filter) {
  if (filter === 'buy') return isBuy(opinion);
  if (filter === 'all') return true;
  if (filter === 'change') return opinion.types.some((type: OpinionType) => type === 'rating-change' || type === 'target-price-change');
  return opinion.types.includes(filter);
}

function ReferenceDetails({ reportId, items, title }: { reportId: string; items: BuyReference[]; title: string }) {
  return <details className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
    <summary className="cursor-pointer text-sm font-semibold text-amber-900">{title}</summary>
    <div className="mt-3 space-y-3">
      {items.map((item) => <div key={`${item.lineNumber}:${item.startColumn}`} className="rounded-xl bg-white/70 p-3 text-sm leading-6 text-slate-700">
        <Link to={buildReportLink({ reportId, lineNumber: item.lineNumber, highlightTerms: ['买入'] })} className="font-semibold text-blue-700">第 {item.lineNumber} 行</Link>
        <span className="ml-3 text-xs text-slate-500">{item.reason}</span>
        <p className="mt-1 break-words">{item.excerpt}</p>
      </div>)}
    </div>
  </details>;
}
