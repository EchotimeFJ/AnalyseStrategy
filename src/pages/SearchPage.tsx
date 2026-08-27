import { FormEvent, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { apiGet, queryString } from '@/lib/api';
import type { GroupedSearchResponse, SearchHit } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { buildReportLink, searchHitHighlightTerms } from '@/lib/reportLinks';

const ratingShortcuts = ['买入', '增持', '中性', '持有', '减持', '卖出'];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState(params.get('mode') ?? 'all');
  const [from, setFrom] = useState(params.get('from') ?? '');
  const [to, setTo] = useState(params.get('to') ?? '');
  const [strict, setStrict] = useState(params.get('raw') === 'true');
  const [result, setResult] = useState<GroupedSearchResponse | SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (params.get('q')) void runSearch(params.get('q') ?? '', params.get('mode') ?? 'all', params.get('raw') === 'true');
    // URL 参数是页面初次加载和首页跳转的恢复源。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(nextQuery = query, nextMode = mode, nextStrict = strict) {
    const value = nextQuery.trim();
    if (!value) {
      setResult(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const searchParams = { q: value, mode: nextMode, from, to, raw: nextStrict ? 'true' : undefined };
      const data = nextStrict
        ? await apiGet<SearchHit[]>(`/api/search${queryString(searchParams)}`)
        : await apiGet<GroupedSearchResponse>(`/api/search${queryString(searchParams)}`);
      setResult(data);
      setParams(searchParams as Record<string, string>);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  return (
    <Layout>
      <PageHeader eyebrow="Smart Search" title="智能检索" description="输入公司、代码、机构或普通关键词。默认按报告聚合相邻命中，避免同一段内容重复刷屏。" />
      <Panel title="搜索报告库" eyebrow="Query">
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[1fr_150px_140px_140px_auto]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-blue-400" placeholder="例如 1768.HK / 英诺赛科 / 中金 / 消费复苏" />
          </div>
          <select value={mode} onChange={(event) => setMode(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全部内容</option><option value="rating">评级</option><option value="target">目标价</option><option value="signal">风险/催化剂</option>
          </select>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="开始日期" />
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="结束日期" />
          <button className="min-h-12 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700">搜索</button>
        </form>
        <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {ratingShortcuts.map((rating) => <button key={rating} type="button" onClick={() => { setQuery(`${rating}评级`); setMode('rating'); void runSearch(`${rating}评级`, 'rating', strict); }} className="min-h-9 rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-200">{rating}</button>)}
          </div>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={strict} onChange={(event) => { setStrict(event.target.checked); if (query.trim()) void runSearch(query, mode, event.target.checked); }} />严格原文模式
          </label>
        </div>
      </Panel>

      <div className="mt-6">
        {loading ? <LoadingBlock label="正在检索报告…" /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {!loading && !error && result ? Array.isArray(result) ? <RawResults hits={result} query={query} /> : <GroupedResults result={result} query={query} /> : null}
        {!loading && !error && !result ? <EmptyState title="输入内容开始检索" description="搜索结果会按报告合并；需要逐行核对时再打开严格原文模式。" /> : null}
      </div>
    </Layout>
  );
}

function GroupedResults({ result, query }: { result: GroupedSearchResponse; query: string }) {
  const intentLabels = { 'security-code': '证券代码', 'security-name': '公司名称', institution: '机构', text: '原文关键词' };
  return (
    <div className="space-y-6">
      {result.company ? (
        <Link to={`/company?q=${encodeURIComponent(result.company.security.code ?? result.company.security.displayName)}`} className="block rounded-3xl border border-blue-200 bg-blue-50/50 p-5 transition hover:border-blue-400">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">公司匹配</Badge><Badge tone="slate">{result.company.security.code ?? '无代码'}</Badge></div>
          <div className="mt-3 text-xl font-semibold text-slate-950">{result.company.security.displayName}</div>
          <div className="mt-2 text-sm text-slate-600">最新评级 {result.company.latestRating ?? '—'} · 目标价 {result.company.latestTargetPrice ?? '—'} · {result.company.institutions.length} 家机构</div>
        </Link>
      ) : null}
      <Panel title={`${result.groups.length} 份报告 · ${result.totalHits} 处命中`} eyebrow={`识别为${intentLabels[result.intent.type]}`}>
        {result.groups.length ? <div className="space-y-4">{result.groups.map((group) => (
          <article key={group.reportId} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{group.date}</Badge>{group.institutions.map((institution) => <Badge key={institution} tone="blue">{institution}</Badge>)}<span className="text-xs text-slate-400">{group.matchCount} 处命中</span></div>
            <div className="mt-3 space-y-2">{group.snippets.slice(0, 4).map((snippet) => (
              <Link key={snippet.startLine} to={buildReportLink({ reportId: group.reportId, lineNumber: snippet.startLine, highlightTerms: [query] })} className="block rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700 transition hover:bg-blue-50">{cleanSnippet(snippet.text)}<span className="ml-2 whitespace-nowrap text-xs font-semibold text-blue-700">第 {snippet.startLine} 行</span></Link>
            ))}</div>
          </article>
        ))}</div> : <EmptyState title="暂无结果" description="尝试缩短关键词、换用公司代码，或取消日期范围。" />}
      </Panel>
    </div>
  );
}

function RawResults({ hits, query }: { hits: SearchHit[]; query: string }) {
  return (
    <Panel title={`严格原文结果 ${hits.length} 条`} eyebrow="Raw source">
      {hits.length ? <div className="space-y-3">{hits.map((hit, index) => (
        <Link key={`${hit.reportId}-${hit.lineNumber}-${index}`} to={buildReportLink({ reportId: hit.reportId, lineNumber: hit.lineNumber, highlightTerms: searchHitHighlightTerms({ matchedText: hit.matchedText, query }) })} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300">
          <div className="flex flex-wrap gap-2"><Badge tone="amber">{hit.date}</Badge><Badge tone="blue">{hit.institution}</Badge><Badge tone="slate">第 {hit.lineNumber} 行</Badge></div>
          <p className="mt-3 text-sm leading-7 text-slate-700">{cleanSnippet(hit.snippet)}</p>
        </Link>
      ))}</div> : <EmptyState title="暂无结果" />}
    </Panel>
  );
}

function cleanSnippet(value: string) {
  return value.replace(/==/g, '').replace(/\n+/g, ' · ');
}
