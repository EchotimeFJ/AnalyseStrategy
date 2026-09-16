import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ReviewedReport, ReviewClaim, ReviewRecord } from '../api/domain/review';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { contentHash, createReviewStore } from '../api/services/reviewStore';
import { loadReviewProjection, projectReviewedReport } from '../api/services/reviewProjection';
const report = buildReportFromMarkdown({id:'r',filePath:'/r.md',markdown:'# 花旗\n腾讯（0700.HK，买入，目标价600港元）。'});
const hash=contentHash(report.markdown);
const absent=<T>():ReviewClaim<T>=>({state:'not_stated',value:null,evidenceIDs:[]});
const claim=<T>(value:T):ReviewClaim<T>=>({state:'stated',value,evidenceIDs:['e']});
const result:ReviewedReport={protocolVersion:'review-v1',vocabularyVersion:'1',reportId:'r',reportRevisionId:hash,sourceHash:hash,candidateHash:'c',coverage:{complete:true,ranges:[{startLine:1,endLine:2}]},records:[],evidence:[{evidenceId:'e',reportId:'r',reportRevisionId:hash,sourceHash:hash,startOffset:0,endOffset:report.markdown.length,startLine:1,endLine:2,quote:report.markdown,method:'original'}],operations:[],issues:[],validationState:'valid',readiness:'ready',complete:true,usage:{attempts:1,reservedUnits:100,inputBytes:100,byAttempt:[]},attempts:[]};
result.records=[
 {id:'m',kind:'mention',articleRef:'a',evidenceIDs:['e'],payload:{articleRef:'a',rawName:'腾讯',roles:['recommended_target'],nameEvidenceIDs:['e'],rawIdentifiers:[{text:'0700.HK',interpretation:'ticker',evidenceIDs:['e']}],resolution:{status:'resolved',resolvedSecurityKey:'0700.HK',resolvedCode:'0700.HK',displayName:'腾讯',aliases:['腾讯'],confidence:'high'}}},
 {id:'s',kind:'statement',articleRef:'a',evidenceIDs:['e'],payload:{articleRef:'a',attribution:{kind:'article_publisher',rawName:'花旗',institutionVerified:true,evidenceIDs:['e']},subject:{scope:'listing',mentionRef:'m'},asOf:absent(),polarity:'affirmative',modality:'actual',temporalContext:'current',conditionText:null,rating:claim({rawLabel:'买入',coverage:'rated',normalizedLabel:'buy',scaleRef:null,benchmarkText:null,horizonText:null,basis:'unknown'}),recommendation:absent(),ratingAction:absent(),priorRating:absent(),targetPrice:claim({rawText:'600港元',shape:'point',amount:'600',currency:'HKD',unit:'unknown'}),targetPriceAction:absent(),priorTargetPrice:absent(),currentPrice:absent(),rationale:absent(),sharedScopeId:null}}
] satisfies ReviewRecord[];
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-projection-'));const store=createReviewStore(root);
try{
 const projected=projectReviewedReport(report,result);assert.equal(projected.opinions[0].rating,'买入');assert.equal(projected.mentions[0].targetPrice,'600港元');
 const deleted=structuredClone(result);deleted.records[1].status='deleted';assert.equal(projectReviewedReport(report,deleted).opinions.length,0);assert.equal(projectReviewedReport(report,deleted).mentions.length,0,'deleted facts cannot survive in mentions');
 const invented=structuredClone(result);if(invented.records[1].kind==='statement')invented.records[1].payload.targetPrice.value!.amount='999999';assert.throws(()=>projectReviewedReport(report,invented),/PRICE_UNSUPPORTED/);
 const fake=structuredClone(result);fake.evidence[0].quote='fabricated';assert.throws(()=>projectReviewedReport(report,fake),/EVIDENCE/);
 await store.sync([report]);let state=await store.read();const job=state.jobs[state.sources.r.jobId];const ref=await store.writeResult(job,result);
 await store.transaction(s=>{s.jobs[job.id].status='succeeded';s.jobs[job.id].resultRef=ref;});
 const changed={...report,markdown:report.markdown.replace('600','700')};await store.sync([changed]);
 const overlay=await loadReviewProjection([changed],root,store);
 assert.equal(overlay!.reports[0].markdown,report.markdown,'pending update keeps old facts paired with old original');
 assert.equal(overlay!.opinions[0].targetPrice,'600港元');assert.equal(overlay!.states.r.sourceHash,contentHash(changed.markdown));assert.equal(overlay!.states.r.publishedSourceHash,hash);
 state=await store.read();const newJob=state.jobs[state.sources.r.jobId];await store.transaction(s=>{s.jobs[newJob.id].status='failed';});
 const failed=await loadReviewProjection([changed],root,store);assert.equal(failed!.opinions[0].targetPrice,'600港元');
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('review projection tests passed');
