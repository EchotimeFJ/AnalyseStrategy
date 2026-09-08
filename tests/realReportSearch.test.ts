import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { realReport } from './realReportFixture';

// Full, byte-verified original reports only; no generated or edited report inputs.
const dates = ['2026-02-05', '2026-09-02', '2026-09-04', '2026-09-07'];
const reports = dates.map(realReport);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-report-search-'));
process.env.REPORTS_DIR = root;
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
try {
  for (const report of reports) await fs.writeFile(path.join(root, `${report.date}.md`), report.markdown);
  const { rebuildIndex, searchReports } = await import('../api/services/reportIndex');
  await rebuildIndex();
  const company = await searchReports({ q: 'Snowflake' });
  assert.ok(!Array.isArray(company) && 'groups' in company);
  const snowflakeLines = reports.flatMap((report) => report.lines.flatMap((line, index) => /snowflake/i.test(line) ? [index + 1] : [])).sort((a, b) => a - b);
  assert.ok([209, 234, 425].every((line) => snowflakeLines.includes(line)));
  assert.deepEqual(company.groups.flatMap((group) => group.snippets.flatMap((snippet) => snippet.lineNumbers)).sort((a, b) => a - b), snowflakeLines);
  assert.ok(company.groups.every((group) => group.snippets.every((snippet) => /snowflake/i.test(snippet.text))));

  const raw = await searchReports({ q: '买入', from: '2026-09-04', to: '2026-09-04', raw: true });
  assert.ok(Array.isArray(raw));
  assert.deepEqual(raw.map((hit) => hit.lineNumber), [115, 134, 196, 197, 198, 199, 200]);
  const citi = await searchReports({ q: '买入', institution: '花旗', from: '2026-09-07', to: '2026-09-07' });
  assert.ok(!Array.isArray(citi) && 'groups' in citi);
  assert.ok(citi.groups.every((group) => group.institutions.every((institution) => institution === '花旗')));
  const citiRaw = await searchReports({ q: '买入', raw: true, institution: '花旗', from: '2026-09-07', to: '2026-09-07' });
  assert.ok(Array.isArray(citiRaw));
  assert.deepEqual(citiRaw.map((hit) => hit.lineNumber), [131, 132, 133, 134, 135, 136, 137]);
  const ubsRaw = await searchReports({ q: '买入', raw: true, institution: 'UBS', from: '2026-09-07', to: '2026-09-07' });
  assert.ok(Array.isArray(ubsRaw));
  assert.deepEqual(ubsRaw.map((hit) => hit.lineNumber), [49]);
  assert.equal(ubsRaw[0].institution, '瑞银');


  const expected = reports.reduce((sum, report) => sum + report.lines.filter((line) => line.includes('的')).length, 0);
  assert.ok(expected > 500, `Original corpus must reproduce truncation: ${expected}`);
  const seen = new Set<string>();
  let offset = 0;
  for (;;) {
    const page = await searchReports({ q: '的', raw: true, paginated: true, offset, limit: 100 });
    assert.ok(!Array.isArray(page) && 'hits' in page);
    assert.equal(page.totalHits, expected);
    assert.ok(page.hits.length <= 100);
    assert.equal(page.returnedHits, page.hits.length);
    for (const hit of page.hits) {
      const key = `${hit.reportId}:${hit.lineNumber}`;
      assert.ok(!seen.has(key), `Duplicate across pages: ${key}`);
      seen.add(key);
    }
    if (!page.hasMore) break;
    offset += page.returnedHits;
  }
  assert.equal(seen.size, expected);
  const grouped = await searchReports({ q: '的', limit: 100 });
  assert.ok(!Array.isArray(grouped) && 'groups' in grouped);
  assert.equal(grouped.totalHits, expected);
  assert.equal(grouped.returnedHits, 100);
  assert.equal(grouped.hasMore, true);
  const capped = await searchReports({ q: '的', raw: true, paginated: true, limit: 999999 });
  assert.ok(!Array.isArray(capped) && 'hits' in capped);
  assert.equal(capped.limit, 500);
  assert.equal(capped.hits.length, 500);
  console.log(`real report search passed: Snowflake=${snowflakeLines.length}, strict 买入=7, pagination=${expected} original lines`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
