import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { apiGet, queryString } from '@/lib/api';
import type { CompanyProfile, OpinionRecord } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { buildReportLink } from '@/lib/reportLinks';

export default function Targets() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const value = params.get('q');
    if (value) void loadProfile(value);
    // URL 是首页和搜索页跳转到公司研究的输入源。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(value = query) {
    const nextQuery = value.trim();
    if (!nextQuery) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiGet<CompanyProfile[]>(`/api/companies${queryString({ q: nextQuery })}`);
      setProfiles(data);
      setQuery(nextQuery);
      setParams({ q: nextQuery });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadProfile();
  }

  const profile = profiles[0];
  return (
    <Layout>
      <PageHeader eyebrow="Company Research" title="公司研究" description="公司身份优先按上市代码归并，别名和报告中的不同写法会保留为可追溯证据。" />
      <Panel title="查找公司" eyebrow="Company query">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-4 top-4 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none focus:border-blue-400" placeholder="公司名称、别名或代码，例如 1768.HK" /></div>
          <button className="min-h-12 rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white transition hover:bg-blue-700">查看研究</button>
        </form>
      </Panel>

      <div className="mt-6 space-y-6">
        {loading ? <LoadingBlock label="正在归并公司历史观点…" /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {!loading && !error && profiles.length > 1 ? (
          <Panel title="找到多个匹配公司" eyebrow="Matches"><div className="flex flex-wrap gap-2">{profiles.slice(0, 10).map((item) => <button key={item.security.key} onClick={() => { setProfiles([item]); setQuery(item.security.code ?? item.security.displayName); }} className="min-h-10 rounded-full border border-slate-200 px-4 text-sm hover:border-blue-300">{item.security.displayName} {item.security.code}</button>)}</div></Panel>
        ) : null}
        {profile ? <CompanyProfileView profile={profile} /> : !loading && !error ? <EmptyState title="输入公司开始研究" description="输入名称、历史别名或上市代码，查看机构观点时间线。" /> : null}
      </div>
    </Layout>
  );
}

function CompanyProfileView({ profile }: { profile: CompanyProfile }) {
  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div><div className="flex items-center gap-2 text-sm font-semibold text-blue-700"><Building2 className="h-4 w-4" />稳定公司档案</div><h2 className="mt-3 text-3xl font-semibold text-slate-950">{profile.security.displayName}</h2><div className="mt-2 text-sm text-slate-500">{profile.security.code ?? '未识别上市代码'}</div></div>
          <div className="flex flex-wrap gap-2">{profile.security.aliases.slice(0, 8).map((alias) => <Badge key={alias} tone="slate">{alias}</Badge>)}</div>
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="最新评级" value={profile.latestRating ?? '—'} hint={`更新于 ${profile.latestMention ?? '-'}`} />
        <StatCard label="最新目标价" value={profile.latestTargetPrice ?? '—'} hint="保留报告原始币种与单位" />
        <StatCard label="覆盖机构" value={profile.institutions.length} hint={profile.institutions.slice(0, 5).join('、')} />
        <StatCard label="历史观点" value={profile.opinions.length} hint={`${profile.firstMention ?? '-'} 至 ${profile.latestMention ?? '-'}`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="观点时间线" eyebrow="Opinion history"><div className="space-y-3">{profile.opinions.map((opinion) => <OpinionHistory key={opinion.id} opinion={opinion} />)}</div></Panel>
        <Panel title="机构最新观点" eyebrow="Institution matrix"><div className="space-y-3">{latestByInstitution(profile.opinions).map((opinion) => <OpinionHistory key={opinion.id} opinion={opinion} compact />)}</div></Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="催化剂" eyebrow="Catalysts">{profile.catalysts.length ? <div className="space-y-3">{profile.catalysts.map((item) => <OpinionHistory key={item.id} opinion={item} compact />)}</div> : <EmptyState title="暂无明确催化剂" />}</Panel>
        <Panel title="风险" eyebrow="Risks">{profile.risks.length ? <div className="space-y-3">{profile.risks.map((item) => <OpinionHistory key={item.id} opinion={item} compact />)}</div> : <EmptyState title="暂无明确风险" />}</Panel>
      </div>
    </>
  );
}

function OpinionHistory({ opinion, compact = false }: { opinion: OpinionRecord; compact?: boolean }) {
  const source = opinion.evidence[0];
  return (
    <Link to={buildReportLink({ reportId: opinion.reportId, lineNumber: source?.lineNumber, highlightTerms: [opinion.security.displayName] })} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:shadow-sm">
      <div className="flex flex-wrap gap-2"><Badge tone="amber">{opinion.reportDate}</Badge><Badge tone="blue">{opinion.institution}</Badge>{opinion.rating ? <Badge tone={opinion.types.includes('positive') ? 'green' : 'slate'}>{opinion.rating}</Badge> : null}{opinion.targetPrice ? <Badge tone="slate">{opinion.targetPrice}</Badge> : null}</div>
      {!compact ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{source?.excerpt}</p> : null}
    </Link>
  );
}

function latestByInstitution(opinions: OpinionRecord[]) {
  return [...new Map(opinions.map((opinion) => [opinion.institution, opinion])).values()];
}
