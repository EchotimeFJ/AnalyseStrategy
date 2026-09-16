import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAiConfigStore } from '../api/services/aiConfig';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'review-config-'));
try{
 const store=createAiConfigStore({filePath:path.join(root,'config.json'),secret:'test-encryption',adminToken:'test-admin',env:{}});
 assert.equal(await store.resolveProvider('deepseek'),null,'an automated DeepSeek profile is required; do not fall back to the active provider');
 await store.save({providerId:'deepseek',providerName:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',apiKey:'key-one',reviewTimeoutMs:30000,reviewMaxTokens:4000,reviewThinking:'disabled'},'test-admin');
 await store.save({providerId:'mimo',providerName:'MiMo',baseUrl:'https://api.xiaomimimo.com/v1',model:'mimo-v2.5-pro',apiKey:'key-two',reviewTimeoutMs:180000,reviewMaxTokens:12000,reviewThinking:'low'},'test-admin');
 let publicConfig=await store.getPublic();const first=publicConfig.profiles.find(p=>p.providerId==='deepseek')!;
 await store.activate(first.id,'test-admin');const resolved=await store.resolve();assert.equal(resolved?.apiKey,'key-one');assert.equal(resolved?.reviewTimeoutMs,30000);assert.equal(resolved?.reviewMaxTokens,4000);assert.equal(resolved?.reviewThinking,'disabled');
 const second=publicConfig.profiles.find(p=>p.providerId==='mimo')!;const pinned=await store.resolveProfile(second.id);assert.equal(pinned?.apiKey,'key-two');assert.equal(pinned?.reviewMaxTokens,12000);assert.equal((await store.resolve())?.model,'deepseek-flash','resolving a pinned background model must not switch the active profile');
 const automated=await store.resolveProvider('deepseek');assert.equal(automated?.apiKey,'key-one');assert.equal(automated?.providerId,'deepseek');assert.equal((await store.resolve())?.model,'deepseek-flash','provider resolution must not change active profile');
 await store.activate(second.id,'test-admin');const automatedWhileMiMoIsActive=await store.resolveProvider('deepseek');assert.equal(automatedWhileMiMoIsActive?.apiKey,'key-one','automated review keeps DeepSeek when the website selects MiMo');assert.equal((await store.resolve())?.apiKey,'key-two');
 await assert.rejects(store.preview({providerId:'deepseek',providerName:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',reviewThinking:'invalid' as 'low'},'test-admin'),/INVALID/);
 publicConfig=await store.getPublic();assert(!JSON.stringify(publicConfig).includes('key-one'));assert(!JSON.stringify(publicConfig).includes('key-two'));
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('per-profile review configuration tests passed');
