import assert from 'node:assert/strict';
import { normalizeSecurityCode } from '../api/services/entityResolver';
import { extractTargetMentions } from '../api/services/reportParser';
import { realReport } from './realReportFixture';

// User-supplied exact lookup examples, not generated financial statements.
assert.equal(normalizeSecurityCode('600098'), '600098.SS');
assert.equal(normalizeSecurityCode('0700'), '0700.HK');
assert.equal(normalizeSecurityCode('BZ'), 'BZ.O');
const boss = extractTargetMentions(realReport('2025-12-21'));
assert.ok(boss.some(x => x.code === 'BZ.O' && x.rating === '买入' && x.targetPrice === '28 美元'));
assert.ok(boss.some(x => x.code === '2076.HK' && x.rating === '买入' && x.targetPrice === '108 港元'));
assert.ok(extractTargetMentions(realReport('2026-03-18')).some(x => x.code === '0700.HK'));
const latest = extractTargetMentions(realReport('2026-09-08'));
assert.ok(latest.some(x => x.targetName === '国电南瑞' && x.code === '600406.SS' && x.targetPrice === '28 元'));
assert.ok(!latest.some(x => x.targetName === '同时覆盖国电南瑞'));
assert.ok(!extractTargetMentions(realReport('2026-01-14')).some(x => x.targetName.includes('EBITDA 和市盈率')), 'P/E in the real report is a ratio, not the US tickers P and E');
assert.ok(!extractTargetMentions(realReport('2026-09-02')).some(x => x.targetName.includes('比亚迪') && x.code === 'BYD.N'), 'BYD in this Chinese report abbreviates BYD, not Boyd Gaming');
const january = extractTargetMentions(realReport('2026-01-20'));
assert.ok(!january.some(x => x.targetName.includes('巨星') && x.code === 'GS.N'));
assert.ok(!january.some(x => x.targetName.includes('东山') && x.code === 'PCB.O'));
assert.ok(!extractTargetMentions(realReport('2026-07-12')).some(x => x.targetName.includes('招金') && x.code === 'EW.N'), 'EW after the code is a rating, not Edwards Lifesciences');
console.log('bare security code tests passed');
