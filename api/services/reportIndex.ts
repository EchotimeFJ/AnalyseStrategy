import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildReportFromMarkdown,
  createExactSearch,
  extractTargetMentions,
  normalizeText,
  type ReportDocument,
  type SearchHit,
  type TargetMention,
} from './reportParser.js';
import { readUserConfig, type WatchItem } from './localConfig.js';

const DEFAULT_REPORT_DIR = process.env.REPORT_DIR || '/Users/bytedance/ai-projects/Strategy/港A美/机构日报';

export type IndexState = {
  sourceDir: string;
  reports: ReportDocument[];
  mentions: TargetMention[];
  indexedAt?: string;
  errors: Array<{ filePath: string; message: string }>;
};

export type ReportSummary = {
  id: string;
  date: string;
  year: string;
  filePath: string;
  title: string;
  institutions: string[];
  targetCount: number;
  lineCount: number;
  updatedAt?: string;
};

export type ReportChangeType = 'added' | 'modified' | 'removed';

export type ReportChange = ReportSummary & {
  type: ReportChangeType;
  previousUpdatedAt?: string;
  nextUpdatedAt?: string;
};

export type ReportChangeSet = {
  added: ReportChange[];
  modified: ReportChange[];
  removed: ReportChange[];
  generatedAt: string;
};

type TargetChange = {
  targetName: string;
  institution: string;
  previousRating?: string;
  currentRating?: string;
  previousTargetPrice?: string;
  currentTargetPrice?: string;
  changeType: string;
  date: string;
  reportId: string;
  lineNumber: number;
};

const RATING_SEARCH_ALIASES: Record<string, string[]> = {
  买入: ['买入', 'buy', '1h', '1l'],
  增持: ['增持', 'overweight', 'ow', '跑赢', '优于大市'],
  中性: ['中性', 'neutral'],
  持有: ['持有', 'hold'],
  减持: ['减持', 'underweight', 'uw', '跑输', '弱于大市'],
  卖出: ['卖出', 'sell'],
};

let state: IndexState = {
  sourceDir: process.env.REPORTS_DIR || DEFAULT_REPORT_DIR,
  reports: [],
  mentions: [],
  errors: [],
};

export async function ensureIndex(): Promise<IndexState> {
  if (!state.indexedAt) {
    await rebuildIndex();
  }
  return state;
}

export async function rebuildIndex(): Promise<IndexState> {
  const sourceDir = process.env.REPORTS_DIR || DEFAULT_REPORT_DIR;
  const files = await scanMarkdownFiles(sourceDir);
  const reports: ReportDocument[] = [];
  const errors: IndexState['errors'] = [];

  for (const filePath of files) {
    try {
      const markdown = await fs.readFile(filePath, 'utf-8');
      const stat = await fs.stat(filePath);
      reports.push(
        buildReportFromMarkdown({
          id: makeReportId(sourceDir, filePath),
          filePath,
          markdown,
          updatedAt: stat.mtime.toISOString(),
        }),
      );
    } catch (error) {
      errors.push({
        filePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const mentions = reports.flatMap((report) => extractTargetMentions(report));
  state = {
    sourceDir,
    reports: reports.sort((left, right) => left.date.localeCompare(right.date)),
    mentions,
    indexedAt: new Date().toISOString(),
    errors,
  };
  return state;
}

export function diffReportChanges(before: IndexState, after: IndexState): ReportChangeSet {
  const beforeById = new Map(before.reports.map((report) => [report.id, report]));
  const afterById = new Map(after.reports.map((report) => [report.id, report]));
  const added: ReportChange[] = [];
  const modified: ReportChange[] = [];
  const removed: ReportChange[] = [];

  for (const report of after.reports) {
    const previous = beforeById.get(report.id);
    if (!previous) {
      added.push(toReportChange('added', report, after.mentions));
      continue;
    }

    if (previous.markdown !== report.markdown) {
      modified.push(toReportChange('modified', report, after.mentions, previous));
    }
  }

  for (const report of before.reports) {
    if (!afterById.has(report.id)) {
      removed.push(toReportChange('removed', report, before.mentions));
    }
  }

  return {
    added: added.sort(compareReportChangesDesc),
    modified: modified.sort(compareReportChangesDesc),
    removed: removed.sort(compareReportChangesDesc),
    generatedAt: new Date().toISOString(),
  };
}

export async function getSummary() {
  const index = await ensureIndex();
  const years = countBy(index.reports, (report) => report.year);
  const institutions = countBy(
    index.reports.flatMap((report) => report.institutions.map((item) => item.institution)),
    (item) => item,
  );
  const latestReports = getReportSummaries(index.reports).slice(-8).reverse();
  const targetNames = new Set(index.mentions.map((mention) => targetKey(mention)));

  return {
    sourceDir: index.sourceDir,
    indexedAt: index.indexedAt,
    reportCount: index.reports.length,
    targetCount: targetNames.size,
    mentionCount: index.mentions.length,
    errorCount: index.errors.length,
    latestDate: latestReports[0]?.date,
    years: toSortedCountArray(years),
    institutions: toSortedCountArray(institutions).slice(0, 18),
    latestReports,
    radar: await getRadar({ limit: 6 }),
  };
}

export async function getReports(filters: { year?: string; institution?: string } = {}) {
  const index = await ensureIndex();
  let reports = index.reports;
  if (filters.year) {
    reports = reports.filter((report) => report.year === filters.year);
  }
  if (filters.institution) {
    reports = reports.filter((report) =>
      report.institutions.some((item) => item.institution === filters.institution),
    );
  }
  return getReportSummaries(reports).reverse();
}

export async function getReportById(id: string) {
  const index = await ensureIndex();
  const report = index.reports.find((item) => item.id === id);
  if (!report) {
    return undefined;
  }
  return {
    ...toReportSummary(report, index.mentions),
    markdown: report.markdown,
    institutions: report.institutions,
    mentions: index.mentions.filter((mention) => mention.reportId === id),
  };
}

export async function searchReports(input: {
  q?: string;
  from?: string;
  to?: string;
  institution?: string;
  mode?: string;
}) {
  const index = await ensureIndex();
  const filteredReports = index.reports.filter((report) => {
    if (input.from && report.date < input.from) {
      return false;
    }
    if (input.to && report.date > input.to) {
      return false;
    }
    if (input.institution && !report.institutions.some((item) => item.institution === input.institution)) {
      return false;
    }
    return true;
  });

  const ratingQuery = parseRatingQuery(input.q, input.mode);
  if (ratingQuery) {
    const reportIds = new Set(filteredReports.map((report) => report.id));
    return searchRatingMentions(index.mentions, reportIds, ratingQuery).slice(0, 500);
  }

  const hits = createExactSearch(sortReportsDesc(filteredReports))(input.q ?? '');
  return filterSearchMode(hits, input.mode).slice(0, 500);
}

export async function getTargetProfile(query: string) {
  const index = await ensureIndex();
  const config = await readUserConfig();
  const aliases = aliasesForQuery(query, config.aliases);
  const normalizedAliases = aliases.map(normalizeText);

  const mentions = index.mentions
    .filter((mention) => mentionMatches(mention, normalizedAliases))
    .sort((left, right) => left.date.localeCompare(right.date));
  const responseMentions = mentions.slice(-1000);

  const institutions = [...new Set(responseMentions.map((mention) => mention.institution))].sort();
  const allAliases = [...new Set(responseMentions.flatMap((mention) => mention.aliases).filter(Boolean))];
  const signals = responseMentions.flatMap((mention) => mention.signals).slice(-40).reverse();

  return {
    query,
    canonicalName: chooseCanonicalName(query, responseMentions),
    aliases: allAliases.length ? allAliases : aliases,
    firstMention: responseMentions[0]?.date,
    latestMention: responseMentions.at(-1)?.date,
    institutions,
    mentions: responseMentions.slice().reverse(),
    ratingChanges: detectChanges(responseMentions),
    matrix: buildInstitutionMatrix(responseMentions),
    signals,
    summary: summarizeTarget(responseMentions),
  };
}

export async function getRadar(options: { from?: string; to?: string; limit?: number } = {}) {
  const index = await ensureIndex();
  const mentions = index.mentions.filter((mention) => {
    if (options.from && mention.date < options.from) {
      return false;
    }
    if (options.to && mention.date > options.to) {
      return false;
    }
    return true;
  });
  const changes = detectChanges(mentions).slice(0, 60);
  const firstCoverages = mentions
    .filter((mention) => mention.action?.includes('首次') || mention.excerpt.includes('首次覆盖') || mention.excerpt.includes('首予'))
    .sort(compareMentionsDesc)
    .slice(0, 60);
  const signals = mentions
    .flatMap((mention) => mention.signals)
    .sort(compareSignalsDesc)
    .slice(0, 80);
  const themes = countThemes(index.reports);
  const limit = options.limit ?? 24;

  return {
    firstCoverages: firstCoverages.slice(0, limit),
    ratingChanges: changes.slice(0, limit),
    targetPriceChanges: changes.filter((item) => item.changeType.includes('目标价')).slice(0, limit),
    catalysts: signals.filter((item) => item.type === 'catalyst').slice(0, limit),
    risks: signals.filter((item) => item.type === 'risk').slice(0, limit),
    themes: themes.slice(0, limit),
  };
}

export async function getInstitutionView(input: { target?: string; institution?: string }) {
  const index = await ensureIndex();
  let mentions = index.mentions;
  if (input.target) {
    const normalized = normalizeText(input.target);
    mentions = mentions.filter((mention) => mentionMatches(mention, [normalized]));
  }
  if (input.institution) {
    mentions = mentions.filter((mention) => mention.institution === input.institution);
  }

  const matrix = buildInstitutionMatrix(mentions);
  const coverage = toSortedCountArray(countBy(mentions, (mention) => mention.institution));
  const targetCoverage = toSortedCountArray(countBy(mentions, (mention) => mention.targetName)).slice(0, 30);

  return {
    matrix,
    coverage,
    targetCoverage,
    divergence: matrix.filter((row) => row.items.length > 1 && hasDivergence(row.items)).slice(0, 30),
  };
}

export async function getWatchlistView(watchlist: WatchItem[]) {
  const index = await ensureIndex();
  return watchlist.map((watch) => {
    const aliases = [watch.name, ...watch.aliases].map(normalizeText);
    const mentions = index.mentions
      .filter((mention) => mentionMatches(mention, aliases))
      .sort((left, right) => right.date.localeCompare(left.date));
    return {
      ...watch,
      mentionCount: mentions.length,
      latestMention: mentions[0],
      latestChanges: detectChanges(mentions).slice(0, 5),
    };
  });
}

export async function exportData(type: string, query?: string) {
  if (type === 'target' && query) {
    const profile = await getTargetProfile(query);
    return toCsv(profile.mentions);
  }
  if (type === 'search' && query) {
    const hits = await searchReports({ q: query });
    return toCsv(hits);
  }
  const summary = await getSummary();
  return JSON.stringify(summary, null, 2);
}

function getReportSummaries(reports: ReportDocument[]): ReportSummary[] {
  return reports.map((report) => toReportSummary(report, state.mentions));
}

function sortReportsDesc(reports: ReportDocument[]): ReportDocument[] {
  return reports.slice().sort((left, right) => compareDateDesc(left.date, right.date));
}

function toReportSummary(report: ReportDocument, mentions: TargetMention[]): ReportSummary {
  return {
    id: report.id,
    date: report.date,
    year: report.year,
    filePath: report.filePath,
    title: report.title,
    institutions: report.institutions.map((item) => item.institution),
    targetCount: mentions.filter((mention) => mention.reportId === report.id).length,
    lineCount: report.lineCount,
    updatedAt: report.updatedAt,
  };
}

function toReportChange(
  type: ReportChangeType,
  report: ReportDocument,
  mentions: TargetMention[],
  previous?: ReportDocument,
): ReportChange {
  return {
    ...toReportSummary(report, mentions),
    type,
    previousUpdatedAt: previous?.updatedAt,
    nextUpdatedAt: report.updatedAt,
  };
}

function compareReportChangesDesc(left: ReportChange, right: ReportChange): number {
  return compareDateDesc(left.date, right.date) || left.id.localeCompare(right.id);
}

async function scanMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return scanMarkdownFiles(fullPath);
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        return [fullPath];
      }
      return [];
    }),
  );
  return nested.flat().sort();
}

function makeReportId(root: string, filePath: string): string {
  return path
    .relative(root, filePath)
    .replace(/\.md$/i, '')
    .replace(/[/\\]+/g, '__')
    .replace(/[^\w.-]+/g, '_');
}

function filterSearchMode(hits: SearchHit[], mode?: string): SearchHit[] {
  if (!mode || mode === 'all') {
    return hits;
  }
  const patterns: Record<string, RegExp> = {
    rating: /评级|买入|增持|中性|卖出|减持|持有|首次覆盖|维持|上调|下调|buy|hold|sell|overweight|underweight/i,
    target: /目标价|tp|pt|target price|港元|美元|人民币|新台币/i,
    signal: /催化剂|风险|估值|财务|宏观|政策|监管|订单|产能/i,
  };
  const pattern = patterns[mode];
  return pattern ? hits.filter((hit) => pattern.test(hit.snippet)) : hits;
}

function parseRatingQuery(query?: string, mode?: string): string | undefined {
  const normalizedQuery = normalizeText(query ?? '').replace(/评级|投资评级|rating/g, '');
  if (!normalizedQuery && mode === 'rating') {
    return '*';
  }

  for (const [rating, aliases] of Object.entries(RATING_SEARCH_ALIASES)) {
    if (aliases.some((alias) => normalizedQuery.includes(normalizeText(alias)))) {
      return rating;
    }
  }
  return undefined;
}

function searchRatingMentions(
  mentions: TargetMention[],
  reportIds: Set<string>,
  ratingQuery: string,
): SearchHit[] {
  return mentions
    .filter((mention) => reportIds.has(mention.reportId))
    .filter((mention) => {
      if (!mention.rating) {
        return false;
      }
      if (ratingQuery === '*') {
        return true;
      }
      return ratingMatches(mention.rating, ratingQuery);
    })
    .sort(compareMentionsDesc)
    .map((mention) => ({
      reportId: mention.reportId,
      date: mention.date,
      institution: mention.institution,
      lineNumber: mention.lineNumber,
      snippet: `${mention.targetName}｜${mention.rating ?? ''}${mention.targetPrice ? `｜目标价 ${mention.targetPrice}` : ''}｜${mention.excerpt}`,
      matchedText: ratingQuery === '*' ? '评级' : `${ratingQuery}评级`,
    }));
}

function ratingMatches(actualRating: string, expectedRating: string): boolean {
  const aliases = RATING_SEARCH_ALIASES[expectedRating] ?? [expectedRating];
  const normalizedActual = normalizeText(actualRating);
  return aliases.some((alias) => normalizedActual.includes(normalizeText(alias)));
}

function aliasesForQuery(query: string, aliasEntries: Array<{ canonical: string; aliases: string[] }>): string[] {
  const normalized = normalizeText(query);
  const entry = aliasEntries.find((item) =>
    [item.canonical, ...item.aliases].some((alias) => normalizeText(alias) === normalized),
  );
  return entry ? [entry.canonical, ...entry.aliases] : [query];
}

function mentionMatches(mention: TargetMention, normalizedAliases: string[]): boolean {
  const fields = [mention.targetName, mention.code ?? '', ...mention.aliases]
    .map(normalizeText)
    .filter(Boolean);
  return normalizedAliases.some((query) => fields.some((field) => field.includes(query)));
}

function chooseCanonicalName(query: string, mentions: TargetMention[]): string {
  const normalizedQuery = normalizeText(query);
  const names = [...new Set(mentions.map((mention) => mention.targetName).filter(Boolean))]
    .filter((name) => {
      const normalized = normalizeText(name);
      return normalized.includes(normalizedQuery) || normalizedQuery.includes(normalized);
    })
    .sort((left, right) => left.length - right.length);
  return names[0] ?? mentions[0]?.targetName ?? query;
}

function detectChanges(mentions: TargetMention[]): TargetChange[] {
  const ordered = mentions
    .filter((mention) => mention.rating || mention.targetPrice)
    .sort((left, right) => {
      const key = targetKey(left).localeCompare(targetKey(right));
      return key || left.institution.localeCompare(right.institution) || left.date.localeCompare(right.date);
    });
  const lastByKey = new Map<string, TargetMention>();
  const changes: TargetChange[] = [];

  for (const mention of ordered) {
    const key = `${targetKey(mention)}|${mention.institution}`;
    const previous = lastByKey.get(key);
    if (!previous) {
      changes.push(toChange(mention, undefined, mention.action || '首次覆盖'));
    } else if (previous.rating !== mention.rating || previous.targetPrice !== mention.targetPrice || mention.action) {
      changes.push(toChange(mention, previous, inferChangeType(previous, mention)));
    }
    lastByKey.set(key, mention);
  }
  return changes.sort((left, right) => compareDateDesc(left.date, right.date));
}

function toChange(mention: TargetMention, previous: TargetMention | undefined, changeType: string): TargetChange {
  return {
    targetName: mention.targetName,
    institution: mention.institution,
    previousRating: previous?.rating,
    currentRating: mention.rating,
    previousTargetPrice: previous?.targetPrice,
    currentTargetPrice: mention.targetPrice,
    changeType,
    date: mention.date,
    reportId: mention.reportId,
    lineNumber: mention.lineNumber,
  };
}

function inferChangeType(previous: TargetMention, current: TargetMention): string {
  if (current.action) {
    return current.action;
  }
  if (previous.targetPrice !== current.targetPrice) {
    return '目标价变化';
  }
  if (previous.rating !== current.rating) {
    return '评级变化';
  }
  return '维持';
}

function buildInstitutionMatrix(mentions: TargetMention[]) {
  const latest = new Map<string, TargetMention>();
  for (const mention of mentions) {
    const key = `${targetKey(mention)}|${mention.institution}`;
    const previous = latest.get(key);
    if (!previous || previous.date <= mention.date) {
      latest.set(key, mention);
    }
  }

  const grouped = new Map<string, TargetMention[]>();
  for (const mention of latest.values()) {
    const key = mention.targetName;
    grouped.set(key, [...(grouped.get(key) ?? []), mention]);
  }

  return [...grouped.entries()]
    .map(([targetName, items]) => ({
      targetName,
      items: items.sort((left, right) => left.institution.localeCompare(right.institution)),
    }))
    .sort((left, right) => right.items.length - left.items.length);
}

function hasDivergence(items: TargetMention[]): boolean {
  const ratings = new Set(items.map((item) => item.rating).filter(Boolean));
  const prices = new Set(items.map((item) => item.targetPrice).filter(Boolean));
  return ratings.size > 1 || prices.size > 1;
}

function summarizeTarget(mentions: TargetMention[]) {
  const latest = mentions.at(-1);
  const ratings = toSortedCountArray(countBy(mentions.filter((item) => item.rating), (item) => item.rating ?? ''));
  const targetPrices = mentions
    .filter((item) => item.targetPrice)
    .slice()
    .sort(compareMentionsDesc)
    .map((item) => ({
      date: item.date,
      institution: item.institution,
      targetPrice: item.targetPrice,
    }));
  const positive = mentions.filter((item) => /买入|增持|上调|首予|首次覆盖|overweight|buy/i.test(item.excerpt)).length;
  const negative = mentions.filter((item) => /卖出|减持|下调|风险|underweight|sell/i.test(item.excerpt)).length;
  return {
    latestRating: latest?.rating,
    latestTargetPrice: latest?.targetPrice,
    ratingDistribution: ratings,
    targetPrices,
    sentimentHint: positive >= negative ? '偏积极或建设性' : '风险提示较多',
  };
}

function countThemes(reports: ReportDocument[]) {
  const tags = reports.flatMap((report) => report.institutions.flatMap((block) => block.tags));
  return toSortedCountArray(countBy(tags, (tag) => tag)).slice(0, 30);
}

function targetKey(mention: TargetMention): string {
  return normalizeText(mention.code || mention.targetName || mention.aliases[0] || '');
}

function compareMentionsDesc(left: TargetMention, right: TargetMention): number {
  return compareDateDesc(left.date, right.date) || right.lineNumber - left.lineNumber;
}

function compareSignalsDesc(
  left: { date: string; lineNumber: number },
  right: { date: string; lineNumber: number },
): number {
  return compareDateDesc(left.date, right.date) || right.lineNumber - left.lineNumber;
}

function compareDateDesc(left: string, right: string): number {
  return right.localeCompare(left);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function toSortedCountArray(counts: Map<string, number>) {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function toCsv(rows: unknown[]): string {
  if (!rows.length) {
    return '';
  }
  const objects = rows.map((row) => flatten(row as Record<string, unknown>));
  const headers = [...new Set(objects.flatMap((row) => Object.keys(row)))];
  const lines = [
    headers.join(','),
    ...objects.map((row) => headers.map((header) => csvCell(row[header])).join(',')),
  ];
  return lines.join('\n');
}

function flatten(value: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = typeof item === 'object' && item !== null ? JSON.stringify(item) : item;
  }
  return result;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[,"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
