import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'paging-order-'));
process.env.REPORT_DIR=path.join(root,'reports');process.env.REPORT_INDEX_CACHE_DIR=path.join(root,'cache');process.env.RESEARCH_REVIEW_DIR=path.join(root,'sources');process.env.REPORT_PUBLICATION_FILE=path.join(root,'publication.json');
await fs.mkdir(process.env.REPORT_DIR);
try{
 await fs.writeFile(path.join(process.env.REPORT_DIR,'2026-10-01.md'),'# 高盛\n\n腾讯控股 (0700.HK，买入)');
 await fs.writeFile(path.join(process.env.REPORT_DIR,'2026-10-30.md'),'# 高盛\n\n腾讯控股，维持买入评级。');
 const {searchReports}=await import('../api/services/reportIndex');
 const first=await searchReports({q:'0700.HK',limit:1});
 assert.equal(first.groups[0]?.date,'2026-10-30');
 const next=await searchReports({q:'0700.HK',limit:1,offset:1,publicationId:first.publicationId});
 assert.equal(next.groups[0]?.date,'2026-10-01');assert.equal(next.hasMore,false);
 const raw=await searchReports({q:'0700.HK',raw:true,paginated:true});
 assert.ok('hits' in raw);assert.equal(raw.totalHits,1);
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('globally sorted pagination passed');
