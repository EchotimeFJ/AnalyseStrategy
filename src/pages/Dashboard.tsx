import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { SummaryData } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, ErrorBlock, LoadingBlock, Panel, StatCard } from '@/components/ui';
import { ChangeRow, SignalCard } from '@/components/SignalList';
import { formatDateTime } from '@/lib/format';

export default function Dashboard() {
  const { data, loading, error } = useAsyncData(() => apiGet<SummaryData>('/api/summary'), []);

  return (
    <Layout>
      <PageHeader
        eyebrow="Overview"
        title="把分散日报变成可追踪的研究资产"
        description="自动整理本地机构日报，建立报告、机构、标的、评级、目标价和催化剂索引。所有数据来自本机 Markdown 文件。"
      />
      {loading ? <LoadingBlock /> : null}
      {error ? <ErrorBlock message={error} /> : null}
      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="报告数量" value={data.reportCount} hint={`最新日期 ${data.latestDate ?? '-'}`} />
            <StatCard label="标的档案" value={data.targetCount} hint={`${data.mentionCount} 条提及记录`} />
            <StatCard label="覆盖机构" value={data.institutions.length} hint="按日报一级标题统计" />
            <StatCard label="索引状态" value={data.errorCount ? '需检查' : '正常'} hint={formatDateTime(data.indexedAt)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="最新日报" eyebrow="Latest reports">
              <div className="space-y-3">
                {data.latestReports.map((report) => (
                  <Link
                    key={report.id}
                    to={`/reports?id=${encodeURIComponent(report.id)}`}
                    className="block rounded-2xl border border-slate-200 bg-stone-50/70 p-4 transition hover:border-amber-300 hover:bg-white"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="amber">{report.date}</Badge>
                      <Badge tone="slate">{report.lineCount} 行</Badge>
                      <Badge tone="blue">{report.targetCount} 个提及</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.institutions.slice(0, 6).map((institution, index) => (
                        <span key={`${report.id}-${institution}-${index}`} className="text-xs text-slate-500">
                          {institution}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>

            <Panel title="机构覆盖 Top" eyebrow="Institutions">
              <div className="space-y-3">
                {data.institutions.slice(0, 12).map((item) => (
                  <div key={item.name} className="grid grid-cols-[88px_1fr_48px] items-center gap-3 text-sm">
                    <div className="truncate font-medium text-slate-700">{item.name}</div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-900"
                        style={{ width: `${Math.min(100, (item.count / data.institutions[0].count) * 100)}%` }}
                      />
                    </div>
                    <div className="text-right text-xs text-slate-500">{item.count}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="评级与目标价变化" eyebrow="Radar">
              <div className="space-y-3">
                {data.radar.ratingChanges.slice(0, 5).map((change, index) => (
                  <ChangeRow
                    key={`${change.reportId}-${change.targetName}-${change.institution}-${change.date}-${change.changeType}-${index}`}
                    change={change}
                  />
                ))}
              </div>
            </Panel>
            <Panel title="最新催化剂与风险" eyebrow="Signals">
              <div className="grid gap-3">
                {[...data.radar.catalysts.slice(0, 3), ...data.radar.risks.slice(0, 3)].map((item, index) => (
                  <SignalCard key={`${item.reportId}-${item.lineNumber}-${item.type}-${index}`} item={item} />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
