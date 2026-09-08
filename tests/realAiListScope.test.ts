import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { extractOpinions } from '../api/services/opinionExtractor';
import { isBuyListQuestion } from '../api/services/aiBuyList';

// These actual report sentences previously introduced generic "company names"
// which caused full-report list requests to fall back to a paid top-eight chat.
const reports = ['2025-09-17', '2026-07-01', '2026-09-04'].map(realReport);
const opinions = reports.flatMap(extractOpinions);
assert.ok(isBuyListQuestion('汇总全部历史报告的买入标的', {}, opinions));
assert.ok(isBuyListQuestion('汇总9.4的报告中买入的标的', {}, opinions));
assert.ok(!opinions.some((opinion) => ['标的', '的买入'].includes(opinion.security.displayName)));
console.log('real AI list scope tests passed');
