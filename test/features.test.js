import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collection, PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { nextRank, removableRoles, absenceDates } from '../src/logic.js';
import { settings } from '../src/settings.js';
import { createStore } from '../src/store.js';
import { listDescriptions } from '../src/memberlist.js';
import { handleInteraction } from '../src/handler.js';
import { branded } from '../src/embeds.js';
test('rank order matches Robin, transitions are one step and boundaries reject',()=>{
  assert.equal(settings.ranks[0],'1311587016928133160');
  assert.equal(settings.ranks.at(-1),'1399490155194220614');
  assert.equal(nextRank(settings.ranks,[settings.ranks[0]],1).to,settings.ranks[1]);
  assert.equal(nextRank(settings.ranks,[settings.ranks[1]],-1).to,settings.ranks[0]);
  assert.throws(()=>nextRank(settings.ranks,[settings.ranks[0]],-1),/laagste/);
  assert.throws(()=>nextRank(settings.ranks,[settings.ranks.at(-1)],1),/hoogste/);
  assert.throws(()=>nextRank(settings.ranks,settings.ranks.slice(0,2),1),/precies één/);
});
test('dismissal preserves exception, everyone and managed roles; blocks uneditable roles',()=>{
  const roles=[{id:'everyone'},{id:settings.keepRole},{id:'managed',managed:true},{id:'ordinary',editable:true}];
  assert.deepEqual(removableRoles(roles,'everyone',settings.keepRole).map(r=>r.id),['ordinary']);
  assert.throws(()=>removableRoles([...roles,{id:'high',editable:false}],'everyone',settings.keepRole),/niets gewijzigd/);
});
test('absence uses inclusive Amsterdam dates and validates impossible/reversed/past dates',()=>{
  const now=Date.parse('2026-10-07T08:00:00Z');
  const range=absenceDates('07-10-2026','08-10-2026',now);
  assert.equal(new Date(range.start).toISOString(),'2026-10-06T22:00:00.000Z');
  assert.equal(new Date(range.end).toISOString(),'2026-10-08T21:59:59.999Z');
  for(const dates of [['31-02-2027','01-03-2027'],['08-10-2026','07-10-2026'],['06-10-2026','08-10-2026']]) assert.throws(()=>absenceDates(...dates,now));
});
test('activity, absences and message IDs survive reopening storage',()=>{
  const path=mkdtempSync(join(tmpdir(),'lanoche-'));
  try {
    let s=createStore(path); s.activity('g','u',200);s.activity('g','u',100);s.setAbsent('g','u',100,300);s.setPanel('g','c','m');s.setList('g','c',['m1','m2']);s.close();
    s=createStore(path);assert.equal(s.last('g','u'),200);assert.equal(s.absent('g','u').end,300);assert.equal(s.panel('g').message,'m');assert.deepEqual(s.list('g').messages,['m1','m2']);s.close();
  } finally {rmSync(path,{recursive:true,force:true});}
});
test('memberlist includes every rank, empty text and every member in bounded pages',()=>{
  const members=new Map(Array.from({length:200},(_,n)=>[String(n),{id:String(n),displayName:`Lid ${n}`,user:{bot:false},roles:{cache:new Map([[settings.ranks[0],true]])}}]));
  const pages=listDescriptions(members,settings.ranks);
  assert.ok(pages.every(p=>p.length<=3400));
  const text=pages.join('\n');
  for(const id of settings.ranks) assert.ok(text.includes(`<@&${id}>`));
  for(let n=0;n<200;n++) assert.ok(text.includes(`<@${n}>`));
  assert.ok(text.includes('*Geen Leden op de rang!*'));
  assert.ok(text.indexOf(settings.ranks.at(-1))<text.indexOf(settings.ranks[0]));
});
test('brand payload validates and includes original logo and banner',()=>{
  const payload=branded('Test','Beschrijving');
  assert.equal(payload.embeds[0].toJSON().color,0xff7900);
  assert.equal(payload.files.length,2);
});
function mockAction(command, held) {
  const changes=[];const sent=[];
  const roles=new Collection(held.map(id=>[id,{id,editable:true,managed:false}]));
  roles.highest={};
  const member={id:'target',manageable:true,roles:{cache:roles,highest:{},add:async ids=>changes.push(['add',ids]),remove:async ids=>changes.push(['remove',ids]),set:async ids=>changes.push(['set',ids])}};
  const actor={roles:{highest:{comparePositionTo:()=>1}}};
  const channel={id:'channel',isTextBased:()=>true,isThread:()=>false,permissionsFor:()=>({has:()=>true}),send:async p=>{sent.push(p);return {url:'https://discord.com/test'};}};
  const cache=new Collection([...new Set([...held,...settings.joinRoles,...settings.ranks,settings.keepRole])].map(id=>[id,{id,editable:true}]));
  const i={commandName:command,guildId:'guild',channelId:'channel',user:{id:'actor'},isChatInputCommand:()=>true,inGuild:()=>true,memberPermissions:new PermissionsBitField(PermissionFlagsBits.Administrator),options:{getUser:()=>({id:'target',bot:false}),getString:()=>null},deferReply:async()=>{},editReply:async payload=>payload,
    guild:{id:'guild',ownerId:'owner',channels:{fetch:async()=>channel},roles:{cache,fetch:async()=>{}},members:{me:{permissions:{has:()=>true}},fetch:async({user})=>user==='target'?member:actor}}};
  return {i,changes,sent};
}
test('promotie replaces exactly one rank and preserves unrelated roles',async()=>{
  const {i,changes,sent}=mockAction('promotie',[settings.ranks[0],'unrelated']);
  await handleInteraction(i,'guild',{});
  assert.deepEqual(changes,[['set',['unrelated',settings.ranks[1]]]]);
  assert.equal(sent.length,1);
});
test('ontslaan removes ordinary roles while keeping exception',async()=>{
  const {i,changes}=mockAction('ontslaan',[settings.keepRole,'ordinary']);
  await handleInteraction(i,'guild',{clearAbsent:()=>{}});
  assert.deepEqual(changes,[['remove',['ordinary']]]);
});
test('missing notification permissions prevent a role mutation',async()=>{
  const {i,changes}=mockAction('aangenomen',[]);
  i.guild.channels.fetch=async()=>({send(){},isTextBased:()=>true,isThread:()=>false,permissionsFor:()=>({has:()=>false})});
  const result=await handleInteraction(i,'guild',{});
  assert.match(result.content,/Ik mis/);assert.equal(changes.length,0);
});

test('live refresh coalesces bursts and retains changes arriving during refresh',async()=>{
  const {createLiveRefresh}=await import('../src/live-list.js');
  let calls=0, release;
  const active=new Promise(resolve=>{release=resolve;});
  const live=createLiveRefresh(async()=>{calls++;if(calls===1) await active;}, error=>{throw error;},5);
  try {
    live.schedule();live.schedule();live.schedule();
    await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);
    live.schedule();release();
    await new Promise(r=>setTimeout(r,20));assert.equal(calls,2);
  } finally {live.stop();}
});
