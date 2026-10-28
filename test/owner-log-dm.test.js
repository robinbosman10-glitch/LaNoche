import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createOwnerLogDm,ownerLogDmPayload} from '../src/owner-log-dm.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';

const env={LOGSITE_BASE_URL:'https://la-noche-logs.nl'};
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ln-owner-dm-')),store=createStore(dir),sent=[];
 const guild={id:'g',members:{cache:new Map([['u',{displayName:'Robin'}]])},channels:{cache:new Map([['c',{name:'algemeen'}]])},iconURL:()=>null};
 const client={isReady:()=>true,guilds:{cache:new Map([['g',guild]])},users:{fetch:async id=>{assert.equal(id,LOGSITE_OWNER);return {id,bot:false,send:async payload=>{sent.push(payload);return {id:'dm-'+sent.length};}};}}};
 return {dir,store,sent,client,cleanup(){store.close();rmSync(dir,{recursive:true,force:true});}};
}

test('compact embeds have category links, bounded details and stable deduplication nonce',()=>{
 const entry={source:'weblog',event:'abc',payload:{cat:'messages',action:'Test'.repeat(100),detail:'x'.repeat(2000),time:1000,actor:'u',channel:'c'}};
 const guild={id:'g',members:{cache:new Map([['u',{displayName:'Robin'}]])},channels:{cache:new Map([['c',{name:'algemeen'}]])}};
 const payload=ownerLogDmPayload(entry,guild,{env}),embed=payload.embeds[0].toJSON();
 assert.equal(embed.url,'https://la-noche-logs.nl/#/logs/messages');
 assert.equal(embed.title.length,180);assert.equal(embed.description.length,600);
 assert.equal(embed.fields[0].value,'Robin');assert.equal(embed.fields[1].value,'algemeen');
 assert.equal(embed.image,undefined);assert.equal(embed.thumbnail,undefined);
 assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.enforceNonce,true);assert.equal(payload.nonce.length,24);
 assert.equal(ownerLogDmPayload(entry,guild,{env}).nonce,payload.nonce);
 assert.notEqual(ownerLogDmPayload({...entry,source:'activity'},guild,{env}).nonce,payload.nonce);
 assert.equal(ownerLogDmPayload({...entry,payload:{cat:'siteactivity',action:'Ingelogd',time:1000}},guild,{env}).embeds[0].toJSON().url,'https://la-noche-logs.nl/#/siteactiviteit');
});

test('worker imports source logs without site traffic and sends each new log and visit only to fixed owner',async()=>{
 const f=fixture();let count=0;
 try{
  const worker=createOwnerLogDm(f.client,'g',f.store,{env,now:()=>1000,onSent:n=>count+=n});
  f.store.queueServerLog('g',{id:'new',title:'Nieuw bericht',time:1001,cat:'messages',user:'u',channel:'c'});
  f.store.queueServerLog('g',{id:'old-import',title:'Oud bericht',time:999});
  f.store.recordSiteEvent('g','u','Robin','','login',1002);
  f.store.recordSiteEvent('other','u','Ander','','login',1002);
  await worker.run();await worker.run();
  assert.equal(f.sent.length,2);assert.equal(count,2);assert.equal(f.store.pendingOwnerLogDms('g',Infinity).length,0);
  assert.equal(f.sent[0].embeds[0].toJSON().title,'Ingelogd');
  assert.equal(f.sent[1].embeds[0].toJSON().title,'Nieuw bericht');
  worker.stop();
 }finally{f.cleanup();}
});

test('blocked DMs back off for all pending logs across restart, then retry the same nonce',async()=>{
 const f=fixture();let clock=1000,attempts=0,errors=0,blocked=true,firstNonce;
 f.client.users.fetch=async id=>{assert.equal(id,LOGSITE_OWNER);return {id,send:async p=>{attempts++;firstNonce??=p.nonce;if(blocked)throw Object.assign(new Error('DM closed'),{code:50007});f.sent.push(p);return {id:'delivered'};}};};
 try{
  const worker=createOwnerLogDm(f.client,'g',f.store,{env,now:()=>clock,onError:()=>errors++});
  f.store.recordWebLog('g',{id:'a',cat:'vault',action:'Kluis',time:1000});
  await worker.run();assert.equal(attempts,1);assert.equal(errors,1);
  f.store.recordWebLog('g',{id:'b',cat:'money',action:'Potjes',time:1000});
  await worker.run();assert.equal(attempts,1);worker.stop();
  const reopened=createStore(f.dir);
  try{
   const resumed=createOwnerLogDm(f.client,'g',reopened,{env,now:()=>clock});
   await resumed.run();assert.equal(attempts,1);
   blocked=false;clock=301000;await resumed.run();
   assert.equal(attempts,3);assert.equal(f.sent.length,2);assert.equal(f.sent[0].nonce,firstNonce);
   assert.equal(reopened.pendingOwnerLogDms('g',Infinity).length,0);resumed.stop();
  }finally{reopened.close();}
 }finally{f.cleanup();}
});

test('concurrent runs, disconnected clients and stopped workers never duplicate delivery',async()=>{
 const f=fixture();let release;
 try{
  const worker=createOwnerLogDm(f.client,'g',f.store,{env,now:()=>1000});
  f.store.recordWebLog('g',{id:'a',time:1000,action:'Test'});
  f.client.isReady=()=>false;await worker.run();assert.equal(f.sent.length,0);
  f.client.isReady=()=>true;
  f.client.users.fetch=async id=>({id,send:async p=>{f.sent.push(p);await new Promise(resolve=>{release=resolve;});return {id:'one'};}});
  const first=worker.run();await new Promise(resolve=>setImmediate(resolve));
  await worker.run();assert.equal(f.sent.length,1);release();await first;
  worker.stop();f.store.recordWebLog('g',{id:'b',time:1000,action:'Next'});await worker.run();assert.equal(f.sent.length,1);
 }finally{f.cleanup();}
});
