import { Link } from 'react-router-dom';
import { apiGet, resolveApiPath } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { WatchlistData } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';

export default function Watchlist() {
  const { data, loading, error } = useAsyncData(() => apiGet<WatchlistData>('/api/watchlist'), []);
  return (
    <Layout>
      <PageHeader
        eyebrow="Watchlist"
        title="关注列表"
        description="查看重点关注的公司，以及它们在最新报告中的观点和变化。"
      />

      <div className="mt-6">
        {loading ? <LoadingBlock label="正在加载关注列表..." /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {data ? (
          <Panel title="已关注标的" eyebrow="Tracked names">
            {data.items.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {data.items.map((item) => (
                  <div key={item.id} className="rounded-[24px] border border-slate-200 bg-white/75 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-slate-950">{item.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.aliases.map((alias, index) => (
                            <Badge key={`${item.id}-${alias}-${index}`}>{alias}</Badge>
                          ))}
                        </div>
                      </div>

                    </div>
                    {item.note ? <p className="mt-3 text-sm text-slate-500">{item.note}</p> : null}
                    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="blue">{item.mentionCount ?? 0} 条提及</Badge>
                        {item.latestMention ? <Badge tone="amber">最近 {item.latestMention.date}</Badge> : null}
                      </div>
                      {item.latestMention ? (
                        <p className="mt-3 line-clamp-3 leading-6 text-slate-600">{item.latestMention.excerpt}</p>
                      ) : (
                        <p className="mt-3 text-slate-500">暂未在日报中识别到该标的。</p>
                      )}
                    </div>
                    <div className="mt-4 flex gap-3">
                      <Link to={`/company?q=${encodeURIComponent(item.name)}`} className="text-sm font-semibold text-slate-950 underline underline-offset-4">
                        查看公司研究
                      </Link>
                      <a
                        href={resolveApiPath(`/api/export?type=target&q=${encodeURIComponent(item.name)}`)}
                        className="text-sm font-semibold text-amber-700 underline underline-offset-4"
                      >
                        导出 CSV
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有关注标的" description="关注列表由管理员维护。" />
            )}
          </Panel>
        ) : null}
      </div>
    </Layout>
  );
}
