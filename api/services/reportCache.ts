import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import type { IndexState } from './reportIndex.js';
import type { InstitutionBlock, ReportDocument } from './reportParser.js';
import type { SecurityEntity } from '../domain/research.js';
import { getAppVersion } from './version.js';

const compress = promisify(gzip);
const decompress = promisify(gunzip);
const SCHEMA_VERSION = 2;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

export type SourceManifest = { sourceDir: string; files: string[]; fingerprint: string };
type DiskReport = Omit<ReportDocument, 'lines' | 'institutions'> & { institutions: Omit<InstitutionBlock, 'content'>[] };
type DiskIndex = Omit<IndexState, 'reports' | 'entities'> & { reports: DiskReport[]; entities: Array<[string, SecurityEntity]> };

export async function readSourceManifest(source: string): Promise<SourceManifest> {
  const sourceDir = path.resolve(source);
  const entries: Array<[string, number, number, number]> = [];
  async function scan(directory: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(children.map(async (child) => {
      const file = path.join(directory, child.name);
      if (child.isDirectory()) return scan(file);
      if (!child.isFile() || !child.name.endsWith('.md')) return;
      const stat = await fs.stat(file);
      entries.push([path.relative(sourceDir, file), stat.size, stat.mtimeMs, stat.ctimeMs]);
    }));
  }
  await scan(sourceDir);
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return {
    sourceDir,
    files: entries.map(([file]) => path.join(sourceDir, file)),
    fingerprint: digest(JSON.stringify(entries)),
  };
}

export function reportCachePath(sourceDir: string) {
  const directory = process.env.REPORT_INDEX_CACHE_DIR?.trim() || path.resolve('data/runtime/report-cache');
  return path.join(directory, `${digest(path.resolve(sourceDir)).slice(0, 20)}.json.gz`);
}

function revision() {
  const app = getAppVersion();
  return `${SCHEMA_VERSION}:${app.version}:${app.commit}`;
}

export async function readReportSnapshot(manifest: SourceManifest): Promise<IndexState | null> {
  try {
    const file = reportCachePath(manifest.sourceDir);
    if ((await fs.stat(file)).size > MAX_SNAPSHOT_BYTES) return null;
    const content = await decompress(await fs.readFile(file), { maxOutputLength: MAX_SNAPSHOT_BYTES });
    const envelope = JSON.parse(content.toString('utf8'));
    if (envelope.revision !== revision() || envelope.sourceDir !== manifest.sourceDir ||
      envelope.fingerprint !== manifest.fingerprint || typeof envelope.payload !== 'string' ||
      envelope.digest !== digest(envelope.payload)) return null;
    const data = JSON.parse(envelope.payload);
    if (!validSnapshot(data) || data.sourceDir !== manifest.sourceDir || data.sourceFingerprint !== manifest.fingerprint) return null;
    return {
      ...data,
      reports: data.reports.map((report) => {
        const lines = report.markdown.split(/\r?\n/);
        return { ...report, lines, institutions: report.institutions.map((block) => ({
          ...block, content: lines.slice(block.startLine - 1, block.endLine).join('\n'),
        })) };
      }),
      entities: new Map(data.entities),
      cache: { origin: 'disk', persisted: true, savedAt: data.indexedAt },
    };
  } catch {
    // Missing, corrupt or incompatible cache files are misses, not application failures.
    return null;
  }
}

export async function writeReportSnapshot(index: IndexState): Promise<void> {
  const file = reportCachePath(index.sourceDir);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  // Only report state is serialized. No environment, AI configuration or user settings.
  const payload = JSON.stringify({
    sourceDir: index.sourceDir, sourceFingerprint: index.sourceFingerprint,
    version: index.version, indexedAt: index.indexedAt,
    reports: index.reports.map((report): DiskReport => ({
      id: report.id, date: report.date, year: report.year, title: report.title,
      filePath: report.filePath, markdown: report.markdown, lineCount: report.lineCount,
      tags: report.tags, updatedAt: report.updatedAt,
      institutions: report.institutions.map((block) => ({
        institution: block.institution, startLine: block.startLine, endLine: block.endLine, tags: block.tags,
      })),
    })),
    mentions: index.mentions, opinions: index.opinions,
    entities: [...index.entities], qualityIssues: index.qualityIssues,
    errors: index.errors, views: index.views,
  });
  const content = JSON.stringify({
    revision: revision(), sourceDir: index.sourceDir,
    fingerprint: index.sourceFingerprint, digest: digest(payload), payload,
  });
  if (Buffer.byteLength(content) > MAX_SNAPSHOT_BYTES) throw new Error('Report snapshot exceeds size limit');
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    const bytes = await compress(content, { level: 1 });
    await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(() => undefined);
  }
}

function validSnapshot(value: unknown): value is DiskIndex {
  if (!value || typeof value !== 'object') return false;
  const data = value as Record<string, unknown>;
  if (typeof data.version !== 'string' || typeof data.indexedAt !== 'string' ||
    !Array.isArray(data.reports) || !Array.isArray(data.mentions) || !Array.isArray(data.opinions) ||
    !Array.isArray(data.qualityIssues) || !Array.isArray(data.errors) || !Array.isArray(data.entities)) return false;
  if (!data.entities.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && entry[1]?.key === entry[0])) return false;
  if (!data.reports.every((report) => typeof report?.id === 'string' && typeof report.markdown === 'string' &&
    Array.isArray(report.tags) && Array.isArray(report.institutions) && report.institutions.every((block: InstitutionBlock) =>
      Number.isInteger(block?.startLine) && Number.isInteger(block?.endLine) && Array.isArray(block.tags)))) return false;
  const views = data.views as IndexState['views'];
  return Boolean(views && Array.isArray(views.summaries) && Array.isArray(views.reportOverviews) &&
    views.overview?.indexVersion === data.version && views.overview.reportCount === data.reports.length);
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
