import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { realReport } from './realReportFixture';
import { ReportOpinionTable } from '../src/components/ReportOpinionTable';

const source = realReport('2026-09-04');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'real-overview-'));
process.env.REPORT_DIR = root;
process.env.REPORT_PUBLICATION_FILE = path.join(root, 'publication.json');
process.env.REPORT_INDEX_CACHE_DIR = path.join(root, 'cache');
await fs.writeFile(path.join(root, source.id + '.md'), source.markdown);
try {
  const { rebuildIndex, getReportOverview } = await import('../api/services/reportIndex');
  const index = await rebuildIndex();
  const overview = await getReportOverview(source.id, index);
  assert.ok(overview);
  assert.equal(overview.buyCoverage?.companyCount, 7);
  const html = renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, createElement(ReportOpinionTable, { overview })));
  for (const name of ['腾讯控股', '阿里巴巴', '美团', '拼多多', '满帮集团', '美图', '中国巨石']) assert.ok(html.includes(name), name);
  assert.match(html, /明确买入 8/);
  assert.ok(!html.includes('长江电力'), 'default view contains explicit buy opinions only');
  assert.match(html, /line=200[^"<>]*highlight=%E7%BE%8E%E5%9B%BE/);
  assert.match(html, /line=196[^"<>]*highlight=%E8%85%BE%E8%AE%AF%E6%8E%A7%E8%82%A1/);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log('real report overview tests passed');
