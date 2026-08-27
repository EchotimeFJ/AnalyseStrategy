import { FormEvent, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { OpinionRecord, TodayOverview } from '@/types';
import { Layout } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { UpdateDataMenu } from '@/components/UpdateDataMenu';
import { formatDateTime } from '@/lib/format';
import { buildReportLink } from '@/lib/reportLinks';

export default function Dashboard() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const overview = useAsyncData(() => apiGet<TodayOverview>('/api/overview'), [revision]);

  function search(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <Layout>
      <section className="overflow-visible rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700"><CalendarDays className="h-4 w-4" />今日研究工作台</div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">先看今天最值得注意的观点</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">报告速览、买入观点和公司历史已经按来源整理好。所有结论都可以回到原文核对。</p>
          </div>
          <UpdateDataMenu onUpdated={() => setRevision((value) => value + 1)} />
        </div>
        <form onSubmit={search} className="mt-6 flex max-w-3xl gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-400 focus-within:bg-white">
          <Search className="ml-2 mt-2.5 h-5 w-5 shrink-0 text-slate-400" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" placeholder="搜索公司、代码、机构或报告关键词" aria-label="全局搜索" />
          <button className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700">检索</button>
        </form>
        {overview.data ? (
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>最新报告 {overview.data.latestDate ?? '-'}</span>
            <span>索引于 {formatDateTime(overview.data.indexedAt)} 更新</span>
            <span className={overview.data.errorCount ? 'text-amber-700' : 'text-emerald-700'}>{overview.data.errorCount ? `${overview.data.errorCount} 个读取问题` : '数据状态正常'}</span>
          </div>
        ) : null}
      </section>

      <div className="mt-6">
        {overview.loading ? <LoadingBlock label="正在整理今日研究内容…" /> : null}
        {overview.error ? <ErrorBlock message={overview.error} /> : null}
      </div>

      {overview.data ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="报告库" value={overview.data.reportCount} hint={`最新 ${overview.data.latestDate ?? '-'}`} />
            <StatCard label="有效公司" value={overview.data.securityCount} hint="优先按上市代码归并" />
            <StatCard label="结构化观点" value={overview.data.opinionCount} hint="含评级、目标价、风险与催化剂" />
            <StatCard label="数据质量" value={overview.data.qualityIssueCount ? '待检查' : '良好'} hint={`${overview.data.qualityIssueCount} 个待识别项`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Panel title="最新买入与积极观点" eyebrow="Positive opinions">
              {overview.data.positiveOpinions.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {overview.data.positiveOpinions.slice(0, 10).map((opinion) => <OpinionCard key={opinion.id} opinion={opinion} />)}
                </div>
              ) : <EmptyState title="暂无明确积极观点" description="报告原文仍可在报告库中查看。" />}
            </Panel>

            <Panel title="日报速览" eyebrow="Report digest" action={<Link className="text-sm font-semibold text-blue-700" to="/reports">查看全部</Link>}>
              <div className="space-y-3">
                {overview.data.reportOverviews.slice(0, 8).map((report) => (
                  <Link key={report.reportId} to={`/reports?id=${encodeURIComponent(report.reportId)}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                    <div className="flex items-center justify-between gap-3"><div className="font-semibold text-slate-950">{report.date}</div><div className="text-xs text-slate-500">{report.securities.length} 家公司</div></div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.positiveCount ? <Badge tone="green">积极 {report.positiveCount}</Badge> : null}
                      {report.ratingChangeCount ? <Badge tone="blue">评级变化 {report.ratingChangeCount}</Badge> : null}
                      {report.targetPriceChangeCount ? <Badge tone="amber">目标价变化 {report.targetPriceChangeCount}</Badge> : null}
                      {report.riskCount ? <Badge tone="red">风险 {report.riskCount}</Badge> : null}
                    </div>
                    <div className="mt-3 line-clamp-2 text-xs leading-6 text-slate-500">{report.securities.slice(0, 8).map((item) => item.displayName).join(' · ') || '暂无高置信公司识别'}</div>
                  </Link>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="接下来可以做什么" eyebrow="Shortcuts">
            <div className="grid gap-3 md:grid-cols-3">
              <Shortcut icon={<Sparkles />} title="看单家公司历史" description="汇总不同机构的评级、目标价和风险" to="/company" />
              <Shortcut icon={<Search />} title="按报告聚合搜索" description="减少重复行，保留严格原文模式" to="/search" />
              <Shortcut icon={<ShieldCheck />} title="检查数据质量" description="查看待识别机构和解析问题" to="/manage" />
            </div>
          </Panel>
        </div>
      ) : null}
    </Layout>
  );
}

function OpinionCard({ opinion }: { opinion: OpinionRecord }) {
  const source = opinion.evidence[0];
  return (
    <Link to={buildReportLink({ reportId: opinion.reportId, lineNumber: source?.lineNumber, highlightTerms: [opinion.security.displayName, opinion.security.code ?? ''].filter(Boolean) })} className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-emerald-300 hover:bg-white hover:shadow-md">
      <div className="flex flex-wrap gap-2"><Badge tone="green">{opinion.rating ?? '积极观点'}</Badge><Badge tone="blue">{opinion.institution}</Badge><Badge tone="slate">{opinion.reportDate}</Badge></div>
      <div className="mt-3 font-semibold text-slate-950">{opinion.security.displayName}</div>
      <div className="mt-1 text-xs text-slate-500">{opinion.security.code ?? '未识别代码'}{opinion.targetPrice ? ` · 目标价 ${opinion.targetPrice}` : ''}</div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{source?.excerpt.replace(/==/g, '')}</p>
    </Link>
  );
}

function Shortcut({ icon, title, description, to }: { icon: ReactNode; title: string; description: string; to: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40">
      <div className="flex items-center justify-between text-blue-700"><span className="[&>svg]:h-5 [&>svg]:w-5">{icon}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
      <div className="mt-4 font-semibold text-slate-950">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
    </Link>
  );
}
