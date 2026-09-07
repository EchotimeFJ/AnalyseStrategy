import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { IndexState } from './reportIndex.js';
import { readReportSnapshot, readSourceManifest, writeReportSnapshot } from './reportCache.js';
import { writeAtomicJson } from './atomicJson.js';

export type Publication = {
  publishedAt: string; checkedAt: string; revision: string | null;
  fingerprint: string; snapshot: string; appRevision: string;
  sourceDir: string;
};
export function publicationFile() {
  return process.env.REPORT_PUBLICATION_FILE || path.resolve('data/runtime/publication.json');
}

export async function readPublication(file = publicationFile()): Promise<Publication | null> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8')) as Publication;
    if (!/^[0-9a-f]{64}$/.test(value.fingerprint) || value.revision !== null && !/^[0-9a-f]{40,64}$/.test(value.revision) ||
      !/^[0-9a-f]{64}\.json\.gz$/.test(value.snapshot) || typeof value.appRevision !== 'string' ||
      typeof value.sourceDir !== 'string' || !path.isAbsolute(value.sourceDir) ||
      !Number.isFinite(Date.parse(value.publishedAt)) || !Number.isFinite(Date.parse(value.checkedAt))) throw new Error('Invalid publication record');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function restorePublishedIndex(sourceDir: string): Promise<IndexState | null> {
  const file = publicationFile();
  const record = await readPublication(file);
  if (!record || record.sourceDir !== path.resolve(sourceDir)) return null;
  // A published generation is independent of the mutable checkout and app
  // revision. The snapshot schema and integrity still have to match.
  const index = await readReportSnapshot({ sourceDir: path.resolve(sourceDir), files: [], fingerprint: '' }, {
    file: path.join(`${file}.snapshots`, record.snapshot), published: true,
  });
  if (!index) throw new Error('Published report snapshot is unavailable');
  return index;
}

export async function commitPublication(
  file: string,
  index: IndexState,
  details: Omit<Publication, 'snapshot' | 'sourceDir'>,
  previous: Publication | null,
  reuseSnapshot: boolean,
): Promise<void> {
  const snapshot = reuseSnapshot && previous ? previous.snapshot
    : `${createHash('sha256').update(index.version!).digest('hex')}.json.gz`;
  // Prune abandoned candidates before staging the next one, while the caller
  // holds the update lock. Never run asynchronous cleanup across a later commit.
  try {
    const names = await fs.readdir(`${file}.snapshots`);
    await Promise.all(names.filter((name) => /^[0-9a-f]{64}\.json\.gz$/.test(name) && name !== previous?.snapshot)
      .map((name) => fs.unlink(path.join(`${file}.snapshots`, name)).catch(() => undefined)));
  } catch { /* A new deployment may not have a snapshot directory yet. */ }
  if (!reuseSnapshot || !previous) {
    await writeReportSnapshot(index, { file: path.join(`${file}.snapshots`, snapshot) });
    const current = await readSourceManifest(index.sourceDir);
    if (current.fingerprint !== index.sourceFingerprint) throw new Error('Report source changed while staging publication');
  }
  // This rename is the sole commit point. A failure leaves the previous pointer
  // and snapshot usable, including after a fresh process starts.
  await writeAtomicJson(file, { ...details, sourceDir: path.resolve(index.sourceDir), snapshot } satisfies Publication);
}
