import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { extractOpinions } from '../api/services/opinionExtractor';
import { resolveOpinions } from '../api/services/opinionResolution';
import { getBuyCoverage } from '../api/services/buyCoverage';

const report = realReport('2026-09-04');
const opinions = resolveOpinions(extractOpinions(report));
const result = getBuyCoverage(report, opinions);
assert.equal(result.companyCount, 7, 'seven actual companies; Alibaba has two listing codes');
assert.equal(result.references, 9, 'nine literal buy references on the original seven lines');
assert.equal(result.covered, 7, 'seven direct rating references, including both companies on line200');
assert.equal(result.other.length, 2, 'the historical report reference and PDD commentary remain separately visible');
assert.deepEqual(result.review, []);
for (const date of ['2026-09-02', '2026-09-03', '2026-09-07', '2026-02-10']) {
  const original = realReport(date);
  const coverage = getBuyCoverage(original, resolveOpinions(extractOpinions(original)));
  assert.equal(coverage.covered + coverage.review.length + coverage.other.length, coverage.references);
  for (const item of [...coverage.review, ...coverage.other]) {
    assert.ok(original.lines[item.lineNumber - 1].includes(item.excerpt));
    assert.match(original.lines[item.lineNumber - 1].slice(item.startColumn - 1), /^(?:买入|Buy)/i);
  }
}
console.log('real buy reference coverage tests passed');
