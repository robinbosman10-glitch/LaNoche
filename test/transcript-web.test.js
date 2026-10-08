import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createTranscriptServer,transcriptLink,transcriptBase} from '../src/transcript-web.js';

test('private viewer links persist and serve only their transcript, including download and deleted fallback',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-web-'));let store=createStore(dir);
 const token=store.transcriptToken('guild','123');
 store.queueAudit({id:'ticket:123:closed',guild:'guild',transcript:{html:'<!doctype html><html><style></style><main><article>&lt;script&gt;hello</article></main><footer></footer></html>'}});
 store.queueAudit({id:'ticket:123:deleted',guild:'guild'});
 store.close();store=createStore(dir);
 assert.equal(store.transcriptToken('guild','123'),token);
 assert.notEqual(store.transcriptToken('guild','456'),token);
 assert.equal(transcriptLink(store,'guild','123','https://example.com'),`https://example.com/t/${token}`);
 const server=createTranscriptServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
  let response=await fetch(`${base}/t/${token}`);assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const html=await response.text();assert.match(html,/id="search"/);assert.match(html,/&lt;script&gt;/);assert.match(html,/viewer.js/);
  response=await fetch(`${base}/t/${token}/download`);assert.match(response.headers.get('content-disposition'),/^attachment/);
  for(const path of ['/t/123','/t/'+ 'a'.repeat(64),'/','/t/'+store.transcriptToken('guild','456')])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(`${base}/t/${token}`,{method:'POST'})).status,405);
  assert.equal((await fetch(`${base}/assets/logo.gif`)).headers.get('content-type'),'image/gif');
 }finally{await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}
});
test('public origin uses Railway domain and rejects unsafe configuration',()=>{
 assert.equal(transcriptBase({RAILWAY_PUBLIC_DOMAIN:'example.up.railway.app'}),'https://example.up.railway.app');
 assert.equal(transcriptBase({}),null);
 for(const value of ['http://example.com','https://user:pass@example.com','https://example.com/path'])assert.throws(()=>transcriptBase({TRANSCRIPT_BASE_URL:value}));
});
