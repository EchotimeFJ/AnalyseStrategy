import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { WatchlistData } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';

export default function Watchlist() {
  const { data, loading, error, setData } = useAsyncData(() => apiGet<WatchlistData>('/api/watchlist'), []);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    await apiPost('/api/watchlist', {
      name,
      aliases: aliases.split(/[,\s，]+/).filter(Boolean),
      note,
    });
    setData(await apiGet<WatchlistData>('/api/watchlist'));
    setName('');
    setAliases('');
    setNote('');
    setSaving(false);
  }

  async function remove(id: string) {
    await apiDelete(`/api/watchlist/${id}`);
    setData(await apiGet<WatchlistData>('/api/watchlist'));
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Watchlist"
        title="关注列表"
        description="维护重点标的池。新增日报刷新索引后，这里会优先显示关注标的的新提及、评级变化和目标价变化。"
      />
      <Panel title="添加关注标的" eyebrow="Track">
        <form onSubmit={addItem} className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <input value={name} onChange={(event) => setName(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm" placeholder="标的名称，例如 英诺赛科" />
          <input value={aliases} onChange={(event) => setAliases(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm" placeholder="别名/代码，例如 2577.HK InnoScience" />
          <input value={note} onChange={(event) => setNote(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm" placeholder="备注，可选" />
          <button disabled={saving} className="h-12 rounded-2xl bg-slate-950 px-7 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? '保存中' : '添加'}
          </button>
        </form>
      </Panel>

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
                      <button onClick={() => remove(item.id)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:border-rose-300 hover:text-rose-600">
                        移除
                      </button>
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
                      <Link to={`/targets?q=${encodeURIComponent(item.name)}`} className="text-sm font-semibold text-slate-950 underline underline-offset-4">
                        查看标的档案
                      </Link>
                      <a href={`/api/export?type=target&q=${encodeURIComponent(item.name)}`} className="text-sm font-semibold text-amber-700 underline underline-offset-4">
                        导出 CSV
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="还没有关注标的" description="添加后，刷新索引时会优先展示它们的新提及和评级变化。" />
            )}
          </Panel>
        ) : null}
      </div>
    </Layout>
  );
}
