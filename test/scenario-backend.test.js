import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {Readable,Writable} from 'node:stream';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scenarioStore,normalizeScenarioInput,ScenarioError,SCENARIO_DRAFT_TTL} from '../src/scenario-store.js';
import {createScenarioApi,scenarioByteRange} from '../src/scenario-api.js';
import {scenarioClipPath} from '../src/scenario-clips.js';
import {logsiteStore} from '../src/logsite-store.js';
import {logsiteAuthStore,LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {sessionCookie} from '../src/logsite-auth.js';

const G='1311580149094809650',OTHER_G='222222222222222222',U='111111111111111111',OTHER='333333333333333333';
const input=()=>({name:'Robin',kind:'Bankoverval',points:'10',times:'2',participants:[{id:U,name:'Robin'},{id:OTHER,name:'Jaro'},{id:OTHER,name:'Jaro'}]});
const link=()=>({type:'link',url:'https://medal.tv/games/gta-v/clips/example'});
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'ln-scenarios-')),file=join(directory,'test.sqlite'),db=new DatabaseSync(file);
 const store={...logsiteStore(db),...logsiteAuthStore(db),...scenarioStore(db)};
 store.changeLogsiteAccess(G,LOGSITE_OWNER,U,true,{label:'Robin',pages:['scenarios']});
 store.changeLogsiteAccess(G,LOGSITE_OWNER,OTHER,true,{label:'Jaro',pages:['overview']});
 const tokens={};for(const id of [U,OTHER,LOGSITE_OWNER])tokens[id]=store.loginLogsite(G,id,id);
 const api=createScenarioApi(store,()=>null,G,{directory});
 const dispatch=async(path='',{who=U,method='GET',headers={}}={})=>{
  const request=Readable.from([]);request.url='/api/scenarios'+path;request.method=method;request.headers={...(who?{cookie:sessionCookie+'='+tokens[who]}:{}),...headers};
  const chunks=[];
  const response=new Writable({write(chunk,encoding,callback){chunks.push(Buffer.from(chunk));callback();}});
  response.writeHead=(status,headers)=>{response.status=status;response.headers=headers;response.headersSent=true;};
  const handled=await api(request,response),data=Buffer.concat(chunks);
  return {handled,status:response.status,headers:response.headers,data,body:response.headers?.['Content-Type']?.includes('json')&&data.length?JSON.parse(data.toString()):null};
 };
 const add=(entry=input(),clip=link(),options={})=>{const draft=store.createScenarioDraft(G,U,entry,options);return store.finalizeScenario(G,draft.id,U,{clip,now:options.now});};
 return {directory,file,db,store,tokens,dispatch,add,close(){db.close();rmSync(directory,{recursive:true,force:true});}};
}

test('gang points are counted once per scenario, participants are deduplicated attendance only, and search does not change gang total',()=>{
 const f=fixture();try{
  const one=f.add();assert.equal(one.total,20);assert.equal(one.participants.length,2);assert.equal(one.participants[0].id,U);
  const two=f.add({...input(),kind:'Winkeloverval',points:5,times:3,participants:[]});assert.equal(two.participants.length,1);
  const result=f.store.listScenarios(G,{q:'Jaro',page:1,limit:1});assert.equal(result.total,1);assert.equal(result.items[0].id,one.id);assert.deepEqual(result.summary,{points:35,scenarios:2,clips:2});
  assert.deepEqual(f.store.listScenarios(OTHER_G).summary,{points:0,scenarios:0,clips:0});
  for(const invalid of [{points:'1e2'},{points:0},{times:-1},{points:1_000_000,times:10_000},{times:'1.5'},{participants:[{id:'x',name:'X'}]}])assert.throws(()=>normalizeScenarioInput(U,{...input(),...invalid}),ScenarioError);
 }finally{f.close();}
});

test('final submission is durable and idempotent; changed clip, wrong author, wrong guild and expired drafts cannot add points',()=>{
 const f=fixture();try{
  const draft=f.store.createScenarioDraft(G,U,input()),first=f.store.finalizeScenario(G,draft.id,U,{clip:link()}),again=f.store.finalizeScenario(G,draft.id,U,{clip:link()});
  assert.equal(first.duplicate,false);assert.equal(again.duplicate,true);assert.equal(f.store.listScenarios(G).summary.points,20);
  assert.throws(()=>f.store.finalizeScenario(G,draft.id,OTHER,{clip:link()}),e=>e.status===403);
  assert.throws(()=>f.store.finalizeScenario(G,draft.id,U,{clip:{type:'link',url:'https://youtube.com/watch?v=other'}}),e=>e.status===409);
  assert.equal(f.store.scenario(OTHER_G,draft.id),null);
  const old=f.store.createScenarioDraft(G,U,input(),{now:1000});assert.equal(f.store.scenarioDraft(G,old.id,OTHER,{now:2000}),null);
  assert.throws(()=>f.store.finalizeScenario(G,old.id,U,{clip:link(),now:1000+SCENARIO_DRAFT_TTL}),e=>e.status===404);
  assert.throws(()=>f.store.finalizeScenario(OTHER_G,old.id,U,{clip:link(),now:2000}),e=>e.status===404);
  const reopened=new DatabaseSync(f.file);try{const persistent=scenarioStore(reopened);assert.equal(persistent.scenario(G,first.id).total,20);assert.equal(persistent.listScenarios(G).summary.points,20);}finally{reopened.close();}
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM web_logs').get().n,1);
  assert(!f.db.prepare('SELECT payload FROM web_logs').get().payload.includes('medal.tv'));
 }finally{f.close();}
});

test('failed atomic registration preserves draft and never commits points or a publishing receipt',()=>{
 const f=fixture();try{
  const draft=f.store.createScenarioDraft(G,U,input());
  f.db.exec("CREATE TRIGGER fail_scenario_audit BEFORE INSERT ON web_logs BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
  assert.throws(()=>f.store.finalizeScenario(G,draft.id,U,{clip:link()}),/audit failed/);
  assert.equal(f.store.listScenarios(G).summary.points,0);assert(f.store.scenarioDraft(G,draft.id,U));assert.equal(f.store.pendingScenarioPublishes(G).length,0);
  f.db.exec('DROP TRIGGER fail_scenario_audit');assert.equal(f.store.finalizeScenario(G,draft.id,U,{clip:link()}).total,20);
 }finally{f.close();}
});

test('publishing claims are exclusive and interrupted sends become uncertain instead of sending duplicates',()=>{
 const f=fixture();try{
  const item=f.add();assert.equal(f.store.pendingScenarioPublishes(G).length,1);
  const claimed=f.store.claimScenarioPublish(G,item.id,1234);assert.equal(claimed.publish.attempts,1);assert.equal(claimed.publish.attemptedAt,1234);assert.equal(f.store.claimScenarioPublish(G,item.id),null);
  assert.equal(f.store.recoverScenarioPublishes(G),1);assert.equal(f.store.pendingScenarioPublishes(G).length,0);assert.equal(f.store.uncertainScenarioPublishes(G).length,1);
  assert.equal(f.store.releaseScenarioPublish(G,item.id),false);assert.equal(f.store.markScenarioPublished(G,item.id,'444444444444444444'),true);
  assert.equal(f.store.recoverScenarioPublishes(G),0);assert.equal(f.store.scenario(G,item.id).publish.status,'sent');assert.equal(f.store.listScenarios(G).summary.points,20);
 }finally{f.close();}
});

test('API enforces current page access for list and direct detail, sanitizes private keys, and paginates bounded responses',async()=>{
 const f=fixture();try{
  const item=f.add();
  for(const path of ['',`/${item.id}`,`/${item.id}/clip`]){
   assert.equal((await f.dispatch(path,{who:null})).status,401);
   assert.equal((await f.dispatch(path,{who:OTHER})).status,403);
  }
  assert.equal((await f.dispatch('',{method:'POST'})).status,405);
  assert.equal((await f.dispatch('?limit=51')).status,400);assert.equal((await f.dispatch('?page=-1')).status,400);
  const list=await f.dispatch('?q=Jaro&limit=1');assert.equal(list.status,200);assert.equal(list.body.items.length,1);assert.equal(list.body.pageSize,1);assert.equal(list.body.summary.points,20);
  assert.equal((await f.dispatch('/'+item.id)).body.scenario.author,U);assert.equal((await f.dispatch('/'+item.id+'/clip')).status,404);
  assert.equal((await f.dispatch('',{who:LOGSITE_OWNER})).status,200);
  f.store.updateLogsiteAccount(G,LOGSITE_OWNER,U,'Robin',[]);assert.equal((await f.dispatch('/'+item.id)).status,403);
  f.store.changeLogsiteAccess(G,LOGSITE_OWNER,U,false);assert.equal((await f.dispatch('')).status,401);
 }finally{f.close();}
});

test('private video serves bounded ranges and HEAD with no path leak, blocks stale access, mismatched files and symlinks',async()=>{
 const f=fixture();try{
  const bytes=Buffer.from('0123456789abcdefghijklmnopqrstuv'),key=randomUUID()+'.mp4',clip={type:'file',key,filename:'Bank clip.mp4',mime:'video/mp4',size:bytes.length};
  mkdirSync(join(f.directory,'scenario-clips'));writeFileSync(scenarioClipPath(key,{directory:f.directory}),bytes);
  const item=f.add(input(),clip),path='/'+item.id+'/clip';
  const detail=await f.dispatch('/'+item.id);assert.equal(detail.body.scenario.clip.key,undefined);assert.equal(detail.body.scenario.clip.url,'/api/scenarios'+path);assert(!detail.data.toString().includes(f.directory));
  const full=await f.dispatch(path);assert.equal(full.status,200);assert.deepEqual(full.data,bytes);assert.equal(full.headers['Cache-Control'],'private, no-store');
  const partial=await f.dispatch(path,{headers:{range:'bytes=2-8'}});assert.equal(partial.status,206);assert.equal(partial.data.toString(),'2345678');assert.equal(partial.headers['Content-Range'],`bytes 2-8/${bytes.length}`);
  const suffix=await f.dispatch(path,{headers:{range:'bytes=-4'}});assert.equal(suffix.data.toString(),'stuv');
  const head=await f.dispatch(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.data.length,0);assert.equal(head.headers['Content-Length'],String(bytes.length));
  for(const range of ['bytes=99-100','bytes=10-2','bytes=0-1,3-4','bytes=-0','garbage'])assert.equal((await f.dispatch(path,{headers:{range}})).status,416);
  const allowed=f.store.logsiteAllowed;let calls=0;f.store.logsiteAllowed=(...args)=>++calls===1&&allowed(...args);
  assert.equal((await f.dispatch(path)).status,403);f.store.logsiteAllowed=allowed;
  const file=scenarioClipPath(key,{directory:f.directory});writeFileSync(file,'short');assert.equal((await f.dispatch(path)).status,503);
  rmSync(file);const elsewhere=join(f.directory,'secret');writeFileSync(elsewhere,bytes);symlinkSync(elsewhere,file);assert.equal((await f.dispatch(path)).status,503);
 }finally{f.close();}
});

test('range parser accepts open and suffix ranges while rejecting unsafe integers and multiple ranges',()=>{
 assert.deepEqual(scenarioByteRange('bytes=5-',10),{start:5,end:9});assert.deepEqual(scenarioByteRange('bytes=0-100',10),{start:0,end:9});assert.deepEqual(scenarioByteRange('bytes=-100',10),{start:0,end:9});
 assert.throws(()=>scenarioByteRange('bytes=9007199254740992-',10));assert.throws(()=>scenarioByteRange('bytes=0-1,5-6',10));
});
