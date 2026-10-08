import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {queueTicketAudit,queueAbsenceAudit,auditPayload,flushAudit} from '../src/audit.js';
import {settings} from '../src/settings.js';
test('ticket and absence logs persist, deduplicate and route to requested channels',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-audit-'));let store=createStore(dir);
 try {
  const ticket={guild:'g',channel:'c',user:'u',claimed:'handler',kind:'drugs-verkoop'};
  queueTicketAudit(store,ticket,'closed','closer','drugs-user');queueTicketAudit(store,ticket,'closed','closer','drugs-user');queueTicketAudit(store,ticket,'deleted','deleter','drugs-user');
  queueAbsenceAudit(store,{id:'absence',guild:'g',user:'u',reviewer:'coordinator',status:'approved',start:1,end:2,reason:'Vakantie',channel:'ac',message:'am'});
  store.close();store=createStore(dir);assert.equal(store.pendingAudit('g').length,3);
  const sent=[];const guild={id:'g',channels:{fetch:async id=>({send:async p=>sent.push({id,p})})}};
  await flushAudit(guild,store);assert.deepEqual(sent.map(s=>s.id),['1420469739725000744','1420469739725000744','1557653747654729748']);
  const a=sent[2].p.embeds[0].toJSON();assert.ok(a.fields.some(f=>f.name==='Goedgekeurd door'&&f.value.includes('coordinator')));
  for(const {p} of sent){const e=p.embeds[0].toJSON();assert.equal(e.image.url,'attachment://ticket-banner.gif');assert.equal(e.thumbnail.url,'attachment://ticket-logo.gif');assert.deepEqual(p.allowedMentions,{parse:[]});}
  assert.equal(store.pendingAudit('g').length,0);await flushAudit(guild,store);assert.equal(sent.length,3);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('failed log send stays queued and is retried without blocking other log channel',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-audit-retry-'));const store=createStore(dir);
 try {
  queueTicketAudit(store,{guild:'g',channel:'c',user:'u',kind:'witwas'},'deleted','actor','ticket');
  const original=console.error;console.error=()=>{};
  try {await flushAudit({id:'g',channels:{fetch:async()=>{throw new Error('offline');}}},store);}finally{console.error=original;}
  assert.equal(store.pendingAudit('g').length,1);
  await flushAudit({id:'g',channels:{fetch:async()=>({send:async()=>{}})}},store);assert.equal(store.pendingAudit('g').length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('rejection log identifies rejecting coordinator; expiration distinguishes original approval',()=>{
 const event={type:'absence',action:'denied',user:'u',actor:'coord',start:1,end:2,time:3,reason:'test'};
 assert.ok(auditPayload(event).embeds[0].toJSON().fields.some(f=>f.name==='Afgekeurd door'));
 const expired=auditPayload({...event,action:'expired'}).embeds[0].toJSON();
 assert.ok(expired.fields.some(f=>f.name==='Goedgekeurd door'&&f.value.includes('coord')));assert.ok(expired.fields.some(f=>f.name==='Beëindigd door'&&f.value==='Automatisch systeem'));
});
