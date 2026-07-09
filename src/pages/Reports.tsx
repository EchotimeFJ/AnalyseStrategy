import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { ReportDetail, ReportSummary } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { MarkdownViewer } from '@/components/MarkdownViewer';

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');
  const [year, setYear] = useState('');
  const reportsQuery = useMemo(() => (year ? `/api/reports?year=${year}` : '/api/reports'), [year]);
  const reports = useAsyncData(() => apiGet<ReportSummary[]>(reportsQuery), [reportsQuery]);
  const firstId = reports.data?.[0]?.id;
  const activeId = selectedId || firstId;
  const detail = useAsyncData(
    () => (activeId ? apiGet<ReportDetail>(`/api/reports/${encodeURIComponent(activeId)}`) : Promise.resolve(null)),
    [activeId],
  );

  useEffect(() => {
    if (!selectedId && firstId) {
      setParams({ id: firstId }, { replace: true });
    }
  }, [firstId, selectedId, setParams]);

  const years = [...new Set((reports.data ?? []).map((report) => report.year))].sort().reverse();

  return (
    <Layout>
      <PageHeader
        eyebrow="Reader"
        title="报告阅读"
        description="按日期浏览机构日报，右侧保留 Markdown 原文格式；报告中的机构、标的、评级和目标价由索引自动提取。"
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <Panel
          title="日报列表"
          eyebrow="Reports"
          action={
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs"
            >
              <option value="">全部年份</option>
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          }
          className="xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)] xl:overflow-auto"
        >
          {reports.loading ? <LoadingBlock label="正在加载报告列表..." /> : null}
          {reports.error ? <ErrorBlock message={reports.error} /> : null}
          <div className="space-y-3">
            {(reports.data ?? []).map((report) => (
              <button
                key={report.id}
                onClick={() => setParams({ id: report.id })}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  activeId === report.id ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white/70 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-950">{report.date}</span>
                  <span className="text-xs text-slate-500">{report.lineCount} 行</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.institutions.slice(0, 4).map((institution, index) => (
                    <Badge key={`${report.id}-${institution}-${index}`} tone="slate">
                      {institution}
                    </Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          {detail.loading ? <LoadingBlock label="正在加载报告原文..." /> : null}
          {detail.error ? <ErrorBlock message={detail.error} /> : null}
          {detail.data ? (
            <>
              <Panel title={detail.data.date} eyebrow="Report meta">
                <div className="grid gap-3 md:grid-cols-3">
                  <Meta label="机构" value={`${detail.data.institutions.length} 家`} />
                  <Meta label="标的提及" value={`${detail.data.mentions.length} 条`} />
                  <Meta label="源文件" value={detail.data.filePath} />
                </div>
              </Panel>
              <Panel title="Markdown 原文" eyebrow="Original" className="overflow-hidden">
                <MarkdownViewer markdown={detail.data.markdown} />
              </Panel>
            </>
          ) : (
            <EmptyState title="请选择一篇报告" description="左侧列表会展示所有已索引 Markdown 日报。" />
          )}
        </div>
      </div>
    </Layout>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
