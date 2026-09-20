import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'program-migration-'));
process.env.REPORT_DIR=path.join(root,'reports');
process.env.REPORT_INDEX_CACHE_DIR=path.join(root,'cache');
process.env.REPORT_PUBLICATION_FILE=path.join(root,'publication.json');
process.env.RESEARCH_REVIEW_DIR=path.join(root,'review');
process.env.RESEARCH_REVIEW_ENABLED='true';
process.env.AI_API_KEY='unused-test-key';
await fs.mkdir(process.env.REPORT_DIR);
await fs.writeFile(path.join(process.env.REPORT_DIR,'2026-09-20.md'),'# 花旗\n\n我们对深南电路/鹏鼎控股持买入评级。');
const {ensureIndex}=await import('../api/services/reportIndex');
const {commitPublication}=await import('../api/services/publicationStore');
const {reviewStore}=await import('../api/services/reviewRuntime');
try {
  const index=await ensureIndex();
  assert.equal(index.analysisMode,'program');
  assert.equal(index.opinions.filter(o=>o.rating==='买入').length,2);
  assert.equal(Object.keys((await reviewStore().read()).jobs).length,0,'program analysis must never enqueue a model job');
  const obsolete={...index,analysisMode:undefined,reviewFingerprint:'old-ai-snapshot',opinions:[],mentions:[],entities:new Map()};
  await commitPublication(process.env.REPORT_PUBLICATION_FILE,obsolete,{publishedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),revision:null,fingerprint:'a'.repeat(64),appRevision:'old-ai'},null,false);
  const script=`import {ensureIndex} from './api/services/reportIndex.ts'; const i=await ensureIndex(); console.log(JSON.stringify({mode:i.analysisMode,buys:i.opinions.filter(o=>o.rating==='买入').length,review:i.reviewFingerprint}));`;
  const fresh=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:process.env});
  assert.deepEqual(JSON.parse(fresh.stdout),{mode:'program',buys:2},'an old AI snapshot must not hide deterministic results');
} finally { await fs.rm(root,{recursive:true,force:true}); }
console.log('program snapshot migration and zero model jobs passed');
