import { useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { IndexStatus, StrategyUpdateResult } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export default function IndexPage() {
  const { data, loading, error, setData } = useAsyncData(() => apiGet<IndexStatus>('/api/index'), []);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [lastPull, setLastPull] = useState<StrategyUpdateResult['pull'] | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshError('');
    try {
      setData(await apiPost<IndexStatus>('/api/reindex'));
    } catch (reason) {
      setRefreshError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRefreshing(false);
    }
  }

  async function updateFromGit() {
    setUpdating(true);
    setRefreshError('');
    setLastPull(null);
    try {
      const result = await apiPost<StrategyUpdateResult>('/api/update-strategy');
      setData(result.index);
      setLastPull(result.pull);
    } catch (reason) {
      setRefreshError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Index"
        title="索引管理"
        description="查看本地日报目录的索引状态。可以只刷新本地索引，也可以先对 Strategy 仓库执行 git pull --ff-only，再自动重建索引。"
      />
      {loading ? <LoadingBlock label="正在读取索引状态..." /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      {refreshError ? <ErrorBlock message={refreshError} /> : null}
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="报告数量" value={data.reportCount} />
            <StatCard label="标的提及" value={data.mentionCount} />
            <StatCard label="解析问题" value={data.errors.length} />
            <StatCard label="最后索引" value={formatDateTime(data.indexedAt)} />
          </div>
          <Panel
            title="源目录"
            eyebrow="Source"
            action={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button
                  onClick={refresh}
                  disabled={refreshing || updating}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:border-amber-300 disabled:opacity-50"
                >
                  {refreshing ? '刷新中...' : '仅刷新索引'}
                </button>
                <button
                  onClick={updateFromGit}
                  disabled={refreshing || updating}
                  className="rounded-2xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  {updating ? '更新中...' : 'Git 更新并重建'}
                </button>
              </div>
            }
          >
            <div className="break-all rounded-2xl bg-slate-50 p-4 font-mono text-sm text-slate-700">{data.sourceDir}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone={data.errors.length ? 'red' : 'green'}>{data.errors.length ? '存在解析问题' : '索引正常'}</Badge>
              <Badge tone="blue">新增内容需手动刷新</Badge>
              <Badge tone="amber">Git pull 使用 --ff-only</Badge>
            </div>
            {lastPull ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="font-semibold">Git 更新完成</div>
                <div className="mt-2 break-all font-mono text-xs">{lastPull.strategyDir}</div>
                <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-xs">
                  {lastPull.stdout || lastPull.stderr || '无输出'}
                </pre>
              </div>
            ) : null}
          </Panel>

          <Panel title="数据质量" eyebrow="Quality">
            {data.errors.length ? (
              <div className="space-y-3">
                {data.errors.map((item) => (
                  <div key={item.filePath} className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="break-all text-sm font-semibold text-rose-800">{item.filePath}</div>
                    <div className="mt-2 text-sm text-rose-700">{item.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-emerald-50 p-5 text-sm text-emerald-700">当前没有读取失败的 Markdown 文件。</div>
            )}
          </Panel>
        </div>
      ) : null}
    </Layout>
  );
}
