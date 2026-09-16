import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createIdentityStore } from '../api/services/researchIdentity';
import type { IdentityMentionLike } from '../api/domain/identity';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'research-identity-'));
const store = createIdentityStore(root);
const mention = (input: IdentityMentionLike): IdentityMentionLike => input;
const mentions = [
  mention({ id: 'a-share', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 1, targetName: '中际旭创', rawCode: '300308 CH', code: '300308.SZ', excerpt: '中际旭创（300308 CH）' }),
  mention({ id: 'h-share', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 1, targetName: '中际旭创', rawCode: '3308 HK', code: '3308.HK', excerpt: '中际旭创（3308 HK）' }),
  mention({ id: 'mobile', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 2, targetName: '中国移动', rawCode: '941 HK', code: '0941.HK', aliases: ['CM'], excerpt: '中国移动（CM；941 HK，买入）' }),
  mention({ id: 'yangtze', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 3, targetName: '长飞光纤', aliases: ['YOFC'], excerpt: '长飞光纤（YOFC）' }),
  mention({ id: 'unknown-code', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 4, targetName: '长飞光纤', rawCode: 'YOFC', aliases: ['YOFC'], excerpt: '长飞光纤（YOFC）' }),
  mention({ id: 'unknown-market-code', reportId: 'r1', articleRef: 'a1', institution: '野村', lineNumber: 4, targetName: '长飞光纤', rawCode: '999999 CH', excerpt: '长飞光纤（999999 CH），同行600487 CH' }),
  mention({ id: 'yangtze-a', reportId: 'r1', articleRef: 'a2', institution: '野村', lineNumber: 1, targetName: '长飞光纤', rawCode: '601869.SS', code: '601869.SS', excerpt: '长飞光纤（601869.SS）' }),
  mention({ id: 'yangtze-h', reportId: 'r1', articleRef: 'a2', institution: '野村', lineNumber: 1, targetName: '长飞光纤', rawCode: '6869.HK', code: '6869.HK', excerpt: '长飞光纤（6869.HK）' }),
  mention({ id: 'term', reportId: 'r1', articleRef: 'a1', lineNumber: 5, payload: { articleRef: 'a1', rawName: '储能系统', rawCode: 'ESS', roles: ['terminology'] } }),
  mention({ id: 'candidate-one', reportId: 'r1', articleRef: 'a1', lineNumber: 6, targetName: '测试简称' }),
  mention({ id: 'candidate-two', reportId: 'r1', articleRef: 'a1', lineNumber: 7, targetName: '测试简称' }),
];

try {
  const first = await store.resolveMentions(mentions);
  const mapping = first.mapping;
  const a = mapping['a-share'];
  const h = mapping['h-share'];
  const mobile = mapping.mobile;
  const longfei = mapping.yangtze;
  const yofc = mapping['unknown-code'];
  const unknownMarketCode = mapping['unknown-market-code'];
  const yangtzeA = mapping['yangtze-a'];
  const yangtzeH = mapping['yangtze-h'];
  const term = mapping.term;
  assert.ok(a && h && mobile && longfei && yofc && unknownMarketCode && yangtzeA && yangtzeH && term);
  assert.equal(a.status, 'resolved');
  assert.equal(h.status, 'resolved');
  assert.equal(a.listingId !== h.listingId, true, 'A/H listings remain distinct');
  assert.equal(a.organizationId, h.organizationId, 'dictionary shared issuer name permits A/H company merge');
  assert.equal(mobile.resolvedCode, '0941.HK');
  assert.equal(mobile.rawCode, '941 HK');
  assert.equal(mobile.listingId !== null, true);
  assert.equal(longfei.status, 'resolved');
  assert.equal(longfei.organizationId !== null, true);
  assert.equal(longfei.securityId, null, 'missing source code creates company identity only');
  assert.equal(longfei.listingId, null);
  assert.equal(yofc.status, 'unresolved');
  assert.equal(yofc.listingId, null, 'YOFC abbreviation cannot choose a listing');
  assert.equal(unknownMarketCode.resolvedCode, null, 'an unknown code cannot fall back to a peer code in the excerpt');
  assert.equal(unknownMarketCode.listingId, null);
  assert.notEqual(yangtzeA.organizationId, yangtzeH.organizationId, 'A/H are not merged without a verified same-issuer relation');
  assert.equal(yangtzeH.status, 'conflict');
  assert.equal(term.status, 'unresolved');
  assert.equal(term.organizationId, null, 'terminology mention does not become a company');
  assert.notEqual(mapping['candidate-one']?.organizationId, mapping['candidate-two']?.organizationId, 'unresolved names are not merged by spelling alone');

  const graph = first.identityGraph;
  assert.equal(graph.dictionary.asOf, '2026-09-09');
  assert.ok(graph.dictionary.sourceUrls.length > 0);
  assert.ok(graph.provenance.some((item) => item.sourceKind === 'dictionary' && item.asOf === '2026-09-09'));
  for (const organization of graph.organizations) assert.match(organization.organizationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  for (const security of graph.securities) assert.match(security.securityId, /^[0-9a-f-]{36}$/i);
  for (const listing of graph.listings) {
    assert.match(listing.listingId, /^[0-9a-f-]{36}$/i);
    assert.equal(listing.symbol, listing.code.endsWith('.HK') ? listing.symbol.replace(/^0+/, '').padStart(listing.symbol.length, '0') : listing.symbol);
  }
  const mobileListing = graph.listings.find((item) => item.code === '0941.HK');
  assert.equal(mobileListing?.symbol, '00941', 'dictionary symbol retains leading zeroes');
  const mobileOrganization = graph.organizations.find((item) => item.organizationId === mobile.organizationId);
  assert.ok(mobileOrganization?.aliases.includes('CM'), 'source abbreviation is retained on the organization');
  const longfeiOrganization = graph.organizations.find((item) => item.organizationId === longfei.organizationId);
  assert.ok(longfeiOrganization?.aliases.includes('YOFC'), 'source abbreviation is retained without creating a listing');
  assert.ok(graph.aliases.some((item) => item.targetId === mobile.organizationId && item.value === '中国移动'));
  assert.ok(graph.aliases.some((item) => item.targetId === mobile.listingId && item.value === '941 HK'));
  assert.ok(graph.organizations.every((item) => item.validFrom === null && item.validTo === null && item.validity === 'unknown'));

  const second = await store.resolveMentions(mentions);
  assert.equal(second.mapping['a-share']?.organizationId, a.organizationId);
  assert.equal(second.mapping['a-share']?.securityId, a.securityId);
  assert.equal(second.mapping.mobile?.listingId, mobile.listingId);
  const reopened = createIdentityStore(root);
  const third = await reopened.resolveMentions(mentions);
  assert.equal(third.mapping['h-share']?.organizationId, h.organizationId);
  assert.equal(third.identityGraph.listings.find((item) => item.code === '0941.HK')?.listingId, mobile.listingId);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log('research identity tests passed');
