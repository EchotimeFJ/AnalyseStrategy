import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { buildReportFromMarkdown, extractTargetMentions, type ReportDocument, type TargetMention } from './reportParser.js';
import { extractOpinionsFromMentions } from './opinionExtractor.js';
import type { OpinionRecord } from '../domain/research.js';

const compress = promisify(gzip), decompress = promisify(gunzip);
const hash = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const digest = createHash('sha256');
for (const file of ['./reportAnalysisCache.ts', './reportParser.ts', './reportRecognition.ts', './opinionExtractor.ts', './entityResolver.ts', './securityDictionary.ts', './securityAliases.ts', '../data/securities.json', '../data/security-aliases.json', '../../src/lib/markdownTags.ts', '../../src/shared/researchVocabulary.ts', '../../package-lock.json']) digest.update(readFileSync(new URL(file, import.meta.url)));
export const analysisRulesHash = digest.digest('hex');
type Input = Parameters<typeof buildReportFromMarkdown>[0];
type Prepared = { report: ReportDocument; mentions: TargetMention[]; opinions: OpinionRecord[]; reused: boolean };
type Cached = { rules: string; content: string; report: Omit<ReportDocument, 'markdown' | 'lines'>; mentions: TargetMention[]; opinions: OpinionRecord[] };

function cacheRoot(sourceDir: string) {
  return path.join(process.env.REPORT_INDEX_CACHE_DIR?.trim() || path.resolve('data/runtime/report-cache'), 'analysis', hash(path.resolve(sourceDir)).slice(0, 20));
}
export function analysisCacheFile(sourceDir: string, id: string) { return path.join(cacheRoot(sourceDir), hash(id) + '.json.gz'); }

export async function analyzeReport(input: Input, sourceDir: string): Promise<Prepared> {
  // Bound uninterrupted work to one report so HTTP requests can use the previous publication.
  await setImmediate();
  const file = analysisCacheFile(sourceDir, input.id), content = hash(input.markdown);
  try {
    const bytes = await fs.readFile(file);
    const cached = JSON.parse((await decompress(bytes, { maxOutputLength: 32 * 1024 * 1024 })).toString()) as Cached;
    if (cached.rules === analysisRulesHash && cached.content === content && cached.report.id === input.id && cached.report.filePath === input.filePath
      && Array.isArray(cached.report.institutions) && Array.isArray(cached.report.tags) && Array.isArray(cached.mentions) && Array.isArray(cached.opinions)) {
      const report = { ...cached.report, markdown: input.markdown, lines: input.markdown.split(/\r?\n/), updatedAt: input.updatedAt };
      return { report, mentions: cached.mentions, opinions: cached.opinions, reused: true };
    }
  } catch { /* Missing/corrupt/obsolete derived data is rebuilt from the original. */ }
  const report = buildReportFromMarkdown(input);
  const mentions = extractTargetMentions(report);
  const opinions = extractOpinionsFromMentions(report, mentions);
  const metadata: Cached['report'] = { id: report.id, date: report.date, year: report.year, filePath: report.filePath, title: report.title, lineCount: report.lineCount, tags: report.tags, institutions: report.institutions, updatedAt: report.updatedAt };
  const data: Cached = { rules: analysisRulesHash, content, report: metadata, mentions, opinions };
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    const bytes = await compress(JSON.stringify(data), { level: 1 });
    await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, file);
  } catch { /* Cache persistence never makes readable source reports unavailable. */ }
  finally { await fs.unlink(temporary).catch(() => undefined); }
  return { report, mentions, opinions, reused: false };
}

export async function pruneAnalysisCache(sourceDir: string, reportIds: string[]) {
  const live = new Set(reportIds.map(id => path.basename(analysisCacheFile(sourceDir, id))));
  try {
    const root = cacheRoot(sourceDir);
    for (const name of await fs.readdir(root)) if (/^[a-f0-9]{64}\.json\.gz$/.test(name) && !live.has(name)) await fs.unlink(path.join(root, name));
  } catch { /* Deleting derived data is best effort. */ }
}
