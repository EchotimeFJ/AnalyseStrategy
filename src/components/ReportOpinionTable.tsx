import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { OpinionRecord, OpinionType, ReportOverview } from '@/types';
import { Badge, EmptyState } from '@/components/ui';
import { buildReportLink } from '@/lib/reportLinks';

type Filter = 'positive' | 'all' | 'change' | 'risk' | 'catalyst';

export function ReportOpinionTable({ overview }: { overview: ReportOverview }) {
  const [filter, setFilter] = useState<Filter>('positive');
  const opinions = useMemo(() => overview.opinions.filter((opinion) => matches(opinion, filter)), [filter, overview.opinions]);
  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'positive', label: `积极观点 ${overview.positiveCount}` },
    { id: 'all', label: `全部 ${overview.opinions.length}` },
    { id: 'change', label: `变化 ${overview.ratingChangeCount + overview.targetPriceChangeCount}` },
    { id: 'risk', label: `风险 ${overview.riskCount}` },
    { id: 'catalyst', label: `催化剂 ${overview.catalystCount}` },
  ];

  return (
    <div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((item) => (
          <button key={item.id} onClick={() => setFilter(item.id)} className={`min-h-10 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition ${filter === item.id ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>
        ))}
      </div>
      {opinions.length ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="hidden grid-cols-[minmax(150px,1.4fr)_110px_100px_120px_100px] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 md:grid">
            <div>公司</div><div>机构</div><div>评级</div><div>目标价</div><div>来源</div>
          </div>
          {opinions.map((opinion) => <OpinionRow key={opinion.id} opinion={opinion} />)}
        </div>
      ) : <EmptyState title="此筛选暂无观点" description="可以切换到“全部”查看报告内已识别公司。" />}
    </div>
  );
}

function OpinionRow({ opinion }: { opinion: OpinionRecord }) {
  const source = opinion.evidence[0];
  return (
    <div className="grid gap-3 border-t border-slate-100 p-4 first:border-t-0 md:grid-cols-[minmax(150px,1.4fr)_110px_100px_120px_100px] md:items-center">
      <div><div className="font-semibold text-slate-950">{opinion.security.displayName}</div><div className="mt-1 text-xs text-slate-500">{opinion.security.code ?? `无代码 · ${opinion.security.confidence === 'high' ? '高' : '待确认'}置信`}</div></div>
      <div className="text-sm text-slate-600">{opinion.institution}</div>
      <div>{opinion.rating ? <Badge tone={opinion.types.includes('positive') ? 'green' : 'slate'}>{opinion.rating}</Badge> : <span className="text-xs text-slate-400">—</span>}</div>
      <div className="text-sm text-slate-600">{opinion.targetPrice ?? '—'}</div>
      <Link to={buildReportLink({ reportId: opinion.reportId, lineNumber: source?.lineNumber, highlightTerms: [opinion.security.displayName] })} className="text-sm font-semibold text-blue-700 hover:text-blue-800">第 {source?.lineNumber ?? '-'} 行</Link>
    </div>
  );
}

function matches(opinion: OpinionRecord, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'change') return opinion.types.some((type: OpinionType) => type === 'rating-change' || type === 'target-price-change');
  return opinion.types.includes(filter);
}
