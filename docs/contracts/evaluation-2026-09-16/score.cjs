const fs=require('node:fs'),path=require('node:path');
const dir=__dirname;const samples=JSON.parse(fs.readFileSync(dir+'/samples.json'));const gold=JSON.parse(fs.readFileSync(dir+'/gold.json')).records;
const Ajv=require('../../../node_modules/ajv/dist/2020').default;const valid=new Ajv({strict:true,allErrors:true}).compile(JSON.parse(fs.readFileSync(dir+'/response.schema.json')));
const enums=['买入','增持','中性','持有','减持','卖出','其他',null];
function price(v){if(v==null)return [null,null];const text=v.replace(/,/g,'');const num=text.match(/\d+(?:\.\d+)?/);return [num?String(Number(num[0])):null,/港|HKD|HK\$/i.test(text)?'HKD':/美元|USD|US\$/i.test(text)?'USD':/人民币|CNY|元/.test(text)?'CNY':null];}
function match(r,g){const [n,c]=price(r.targetPrice);return r.name===g[0]&&r.rating===g[1]&&n===g[2]&&c===g[3];}
function score(results){let correct=0,count=0,exact=0,quotes=0;const errors=[],caseResults=[];
 for(const s of samples){const rs=results.filter(r=>r.sampleId===s.id);if(rs.length!==1){errors.push(s.id+':result count '+rs.length);continue;}const r=rs[0],source=s.source+'\n'+(s.context||[]).map(c=>c.quote).join('\n');
 let hits=0;const seen=new Set();for(const rec of r.records||[]){count++;const ix=gold[s.id].findIndex(g=>match(rec,g));if(ix>=0&&!seen.has(ix)){hits++;correct++;seen.add(ix);}else errors.push(s.id+':wrong/duplicate record '+rec.name);
 if(!enums.includes(rec.rating))errors.push(s.id+':invalid rating');
 if(!Array.isArray(rec.evidence)||!rec.evidence.length)errors.push(s.id+':missing evidence '+rec.name);
 for(const q of rec.evidence||[]){quotes++;if(source.includes(q))exact++;else errors.push(s.id+':nonliteral quote '+rec.name);}}
 const expected=new Set(s.candidates.map(c=>c.id));const decisions=r.decisions||[];for(const id of expected){if(decisions.filter(d=>d.candidateId===id).length!==1)errors.push(s.id+':decision missing/duplicate');}
 for(const d of decisions)if(!expected.has(d.candidateId))errors.push(s.id+':invented candidate id');
 for(const t of r.tags||[])if(!source.includes('#'+t.replace(/^#/,'')))errors.push(s.id+':invented source tag '+t);
 for(const signal of r.signals||[]){quotes++;if(source.includes(signal.quote))exact++;else errors.push(s.id+':nonliteral signal');}
 caseResults.push({id:s.id,correctRecords:hits,expectedRecords:gold[s.id].length,returnedRecords:(r.records||[]).length});
 }
 return {correctRecords:correct,expectedRecords:18,returnedRecords:count,exactQuotes:exact,totalQuotes:quotes,errors,caseResults};}
const output=[];
for(const f of fs.readdirSync(dir).filter(f=>/^(base|common|adapted)-.*\.json$/.test(f))){const run=JSON.parse(fs.readFileSync(path.join(dir,f)));let parsed;try{parsed=JSON.parse(run.content);}catch{}
 output.push({file:f,provider:run.provider,model:run.actualModel||run.configuredModel,status:run.status,elapsedMs:run.elapsedMs,usage:run.usage||null,jsonParseable:!!parsed,schemaValid:parsed?valid(parsed):false,schemaErrors:parsed?(valid.errors||[]).map(e=>({path:e.instancePath,keyword:e.keyword,message:e.message})):[],score:parsed?.results?score(parsed.results):null});
}
fs.writeFileSync(dir+'/scores.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output.map(({score,...r})=>({...r,score:score?{...score,caseResults:undefined}:null})),null,2));
