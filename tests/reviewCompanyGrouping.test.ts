import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-company-group-'));
process.env.REPORT_DIR=path.join(root,'reports');process.env.REPORT_INDEX_CACHE_DIR=path.join(root,'cache');process.env.RESEARCH_REVIEW_DIR=path.join(root,'review');process.env.REPORT_PUBLICATION_FILE=path.join(root,'publication.json');process.env.RESEARCH_REVIEW_ENABLED='true';
await fs.mkdir(process.env.REPORT_DIR);
await fs.writeFile(path.join(process.env.REPORT_DIR,'2026-09-16.md'),'# 摩根大通\n\n赣锋锂业（002460 CH，增持，目标价80元）。\n\n# 花旗\n\n赣锋锂业（1772 HK，买入，目标价90港元）。');
const {ensureIndex,rebuildIndex,getCompanyProfiles,getInstitutionView}=await import('../api/services/reportIndex');
try{
 const original=await ensureIndex();assert.ok(original.opinions.length);
 await rebuildIndex();const profiles=await getCompanyProfiles('赣锋');assert.equal(profiles.length,1,'A/H issuer grouped once');assert.equal(profiles[0].listings?.length,2);assert.equal(new Set(profiles[0].listings?.map(l=>l.securityId)).size,2,'securities remain distinct');
 assert(profiles[0].opinions.some(o=>o.targetPrice?.includes('港元')));assert(profiles[0].opinions.some(o=>o.targetPrice&&!o.targetPrice.includes('港元')));
 const institution=await getInstitutionView({target:'赣锋'});assert.equal(institution.divergence.length,0,'different markets are not a broker disagreement');
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('program company grouping tests passed');
