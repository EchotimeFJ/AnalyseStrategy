import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createReviewStore } from '../api/services/reviewStore';
import { buildReportFromMarkdown } from '../api/services/reportParser';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'review-store-'));
const store = createReviewStore(root);
const report = (id: string, markdown: string, file = id) => buildReportFromMarkdown({ id, markdown, filePath: `/reports/${file}.md` });
try {
  const a = report('2026-09-01', '# 花旗\n\n腾讯（0700，买入）。');
  const first = await store.sync([a]);
  const job = (await store.read()).jobs[first[0].source.jobId];
  assert.equal(job.status, 'queued');
  const ref = await store.writeResult(job, { facts: ['original'] });
  await store.transaction(s => { s.jobs[job.id].status = 'succeeded'; s.jobs[job.id].resultRef = ref; });
  await store.sync([{ ...a, updatedAt: new Date().toISOString() }]);
  assert.equal(Object.keys((await store.read()).jobs).length, 1, 'mtime does not enqueue a paid job');
  const moved = await store.sync([report('new-path', a.markdown, 'moved')]);
  assert.equal(moved[0].report.id, a.id, 'unambiguous rename preserves identity');
  const modified = await store.sync([report('new-path', a.markdown + '\n目标价600港元。', 'moved')]);
  assert.notEqual(modified[0].source.jobId, job.id);
  assert.equal((await store.loadResult<{ facts: string[] }>(ref)).result.facts[0], 'original', 'old result preserved');
  assert.equal((await store.loadReport(job)).markdown, a.markdown, 'old evidence preserved');
  await store.sync([]);
  assert.equal((await store.read()).sources[a.id].active, false);
  assert.equal((await store.loadReport(job)).markdown, a.markdown, 'withdrawal never deletes evidence');
  // A duplicate content document must not overwrite the first identity.
  await store.sync([report('a', 'same'), report('b', 'same')]);
  const state = await store.read();
  for (const id of ['a','b']) assert.equal((await store.loadReport(state.jobs[state.sources[id].jobId])).id, id);
  await fs.writeFile(path.join(root, 'state.json'), '{invalid');
  await assert.rejects(store.read(), 'corrupt ledger must not reset to empty');
} finally { await fs.rm(root, { recursive: true, force: true }); }
console.log('review store tests passed');
