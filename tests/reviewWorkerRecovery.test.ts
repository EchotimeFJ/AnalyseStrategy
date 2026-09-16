import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createReviewStore} from '../api/services/reviewStore';
import {createReviewWorker} from '../api/services/reviewWorker';
import {buildReportFromMarkdown} from '../api/services/reportParser';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-recovery-'));
const store=createReviewStore(root);let now=new Date('2026-09-16T01:00:00Z');let published=0;
const config={providerId:'custom' as const,providerName:'Fixture',model:'fixture',baseUrl:'https://unused.invalid',apiKey:'fixture',timeoutMs:1000,dailyTokenBudget:10000,maxConcurrency:1};
let available=true;
const worker=createReviewWorker({store,usageFile:path.join(root,'usage.json'),now:()=>now,resolve:async()=>available?config:null,resolveProfile:async()=>config,process:async()=>{throw Error('must not reach provider');},publish:async()=>{published++;}});
try{
 await store.sync([buildReportFromMarkdown({id:'a',filePath:'2026-09-16.md',markdown:'# 花旗\n\n腾讯（0700.HK，买入）。'})]);
 available=false;await worker.wake();let state=await store.read();assert.equal(state.jobs[state.sources.a.jobId].status,'config_paused');assert.equal(published,1,'paused state must be published');
 available=true;await store.retry('a');
 const files=await fs.readdir(path.join(root,'sources'));await fs.unlink(path.join(root,'sources',files[0]));
 for(let i=0;i<3;i++){now=new Date(now.getTime()+10*60000);await worker.wake();}
 state=await store.read();assert.equal(state.jobs[state.sources.a.jobId].status,'failed');assert.equal(state.jobs[state.sources.a.jobId].attempts,3,'pre-provider errors have a finite retry limit');
 const raw=JSON.parse(await fs.readFile(path.join(root,'state.json'),'utf8'));raw.jobs[raw.sources.a.jobId].nextAttemptAt='not-a-date';await fs.writeFile(path.join(root,'state.json'),JSON.stringify(raw));await assert.rejects(store.read(),/INVALID/);
}finally{await worker.stop();await fs.rm(root,{recursive:true,force:true});}
console.log('review worker recovery tests passed');
