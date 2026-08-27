import assert from 'node:assert/strict';
import {
  chooseCanonicalSecurityName,
  isInvalidEntityName,
  normalizeSecurityCode,
  resolveInstitution,
  securityKey,
} from '../api/services/entityResolver';

assert.equal(normalizeSecurityCode('1768 hk'), '1768.HK');
assert.equal(normalizeSecurityCode(' 600519.ss '), '600519.SS');
assert.equal(normalizeSecurityCode('not-a-code'), null);

assert.equal(securityKey({ code: '1768.HK', name: '鸣鸣很忙' }), 'code:1768.HK');
assert.equal(securityKey({ code: '1768.HK', name: '明明很忙' }), 'code:1768.HK');
assert.equal(securityKey({ name: ' 英诺赛科 ' }), 'name:英诺赛科');

for (const invalid of ['AI', 'AH', '未覆盖', '买入', '零件材料']) {
  assert.equal(isInvalidEntityName(invalid), true, `${invalid} should be rejected`);
}
assert.equal(isInvalidEntityName('英诺赛科'), false);

assert.deepEqual(resolveInstitution('精选-中金'), {
  rawName: '精选-中金',
  canonicalName: '中金',
  verified: true,
});
assert.equal(resolveInstitution('高盛').verified, true);
assert.equal(resolveInstitution('AI').verified, false);
assert.equal(resolveInstitution('零件材料').verified, false);

assert.equal(
  chooseCanonicalSecurityName(['AI', '鸣鸣很忙', '鸣鸣很忙', '明明很忙']),
  '鸣鸣很忙',
);

console.log('entity resolver tests passed');
