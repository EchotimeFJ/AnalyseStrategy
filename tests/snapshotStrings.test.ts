import assert from 'node:assert/strict';
import { packSnapshotStrings, unpackSnapshotStrings } from '../api/services/snapshotStrings';
import { realReport } from './realReportFixture';
import { extractOpinions } from '../api/services/opinionExtractor';
import { extractTargetMentions } from '../api/services/reportParser';

const report = realReport('2026-09-04');
const original = { report, mentions: extractTargetMentions(report), opinions: extractOpinions(report) };
const packed = packSnapshotStrings(original);
assert.deepEqual(unpackSnapshotStrings(JSON.parse(JSON.stringify(packed))), JSON.parse(JSON.stringify(original)));
assert.ok(JSON.stringify(packed).length < JSON.stringify(original).length, 'repeated real source text is stored once');
const broken = JSON.parse(JSON.stringify(packed));
broken.strings = [];
assert.throws(() => unpackSnapshotStrings(broken), /Invalid snapshot string/);
console.log('snapshot string roundtrip tests passed');
