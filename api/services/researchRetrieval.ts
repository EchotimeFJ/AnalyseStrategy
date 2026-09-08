import type { OpinionRecord, SecurityEntity } from '../domain/research.js';
import type { ReportDocument } from './reportParser.js';
import { normalizeText } from './reportParser.js';
import { resolveInstitution } from './entityResolver.js';

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
  securityKeys?: string[];
  securities?: SecurityEntity[];
  startLine: number;
  endLine: number;
  text: string;
  score: number;
};

type PreparedSecurity = { security: SecurityEntity; terms: string[] };
const chunkCache = new WeakMap<ReportDocument[], { opinions: OpinionRecord[]; chunks: RetrievalChunk[] }>();
const securityIndexes = new WeakMap<RetrievalChunk[], Map<string, PreparedSecurity>>();
const normalizedSources = new WeakMap<RetrievalChunk, string>();

function sourceText(chunk: RetrievalChunk) {
  const saved = normalizedSources.get(chunk);
  if (saved !== undefined) return saved;
  const value = normalizeText(chunk.text);
  normalizedSources.set(chunk, value);
  return value;
}

export function buildRetrievalChunks(reports: ReportDocument[], opinions: OpinionRecord[]): RetrievalChunk[] {
  const cached = chunkCache.get(reports);
  if (cached?.opinions === opinions) return cached.chunks;
  const chunks: RetrievalChunk[] = [];
  const securities = new Map<string, PreparedSecurity>();
  const reportKeys = new Map<string, Set<string>>();
  for (const opinion of opinions) {
    const security = opinion.security;
    if (!securities.has(security.key)) securities.set(security.key, { security,
      terms: [...new Set([security.displayName, ...security.aliases, security.code ?? ''].filter((term) => term.length >= 2).map(normalizeText))] });
    const keys = reportKeys.get(opinion.reportId) ?? new Set<string>();
    keys.add(security.key);
    reportKeys.set(opinion.reportId, keys);
  }
  for (const report of reports) {
    const localSecurities = [...(reportKeys.get(report.id) ?? [])].map((key) => securities.get(key)!);
    let text = '';
    let startLine = 1;
    let endLine = 1;
    let institution = '';
    const flush = () => {
      if (text.trim()) {
        const normalized = normalizeText(text);
        const matched = localSecurities.filter((item) => item.terms.some((term) => normalized.includes(term))).map((item) => item.security);
        const chunk: RetrievalChunk = {
          id: `source:${report.id}:${startLine}:${chunks.length}`,
          reportId: report.id, date: report.date, institution,
          securityKey: matched[0]?.key ?? null,
          securityName: matched[0]?.displayName ?? null,
          securityKeys: matched.map((security) => security.key),
          securities: matched,
          startLine, endLine, text, score: 0,
        };
        normalizedSources.set(chunk, normalized);
        chunks.push(chunk);
      }
      text = '';
    };
    // Chunk the original source, not extracted/truncated opinion excerpts. Keep
    // every content line, including those the entity parser does not recognize.
    for (let index = 0; index < report.lines.length; index += 1) {
      const lineNumber = index + 1;
      const block = report.institutions.find((block) => block.startLine <= lineNumber && block.endLine >= lineNumber);
      const nextInstitution = block?.institution ?? '';
      if (nextInstitution !== institution || block?.startLine === lineNumber) flush();
      institution = nextInstitution;
      const line = report.lines[index];
      if (text && text.length + 1 + line.length > 1800) flush();
      if (line.length > 1800) {
        for (let offset = 0; offset < line.length; offset += 1800) {
          startLine = endLine = lineNumber;
          text = line.slice(offset, offset + 1800);
          flush();
        }
      } else {
        if (!text) startLine = lineNumber;
        text += (text ? '\n' : '') + line;
        endLine = lineNumber;
      }
    }
    flush();
  }
  securityIndexes.set(chunks, securities);
  chunkCache.set(reports, { opinions, chunks });
  return chunks;
}

export function retrieveResearch(
  query: string,
  scope: ResearchScope,
  chunks: RetrievalChunk[],
  options: { maxChunks?: number; maxChars?: number } = {},
) {
  const maxChunks = options.maxChunks ?? 8;
  const maxChars = options.maxChars ?? 12_000;
  const selectedTerms = scope.securityKey ? securityIndexes.get(chunks)?.get(scope.securityKey)?.terms : undefined;
  const queryNormalized = normalizeText(query);
  const tokens = queryTokens(queryNormalized);
  const filtered = chunks.filter((chunk) => {
    if (scope.from && chunk.date < scope.from) return false;
    if (scope.to && chunk.date > scope.to) return false;
    if (scope.securityKey && chunk.securityKey !== scope.securityKey && !chunk.securityKeys?.includes(scope.securityKey)
      && !(selectedTerms ?? [normalizeText(scope.securityKey.replace(/^(?:code|name):/, ''))]).some((term) => sourceText(chunk).includes(term))) return false;
    if (scope.institution && resolveInstitution(chunk.institution).canonicalName !== resolveInstitution(scope.institution).canonicalName) return false;
    return true;
  });
  const scored = filtered
    .map((chunk) => ({ ...chunk, score: relevanceScore(queryNormalized, tokens, chunk) }))
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
    selected.push({ ...chunk, text, endLine: chunk.startLine + text.split(/\r?\n/).length - 1 });
    totalChars += text.length;
  }
  return { chunks: selected, totalChars };
}

export function resolveResearchIntent(
  query: string,
  scope: ResearchScope,
  chunks: ReadonlyArray<Pick<RetrievalChunk, 'date'>>,
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
  if (!scope.from && !scope.to) {
    const explicitDates = [...query.matchAll(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/g)]
      .map((match) => `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
    if (!explicitDates.length && latestReportDate) {
      for (const match of query.matchAll(/(?<!\d)(\d{1,2})月(\d{1,2})日?/g)) {
        explicitDates.push(`${latestReportDate.slice(0, 4)}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`);
      }
      if (!explicitDates.length && /报告|日报|全部买入|买入(?:标的|名单)/.test(query)) {
        for (const match of query.matchAll(/(?<![\d.])(\d{1,2})\.(\d{1,2})(?![\d.])/g)) {
          const date = `${latestReportDate.slice(0, 4)}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
          const parsed = new Date(`${date}T00:00:00Z`);
          if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) explicitDates.push(date);
        }
      }
    }
    if (explicitDates.length) {
      explicitDates.sort();
      return { scope: { ...scope, from: explicitDates[0], to: explicitDates.at(-1) }, currentDate, latestReportDate, mode };
    }
  }
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

export function resolveFollowUpScope(
  query: string,
  scope: ResearchScope,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  chunks: RetrievalChunk[],
): ResearchScope {
  const referencesPriorSecurity = /它|该公司|这家公司|这个公司|上述公司|前者|后者/.test(query)
    || /^(?:关于)?其(?!他|中|实|余|次)/.test(query);
  if (scope.securityKey || !referencesPriorSecurity) return { ...scope };
  const securities = new Map<string, { securityKey: string; terms: string[] }>();
  for (const chunk of chunks) {
    const entities = chunk.securities ?? (chunk.securityKey ? [{ key: chunk.securityKey, displayName: chunk.securityName ?? '', aliases: [] }] : []);
    for (const entity of entities) {
      const current = securities.get(entity.key) ?? { securityKey: entity.key, terms: [] };
      const code = entity.key.startsWith('code:') ? entity.key.slice(5) : '';
      current.terms = [...new Set([...current.terms, entity.displayName, ...entity.aliases, code].map(normalizeText).filter(Boolean))];
      securities.set(entity.key, current);
    }
  }
  for (let historyIndex = history.length - 1; historyIndex >= 0; historyIndex -= 1) {
    const content = normalizeText(history[historyIndex].content);
    let matchedKey = '';
    let matchedAt = -1;
    for (const security of securities.values()) {
      const latestMention = Math.max(...security.terms.map((term) => content.lastIndexOf(term)));
      if (latestMention > matchedAt) {
        matchedAt = latestMention;
        matchedKey = security.securityKey;
      }
    }
    if (matchedKey && matchedAt >= 0) return { ...scope, securityKey: matchedKey };
  }
  return { ...scope };
}

function relevanceScore(normalizedQuery: string, tokens: string[], chunk: RetrievalChunk) {
  const haystack = sourceText(chunk);
  let score = 0;
  if (chunk.securityName && normalizedQuery.includes(normalizeText(chunk.securityName))) score += 12;
  if (chunk.institution && normalizedQuery.includes(normalizeText(chunk.institution))) score += 8;
  for (const token of tokens) if (haystack.includes(token)) score += token.length > 2 ? 3 : 1;
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
