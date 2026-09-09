import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { realReport } from './realReportFixture';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-snapshot-'));
process.env.REPORT_DIR = root;
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
process.env.REPORT_PUBLICATION_FILE = path.join(root, 'publication.json');
try {
  for (const date of ['2026-09-08', '2025-12-21']) await fs.writeFile(path.join(root, date + '.md'), realReport(date).markdown);
  const { rebuildIndex } = await import('../api/services/reportIndex');
  const { readSourceManifest, readReportSnapshot } = await import('../api/services/reportCache');
  const built = await rebuildIndex();
  const restored = await readReportSnapshot(await readSourceManifest(root));
  assert.ok(restored);
  for (const key of ['opinions', 'mentions', 'views', 'qualityIssues', 'errors'] as const) {
    assert.deepEqual(restored[key], JSON.parse(JSON.stringify(built[key])), `streamed ${key} retains every real source value`);
  }
  assert.deepEqual(restored.reports.map(r => r.markdown), built.reports.map(r => r.markdown));
} finally { await fs.rm(root, { recursive: true, force: true }); }
console.log('real snapshot roundtrip tests passed');
