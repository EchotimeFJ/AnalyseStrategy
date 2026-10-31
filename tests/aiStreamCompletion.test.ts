import assert from 'node:assert/strict';
import {createOpenAiCompatibleProvider} from '../api/services/aiProvider';
const config={providerId:'custom' as const,providerName:'mock',baseUrl:'https://invalid.example',model:'mock',apiKey:'mock',timeoutMs:5000,dailyTokenBudget:1,maxConcurrency:1};
for(const [reason,done,expected] of [['length',true,'AI_INCOMPLETE_COMPLETION'],[null,false,'AI_STREAM_INTERRUPTED'],['content_filter',true,'AI_RESPONSE_BLOCKED']] as const){
 let attempts=0;
 const p=createOpenAiCompatibleProvider(async()=>{attempts++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:'未完成的回答'},finish_reason:reason}]})+'\n\n'+(done?'data: [DONE]\n\n':''));});
 let text='';await assert.rejects(async()=>{for await(const x of p.stream({messages:[]},config,new AbortController().signal))text+=x;},new RegExp(expected));
 assert.equal(text,'未完成的回答');assert.equal(attempts,1,'visible partial text must not be duplicated by a hidden retry');
}
const complete=createOpenAiCompatibleProvider(async()=>new Response('data: {"choices":[{"delta":{"content":"完整回答"},"finish_reason":"stop"}]}'));
let answer='';for await(const x of complete.stream({messages:[]},config,new AbortController().signal))answer+=x;
assert.equal(answer,'完整回答','accept a final stop frame without trailing blank lines');
console.log('stream truncation and unexpected EOF passed');
// A partial answer must never enter the shared answer cache.
const {createAiService}=await import('../api/services/aiService');
const {buildReportFromMarkdown}=await import('../api/services/reportParser');
const {extractOpinions}=await import('../api/services/opinionExtractor');
const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'stream-cache-'));
try{
 const report=buildReportFromMarkdown({id:'source',filePath:'/2026-10-30.md',markdown:'# 高盛\n腾讯控股 (0700.HK)\n风险：需求下降。'});
 let calls=0;
 const provider=createOpenAiCompatibleProvider(async()=>{calls++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:calls===1?'半截':'完整'},finish_reason:calls===1?'length':'stop'}]})+'\n\ndata: [DONE]\n\n');});
 const service=createAiService({provider,configStore:{resolve:async()=>config,getPublic:async()=>({})},getIndex:async()=>({reports:[report],opinions:extractOpinions(report),version:'one'}),usageFile:path.join(root,'usage.json')});
 const request={question:'腾讯控股有什么风险？',scope:{},ip:'test'};
 const first=await service.prepareChat(request);
 await assert.rejects(async()=>{for await(const x of first.stream)void x;},/AI_INCOMPLETE_COMPLETION/);
 const second=await service.prepareChat(request);assert.equal(second.cached,false);
 let result='';for await(const x of second.stream)result+=x;assert.equal(result,'完整');assert.equal(calls,2);
 assert.equal((await service.prepareChat(request)).cached,true);
}finally{await fs.rm(root,{recursive:true,force:true});}
