import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { extractOpinions } from '../api/services/opinionExtractor';
import { buildRetrievalChunks, resolveResearchIntent, retrieveResearch } from '../api/services/researchRetrieval';
import { buildBuyList, isBuyListQuestion } from '../api/services/aiBuyList';
import { createAiService } from '../api/services/aiService';

const reports = ['2026-09-04', '2026-09-03'].map(realReport);
const opinions = reports.flatMap(extractOpinions);
const chunks = buildRetrievalChunks(reports, opinions);
for (const report of reports) {
  const reportChunks = chunks.filter((chunk) => chunk.reportId === report.id);
  for (let index = 0; index < report.lines.length; index += 1) {
    const line = report.lines[index];
    if (!line.trim()) continue;
    const coverage = reportChunks.filter((chunk) => chunk.startLine <= index + 1 && chunk.endLine >= index + 1);
    assert.ok(coverage.length, `${report.date}:${index + 1} must be retrievable`);
    // Every character of long original lines survives splitting, too.
    const reconstructed = coverage.map((chunk) => chunk.text.split('\n')[index + 1 - chunk.startLine] ?? '').join('');
    assert.equal(reconstructed, line, `${report.date}:${index + 1} must preserve the original line`);
  }
  for (const chunk of reportChunks) {
    assert.ok(chunk.text.length <= 1800);
    assert.ok(report.lines.slice(chunk.startLine - 1, chunk.endLine).join('\n').includes(chunk.text));
  }
}
assert.ok(retrieveResearch('腾讯买入评级', { from: '2026-09-04', to: '2026-09-04' }, chunks).chunks.some((chunk) => chunk.text.includes('腾讯')));
assert.ok(retrieveResearch('润泽科技买入评级', { from: '2026-09-03', to: '2026-09-03' }, chunks).chunks.some((chunk) => chunk.startLine <= 228 && chunk.endLine >= 228));
const intent = resolveResearchIntent('汇总2026年9月3日的全部买入标的', {}, chunks);
assert.deepEqual(intent.scope, { from: '2026-09-03', to: '2026-09-03' });
assert.deepEqual(resolveResearchIntent('汇总9.4的报告中买入的标的', {}, chunks).scope, { from: '2026-09-04', to: '2026-09-04' });
assert.ok(isBuyListQuestion('汇总2026年9月3日的全部买入标的', {}, opinions));
assert.ok(!isBuyListQuestion('润泽科技买入理由有哪些', {}, opinions));
assert.ok(!isBuyListQuestion('汇总润泽科技买入观点', {}, opinions));
assert.deepEqual(resolveResearchIntent('汇总全部历史报告的买入标的', {}, chunks).scope, {});
const list = buildBuyList(reports, opinions, intent);
for (const [index, source] of list.sources.entries()) {
  const report = reports.find((report) => report.id === source.reportId)!;
  assert.equal(source.date, '2026-09-03');
  assert.ok(report.lines[source.lineNumber - 1].includes(source.excerpt));
  assert.match(source.excerpt, /买入|\bbuy\b/i);
  assert.ok(list.answer.includes(`[${index + 1}]`));
}
assert.match(list.answer, /未识别公司/);
const historicalReports = ['2025-11-25', '2026-01-14', '2026-02-05', '2026-02-10', '2026-07-26', '2026-08-06', '2026-08-26', '2026-08-27', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07'].map(realReport);
const historicalOpinions = historicalReports.flatMap(extractOpinions);
const historicalList = buildBuyList(historicalReports, historicalOpinions, { ...intent, scope: {} });
assert.ok(historicalList.sources.length > 8, 'Real historical buy evidence exceeds the conversational retrieval cap');
const service = createAiService({
  configStore: {
    resolve: async () => ({ providerId: 'custom', providerName: 'Unused transport', baseUrl: 'https://unused.invalid/v1', model: 'unused', apiKey: 'unused', timeoutMs: 5000, dailyTokenBudget: 1, maxConcurrency: 1 }),
    getPublic: async () => ({ configured: true }),
  },
  provider: { async *stream() { yield ''; throw new Error('Deterministic lists must not contact a provider'); } },
  getIndex: async () => ({ reports: historicalReports, opinions: historicalOpinions, version: 'original-real-reports' }),
});
for (let attempt = 0; attempt < 2; attempt += 1) {
  const result = await service.prepareChat({ question: '汇总全部历史报告的买入标的', scope: {}, ip: '127.0.0.1' });
  assert.equal(result.sources.length, historicalList.sources.length);
  let answer = '';
  for await (const delta of result.stream) answer += delta;
  assert.match(answer, /全部已加载历史报告/);
  for (let index = 0; index < result.sources.length; index += 1) assert.ok(answer.includes(`[${index + 1}]`));
}
console.log('real AI evidence coverage tests passed');
