// Explicitly invoked evaluation only. Never saves/activates profiles or changes reports.
// Run on the existing host; credentials stay in process memory. Results contain no credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');const app='/opt/AnalyseStrategy';
const requireApp=createRequire(app+'/package.json');
requireApp('dotenv').config({path:app+'/.env',quiet:true});
const dir=__dirname,phase=process.argv[2];if(!['base','common','adapted'].includes(phase))throw Error('phase required');
const configFile=app+'/data/runtime/ai-config.json';const before=fs.readFileSync(configFile);const cfg=JSON.parse(before);
const samples=JSON.parse(fs.readFileSync(dir+'/samples.json'));
if(phase==='adapted')for(const s of samples){s.allowedTags=s.id==='S3'?['AH','储能']:[];s.allowedDecisionIds=s.candidates.map(c=>c.id);}
const system=fs.readFileSync(dir+'/prompt-base.txt','utf8')+(phase!=='base'?'\n'+fs.readFileSync(dir+'/prompt-common-extra.txt','utf8'):'');
const finalSystem=system+(phase==='adapted'?'\n'+fs.readFileSync(dir+'/prompt-common-v2-extra.txt','utf8'):'');
const messages=[{role:'system',content:finalSystem},{role:'user',content:JSON.stringify(samples)}];
const ledgerFile=dir+'/evaluation-budget.json';let ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile)):{cap:200000,reserved:0,attempts:[]};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function decrypt(v){const key=crypto.createHash('sha256').update(process.env.AI_CONFIG_SECRET||'').digest();const d=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(v.iv,'base64'));d.setAuthTag(Buffer.from(v.tag,'base64'));return Buffer.concat([d.update(Buffer.from(v.ciphertext,'base64')),d.final()]).toString();}
(async()=>{for(const p of cfg.profiles){
 const id=phase+'-'+p.providerId,file=dir+'/'+id+'.json';if(fs.existsSync(file)){console.log(JSON.stringify({id,skipped:'existing result'}));continue;}
 const maxTokens=phase==='adapted'?(p.providerId==='mimo'?9000:4000):6000, reserve=Buffer.byteLength(JSON.stringify(messages))+maxTokens+1024;
 const active=cfg.profiles.find(p=>hash(JSON.stringify([p.providerId,p.baseUrl.replace(/\/+$/,''),p.model.trim()]))===cfg.activeProfileId);
 const limit=Number(process.env.AI_DAILY_TOKEN_BUDGET||active?.dailyTokenBudget||500000);
 let online=0;try{const usage=JSON.parse(fs.readFileSync(app+'/data/runtime/ai-usage.json'));if(usage.day===new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}))online=usage.estimatedTokens;}catch(e){if(e.code!=='ENOENT')throw Error('usage unreadable');}
 if(ledger.reserved+reserve>ledger.cap||online+ledger.reserved+reserve>limit){console.log(JSON.stringify({id,status:'budget_blocked'}));break;}
 ledger.reserved+=reserve;ledger.attempts.push({id,reserved:reserve,at:new Date().toISOString()});fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2),{mode:0o600});
 const key=decrypt(p.apiKeyEncrypted),headers={'Content-Type':'application/json'};
 if(p.providerId==='mimo')headers['api-key']=key;else headers.Authorization='Bearer '+key;
 if(p.providerId==='openrouter'){headers['HTTP-Referer']='https://fustar.top/analyse-strategy/';headers['X-OpenRouter-Title']='AnalyseStrategy evaluation';}
 const body={model:p.model,messages,stream:false,temperature:p.providerId==='mimo'?1:0.2};
 if(p.providerId==='mimo'){body.top_p=0.95;body.max_completion_tokens=maxTokens;}else body.max_tokens=maxTokens;
 if(p.providerId==='openrouter')body.reasoning={effort:'low',exclude:true};
 if(phase==='adapted'&&p.providerId==='deepseek')body.thinking={type:'disabled'};
 const timeout=phase==='base'?p.timeoutMs:phase==='adapted'?180000:120000;
 const result={id,phase,provider:p.providerId,configuredModel:p.model,startedAt:new Date().toISOString(),timeoutMs:timeout,maxTokens,thinking:body.thinking||null,inputHash:hash(JSON.stringify(messages)),sampleIds:samples.map(s=>s.id)};const start=Date.now();
 console.log(JSON.stringify({id,status:'started',timeoutMs:timeout}));
 try{const r=await fetch(p.baseUrl.replace(/\/+$/,'')+'/chat/completions',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});result.httpStatus=r.status;
 if(!r.ok){result.status='provider_error';}else{const data=await r.json();result.actualModel=data.model;result.usage=data.usage||null;result.finishReason=data.choices?.[0]?.finish_reason||null;result.content=(data.choices?.[0]?.message?.content||'').split(key).join('[REDACTED]');result.status=result.finishReason==='length'?'truncated':result.content?'received':'empty';}}
 catch(e){result.status=e.name==='TimeoutError'||e.name==='AbortError'?'timeout':'transport_error';result.errorType=e.name;}
 result.elapsedMs=Date.now()-start;result.configUnchanged=hash(fs.readFileSync(configFile))===hash(before);fs.writeFileSync(file,JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({id,status:result.status,httpStatus:result.httpStatus,elapsedMs:result.elapsedMs,usage:result.usage,configUnchanged:result.configUnchanged}));
 }})().catch(()=>{console.error('evaluation failed; inspect credential-free artifacts');process.exitCode=1;});
