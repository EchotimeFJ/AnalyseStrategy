import assert from 'node:assert/strict';import {gzipSync} from 'node:zlib';
const {default:app}=await import('../api/app');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a==='object');const base=`http://127.0.0.1:${a.port}`;
try{
 const r=await fetch(base+'/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:Buffer.concat([gzipSync('{}'),Buffer.from('trailing-bytes')])});
 assert.equal(r.status,415);assert.equal((await fetch(base+'/api/health')).status,200);
}finally{await new Promise<void>(r=>server.close(()=>r()));}
console.log('compressed bodies are rejected before decompression');
