import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createGzip, createGunzip, gunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { IndexState } from './reportIndex.js';
import type { InstitutionBlock, ReportDocument } from './reportParser.js';
import type { SecurityEntity } from '../domain/research.js';
import { getAppVersion } from './version.js';
import { packSnapshotStrings, unpackSnapshotStrings } from './snapshotStrings.js';

const decompress = promisify(gunzip);
const SCHEMA_VERSION = 3;
const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;
const LINE_FORMAT = 'report-snapshot-lines-v1';

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

export async function readReportSnapshot(manifest: SourceManifest, options: { file?: string; published?: boolean } = {}): Promise<IndexState | null> {
  try {
    const file = options.file ?? reportCachePath(manifest.sourceDir);
    if ((await fs.stat(file)).size > MAX_SNAPSHOT_BYTES) return null;
    const envelope = await readEnvelope(file);
    const compatible = options.published ? /^[23]:/.test(String(envelope.revision)) : envelope.revision === revision();
    if (!compatible || envelope.sourceDir !== manifest.sourceDir ||
      !options.published && envelope.fingerprint !== manifest.fingerprint) return null;
    const data = envelope.data;
    if (!validSnapshot(data) || data.sourceDir !== manifest.sourceDir || !options.published && data.sourceFingerprint !== manifest.fingerprint) return null;
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

export async function writeReportSnapshot(index: IndexState, options: { file?: string } = {}): Promise<void> {
  const file = options.file ?? reportCachePath(index.sourceDir);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  // Only report state is serialized. No environment, AI configuration or user settings.
  const packed = packSnapshotStrings({
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
  // Each source string is a separate JSON line so both write and restore avoid
  // materializing an escaped copy of the entire corpus at once.
  function* payloadParts() {
    for (const value of packed.strings) yield `${JSON.stringify({ text: value })}\n`;
    yield `${JSON.stringify({ root: packed.root })}\n`;
  }
  const header = JSON.stringify({
    format: LINE_FORMAT, revision: revision(), sourceDir: index.sourceDir,
    fingerprint: index.sourceFingerprint,
  });
  function* envelopeParts() {
    let size = 0;
    const checked = (part: string) => {
      size += Buffer.byteLength(part);
      if (size > MAX_SNAPSHOT_BYTES) throw new Error('Report snapshot exceeds size limit');
      return part;
    };
    const hash = createHash('sha256');
    yield checked(`${header}\n`);
    for (const part of payloadParts()) { hash.update(part); yield checked(part); }
    yield checked(`${JSON.stringify({ digest: hash.digest('hex') })}\n`);
  }
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    await pipeline(Readable.from(envelopeParts()), createGzip({ level: 1 }), createWriteStream(temporary, { mode: 0o600, flags: 'wx' }));
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

async function readEnvelope(file: string) {
  const probeInput = createReadStream(file);
  const probe = probeInput.pipe(createGunzip());
  probeInput.on('error', (error) => probe.destroy(error));
  let isLines = false;
  try {
    for await (const chunk of probe) { isLines = chunk.toString('utf8').startsWith(`{"format":"${LINE_FORMAT}"`); break; }
  } finally { probe.destroy(); probeInput.destroy(); }
  if (!isLines) {
    // Published schema-2 snapshots remain valid until a new publication commits.
    const content = await decompress(await fs.readFile(file), { maxOutputLength: MAX_SNAPSHOT_BYTES });
    const envelope = JSON.parse(content.toString('utf8'));
    if (typeof envelope.payload !== 'string' || envelope.digest !== digest(envelope.payload)) throw new Error('Invalid snapshot digest');
    const parsed = JSON.parse(envelope.payload);
    return { ...envelope, data: envelope.encoding === 'strings-v1' ? unpackSnapshotStrings(parsed) : parsed };
  }
  const input = createReadStream(file);
  const unzip = input.pipe(createGunzip());
  input.on('error', (error) => unzip.destroy(error));
  const lines = createInterface({ input: unzip, crlfDelay: Infinity });
  const strings: string[] = [];
  const hash = createHash('sha256');
  let header: { revision: string; sourceDir: string; fingerprint: string } | undefined;
  let root: unknown;
  let expected: string | undefined;
  let bytes = 0;
  try {
    for await (const line of lines) {
      bytes += Buffer.byteLength(line) + 1;
      if (bytes > MAX_SNAPSHOT_BYTES || expected) throw new Error('Invalid snapshot length');
      const entry = JSON.parse(line);
      if (!header) { header = entry; continue; }
      if (typeof entry.digest === 'string') { expected = entry.digest; continue; }
      hash.update(`${line}\n`);
      if (typeof entry.text === 'string' && root === undefined) strings.push(entry.text);
      else if ('root' in entry && root === undefined) root = entry.root;
      else throw new Error('Invalid snapshot record');
    }
    if (!header || !root || !expected || hash.digest('hex') !== expected) throw new Error('Invalid snapshot digest');
    return { ...header, data: unpackSnapshotStrings({ strings, root }) };
  } finally { lines.close(); unzip.destroy(); input.destroy(); }
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
