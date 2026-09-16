import assert from 'node:assert/strict';
import {buildReportFromMarkdown} from '../api/services/reportParser';
import {extractOpinions} from '../api/services/opinionExtractor';
import {buildReviewCandidate,reviewReportCandidate,type ReviewCheckpoint} from '../api/services/researchReview';
const report=buildReportFromMarkdown({id:'split',filePath:'2026-09-16.md',markdown:'# 花旗\n\n思源电气（买入，目标价216元）。\n\n国电南瑞（买入，目标价28元）。'});const candidate=buildReviewCandidate(report,extractOpinions(report));
const cache=new Map<string,ReviewCheckpoint>();let calls=0;const config={providerId:'custom' as const,providerName:'fixture',model:'fixture',apiKey:'fixture',baseUrl:'https://unused.invalid',timeoutMs:1000,dailyTokenBudget:100000,maxConcurrency:1};
const options={loadChunk:async(key:string)=>cache.get(key),saveChunk:async(key:string,value:ReviewCheckpoint)=>{cache.set(key,value);},provider:{test:async()=>{},async *stream(){},complete:async(input:{messages:Array<{content:string}>})=>{
 calls++;const ctx=JSON.parse(input.messages[1].content.split('\n')[0]);if(ctx.range.startLine===1&&ctx.range.endLine===5)return {content:'{',finishReason:'length',usage:{totalTokens:100}};
 return {content:JSON.stringify({baseRevisionId:candidate.reportRevisionId,baseCandidateHash:candidate.candidateHash,sourceHash:candidate.sourceHash,coverage:{ranges:[ctx.range],complete:false},operations:ctx.candidateRecordIDs.map((candidateId:string)=>({op:'keep',candidateId,reason:'原文一致'})),issues:[]}),finishReason:'stop',usage:{totalTokens:100}};
}}};
const result=await reviewReportCandidate(report,candidate,config,options);assert.equal(result.readiness,'ready',JSON.stringify(result.issues));assert.equal(calls,3);assert.equal(result.attempts.filter(a=>a.status==='failed').length,1,'retain the billed truncated attempt');
const again=await reviewReportCandidate(report,candidate,config,options);assert.equal(again.readiness,'ready');assert.equal(calls,3,'reuse split plan and successful child checkpoints without another request');
console.log('truncation split and checkpoint reuse tests passed');
