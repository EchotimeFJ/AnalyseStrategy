import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';
import {buildReportLink} from '../src/lib/reportLinks';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-revision-'));
process.env.REPORT_DIR=path.join(root,'reports');process.env.REPORT_INDEX_CACHE_DIR=path.join(root,'cache');process.env.RESEARCH_REVIEW_DIR=path.join(root,'review');process.env.REPORT_PUBLICATION_FILE=path.join(root,'publication.json');process.env.RESEARCH_REVIEW_ENABLED='true';
await fs.mkdir(process.env.REPORT_DIR);const file=path.join(process.env.REPORT_DIR,'2026-09-16.md');const original='# 花旗\n\n腾讯（0700 HK，买入，目标价10港元）。';await fs.writeFile(file,original);
const {ensureIndex,rebuildIndex}=await import('../api/services/reportIndex');
const {commitPublication}=await import('../api/services/publicationStore');
const {contentHash}=await import('../api/services/reviewStore');
const {default:app}=await import('../api/app');
const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
try{
 const first=await ensureIndex();const report=first.reports[0];const hash=contentHash(original);
 await commitPublication(process.env.REPORT_PUBLICATION_FILE,first,{publishedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),revision:null,fingerprint:hash,appRevision:'test',reviewRevisions:[{reportId:report.id,sourceHash:hash}]},null,false);
 await fs.writeFile(file,original.replace('10港元','20港元'));await rebuildIndex();
 const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 const response=await fetch(`${base}/api/review/reports/${encodeURIComponent(report.id)}/revisions/${hash}`);assert.equal(response.status,200);const payload=await response.json();assert.equal(payload.data.markdown,original);assert(!JSON.stringify(payload).includes('filePath'));
 const link=buildReportLink({reportId:report.id,lineNumber:3,sourceHash:hash});assert(link.includes(`revision=${hash}`));
 const unknown=await fetch(`${base}/api/review/reports/${encodeURIComponent(report.id)}/revisions/${'f'.repeat(64)}`);assert.equal(unknown.status,404,'unknown versions do not silently serve the latest text');
 assert(!buildReportLink({reportId:report.id,sourceHash:'javascript:bad'}).includes('revision='));
}finally{await new Promise<void>(r=>server.close(()=>r()));await fs.rm(root,{recursive:true,force:true});}
console.log('immutable source revision link tests passed');
