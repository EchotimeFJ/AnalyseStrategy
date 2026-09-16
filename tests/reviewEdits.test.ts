import assert from 'node:assert/strict';
import {buildReportFromMarkdown} from '../api/services/reportParser';
import {extractOpinions} from '../api/services/opinionExtractor';
import {validateReviewCandidate,buildReviewCandidate,buildReviewFieldGuards,validateReviewPatch,applyReviewPatch,reviewReportCandidate} from '../api/services/researchReview';
import type {ReviewPatch,SignalRecord} from '../api/domain/review';
const report=buildReportFromMarkdown({id:'name-fix',filePath:'2026-09-16.md',markdown:'# 花旗\n\n同时覆盖国电南瑞（买入，目标价28元）。'});
const baseline=extractOpinions(report).map(o=>({...o,sourceName:'同时覆盖国电南瑞',security:{...o.security,displayName:'同时覆盖国电南瑞'}}));
const candidate=buildReviewCandidate(report,baseline);const mention=candidate.records.find(r=>r.kind==='mention')!;assert.equal(mention.kind,'mention');
const guard=buildReviewFieldGuards(mention).find(g=>g.path==='payload.rawName')!;assert(guard);
const patch:ReviewPatch={baseRevisionId:candidate.reportRevisionId,baseCandidateHash:candidate.candidateHash,sourceHash:candidate.sourceHash,coverage:candidate.coverage,operations:candidate.reviewableRecordIDs.map(candidateId=>candidateId===mention.id?{op:'modify',candidateId,reason:'连接语不是公司名称',fieldChanges:[{path:guard.path,expectedValueHash:guard.expectedValueHash,value:'国电南瑞',evidenceIDs:mention.evidenceIDs}]}:{op:'keep',candidateId,reason:'原文一致'}),issues:[]};
assert.equal(validateReviewPatch(patch,candidate).valid,true);
const applied=applyReviewPatch(candidate,patch);const corrected=applied.records.find(r=>r.id===mention.id)!;assert.equal(corrected.kind,'mention');if(corrected.kind==='mention'){assert.equal(corrected.payload.rawName,'国电南瑞');assert.equal(corrected.payload.resolution.status,'unresolved','program must re-resolve identity after a name edit');}
const bad=structuredClone(patch);bad.operations.find(o=>o.op==='modify')!.fieldChanges![0].value='原文没有这家公司';assert.equal(validateReviewPatch(bad,candidate).valid,false);

const macro=buildReportFromMarkdown({id:'macro-add',filePath:'2026-09-16.md',markdown:'# 花旗\n\n风险：行业库存上升。\n\n# 高盛\n\n风险：下游需求下降。'});
const c=buildReviewCandidate(macro,extractOpinions(macro));
const result=await reviewReportCandidate(macro,c,{providerId:'custom',providerName:'fixture',model:'fixture',apiKey:'fixture',baseUrl:'https://unused.invalid',timeoutMs:1000,dailyTokenBudget:100000,maxConcurrency:1},{provider:{test:async()=>{},async *stream(){},complete:async input=>{
 const ctx=JSON.parse(input.messages[1].content.split('\n')[0]);assert.equal(ctx.reportDate,macro.date);const evidence=c.evidence.find(e=>e.startLine>=ctx.range.startLine&&e.startLine<=ctx.range.endLine&&e.quote.includes('风险'))!;
 const record:SignalRecord={id:'new:signal',kind:'signal',status:'active',articleRef:ctx.articleRefs[0],evidenceIDs:[evidence.evidenceId],payload:{articleRef:ctx.articleRefs[0],subject:{scope:'theme',mentionRef:null,rawText:'行业',resolvedSecurityKey:null},kind:'risk',summary:evidence.quote,evidenceIDs:[evidence.evidenceId],temporalContext:'current',polarity:'affirmative',modality:'actual',relatedStatementRefs:[],expectedWindowText:null,eventDate:{state:'not_stated',value:null,evidenceIDs:[]},conditionText:null,realizationStatus:'not_tracked'}};
 return {finishReason:'stop',usage:{totalTokens:100},content:JSON.stringify({baseRevisionId:c.reportRevisionId,baseCandidateHash:c.candidateHash,sourceHash:c.sourceHash,coverage:{ranges:[ctx.range],complete:false},operations:[...ctx.candidateRecordIDs.map((candidateId:string)=>({op:'keep',candidateId,reason:'原文一致'})),{op:'add',candidateId:'new:signal',reason:'补充明确的行业风险',record}],issues:[]})};
}}});
assert.equal(result.readiness,'ready',JSON.stringify(result.issues));const signals=result.records.filter(r=>r.kind==='signal');assert.equal(signals.length,2);assert.equal(new Set(signals.map(s=>s.id)).size,2,'identical model-local IDs in different chunks must not collide');
console.log('source-bounded name edits and cross-chunk additions tests passed');

// Incorrect tentative prices must reach AI, while an unchanged wrong price is rejected.
const wrongPriceCandidate=buildReviewCandidate(report,baseline.map(o=>({...o,targetPrice:o.targetPrice?'60元':null})));
assert.equal(validateReviewCandidate(wrongPriceCandidate).valid,true,'semantic candidate errors must remain reviewable');
const wrongKeep:ReviewPatch={baseRevisionId:wrongPriceCandidate.reportRevisionId,baseCandidateHash:wrongPriceCandidate.candidateHash,sourceHash:wrongPriceCandidate.sourceHash,coverage:wrongPriceCandidate.coverage,operations:wrongPriceCandidate.reviewableRecordIDs.map(candidateId=>({op:'keep',candidateId,reason:'unchanged'})),issues:[]};
assert.equal(validateReviewPatch(wrongKeep,wrongPriceCandidate).valid,false,'review must not approve unsupported price');

// Resolved findings are audit history, and one bounded format repair can succeed.
let repairCalls=0;
const repaired=await reviewReportCandidate(report,candidate,{providerId:'custom',providerName:'fixture',model:'fixture',apiKey:'fixture',baseUrl:'https://unused.invalid',timeoutMs:1000,dailyTokenBudget:100000,maxConcurrency:1},{provider:{test:async()=>{},async *stream(){},complete:async input=>{
 repairCalls++;
 if(repairCalls===1)return {finishReason:'stop',usage:{totalTokens:100},content:'```json\n{}\n```'};
 assert(input.messages.at(-1)?.content.includes('校验'));
 return {finishReason:'stop',usage:{totalTokens:100},content:JSON.stringify({...patch,issues:[{issueId:'corrected-name',recordRef:mention.id,fieldPath:'payload.rawName',category:'subject_role',severity:'error',status:'resolved',description:'名称边界已经修正',evidenceIDs:mention.evidenceIDs}]})};
}}});
assert.equal(repairCalls,2);assert.equal(repaired.readiness,'ready',JSON.stringify(repaired.issues));assert.equal(repaired.attempts.length,2);assert(repaired.issues.some(i=>i.status==='resolved'));
let invalidCalls=0;
const rejected=await reviewReportCandidate(report,candidate,{providerId:'custom',providerName:'fixture',model:'fixture',apiKey:'fixture',baseUrl:'https://unused.invalid',timeoutMs:1000,dailyTokenBudget:100000,maxConcurrency:1},{provider:{test:async()=>{},async *stream(){},complete:async()=>{invalidCalls++;return {finishReason:'stop',content:'bad json'};}}});
assert.equal(invalidCalls,2,'invalid output must not cause unbounded paid retries');assert.equal(rejected.complete,false);
