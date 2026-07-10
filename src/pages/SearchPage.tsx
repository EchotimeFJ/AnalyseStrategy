import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { apiGet, queryString } from '@/lib/api';
import type { SearchHit } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { buildReportLink, searchHitHighlightTerms } from '@/lib/reportLinks';

const ratingShortcuts = ['买入', '增持', '中性', '持有', '减持', '卖出'];
const LAST_SEARCH_FILTER_KEY = 'analyse-strategy:last-search-filter';

type SearchFilters = {
  query: string;
  mode: string;
  from: string;
  to: string;
};

function readLastSearchFilter(): SearchFilters | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(LAST_SEARCH_FILTER_KEY);
    return raw ? (JSON.parse(raw) as SearchFilters) : null;
  } catch {
    return null;
  }
}

function saveLastSearchFilter(value: SearchFilters) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(LAST_SEARCH_FILTER_KEY, JSON.stringify(value));
  } catch {
    // Session storage is only used to restore the last successful search.
  }
}

function clearLastSearchFilter() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(LAST_SEARCH_FILTER_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

export default function SearchPage() {
  const [query, setQuery] = useState(() => readLastSearchFilter()?.query ?? '');
  const [mode, setMode] = useState(() => readLastSearchFilter()?.mode ?? 'all');
  const [from, setFrom] = useState(() => readLastSearchFilter()?.from ?? '');
  const [to, setTo] = useState(() => readLastSearchFilter()?.to ?? '');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = readLastSearchFilter();
    if (cached) {
      setQuery(cached.query);
      setMode(cached.mode);
      setFrom(cached.from);
      setTo(cached.to);
      void runSearch(cached);
    }
    // 只在首次进入页面时恢复上一次成功搜索的条件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch(filters: SearchFilters = { query, mode, from, to }) {
    const nextFilters = {
      query: filters.query.trim(),
      mode: filters.mode,
      from: filters.from.trim(),
      to: filters.to.trim(),
    };

    if (!nextFilters.query) {
      clearLastSearchFilter();
      setHits([]);
      setError('');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await apiGet<SearchHit[]>(
        `/api/search${queryString({
          q: nextFilters.query,
          mode: nextFilters.mode,
          from: nextFilters.from,
          to: nextFilters.to,
        })}`,
      );
      saveLastSearchFilter(nextFilters);
      setQuery(nextFilters.query);
      setMode(nextFilters.mode);
      setFrom(nextFilters.from);
      setTo(nextFilters.to);
      setHits(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    await runSearch();
  }

  async function searchRating(rating: string) {
    const nextQuery = `${rating}评级`;
    setQuery(nextQuery);
    setMode('rating');
    await runSearch({ query: nextQuery, mode: 'rating', from, to });
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Exact Search"
        title="精确搜索"
        description="普通关键词使用标准化精确匹配；评级词会进入结构化评级索引，例如搜索“买入评级”会返回最近报告中明确提到买入的内容。"
      />
      <Panel title="搜索条件" eyebrow="Query">
        <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[1fr_160px_150px_150px_auto]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-amber-400"
              placeholder="输入标的、代码、关键词，例如 2577.HK / SpaceX / 目标价"
            />
          </div>
          <select value={mode} onChange={(event) => setMode(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm">
            <option value="all">全文</option>
            <option value="rating">只看评级</option>
            <option value="target">只看目标价</option>
            <option value="signal">只看信号</option>
          </select>
          <input value={from} onChange={(event) => setFrom(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm" placeholder="开始日期" />
          <input value={to} onChange={(event) => setTo(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-3 text-sm" placeholder="结束日期" />
          <button className="h-12 rounded-2xl bg-slate-950 px-6 text-sm font-semibold text-white transition hover:bg-slate-800">搜索</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {ratingShortcuts.map((rating) => (
            <button
              key={rating}
              type="button"
              onClick={() => void searchRating(rating)}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
            >
              {rating}评级
            </button>
          ))}
        </div>
      </Panel>

      <div className="mt-6">
        {loading ? <LoadingBlock label="正在精确检索..." /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {!loading && !error ? (
          <Panel title={`搜索结果 ${hits.length} 条`} eyebrow="Results">
            {hits.length ? (
              <div className="space-y-3">
                {hits.map((hit, index) => (
                  <Link
                    key={`${hit.reportId}-${hit.lineNumber}-${hit.matchedText}-${index}`}
                    to={buildReportLink({
                      reportId: hit.reportId,
                      lineNumber: hit.lineNumber,
                      highlightTerms: searchHitHighlightTerms({
                        matchedText: hit.matchedText,
                        query,
                      }),
                    })}
                    className="block rounded-2xl border border-slate-200 bg-white/75 p-4 transition hover:border-amber-300 hover:shadow-md"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="amber">{hit.date}</Badge>
                      <Badge tone="blue">{hit.institution}</Badge>
                      <Badge tone="slate">第 {hit.lineNumber} 行</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{hit.snippet}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无结果" description="输入关键词后点击搜索；搜索不会做模糊扩展，所以结果为空通常代表原文没有严格包含该词。" />
            )}
          </Panel>
        ) : null}
      </div>
    </Layout>
  );
}
