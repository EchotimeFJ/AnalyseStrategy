import { FormEvent, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, queryString } from '@/lib/api';
import type { TargetProfile } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { ChangeRow, MentionCard, SignalCard } from '@/components/SignalList';

export default function Targets() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '英诺赛科');
  const [profile, setProfile] = useState<TargetProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initialQuery = params.get('q');
    if (initialQuery) {
      void loadProfile(initialQuery);
    }
    // 只在首次进入页面时消费 URL 查询词，后续由表单控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile(value: string) {
    if (!value.trim()) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      setProfile(await apiGet<TargetProfile>(`/api/targets${queryString({ q: value })}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    await loadProfile(query);
  }

  return (
    <Layout>
      <PageHeader
        eyebrow="Target 360"
        title="标的分析"
        description="输入标的名称、英文名或代码，查看它在历史报告中被哪些机构提到过，评级和目标价如何变化。"
      />
      <Panel title="查询标的" eyebrow="Target query">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-amber-400"
            placeholder="例如：英诺赛科 / 2577.HK / SpaceX / 中金公司"
          />
          <button className="h-12 rounded-2xl bg-slate-950 px-7 text-sm font-semibold text-white transition hover:bg-slate-800">分析</button>
        </form>
      </Panel>

      <div className="mt-6 space-y-6">
        {loading ? <LoadingBlock label="正在整理标的历史..." /> : null}
        {error ? <ErrorBlock message={error} /> : null}
        {profile ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="标的" value={profile.canonicalName} hint={profile.aliases.slice(0, 4).join(' / ')} />
              <StatCard label="历史提及" value={profile.mentions.length} hint={`${profile.firstMention ?? '-'} 至 ${profile.latestMention ?? '-'}`} />
              <StatCard label="覆盖机构" value={profile.institutions.length} hint={profile.institutions.slice(0, 5).join('、')} />
              <StatCard label="最新评级/目标价" value={profile.summary.latestRating ?? '-'} hint={profile.summary.latestTargetPrice ?? '暂无目标价'} />
            </div>

            <Panel title="观点变化摘要" eyebrow="Digest">
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                  综合提示：{profile.summary.sentimentHint}。系统按原文提及和关键词抽取，建议点击原报告复核上下文。
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.summary.ratingDistribution.map((item) => (
                    <Badge key={item.name} tone="green">
                      {item.name} {item.count}
                    </Badge>
                  ))}
                </div>
              </div>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
              <Panel title="评级与目标价变化" eyebrow="Timeline">
                <div className="space-y-3">
                  {profile.ratingChanges.length ? (
                    profile.ratingChanges.map((change, index) => (
                      <ChangeRow key={`${change.reportId}-${change.date}-${change.institution}-${change.targetName}-${index}`} change={change} />
                    ))
                  ) : (
                    <EmptyState title="暂无可识别变化" description="该标的可能只有单次提及，或原文没有明确评级/目标价。" />
                  )}
                </div>
              </Panel>
              <Panel title="机构最新观点矩阵" eyebrow="Institution matrix">
                <div className="space-y-3">
                  {(profile.matrix[0]?.items ?? []).map((item) => (
                    <div key={`${item.institution}-${item.reportId}`} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="blue">{item.institution}</Badge>
                        <Badge tone="amber">{item.date}</Badge>
                        {item.rating ? <Badge tone="green">{item.rating}</Badge> : null}
                        {item.targetPrice ? <Badge tone="slate">{item.targetPrice}</Badge> : null}
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{item.excerpt}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="历史提及" eyebrow="Mentions">
                <div className="space-y-3">
                  {profile.mentions.slice(0, 12).map((mention, index) => (
                    <MentionCard key={`${mention.reportId}-${mention.lineNumber}-${mention.institution}-${index}`} mention={mention} />
                  ))}
                </div>
              </Panel>
              <Panel title="催化剂与风险" eyebrow="Signals">
                <div className="space-y-3">
                  {profile.signals.slice(0, 12).map((signal, index) => (
                    <SignalCard key={`${signal.reportId}-${signal.lineNumber}-${signal.type}-${index}`} item={signal} />
                  ))}
                </div>
              </Panel>
            </div>
          </>
        ) : (
          <EmptyState title="输入标的开始分析" description="建议先试试：英诺赛科、2577.HK、SpaceX、中金公司、3908.HK。" />
        )}
      </div>
    </Layout>
  );
}
