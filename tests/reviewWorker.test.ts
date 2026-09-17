import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { createReviewStore } from '../api/services/reviewStore';
import { createReviewWorker } from '../api/services/reviewWorker';
import { aiResourceGroup } from '../api/services/aiResources';
import type { ResolvedAiConfig } from '../api/services/aiConfig';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'review-worker-'));
const store = createReviewStore(path.join(root, 'store'));
const usageFile = path.join(root, 'usage.json');
const cfg: ResolvedAiConfig = { providerId:'custom', providerName:'Fixture',model:'first',baseUrl:'https://unused.invalid/v1',apiKey:'secret-never-persist',timeoutMs:1000,dailyTokenBudget:10000,maxConcurrency:2 };
const report = (text:string) => buildReportFromMarkdown({id:'a',filePath:'2026-09-16.md',markdown:text});
let calls=0,published=0;
const worker = createReviewWorker({store,usageFile,resolve:async()=>cfg,resolveProfile:async()=>cfg,
  process:async(r,c,ctx)=>{calls++;const reservation=await ctx.reserve(1000);await ctx.recordActual(reservation,50);return {result:{source:r.markdown,model:c.model},partial:false};},
  publish:async()=>{published++;}});
try {
  await store.sync([report('first source')]);
  await Promise.all([worker.wake(),worker.wake()]);
  assert.equal(calls,1);assert.equal(published,1);
  await store.sync([report('first source')]);await worker.wake();assert.equal(calls,1);
  cfg.model='second';await store.sync([report('changed source')]);await worker.wake();assert.equal(calls,2);
  const state=await store.read();const current=state.jobs[state.sources.a.jobId];
  assert.equal(current.pin?.model,'second');
  assert(!JSON.stringify(state).includes(cfg.apiKey),'plaintext key must not persist');
  const usage=JSON.parse(await fs.readFile(usageFile,'utf8'));assert.equal(usage.measuredTokens,100);assert.equal(usage.estimatedTokens,100,'confirmed usage settles reservations');
  await store.sync([report('third source')]);
  const release=aiResourceGroup(usageFile).acquire('chat',2);
  await worker.wake();assert.equal(calls,2,'background reserves capacity for conversation');release();
  cfg.dailyTokenBudget=100;await worker.wake();
  let latest=(await store.read());assert.notEqual(latest.jobs[latest.sources.a.jobId].status,'budget_paused');
  assert.ok(latest.jobs[latest.sources.a.jobId].resultRef,'provider request is not blocked by local budget');
  assert.equal(published,3,'publish the completed third review');
  cfg.dailyTokenBudget=10000;await store.retry('a');await worker.wake();assert.equal(published,3);
  // Recovered in-flight jobs retain reservations and pinned model metadata.
  await store.sync([report('interrupted')]);await store.transaction(s=>{s.jobs[s.sources.a.jobId].status='running';});
  await worker.recover();latest=await store.read();assert.equal(latest.jobs[latest.sources.a.jobId].status,'retry_wait');
} finally {await worker.stop();await fs.rm(root,{recursive:true,force:true});}
console.log('review worker tests passed');
