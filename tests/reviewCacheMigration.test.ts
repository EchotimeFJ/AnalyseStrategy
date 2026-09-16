import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-cache-migration-'));
try{
 const reports=path.join(root,'reports');await fs.mkdir(reports);await fs.writeFile(path.join(reports,'2026-09-16.md'),'# 花旗\n\n腾讯（0700.HK）\n买入，目标价600港元。');
 const script=`import {ensureIndex} from ${JSON.stringify(path.resolve('api/services/reportIndex.ts'))};const i=await ensureIndex();console.log(JSON.stringify({opinions:i.opinions.length,mentions:i.mentions.length,states:i.reviewStates}));`;
 const env={...process.env,REPORT_DIR:reports,REPORT_INDEX_CACHE_DIR:path.join(root,'cache'),REPORT_PUBLICATION_FILE:path.join(root,'publication.json'),RESEARCH_REVIEW_DIR:path.join(root,'review')};
 const old=await exec(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...env,RESEARCH_REVIEW_ENABLED:'false'}});assert(JSON.parse(old.stdout).opinions>0);
 const migrated=await exec(process.execPath,['--import','tsx','--input-type=module','-e',script],{env:{...env,RESEARCH_REVIEW_ENABLED:'true'}});const value=JSON.parse(migrated.stdout);assert.equal(value.opinions,0);assert.equal(value.mentions,0);assert.equal(Object.values(value.states)[0].status,'legacy_unreviewed');
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('unreviewed cache migration tests passed');
