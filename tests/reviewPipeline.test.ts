import assert from 'node:assert/strict';
import { realReport } from './realReportFixture';
import { buildReportFromMarkdown } from '../api/services/reportParser';
import { extractOpinions } from '../api/services/opinionExtractor';
import { buildReviewCandidate, reviewReportCandidate, buildReviewChunks } from '../api/services/researchReview';
import { projectReviewedReport } from '../api/services/reviewProjection';
import type { ResolvedAiConfig } from '../api/services/aiConfig';
const original=realReport('2026-09-08');
const config:ResolvedAiConfig={providerId:'custom',providerName:'Fixture',model:'fixture',baseUrl:'https://unused.invalid',apiKey:'fixture',timeoutMs:1000,maxConcurrency:1,dailyTokenBudget:100000};
for(const [header,start,end,min] of [['花旗',16,16,4],['野村',223,223,4],['野村',627,635,2]] as const){
 const report=buildReportFromMarkdown({id:`smoke-${start}`,filePath:'2026-09-08.md',markdown:`# ${header}\n\n${original.lines.slice(start-1,end).join('\n')}`});
 const candidate=buildReviewCandidate(report,extractOpinions(report));
 const chunks=buildReviewChunks(report,candidate,6000);
 let calls=0,reservations=0;
 const result=await reviewReportCandidate(report,candidate,config,{reserve:async n=>{reservations+=n;return 'r';},provider:{test:async()=>{},async *stream(){},complete:async input=>{
  calls++; const ctx=JSON.parse(input.messages[1].content.split('\n')[0]);const chunk=chunks.find(c=>c.chunkId===ctx.chunkId)!;
  return {content:JSON.stringify({baseRevisionId:candidate.reportRevisionId,baseCandidateHash:candidate.candidateHash,sourceHash:candidate.sourceHash,coverage:{ranges:[{startLine:chunk.startLine,endLine:chunk.endLine}],complete:chunks.length===1},operations:chunk.recordIDs.map(candidateId=>({op:'keep',candidateId,reason:'原文一致'})),issues:[]}),finishReason:'stop',usage:{totalTokens:100}};
 }}});
 assert.equal(result.readiness,'ready',JSON.stringify(result.issues));
 const output=projectReviewedReport(report,result);
 assert(output.opinions.length>=min,`${start}: full pipeline lost opinions`);
 assert.equal(output.opinions.some(o=>o.security.code==='CM.N'),false);
 assert(reservations>0);assert.equal(calls,chunks.length);
}
console.log('review candidate-to-publication pipeline tests passed');
