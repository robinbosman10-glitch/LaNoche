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
  const sent=[];const messages=new Map();const guild={id:'g',channels:{fetch:async id=>({id,messages:{fetch:async mid=>messages.get(mid)},send:async p=>{const entry={id,p};sent.push(entry);const message={id:String(sent.length),edit:async payload=>{entry.p=payload;}};messages.set(message.id,message);return message;}})}};
  await flushAudit(guild,store);assert.deepEqual(sent.map(s=>s.id),['1420469739725000744','1557653747654729748']);
  const a=sent[1].p.embeds[0].toJSON();assert.ok(a.fields.some(f=>f.name==='Goedgekeurd door'&&f.value.includes('coordinator')));
  for(const {p} of sent){const e=p.embeds[0].toJSON();assert.equal(e.image.url,'attachment://ticket-banner.gif');assert.equal(e.thumbnail.url,'attachment://ticket-logo.gif');assert.deepEqual(p.allowedMentions,{parse:[]});}
  assert.ok(sent[0].p.embeds[0].toJSON().fields.some(f=>f.value.includes('closer')&&f.value.includes('deleter')));assert.equal(store.pendingAudit('g').length,0);await flushAudit(guild,store);assert.equal(sent.length,2);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('failed log send stays queued and is retried without blocking other log channel',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-audit-retry-'));const store=createStore(dir);
 try {
  queueTicketAudit(store,{guild:'g',channel:'c',user:'u',kind:'witwas'},'deleted','actor','ticket');
  const original=console.error;console.error=()=>{};
  try {await flushAudit({id:'g',channels:{fetch:async()=>{throw new Error('offline');}}},store);}finally{console.error=original;}
  assert.equal(store.pendingAudit('g').length,1);
  await flushAudit({id:'g',channels:{fetch:async()=>({send:async()=>({id:'log'})})}},store);assert.equal(store.pendingAudit('g').length,0);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('rejection log identifies rejecting coordinator; expiration distinguishes original approval',()=>{
 const event={type:'absence',action:'denied',user:'u',actor:'coord',start:1,end:2,time:3,reason:'test'};
 assert.ok(auditPayload(event).embeds[0].toJSON().fields.some(f=>f.name==='Afgekeurd door'));
 const expired=auditPayload({...event,action:'expired'}).embeds[0].toJSON();
 assert.ok(expired.fields.some(f=>f.name==='Goedgekeurd door'&&f.value.includes('coord')));assert.ok(expired.fields.some(f=>f.name==='Beëindigd door'&&f.value==='Automatisch systeem'));
});

test('existing duplicate logs are merged and transcript recovered from remaining channel',async()=>{
 const {upgradeTicketLogs}=await import('../src/audit.js');
 const {Collection}=await import('discord.js');
 const dir=mkdtempSync(join(tmpdir(),'ln-upgrade-'));const store=createStore(dir);
 try {
  const id='1557655263761272852';const ticket={guild:'g',channel:id,user:'u',kind:'sollicitaties',support:null,claimed:null,closed:1,message:'m'};store.addTicket(ticket);
  queueTicketAudit(store,ticket,'closed','closer','ticket');store.markAuditSent(`ticket:${id}:closed`);
  let deleted=0;
  const msg=n=>({id:n,author:{id:'bot'},embeds:[{title:'🔒 TICKET GESLOTEN',fields:[{value:`ID: ${id}`}]}],delete:async()=>{deleted++;}});
  const logs={id:settings.channels.ticketLogs,messages:{fetch:async()=>new Collection([['2',msg('2')],['1',msg('1')]])}};
  const source={name:'ticket',messages:{fetch:async()=>new Collection()}};
  const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async channel=>channel===settings.channels.ticketLogs?logs:source}};
  await upgradeTicketLogs(guild,store);
  assert.equal(deleted,1);assert.equal(store.ticketLog('g',id).message,'2');assert.ok(store.pendingAudit('g')[0].transcript.html.includes('LA NOCHE'));
  await upgradeTicketLogs(guild,store);assert.equal(deleted,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
