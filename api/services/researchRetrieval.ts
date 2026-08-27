import type { OpinionRecord } from '../domain/research.js';
import type { ReportDocument } from './reportParser.js';
import { normalizeText } from './reportParser.js';

export type ResearchScope = {
  from?: string;
  to?: string;
  securityKey?: string;
  institution?: string;
};

export type ResearchIntent = {
  scope: ResearchScope;
  currentDate: string;
  latestReportDate: string | null;
  mode: 'default' | 'latest' | 'week';
};

export type RetrievalChunk = {
  id: string;
  reportId: string;
  date: string;
  institution: string;
  securityKey: string | null;
  securityName: string | null;
  startLine: number;
  endLine: number;
  text: string;
  score: number;
};

export function buildRetrievalChunks(reports: ReportDocument[], opinions: OpinionRecord[]): RetrievalChunk[] {
  const reportById = new Map(reports.map((report) => [report.id, report]));
  return opinions.map((opinion) => {
    const report = reportById.get(opinion.reportId);
    const evidence = opinion.evidence[0];
    const text = evidence?.excerpt || report?.lines.slice(Math.max(0, (evidence?.lineNumber ?? 1) - 1), (evidence?.lineNumber ?? 1) + 7).join('\n') || '';
    const lineCount = Math.max(0, text.split(/\r?\n/).length - 1);
    return {
      id: `source:${opinion.reportId}:${evidence?.lineNumber ?? 1}:${opinion.security.key}`,
      reportId: opinion.reportId,
      date: opinion.reportDate,
      institution: opinion.institution,
      securityKey: opinion.security.key,
      securityName: opinion.security.displayName,
      startLine: evidence?.lineNumber ?? 1,
      endLine: (evidence?.lineNumber ?? 1) + lineCount,
      text,
      score: 0,
    };
  });
}

export function retrieveResearch(
  query: string,
  scope: ResearchScope,
  chunks: RetrievalChunk[],
  options: { maxChunks?: number; maxChars?: number } = {},
) {
  const maxChunks = options.maxChunks ?? 8;
  const maxChars = options.maxChars ?? 12_000;
  const filtered = chunks.filter((chunk) => {
    if (scope.from && chunk.date < scope.from) return false;
    if (scope.to && chunk.date > scope.to) return false;
    if (scope.securityKey && chunk.securityKey !== scope.securityKey) return false;
    if (scope.institution && chunk.institution !== scope.institution) return false;
    return true;
  });
  const scored = filtered
    .map((chunk) => ({ ...chunk, score: relevanceScore(query, chunk) }))
    .filter((chunk) => chunk.score > 0 || Boolean(scope.from || scope.to || scope.securityKey || scope.institution))
    .sort((left, right) => right.score - left.score || right.date.localeCompare(left.date));

  const selected: RetrievalChunk[] = [];
  let totalChars = 0;
  const seen = new Set<string>();
  for (const chunk of scored) {
    if (selected.length >= maxChunks || totalChars >= maxChars) break;
    const dedupeKey = normalizeText(chunk.text);
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const remaining = maxChars - totalChars;
    const text = chunk.text.slice(0, remaining);
    selected.push({ ...chunk, text });
    totalChars += text.length;
  }
  return { chunks: selected, totalChars };
}

export function resolveResearchIntent(
  query: string,
  scope: ResearchScope,
  chunks: RetrievalChunk[],
  now = new Date(),
): ResearchIntent {
  const latestReportDate = chunks.reduce<string | null>(
    (latest, chunk) => !latest || chunk.date > latest ? chunk.date : latest,
    null,
  );
  const currentDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const mode = /最近\s*(?:一|1)?\s*周|近\s*(?:7|七)\s*天|本周/.test(query)
    ? 'week'
    : /今天|今日|最新|当日/.test(query)
      ? 'latest'
      : 'default';
  if (!latestReportDate || scope.from || scope.to || mode === 'default') {
    return { scope: { ...scope }, currentDate, latestReportDate, mode };
  }
  if (mode === 'week') {
    return {
      scope: { ...scope, from: shiftDate(latestReportDate, -6), to: latestReportDate },
      currentDate,
      latestReportDate,
      mode,
    };
  }
  return {
    scope: { ...scope, from: latestReportDate, to: latestReportDate },
    currentDate,
    latestReportDate,
    mode,
  };
}

function relevanceScore(query: string, chunk: RetrievalChunk) {
  const normalizedQuery = normalizeText(query);
  const haystack = normalizeText(`${chunk.securityName ?? ''} ${chunk.institution} ${chunk.text}`);
  let score = 0;
  if (chunk.securityName && normalizedQuery.includes(normalizeText(chunk.securityName))) score += 12;
  if (normalizedQuery.includes(normalizeText(chunk.institution))) score += 8;
  for (const token of queryTokens(normalizedQuery)) if (haystack.includes(token)) score += token.length > 2 ? 3 : 1;
  return score;
}

function queryTokens(value: string) {
  const words = value.match(/[a-z0-9.]{2,}|[\u4e00-\u9fa5]{2,}/g) ?? [];
  return [...new Set(words.flatMap((word) => {
    if (!/[\u4e00-\u9fa5]/.test(word) || word.length <= 4) return [word];
    return Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2));
  }))];
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
