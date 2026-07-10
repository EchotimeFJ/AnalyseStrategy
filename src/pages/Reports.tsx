import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { ReportDetail, ReportSummary } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { getCenteredScrollTop, getSourceLineScrollTop } from '@/lib/reportScroll';

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');
  const focusedLine = parseLineNumber(params.get('line'));
  const highlightTerms = useMemo(() => params.getAll('highlight').map((item) => item.trim()).filter(Boolean), [params]);
  const reportListRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (!detail.data || !focusedLine) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = findSourceLineElement(focusedLine);
      if (!element) {
        return;
      }

      document.querySelectorAll('.report-line-focus').forEach((node) => {
        node.classList.remove('report-line-focus');
      });
      element.classList.add('report-line-focus');
      const rect = element.getBoundingClientRect();
      const top = getSourceLineScrollTop({
        windowScrollY: window.scrollY,
        viewportHeight: window.innerHeight,
        elementTop: rect.top,
        elementHeight: rect.height,
        startLine: Number(element.dataset.lineStart ?? focusedLine),
        endLine: Number(element.dataset.lineEnd ?? focusedLine),
        targetLine: focusedLine,
      });
      window.scrollTo({ top, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [detail.data, focusedLine]);

  useEffect(() => {
    if (!activeId || !reports.data?.length) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollReportListToActiveItem(reportListRef.current, activeId);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeId, reports.data]);

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
          ref={reportListRef}
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
                data-report-id={report.id}
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
                <MarkdownViewer markdown={detail.data.markdown} highlightTerms={highlightTerms} />
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

function parseLineNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const line = Number.parseInt(value, 10);
  return Number.isFinite(line) && line > 0 ? line : undefined;
}

function findSourceLineElement(line: number) {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-line-start]'));
  return (
    nodes.find((node) => {
      const start = Number(node.dataset.lineStart);
      const end = Number(node.dataset.lineEnd || node.dataset.lineStart);
      return start <= line && line <= end;
    }) ??
    nodes
      .filter((node) => Number(node.dataset.lineStart) <= line)
      .sort((left, right) => Number(right.dataset.lineStart) - Number(left.dataset.lineStart))[0] ??
    null
  );
}

function scrollReportListToActiveItem(container: HTMLElement | null, activeId: string) {
  if (!container) {
    return;
  }

  const item = Array.from(container.querySelectorAll<HTMLElement>('[data-report-id]')).find(
    (node) => node.dataset.reportId === activeId,
  );
  if (!item) {
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const itemOffsetTop = itemRect.top - containerRect.top + container.scrollTop;
  const top = getCenteredScrollTop({
    containerHeight: container.clientHeight,
    itemOffsetTop,
    itemHeight: item.offsetHeight,
  });
  container.scrollTo({ top, behavior: 'auto' });
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}
