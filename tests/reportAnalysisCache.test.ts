import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'analysis-cache-'));process.env.REPORT_INDEX_CACHE_DIR=root;
const {analyzeReport,analysisCacheFile,pruneAnalysisCache}=await import('../api/services/reportAnalysisCache');
const source=path.join(root,'source');const input={id:'one',filePath:path.join(source,'2026-10-20.md'),markdown:'# 高盛\n腾讯控股 (0700.HK，买入)'};
try{
 const first=await analyzeReport(input,source);assert.equal(first.reused,false);
 const second=await analyzeReport(input,source);assert.equal(second.reused,true);assert.equal(JSON.stringify(second.opinions),JSON.stringify(first.opinions));
 const changed=await analyzeReport({...input,markdown:input.markdown.replace('买入','中性')},source);assert.equal(changed.reused,false);assert.equal(changed.opinions[0].rating,'中性');
 await fs.writeFile(analysisCacheFile(source,input.id),'bad-cache');assert.equal((await analyzeReport(input,source)).reused,false);
 await analyzeReport({...input,id:'removed'},source);await pruneAnalysisCache(source,['one']);
 await assert.rejects(fs.access(analysisCacheFile(source,'removed')));assert.equal((await analyzeReport(input,source)).reused,true);
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('per-report source cache and deletion passed');
