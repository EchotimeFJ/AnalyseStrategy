import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import type { ReportDetail, ReportOverview, ReportSummary } from '@/types';
import { Layout, PageHeader } from '@/components/Layout';
import { Badge, EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/ui';
import { MarkdownViewer } from '@/components/MarkdownViewer';
import { findSourceLineElement, getCenteredScrollTop, getSourceLineScrollTop } from '@/lib/reportScroll';
import { ReportOpinionTable } from '@/components/ReportOpinionTable';
import { normalizeReportReview, reviewStatusLabel } from '@/lib/reviewDisplay';

export default function Reports() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('id');
  const revision = params.get('revision');
  const focusedLine = parseLineNumber(params.get('line'));
  const highlightTerms = useMemo(() => params.getAll('highlight').map((item) => item.trim()).filter(Boolean), [params]);
  const reportListRef = useRef<HTMLElement | null>(null);
  const [year, setYear] = useState('');
  const [visibleCount, setVisibleCount] = useState(48);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDraft,setShowDraft]=useState(false);
  const reportsQuery = useMemo(() => (year ? `/api/reports?year=${year}` : '/api/reports'), [year]);
  const reports = useAsyncData(() => apiGet<ReportSummary[]>(reportsQuery), [reportsQuery]);
  const firstId = reports.data?.[0]?.id;
  const activeId = selectedId || firstId;
  const detail = useAsyncData(
    () => (activeId ? apiGet<ReportDetail>(revision ? `/api/review/reports/${encodeURIComponent(activeId)}/revisions/${encodeURIComponent(revision)}` : `/api/reports/${encodeURIComponent(activeId)}`) : Promise.resolve(null)),
    [activeId, revision, refreshKey],
  );
  const overview = useAsyncData(
    () => (activeId && !revision ? apiGet<ReportOverview>(`/api/reports/${encodeURIComponent(activeId)}/overview`) : Promise.resolve(null)),
    [activeId, revision, refreshKey],
  );
  const draft=useAsyncData(()=>activeId&&showDraft&&!revision?apiGet<ReportOverview>(`/api/review/reports/${encodeURIComponent(activeId)}/draft`):Promise.resolve(null),[activeId,showDraft,revision,refreshKey]);
  const activeDetail = detail.data?.id === activeId ? detail.data : null;
  const activeOverview = overview.data?.reportId === activeId ? overview.data : null;
  const publicationsAligned = samePublication(activeDetail, activeOverview);

  useEffect(() => {
    if (!selectedId && firstId) {
      setParams({ id: firstId }, { replace: true });
    }
  }, [firstId, selectedId, setParams]);

  useEffect(() => {
    if (!activeDetail || (!revision && (!activeOverview || !publicationsAligned)) || detail.loading || overview.loading || !focusedLine) {
      return;
    }

    let focusedElement: HTMLElement | null = null;
    const frame = window.requestAnimationFrame(() => {
      const element = findSourceLineElement(document, focusedLine);
      if (!element) {
        return;
      }

      document.querySelectorAll('.report-line-focus').forEach((node) => {
        node.classList.remove('report-line-focus');
      });
      element.classList.add('report-line-focus');
      focusedElement = element;
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

    return () => {
      window.cancelAnimationFrame(frame);
      focusedElement?.classList.remove('report-line-focus');
    };
  }, [activeId, activeDetail, detail.loading, activeOverview, overview.loading, focusedLine, highlightTerms, publicationsAligned, revision]);

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
        eyebrow="Report Library"
        title="报告库"
        description="先速览每份报告里的买入、评级和目标价变化，再按来源跳回 Markdown 原文核对。"
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
          className="max-h-72 overflow-auto xl:sticky xl:top-8 xl:max-h-[calc(100vh-4rem)]"
        >
          {reports.loading ? <LoadingBlock label="正在加载报告列表..." /> : null}
          {reports.error ? <ErrorBlock message={reports.error} /> : null}
          <div className="space-y-3">
            {(reports.data ?? []).slice(0, visibleCount).map((report) => (
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
            {(reports.data?.length ?? 0) > visibleCount ? (
              <button onClick={() => setVisibleCount((value) => value + 48)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-blue-300">再加载 48 篇</button>
            ) : null}
          </div>
        </Panel>

        <div className="min-w-0 space-y-6">
          {detail.loading || overview.loading ? <LoadingBlock label="正在加载报告与速览..." /> : null}
          {detail.error ? <ErrorBlock message={detail.error} /> : null}
          {overview.error ? <ErrorBlock message={overview.error} /> : null}
          {activeDetail && activeOverview && !publicationsAligned ? <PublicationMismatchNotice onRefresh={() => setRefreshKey((value) => value + 1)} /> : null}
          {activeDetail ? (
            <>
              <Panel title={activeDetail.date} eyebrow="Report meta">
                <div className="grid gap-3 md:grid-cols-3">
                  <Meta label="机构" value={`${activeDetail.institutions.length} 家`} />
                  <Meta label={revision ? "视图" : "标的提及"} value={revision ? "历史原文" : `${activeDetail.mentions.length} 条`} />
                  <Meta label="报告编号" value={activeDetail.id} />
                  <Meta label="自动整理" value={revision ? "历史引用，仅展示原文" : reviewStatusLabel(normalizeReportReview(activeDetail.review).status)} />
                </div>
              </Panel>
              {activeOverview && publicationsAligned ? (
                <Panel title="报告观点速览" eyebrow="Quick view">
                  <ReportOpinionTable key={`${activeOverview.reportId}:${activeOverview.publicationId ?? 'legacy'}`} overview={activeOverview} />
                </Panel>
              ) : null}
              {!revision && normalizeReportReview(activeDetail.review).status !== 'succeeded' ? <Panel title="程序草稿" eyebrow="Unreviewed draft"><p className="text-sm text-slate-500">这里仅展示程序匹配结果，尚未通过 AI 复核，不计入默认统计。</p><button className="mt-3 text-sm font-semibold text-blue-600" onClick={()=>setShowDraft(!showDraft)}>{showDraft?'收起草稿':'查看规则草稿'}</button>{showDraft&&draft.loading?<LoadingBlock label="正在读取草稿…"/>:null}{showDraft&&draft.error?<ErrorBlock message={draft.error}/>:null}{showDraft&&draft.data?(draft.data.publicationId===activeDetail.publicationId?<ReportOpinionTable overview={draft.data}/>:<PublicationMismatchNotice onRefresh={()=>setRefreshKey(v=>v+1)}/>):null}</Panel> : null}
              {revision ? <div className="rounded-xl border border-blue-200 p-3 text-sm text-slate-600">正在查看引用时保存的原文版本。<button className="ml-3 font-semibold text-blue-600" onClick={() => setParams({id:activeId!})}>查看当前版本</button></div> : null}
              <Panel title="Markdown 原文" eyebrow="Original" className="overflow-hidden">
                <MarkdownViewer markdown={activeDetail.markdown} highlightTerms={highlightTerms} />
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

function samePublication(detail: ReportDetail | null, overview: ReportOverview | null) {
  if (!detail || !overview) return false;
  if (!detail.publicationId && !overview.publicationId) return true;
  return Boolean(detail.publicationId && overview.publicationId && detail.publicationId === overview.publicationId);
}

function PublicationMismatchNotice({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
      <div className="font-semibold">报告数据正在更新</div>
      <p className="mt-1 leading-6">原文和速览来自不同版本，已暂时隐藏带行号的观点链接，避免跳到不对应的原文位置。</p>
      <button type="button" onClick={onRefresh} className="mt-3 min-h-10 rounded-xl border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900">刷新当前报告</button>
    </div>
  );
}

function parseLineNumber(value: string | null) {
  if (!value) {
    return undefined;
  }

  const line = Number.parseInt(value, 10);
  return Number.isFinite(line) && line > 0 ? line : undefined;
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
