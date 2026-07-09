import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { RadarData } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { ChangeRow, MentionCard, SignalCard } from '@/components/SignalList';

export default function RadarPage() {
  const { data, loading, error } = useAsyncData(() => apiGet<RadarData>('/api/radar'), []);

  return (
    <Layout>
      <PageHeader
        eyebrow="Research Radar"
        title="研究雷达"
        description="从所有日报中抽取首次覆盖、评级/目标价变化、催化剂、风险和主题热度，帮助你快速捕捉新增研究信号。"
      />
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="首次覆盖与新增推荐" eyebrow="New coverage">
              <div className="space-y-3">
                {data.firstCoverages.length ? data.firstCoverages.slice(0, 8).map((mention, index) => (
                  <MentionCard key={`${mention.reportId}-${mention.lineNumber}-${mention.institution}-${index}`} mention={mention} />
                )) : <EmptyState title="暂无首次覆盖信号" />}
              </div>
            </Panel>
            <Panel title="评级与目标价变化" eyebrow="Changes">
              <div className="space-y-3">
                {data.ratingChanges.slice(0, 8).map((change, index) => (
                  <ChangeRow key={`${change.reportId}-${change.targetName}-${change.institution}-${change.date}-${index}`} change={change} />
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="催化剂" eyebrow="Catalysts">
              <div className="space-y-3">
                {data.catalysts.slice(0, 10).map((item, index) => (
                  <SignalCard key={`${item.reportId}-${item.lineNumber}-${item.type}-${index}`} item={item} />
                ))}
              </div>
            </Panel>
            <Panel title="风险提示" eyebrow="Risks">
              <div className="space-y-3">
                {data.risks.slice(0, 10).map((item, index) => (
                  <SignalCard key={`${item.reportId}-${item.lineNumber}-${item.type}-${index}`} item={item} />
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="主题热度" eyebrow="Themes">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {data.themes.map((theme) => (
                <div key={theme.name} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="font-semibold text-slate-950">{theme.name}</div>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, theme.count * 6)}%` }} />
                  </div>
                  <div className="mt-2 text-xs text-slate-500">{theme.count} 次标签出现</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </Layout>
  );
}
