import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { diffReportChanges, type IndexState } from '../api/services/reportIndex';
import { createReviewStore } from '../api/services/reviewStore';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'review-source-delta-'));
const report = (id: string, text: string) => buildReportFromMarkdown({ id, filePath: `/reports/${id}.md`, markdown: text });
const empty = (reports: ReturnType<typeof report>[]): IndexState => ({ sourceDir: '/reports', reports, sourceReports: reports, mentions: [], opinions: [], entities: new Map(), qualityIssues: [], errors: [] });

try {
  const store = createReviewStore(path.join(root, 'store'));
  const first = report('2026-09-01', '# 花旗\n\n旧内容');
  const added = report('2026-09-02', '# 野村\n\n新增内容');
  await store.sync([first]);
  let state = await store.read();
  assert.equal(state.sources[first.id].active, true);
  assert.equal(state.jobs[state.sources[first.id].jobId].status, 'queued');

  const changed = report('2026-09-01', '# 花旗\n\n修改内容');
  await store.sync([changed, added]);
  state = await store.read();
  assert.notEqual(state.sources[first.id].jobId, state.sources[added.id].jobId, 'each report gets its own queued job');
  assert.equal(state.jobs[state.sources[first.id].jobId].status, 'queued', 'modified source is queued again');
  assert.equal(state.jobs[state.sources[added.id].jobId].status, 'queued', 'added source is queued');

  await store.sync([changed]);
  state = await store.read();
  assert.equal(state.sources[added.id].active, false, 'missing source is marked removed');
  assert.equal(state.jobs[state.sources[added.id].jobId].status, 'withdrawn', 'removed source cannot continue processing');

  // A pending review may expose old facts in the publication overlay. Change
  // detection must compare the source snapshots retained in memory instead.
  const publishedOld = empty([first]);
  const currentWithOldOverlay = { ...empty([first]), reports: [first], sourceReports: [changed] };
  const changes = diffReportChanges(publishedOld, currentWithOldOverlay);
  assert.deepEqual(changes.modified.map(item => item.id), [first.id]);
  assert.equal(changes.added.length, 0);
  assert.equal(changes.removed.length, 0);

  const allChanges = diffReportChanges(empty([first]), empty([changed, added]));
  assert.deepEqual(allChanges.added.map(item => item.id), [added.id]);
  assert.deepEqual(allChanges.modified.map(item => item.id), [first.id]);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('review source delta tests passed');
