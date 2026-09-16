import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-company-group-'));
process.env.REPORT_DIR=path.join(root,'reports');process.env.REPORT_INDEX_CACHE_DIR=path.join(root,'cache');process.env.RESEARCH_REVIEW_DIR=path.join(root,'review');process.env.REPORT_PUBLICATION_FILE=path.join(root,'publication.json');process.env.RESEARCH_REVIEW_ENABLED='true';
await fs.mkdir(process.env.REPORT_DIR);
await fs.writeFile(path.join(process.env.REPORT_DIR,'2026-09-16.md'),'# 摩根大通\n\n赣锋锂业（002460 CH，增持，目标价80元）。\n\n# 花旗\n\n赣锋锂业（1772 HK，买入，目标价90港元）。');
const {ensureIndex,rebuildIndex,getCompanyProfiles,getInstitutionView}=await import('../api/services/reportIndex');
const {reviewStore}=await import('../api/services/reviewRuntime');
const {buildReviewCandidate,reviewReportCandidate}=await import('../api/services/researchReview');
const {extractOpinions}=await import('../api/services/opinionExtractor');
try{
 const original=await ensureIndex();const report=original.reports[0];
 const candidate=buildReviewCandidate(report,extractOpinions(report));
 const result=await reviewReportCandidate(report,candidate,{providerId:'custom',providerName:'fixture',model:'fixture',apiKey:'fixture',baseUrl:'https://unused.invalid',timeoutMs:1000,dailyTokenBudget:100000,maxConcurrency:1},{provider:{test:async()=>{},async *stream(){},complete:async input=>{const ctx=JSON.parse(input.messages[1].content.split('\n')[0]);return {finishReason:'stop',usage:{totalTokens:100},content:JSON.stringify({baseRevisionId:candidate.reportRevisionId,baseCandidateHash:candidate.candidateHash,sourceHash:candidate.sourceHash,coverage:{ranges:[ctx.range],complete:false},operations:ctx.candidateRecordIDs.map((candidateId:string)=>({op:'keep',candidateId,reason:'原文一致'})),issues:[]})};}}});
 assert.equal(result.readiness,'ready',JSON.stringify(result.issues));
 const store=reviewStore();const state=await store.read();const job=state.jobs[state.sources[report.id].jobId];const ref=await store.writeResult(job,result);await store.transaction(s=>{s.jobs[job.id].status='succeeded';s.jobs[job.id].resultRef=ref;});
 await rebuildIndex();const profiles=await getCompanyProfiles('赣锋');assert.equal(profiles.length,1,'A/H issuer grouped once');assert.equal(profiles[0].listings?.length,2);assert.equal(new Set(profiles[0].listings?.map(l=>l.securityId)).size,2,'securities remain distinct');
 assert(profiles[0].opinions.some(o=>o.targetPrice?.includes('港元')));assert(profiles[0].opinions.some(o=>o.targetPrice&&!o.targetPrice.includes('港元')));
 const institution=await getInstitutionView({target:'赣锋'});assert.equal(institution.divergence.length,0,'different markets are not a broker disagreement');
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('reviewed company grouping tests passed');
