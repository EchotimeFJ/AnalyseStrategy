import fs from 'node:fs/promises';
import type { ReviewedReport } from '../domain/review.js';
import { loadReviewProjection, type ReportReviewState } from './reviewProjection.js';
import { reviewEnabled, reviewStore } from './reviewRuntime.js';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import {
  buildReportFromMarkdown,
  createExactSearch,
  createTagSearch,
  extractTargetMentions,
  normalizeText,
  type ReportDocument,
  type SearchHit,
  type TargetMention,
} from './reportParser.js';
import type {
  CompanyProfile,
  DataQualityIssue,
  OpinionRecord,
  ReportOverview,
  SecurityEntity,
} from '../domain/research.js';
import { dictionaryCodeNames } from './securityDictionary.js';
import { mergeSecurityEntities, resolveInstitution, securityKey, normalizeSecurityCode } from './entityResolver.js';
import { extractOpinions } from './opinionExtractor.js';
import { classifySearchIntent, groupSearchHits } from './searchService.js';
import { readUserConfig, type WatchItem } from './localConfig.js';
import { getReportDir } from '../runtimeConfig.js';
import { readSourceManifest, readReportSnapshot, writeReportSnapshot, type SourceManifest } from './reportCache.js';
import { publicData } from '../security.js';
import { restorePublishedIndex } from './publicationStore.js';
import { getBuyCoverage } from './buyCoverage.js';
import { resolveOpinions as dedupeOpinions } from './opinionResolution.js';

export type IndexState = {
  sourceDir: string;
  /** Current files read from disk before review overlays an older published
   * result for a pending modification. This stays in memory for source-change
   * reporting and is deliberately excluded from public snapshots. */
  sourceReports?: ReportDocument[];
  reports: ReportDocument[];
  mentions: TargetMention[];
  opinions: OpinionRecord[];
  entities: Map<string, SecurityEntity>;
  qualityIssues: DataQualityIssue[];
  reviewStates?: Record<string, ReportReviewState>;
  reviewFacts?: ReviewedReport[];
  reviewSignals?: import('./reportParser.js').CatalystRiskItem[];
  reviewFingerprint?: string;
  identityGraph?: import('../domain/identity.js').IdentityGraph;
  identityMapping?: Record<string, import('../domain/identity.js').IdentityMapping>;
  version?: string;
  indexedAt?: string;
  errors: Array<{ filePath: string; message: string }>;
  sourceFingerprint?: string;
  views?: IndexViews;
  cache?: { origin: 'disk' | 'rebuilt'; persisted: boolean; savedAt?: string; warning?: string };
};

type IndexOverview = {
  sourceDir: string; indexedAt?: string; indexVersion?: string;
  reportCount: number; securityCount: number; companyCount?: number; opinionCount: number;
  errorCount: number; qualityIssueCount: number; latestDate?: string;
  positiveOpinions: OpinionRecord[]; reportOverviews: ReportOverview[];
};
type IndexViews = { summaries: ReportSummary[]; reportOverviews: ReportOverview[]; overview: IndexOverview };

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
  sourceHash?: string;
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
  sourceDir: getReportDir(),
  reports: [],
  mentions: [],
  opinions: [],
  entities: new Map(),
  qualityIssues: [],
  errors: [],
};

let initializing: Promise<IndexState> | undefined;
let checkingSource: Promise<IndexState> | undefined;
let buildingIndex: Promise<IndexState> | undefined;
let nextSourceCheck = 0;
let updatingSource = false;
let publishedState = false;
let sourceUpdate: Promise<unknown> | undefined;

// Serialize all management updates and pause on-access checks while git changes
// the working tree. Readers continue using the previous complete index.
export function withIndexSourceUpdate<T>(work: () => Promise<T>): Promise<T> {
  const previous = sourceUpdate;
  const job = (async () => {
    await previous?.catch(() => undefined);
    updatingSource = true;
    await Promise.allSettled([initializing, checkingSource, buildingIndex].filter(Boolean));
    const baseline = state;
    try {
      return await work();
    } catch (error) {
      state = baseline;
      throw error;
    } finally {
      updatingSource = false;
    }
  })();
  sourceUpdate = job;
  void job.finally(() => { if (sourceUpdate === job) sourceUpdate = undefined; }).catch(() => undefined);
  return job;
}

export async function ensureIndex(options: { checkSource?: boolean } = {}): Promise<IndexState> {
  if (state.indexedAt) {
    // Readers keep using the last complete generation while a rebuild is running.
    if (options.checkSource === false || updatingSource || publishedState || process.env.NODE_ENV === 'production' || buildingIndex || checkingSource || Date.now() < nextSourceCheck) return state;
    checkingSource = (async () => {
      try {
        const manifest = await readSourceManifest(getReportDir());
        if (manifest.fingerprint !== state.sourceFingerprint || manifest.sourceDir !== state.sourceDir) {
          return await buildFreshIndex();
        }
        if (state.cache?.persisted) delete state.cache.warning;
      } catch {
        if (state.cache) state.cache.warning = '报告文件检查或重建失败，继续使用上一份完整索引。';
      }
      return state;
    })().finally(() => {
      checkingSource = undefined;
      scheduleSourceCheck();
    });
    return checkingSource;
  }
  if (initializing) return initializing;
  initializing = (async () => {
    const published = await restorePublishedIndex(getReportDir());
    if (published) {
      if (reviewEnabled() && !published.reviewFingerprint) {
        // Old snapshots are readable originals, not AI-validated facts. Never
        // promote a separately staged review result during pointer recovery.
        published.opinions = []; published.mentions = []; published.entities = new Map();
        published.reviewFacts = []; published.reviewSignals = [];
        published.reviewStates = Object.fromEntries(published.reports.map(r => [r.id, { status: 'legacy_unreviewed', sourceHash: '' , issueCount: 0 }]));
        published.version = `${published.version}:review-migration`;
        published.views = buildIndexViews(published);
      }
      state = published;
      publishedState = true;
      return state;
    }
    const manifest = await readSourceManifest(getReportDir());
    const restored = await readReportSnapshot(manifest);
    if (restored && (await readSourceManifest(manifest.sourceDir)).fingerprint === manifest.fingerprint) {
      if (reviewEnabled() && !restored.reviewFingerprint) {
        restored.opinions = []; restored.mentions = []; restored.entities = new Map();
        restored.reviewFacts = []; restored.reviewSignals = [];
        restored.reviewStates = Object.fromEntries(restored.reports.map(r => [r.id, { status: 'legacy_unreviewed', sourceHash: '', issueCount: 0 }]));
        restored.version = `${restored.version}:review-migration`;
        restored.views = buildIndexViews(restored);
      }
      state = restored;
      return state;
    }
    return buildFreshIndex();
  })().finally(() => {
    initializing = undefined;
    scheduleSourceCheck();
  });
  return initializing;
}

export async function rebuildIndex(): Promise<IndexState> {
  // Initialization can restore a disk snapshot, so it is not itself a forced build.
  if (initializing) await initializing.catch(() => undefined);
  return buildFreshIndex();
}

async function buildFreshIndex(): Promise<IndexState> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!buildingIndex) {
      // Keep the actual build rejection separate from automatic readers' stale fallback.
      buildingIndex = (async () => buildAndSaveIndex(await readSourceManifest(getReportDir())))()
        .finally(() => { buildingIndex = undefined; scheduleSourceCheck(); });
    }
    const result = await buildingIndex;
    const current = await readSourceManifest(getReportDir());
    if (current.sourceDir === result.sourceDir && current.fingerprint === result.sourceFingerprint) return result;
    // Files may have changed during async snapshot persistence or before a later
    // caller joined. That caller must get a build covering its current source.
  }
  throw new Error('Report files keep changing during rebuild; retry after the source update finishes');
}

function scheduleSourceCheck() {
  const configured = Number(process.env.REPORT_INDEX_CHECK_MS ?? 30_000);
  nextSourceCheck = Date.now() + (Number.isFinite(configured) && configured >= 0 ? configured : 30_000);
}

async function buildAndSaveIndex(manifest: SourceManifest): Promise<IndexState> {
  const next = await buildIndexCandidate(manifest);
  try {
    await writeReportSnapshot(next);
    next.cache = { origin: 'rebuilt', persisted: true, savedAt: next.indexedAt };
  } catch {
    next.cache!.warning = '索引已更新，但服务器缓存写入失败；重启后需要重新构建。';
  }
  state = next;
  return state;
}

export async function prepareIndexForPublication(): Promise<IndexState> {
  return buildIndexCandidate(await readSourceManifest(getReportDir()));
}

export function activatePublishedIndex(index: IndexState) {
  index.cache = { origin: 'rebuilt', persisted: true, savedAt: index.indexedAt };
  state = index;
  publishedState = true;
  scheduleSourceCheck();
}

async function buildIndexCandidate(manifest: SourceManifest): Promise<IndexState> {
  const { sourceDir, files } = manifest;
  let reports: ReportDocument[] = [];
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

  if (errors.length) throw new Error(`Report rebuild failed: ${errors.length} unreadable reports`);
  if (reviewEnabled()) {
    const synced = await reviewStore(sourceDir).sync(reports);
    reports = synced.map(item => item.report);
  }
  const sourceReports = reports.map(report => ({ ...report, lines: [...report.lines], institutions: report.institutions.map(block => ({ ...block })) }));
  const rawOpinions = reports.flatMap((report) => extractOpinions(report));
  const entities = mergeSecurityEntities(
    rawOpinions.map((opinion) => ({
      name: opinion.security.displayName,
      code: opinion.security.code,
      aliases: opinion.security.aliases,
    })),
  );
  const opinions = rawOpinions.map((opinion) => ({
    ...opinion,
    security: entities.get(opinion.security.key) ?? opinion.security,
  }));
  const reportHashes = new Map(reports.map(r => [r.id, createHash('sha256').update(r.markdown).digest('hex')]));
  const mentions = reports.flatMap((report) => extractTargetMentions(report)).map((mention) => {
    const key = securityKey({ code: mention.code, name: mention.targetName });
    const entity = entities.get(key);
    const institution = resolveInstitution(mention.institution);
    return {
      ...mention,
      sourceHash: reportHashes.get(mention.reportId),
      signals: mention.signals.map(s=>({...s,sourceHash:reportHashes.get(mention.reportId)})),
      institution: institution.canonicalName || mention.institution,
      targetName: entity?.displayName ?? mention.targetName,
      aliases: entity?.aliases ?? mention.aliases,
      code: entity?.code ?? mention.code,
    };
  });
  const qualityIssues = buildQualityIssues(reports, opinions);
  const indexedAt = new Date().toISOString();
  if (errors.length) throw new Error(`Report rebuild failed: ${errors.length} unreadable reports`);
  if ((await readSourceManifest(sourceDir)).fingerprint !== manifest.fingerprint) {
    throw new Error('Report files changed during rebuild; retry when the update has finished');
  }
  const next: IndexState = {
    sourceDir,
    sourceReports,
    reports: reports.sort((left, right) => left.date.localeCompare(right.date)),
    mentions,
    opinions,
    entities,
    qualityIssues,
    version: `${indexedAt}-${randomUUID()}`,
    indexedAt,
    errors,
    sourceFingerprint: manifest.fingerprint,
    cache: { origin: 'rebuilt', persisted: false },
  };
  const reviewed = await loadReviewProjection(reports, sourceDir);
  if (reviewed) {
    next.reports = reviewed.reports;
    next.opinions = reviewed.opinions; next.mentions = reviewed.mentions; next.entities = reviewed.entities;
    next.reviewStates = reviewed.states; next.reviewFacts = reviewed.facts;
    next.reviewSignals = reviewed.signals; next.reviewFingerprint = reviewed.fingerprint;
    next.identityGraph = reviewed.identityGraph; next.identityMapping = reviewed.identityMapping;
    next.qualityIssues = buildQualityIssues(next.reports, next.opinions);
    for (const [reportId,review] of Object.entries(reviewed.states)) if(review.status!=='succeeded') next.qualityIssues.push({type:review.status==='partial'?'review-partial':review.status==='failed'?'review-failed':'review-pending',reportId,message:review.status==='partial'?'报告有待核对字段':review.status==='failed'?'报告复核失败':'报告尚待复核'});
  }
  next.views = buildIndexViews(next);
  return next;
}

function buildQualityIssues(reports: ReportDocument[], opinions: OpinionRecord[]): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const seenInstitutions = new Set<string>();
  for (const report of reports) {
    for (const block of report.institutions) {
      const institution = resolveInstitution(block.institution);
      if (institution.verified || seenInstitutions.has(institution.rawName)) continue;
      seenInstitutions.add(institution.rawName);
      issues.push({
        type: 'unverified-institution',
        reportId: report.id,
        filePath: report.filePath,
        lineNumber: block.startLine,
        message: `待识别机构：${institution.rawName}`,
      });
    }
  }
  for (const opinion of opinions) {
    if (opinion.security.confidence !== 'low') continue;
    issues.push({
      type: 'low-confidence-security',
      reportId: opinion.reportId,
      lineNumber: opinion.evidence[0]?.lineNumber,
      message: `低置信证券：${opinion.security.displayName}`,
    });
  }
  return issues;
}

export function diffReportChanges(before: IndexState, after: IndexState): ReportChangeSet {
  const beforeReports = before.sourceReports ?? before.reports;
  const afterReports = after.sourceReports ?? after.reports;
  const beforeById = new Map(beforeReports.map((report) => [report.id, report]));
  const afterById = new Map(afterReports.map((report) => [report.id, report]));
  const added: ReportChange[] = [];
  const modified: ReportChange[] = [];
  const removed: ReportChange[] = [];

  for (const report of afterReports) {
    const previous = beforeById.get(report.id);
    if (!previous) {
      added.push(toReportChange('added', report, after.mentions));
      continue;
    }

    if (previous.markdown !== report.markdown) {
      modified.push(toReportChange('modified', report, after.mentions, previous));
    }
  }

  for (const report of beforeReports) {
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
    index.opinions.filter((item) => item.institutionVerified).map((item) => item.institution),
    (item) => item,
  );
  const latestReports = getIndexViews(index).summaries.slice(-8).reverse();

  return {
    sourceDir: index.sourceDir,
    indexedAt: index.indexedAt,
    reportCount: index.reports.length,
    targetCount: index.entities.size,
    mentionCount: index.mentions.length,
    errorCount: index.errors.length,
    latestDate: latestReports[0]?.date,
    years: toSortedCountArray(years),
    institutions: toSortedCountArray(institutions).slice(0, 18),
    latestReports,
    radar: await getRadar({ limit: 6 }),
  };
}

export async function getOverview(snapshot?: IndexState) {
  const index = snapshot ?? await ensureIndex();
  return getIndexViews(index).overview;
}

function buildIndexViews(index: IndexState): IndexViews {
  const reports = index.reports.slice().sort((left, right) => compareDateDesc(left.date, right.date));
  const opinionsByReport = new Map<string, OpinionRecord[]>();
  for (const opinion of index.opinions) {
    const group = opinionsByReport.get(opinion.reportId) ?? [];
    group.push(opinion);
    opinionsByReport.set(opinion.reportId, group);
  }
  const reportOverviews = reports.map(report => {
    const overview=buildReportOverview(report,opinionsByReport.get(report.id)??[]);
    const facts=index.reviewFacts?.find(f=>f.reportId===report.id);
    const evidence=new Map(facts?.evidence.map(e=>[e.evidenceId,e])??[]);
    const active=facts?.records.filter(r=>!r.status||r.status==='active')??[];
    const signals:NonNullable<ReportOverview['signals']>=active.flatMap(r=>{
      if(r.kind!=='signal'||r.payload.polarity!=='affirmative'||r.payload.temporalContext==='historical')return [];
      if(facts?.issues.some(i=>i.severity==='error'&&(!i.recordRef||[r.id,r.articleRef,r.payload.subject.mentionRef].includes(i.recordRef))))return [];
      const e=evidence.get(r.payload.evidenceIDs[0]);if(!e)return [];
      const subject=active.find(m=>m.id===r.payload.subject.mentionRef);
      return [{id:r.id,kind:r.payload.kind,subject:subject?.kind==='mention'?subject.payload.rawName:r.payload.subject.rawText??'未明确对象',subjectScope:r.payload.subject.scope,summary:r.payload.summary,lineNumber:e.startLine,sourceHash:facts!.sourceHash}];
    });
    const summaries:NonNullable<ReportOverview['summaries']>=active.flatMap(r=>{
      if(r.kind!=='article'||r.payload.summary.state!=='stated'||!r.payload.summary.value)return [];
      const e=evidence.get(r.payload.summary.evidenceIDs[0]);return e?[{id:r.id,title:r.payload.title,summary:r.payload.summary.value,lineNumber:e.startLine,sourceHash:facts!.sourceHash}]:[];
    });
    return {...overview,companyCount:index.identityGraph?new Set(overview.securities.map(s=>s.organizationId??s.key)).size:undefined,signals,summaries,review:index.reviewStates?.[report.id]??{status:'legacy_unreviewed'},publicationId:index.version};
  });
  const mentionCounts = new Map<string, number>();
  for (const mention of index.mentions) mentionCounts.set(mention.reportId, (mentionCounts.get(mention.reportId) ?? 0) + 1);
  const summaries = index.reports.map((report) => ({
    ...toReportSummary(report, []), targetCount: mentionCounts.get(report.id) ?? 0,
  }));
  const positiveOpinions = dedupeOpinions(index.opinions.filter((opinion) => opinion.types.includes('positive')))
    .sort(compareOpinionsDesc)
    .slice(0, 30);
  const overview: IndexOverview = {
    sourceDir: index.sourceDir,
    indexedAt: index.indexedAt,
    indexVersion: index.version,
    reportCount: index.reports.length,
    securityCount: index.entities.size,
    companyCount: index.identityGraph?new Set([...index.entities.values()].map(s=>s.organizationId??s.key)).size:undefined,
    opinionCount: index.opinions.length,
    errorCount: index.errors.length,
    qualityIssueCount: index.qualityIssues.length,
    latestDate: reports[0]?.date,
    positiveOpinions,
    reportOverviews: reportOverviews.slice(0, 12),
  };
  return { summaries, reportOverviews, overview };
}

function getIndexViews(index: IndexState) {
  return index.views ?? (index.views = buildIndexViews(index));
}


export async function getReportDraft(reportId: string, snapshot?: IndexState): Promise<ReportOverview | null> {
  const index=snapshot??await ensureIndex();const report=index.reports.find(r=>r.id===reportId);
  if(!report)return null;
  return {...buildReportOverview(report,extractOpinions(report)),review:{status:'legacy_unreviewed',sourceHash:createHash('sha256').update(report.markdown).digest('hex')},publicationId:index.version} as ReportOverview;
}

export async function getReportOverview(reportId: string, snapshot?: IndexState): Promise<ReportOverview | null> {
  const index = snapshot ?? await ensureIndex();
  return getIndexViews(index).reportOverviews.find((item) => item.reportId === reportId) ?? null;
}

export async function getCompanyProfiles(query = ''): Promise<CompanyProfile[]> {
  const index = await ensureIndex();
  const normalized = normalizeText(query);
  const queryCode=normalizeSecurityCode(query);
  const codeNames=new Set(queryCode?dictionaryCodeNames(queryCode).map(normalizeText):[]);
  const matchingEntities = [...index.entities.values()].filter((entity) => {
    if (!normalized) return true;
    return [entity.code ?? '', entity.displayName, ...entity.aliases]
      .some((value) => normalizeText(value).includes(normalized) || codeNames.has(normalizeText(value)));
  });

  const groupKeys = [...new Set(matchingEntities.map(s => s.organizationId ?? s.key))];
  return groupKeys.map(groupKey => {
    const listings = [...index.entities.values()].filter(s => (s.organizationId ?? s.key) === groupKey);
    const companyId = listings[0]?.organizationId;
    const organization = index.identityGraph?.organizations.find(o => o.organizationId === companyId);
    const security = listings.length === 1 ? listings[0] : { ...listings[0], key: `organization:${groupKey}`, code: null, displayName: organization?.canonicalName ?? listings[0].displayName, aliases: [...new Set(listings.flatMap(s => s.aliases))] };
    const memberKeys = new Set(listings.map(s => s.key));
    const opinions = dedupeOpinions(index.opinions.filter((opinion) => memberKeys.has(opinion.security.key)))
      .sort(compareOpinionsDesc);
    return {
      security,
      companyId, listings,
      firstMention: opinions.at(-1)?.reportDate ?? null,
      latestMention: opinions[0]?.reportDate ?? null,
      latestRating: opinions[0]?.rating ?? null,
      latestTargetPrice: opinions[0]?.targetPrice ?? null,
      institutions: [...new Set(opinions.map((opinion) => opinion.institution))].sort(),
      opinions,
      catalysts: opinions.filter((opinion) => opinion.types.includes('catalyst')),
      risks: opinions.filter((opinion) => opinion.types.includes('risk')),
    };
  }).sort((left, right) =>
    (right.latestMention ?? '').localeCompare(left.latestMention ?? '') ||
    left.security.displayName.localeCompare(right.security.displayName),
  );
}

export async function getDataQuality() {
  const index = await ensureIndex();
  return {
    issueCount: index.qualityIssues.length + index.errors.length,
    parseErrors: index.errors,
    issues: index.qualityIssues,
  };
}

export async function getReports(filters: { year?: string; institution?: string } = {}, snapshot?: IndexState) {
  const index = snapshot ?? await ensureIndex();
  let reports = getIndexViews(index).summaries;
  if (filters.year) {
    reports = reports.filter((report) => report.year === filters.year);
  }
  if (filters.institution) {
    reports = reports.filter((report) =>
      report.institutions.includes(filters.institution!),
    );
  }
  return reports.slice().reverse();
}

export async function getReportById(id: string, snapshot?: IndexState) {
  const index = snapshot ?? await ensureIndex();
  const report = index.reports.find((item) => item.id === id);
  if (!report) {
    return undefined;
  }
  return {
    ...toReportSummary(report, index.mentions),
    markdown: report.markdown,
    institutions: report.institutions,
    mentions: index.mentions.filter((mention) => mention.reportId === id),
    review: index.reviewStates?.[id] ?? { status: 'legacy_unreviewed' },
    publicationId: index.version,
  };
}

export async function searchReports(input: {
  q?: string;
  from?: string;
  to?: string;
  institution?: string;
  mode?: string;
  raw?: boolean;
  paginated?: boolean;
  offset?: number;
  limit?: number;
  publicationId?: string;
}) {
  const index = await ensureIndex();
  if (input.publicationId && input.publicationId !== index.version) throw new Error('PUBLICATION_CHANGED');
  const filteredReports = index.reports.filter((report) => {
    if (input.from && report.date < input.from) {
      return false;
    }
    if (input.to && report.date > input.to) {
      return false;
    }
    return true;
  });

  const ratingQuery = parseRatingQuery(input.q, input.mode);
  let hits: SearchHit[];
  if (input.mode === 'tag') {
    hits = createTagSearch(sortReportsDesc(filteredReports))(input.q ?? '');
  } else if (!input.raw && ratingQuery) {
    const reportIds = new Set(filteredReports.map((report) => report.id));
    hits = searchRatingMentions(index.mentions, reportIds, ratingQuery);
  } else {
    hits = filterSearchMode(
      createExactSearch(sortReportsDesc(filteredReports))(input.q ?? ''),
      input.raw ? undefined : input.mode,
    );
  }

  const queryCode=normalizeSecurityCode(input.q);
  if (!input.raw && input.mode !== 'tag' && !ratingQuery && queryCode) {
    const search=createExactSearch(sortReportsDesc(filteredReports));
    const related=filterSearchMode(dictionaryCodeNames(queryCode).flatMap(name=>search(name)),input.mode);
    hits=[...new Map([...hits,...related].map(hit=>[`${hit.reportId}:${hit.lineNumber}:${hit.snippet}`,hit])).values()];
  }

  if (input.institution) {
    const institution = normalizeText(resolveInstitution(input.institution).canonicalName);
    hits = hits.filter((hit) => normalizeText(resolveInstitution(hit.institution).canonicalName) === institution);
  }
  const sourceHashes=new Map(filteredReports.map(r=>[r.id,createHash('sha256').update(r.markdown).digest('hex')]));
  hits = hits.map(hit => ({ ...hit, sourceHash: sourceHashes.get(hit.reportId) }));
  const totalHits = hits.length;
  const offset = Number.isFinite(input.offset) ? Math.max(0, Math.floor(input.offset!)) : 0;
  const limit = Number.isFinite(input.limit) ? Math.min(500, Math.max(1, Math.floor(input.limit!))) : 500;
  hits = hits.slice(offset, offset + limit);
  const pagination = { totalHits, offset, limit, returnedHits: hits.length, hasMore: offset + hits.length < totalHits };
  // Existing raw clients keep the array contract; interactive clients opt into totals and paging.
  if (input.raw) return input.paginated ? { query: input.q ?? '', hits, ...pagination, publicationId: index.version } : hits;

  const intent = classifySearchIntent(input.q ?? '', {
    securities: [...index.entities.values()],
    institutions: [...new Set(index.opinions.filter((item) => item.institutionVerified).map((item) => item.institution))],
  });
  const company = intent.securityKey
    ? (await getCompanyProfiles(input.q ?? '')).find((item) => item.security.key === intent.securityKey || item.listings?.some(s => s.key === intent.securityKey)) ?? null
    : null;
  return {
    query: input.q ?? '',
    intent,
    ...pagination,
    groups: groupSearchHits(hits),
    company,
    publicationId: index.version,
  };
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
  const signals = (index.reviewSignals ?? mentions.flatMap((mention) => mention.signals))
    .filter(signal => (!options.from || signal.date >= options.from) && (!options.to || signal.date <= options.to))
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
    return toCsv(publicData(profile.mentions));
  }
  if (type === 'search' && query) {
    const hits = await searchReports({ q: query, raw: true });
    return toCsv(publicData(Array.isArray(hits) ? hits : []));
  }
  const summary = await getSummary();
  return JSON.stringify(publicData(summary), null, 2);
}

function buildReportOverview(report: ReportDocument, opinions: OpinionRecord[]): ReportOverview {
  const reportOpinions = dedupeOpinions(opinions.filter((opinion) => opinion.reportId === report.id));
  const securities = [...new Map(reportOpinions.map((opinion) => [opinion.security.key, opinion.security])).values()];
  return {
    reportId: report.id,
    date: report.date,
    title: report.title,
    institutions: [...new Set(reportOpinions.map((opinion) => opinion.institution))],
    opinions: reportOpinions,
    securities,
    positiveCount: reportOpinions.filter((opinion) => opinion.types.includes('positive')).length,
    ratingChangeCount: reportOpinions.filter((opinion) => opinion.types.includes('rating-change')).length,
    targetPriceChangeCount: reportOpinions.filter((opinion) => opinion.types.includes('target-price-change')).length,
    riskCount: reportOpinions.filter((opinion) => opinion.types.includes('risk')).length,
    catalystCount: reportOpinions.filter((opinion) => opinion.types.includes('catalyst')).length,
    buyCoverage: getBuyCoverage(report, reportOpinions),
  };
}

function compareOpinionsDesc(left: OpinionRecord, right: OpinionRecord): number {
  return compareDateDesc(left.reportDate, right.reportDate) || left.id.localeCompare(right.id);
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
  const normalizedQuery = normalizeText(query ?? '').replace(/^(?:投资评级|评级|rating)[:：]?|(?:投资评级|评级|rating)$/g, '');
  if (!normalizedQuery && mode === 'rating') {
    return '*';
  }

  for (const [rating, aliases] of Object.entries(RATING_SEARCH_ALIASES)) {
    if (aliases.some((alias) => normalizedQuery === normalizeText(alias))) {
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
      changes.push(toChange(mention, undefined, mention.action || '首次记录'));
    } else if (previous.date !== mention.date && ((previous.rating && mention.rating && previous.rating !== mention.rating) || comparablePriceChanged(previous, mention) || mention.action && !/维持|重申/.test(mention.action))) {
      changes.push(toChange(mention, previous, inferChangeType(previous, mention)));
    }
    lastByKey.set(key, mention);
  }
  return changes.sort((left, right) => compareDateDesc(left.date, right.date));
}

function toChange(mention: TargetMention, previous: TargetMention | undefined, changeType: string): TargetChange {
  return {
    sourceHash: mention.sourceHash,
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
  if (comparablePriceChanged(previous,current)) {
    return '目标价变化';
  }
  if (previous.rating !== current.rating) {
    return '评级变化';
  }
  return '维持';
}

function buildInstitutionMatrix(mentions: TargetMention[]) {
  const latest = new Map<string, TargetMention[]>();
  for (const mention of mentions) {
    const key = `${targetKey(mention)}|${mention.institution}`;
    const previous = latest.get(key);
    if (!previous || previous[0].date < mention.date) latest.set(key, [mention]);
    else if (previous[0].date === mention.date) previous.push(mention);
  }

  const grouped = new Map<string, TargetMention[]>();
  for (const mention of [...latest.values()].flat()) {
    const key = `${mention.targetName}|${targetKey(mention)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), mention]);
  }

  return [...grouped.entries()]
    .map(([, items]) => ({
      targetName: items[0].targetName,
      securityCode: items[0].code ?? null,
      items: items.sort((left, right) => left.institution.localeCompare(right.institution)),
    }))
    .sort((left, right) => right.items.length - left.items.length);
}

function hasDivergence(items: TargetMention[]): boolean {
  if (items.some(item => item.reviewStatementId)) {
    const latest = items.map(i => i.date).sort().at(-1);
    items = items.filter(i => i.date === latest && i.ratingScaleRef && i.targetPriceHorizon);
    if (items.length < 2 || new Set(items.map(i => `${i.ratingScaleRef}|${i.targetPriceHorizon}|${targetKey(i)}`)).size !== 1) return false;
  }
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

function comparablePriceChanged(previous: TargetMention, current: TargetMention) {
  if (!previous.targetPrice || !current.targetPrice) return false;
  if (previous.reviewStatementId || current.reviewStatementId) {
    if (!previous.targetPriceComparable || !current.targetPriceComparable) return false;
    const before = JSON.parse(previous.targetPriceComparable) as Array<string | null>;
    const after = JSON.parse(current.targetPriceComparable) as Array<string | null>;
    if (JSON.stringify(before.slice(0,3)) !== JSON.stringify(after.slice(0,3))) return false;
    const normalize = (values: Array<string | null>) => values.map(v => v && /^\d+(?:\.\d+)?$/.test(v) && v.includes('.') ? v.replace(/0+$/,'').replace(/\.$/,'') : v);
    return JSON.stringify(normalize(before.slice(3))) !== JSON.stringify(normalize(after.slice(3)));
  }
  const currency = (text: string) => /港元|HKD|HK\$/i.test(text) ? 'HKD' : /美元|USD|US\$/i.test(text) ? 'USD' : /人民币|RMB|CNY|元/.test(text) ? 'CNY' : null;
  const before = currency(previous.targetPrice), after = currency(current.targetPrice);
  if (!before || before !== after) return false;
  const normalized = (text: string) => text.normalize('NFKC').replace(/[,，\s]/g,'').replace(/\d+(?:\.\d+)?/g,n => n.includes('.') ? n.replace(/0+$/,'').replace(/\.$/,'') : n);
  return normalized(previous.targetPrice) !== normalized(current.targetPrice);
}
