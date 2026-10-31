import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'config-atomic-'));
process.env.USER_CONFIG_FILE=path.join(root,'settings.json');
const api=await import('../api/services/localConfig');
try {
 assert.deepEqual(await api.readUserConfig(),{watchlist:[],aliases:[]});
 await assert.rejects(fs.access(process.env.USER_CONFIG_FILE));
 await Promise.all(Array.from({length:12},(_,n)=>api.addWatchItem({name:`公司${n}`,aliases:[`代号${n}`]})));
 assert.equal((await api.readUserConfig()).watchlist.length,12);
 await Promise.all([api.addAlias({canonical:'甲',aliases:['A']}),api.addAlias({canonical:'甲',aliases:['B']})]);
 assert.deepEqual((await api.readUserConfig()).aliases[0].aliases.sort(),['A','B','甲'].sort());
 const original=await fs.readFile(process.env.USER_CONFIG_FILE,'utf8');
 await assert.rejects(api.addWatchItem({name:'非法',aliases:[123] as unknown as string[]}));
 assert.equal(await fs.readFile(process.env.USER_CONFIG_FILE,'utf8'),original);
 await fs.writeFile(process.env.USER_CONFIG_FILE,'{"watchlist":[');
 await assert.rejects(api.readUserConfig());
 await assert.rejects(api.addWatchItem({name:'不会覆盖损坏数据'}));
 assert.equal(await fs.readFile(process.env.USER_CONFIG_FILE,'utf8'),'{"watchlist":[');
 await fs.writeFile(process.env.USER_CONFIG_FILE,original);
 await api.addWatchItem({name:'失败后仍可保存'});
 assert.equal((await api.readUserConfig()).watchlist.length,13);
 assert.equal((await fs.readdir(root)).filter(x=>x.endsWith('.tmp')).length,0);
}finally{await fs.rm(root,{recursive:true,force:true});}
console.log('atomic configuration and concurrent edits passed');
