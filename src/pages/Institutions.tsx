import { FormEvent, useState } from 'react';
import { apiGet, queryString } from '@/lib/api';
import type { InstitutionView } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';

export default function Institutions() {
  const [target, setTarget] = useState('英诺赛科');
  const [view, setView] = useState<InstitutionView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    try {
      setView(await apiGet<InstitutionView>(`/api/institutions${queryString({ target })}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Institution Matrix"
        title="机构观点"
        description="横向比较机构覆盖频率、最新评级、目标价和观点分歧。输入标的可聚焦单一公司；留空可查看全局覆盖。"
      />
      <Panel title="对比条件" eyebrow="Filter">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-amber-400"
            placeholder="输入标的名称或代码；留空看全局"
          />
          <button className="h-12 rounded-2xl bg-slate-950 px-7 text-sm font-semibold text-white hover:bg-slate-800">生成矩阵</button>
        </form>
      </Panel>

      <div className="mt-6 space-y-6">
        {loading ? <LoadingBlock label="正在生成机构矩阵..." /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {view ? (
          <>
            <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <Panel title="机构观点矩阵" eyebrow="Matrix">
                {view.matrix.length ? (
                  <div className="space-y-4">
                    {view.matrix.slice(0, 12).map((row) => (
                      <div key={row.targetName} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                        <div className="mb-3 font-semibold text-slate-950">{row.targetName}</div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {row.items.map((item) => (
                            <div key={`${item.institution}-${item.reportId}`} className="rounded-xl bg-slate-50 p-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge tone="blue">{item.institution}</Badge>
                                <Badge tone="amber">{item.date}</Badge>
                                {item.rating ? <Badge tone="green">{item.rating}</Badge> : null}
                                {item.targetPrice ? <Badge>{item.targetPrice}</Badge> : null}
                              </div>
                              <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{item.excerpt}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="暂无矩阵结果" description="该标的可能只有散落提及，或尚未识别出有效评级/目标价。" />
                )}
              </Panel>
              <Panel title="覆盖频率" eyebrow="Coverage">
                <div className="space-y-3">
                  {view.coverage.slice(0, 16).map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                      <span className="font-medium text-slate-700">{item.name}</span>
                      <Badge tone="slate">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="观点分歧榜" eyebrow="Divergence">
              {view.divergence.length ? (
                <div className="grid gap-3 xl:grid-cols-2">
                  {view.divergence.map((row) => (
                    <div key={row.targetName} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <div className="font-semibold text-slate-950">{row.targetName}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {row.items.map((item) => (
                          <Badge key={`${item.institution}-${item.date}`} tone="amber">
                            {item.institution}: {item.rating || '-'} / {item.targetPrice || '-'}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="暂无明显分歧" description="当前筛选下没有发现多机构评级或目标价差异。" />
              )}
            </Panel>
          </>
        ) : (
          <EmptyState title="输入条件后生成矩阵" description="建议先试试英诺赛科、SpaceX、中金公司等近期报告提及的标的。" />
        )}
      </div>
    </Layout>
  );
}
