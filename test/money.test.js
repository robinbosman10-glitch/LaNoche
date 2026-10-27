import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {allocation,parseAmount} from '../src/money-store.js';
import {handleMoney,moneyRole,moneyPayload,syncMoney,flushMoneyLogs,moneyLogPayload,moneyLogChannel} from '../src/money.js';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'ln-money-'));const store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const event={id:'first',guild:'g',actor:'lead',kind:'zwart',action:'add',amount:1_000_000};
test('amount parsing and exact percentage allocation without loss',()=>{
 for(const text of ['1000000','1.000.000','1 miljoen','1m'])assert.equal(parseAmount(text),1_000_000);
 assert.equal(parseAmount('1,5 miljoen'),1_500_000);
 for(const text of ['0','-1','1.5','NaN','1e6','1,000','1.23.456','1000000000001'])assert.throws(()=>parseAmount(text));
 assert.deepEqual(allocation(1_000_000,'zwart'),[100000,450000,450000]);
 assert.deepEqual(allocation(1_000_000,'wit'),[400000,600000,0]);
 for(const kind of ['zwart','wit'])for(const n of [1,2,3,99,101,999999,1e12]){
 const split=allocation(n,kind);assert.equal(split.reduce((a,b)=>a+b,0),n);if(kind==='wit')assert.equal(split[2],0);
 }
});
test('bookings are persistent, idempotent and never overdraw or mix money types',t=>{
 const store=fixture(t);assert.equal(store.changeMoney(event),true);assert.equal(store.changeMoney(event),false);
 store.changeMoney({...event,id:'white',kind:'wit'});
 store.changeMoney({...event,id:'remove',action:'remove',pot:'gang',amount:50000});
 const before=store.moneyBalances('g');
 assert.throws(()=>store.changeMoney({...event,id:'overdraw',action:'remove',pot:'gang',amount:50001}),/onvoldoende/);
 assert.deepEqual(store.moneyBalances('g'),before);assert.equal(store.moneyHistory('g').length,3);
 assert.equal(before.find(b=>b.kind==='zwart'&&b.pot==='gang').amount,50000);
 assert.equal(before.find(b=>b.kind==='wit'&&b.pot==='gang').amount,400000);
 assert.deepEqual(store.moneyBalances('another-guild'),[]);
});
test('balances and duplicate protection survive reopening',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-money-reopen-'));let s=createStore(dir);
 try{s.changeMoney(event);s.close();s=createStore(dir);assert.equal(s.changeMoney(event),false);assert.equal(s.moneyBalances('g').reduce((n,b)=>n+b.amount,0),1000000);}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
function interaction(customId='ln-money:start',authorized=true){
 const replies=[];
 const member={roles:{cache:new Map(authorized?[[moneyRole,{}]]:[])}};
 return {id:'source',customId,replies,inGuild:()=>true,guildId:'g',user:{id:'lead'},guild:{id:'g',members:{fetch:async()=>member}},reply:async p=>{replies.push(p);return p;},update:async p=>{replies.push(p);return p;},showModal:async m=>m.toJSON(),deferReply:async function(){this.deferred=true;},editReply:async p=>{replies.push(p);return p;}};
}
test('role enforced at start and submit, including administrators without lead role',async t=>{
 const s=fixture(t);
 for(const id of ['ln-money:start','ln-money:amount:zwart:add:all:123']){
 const i=interaction(id,false);await handleMoney(i,'g',s);assert.match(i.replies[0].content,/leidingrol/);assert.equal(s.moneyHistory('g').length,0);
 }
 const i=interaction();await handleMoney(i,'wrong-guild',s);assert.match(i.replies[0].content,/La Noche/);
});
test('select money, action and pot then open amount form',async t=>{
 const s=fixture(t);const i=interaction();
 const start=await handleMoney(i,'g',s);assert.equal(start.components[0].toJSON().components[0].options.length,2);
 i.customId='ln-money:kind';i.values=['wit'];const actions=await handleMoney(i,'g',s);assert.equal(actions.components[0].toJSON().components.length,2);
 i.customId='ln-money:action:wit:add';let modal=await handleMoney(i,'g',s);assert.match(modal.custom_id,/amount:wit:add:all/);
 i.customId='ln-money:action:wit:remove';const options=await handleMoney(i,'g',s);assert.equal(options.components[0].toJSON().components[0].options.length,3);
 i.customId='ln-money:pot:wit:remove';i.values=['gang'];modal=await handleMoney(i,'g',s);assert.match(modal.custom_id,/amount:wit:remove:gang/);
});
test('failed dashboard update does not lose or duplicate a saved booking',async t=>{
 const s=fixture(t);const i=interaction('ln-money:amount:zwart:add:all:123');
 i.fields={getTextInputValue:()=> '1 miljoen'};i.guild.channels={fetch:async()=>{throw new Error('offline');}};
 await handleMoney(i,'g',s);assert.match(i.replies.at(-1).content,/opgeslagen/);
 await handleMoney(i,'g',s);assert.equal(s.moneyHistory('g').length,1);assert.match(i.replies.at(-1).content,/al verwerkt/);
 const payload=moneyPayload(s,'g');assert.equal(payload.embeds[0].toJSON().fields.length,3);assert.equal(payload.files.length,2);
});
test('dashboard edits existing message after reload instead of sending duplicates',async t=>{
 const s=fixture(t);let sends=0,edits=0;const message={id:'panel',attachments:[],edit:async()=>{edits++;}};
 const channel={messages:{fetch:async options=>typeof options==='string'?message:new Map()},send:async()=>{sends++;return message;}};
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
 await syncMoney(guild,s);s.changeMoney(event);await syncMoney(guild,s);
 assert.equal(sends,1);assert.equal(edits,1);assert.equal(s.getMeta('money-panel:g'),'panel');
});

test('historical opening balances are exact and imported once across restarts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-money-opening-'));let s=createStore(dir);
 try {
  s.changeMoney(event); // Preserve bookings made before the opening import.
  assert.equal(s.initializeMoney('g'),true);
  const values=Object.fromEntries(s.moneyBalances('g').map(b=>[`${b.kind}:${b.pot}`,b.amount]));
  assert.deepEqual(values,{'zwart:gang':350000,'zwart:drugs':962000,'zwart:wapens':962000,'wit:gang':892000,'wit:drugs':1380000,'wit:wapens':0});
  assert.equal(s.initializeMoney('g'),false);
  s.close();s=createStore(dir);assert.equal(s.initializeMoney('g'),false);
  assert.deepEqual(Object.fromEntries(s.moneyBalances('g').map(b=>[`${b.kind}:${b.pot}`,b.amount])),values);
  const fields=moneyPayload(s,'g').embeds[0].toJSON().fields;
  assert.equal(fields.length,3);assert.ok(fields.every(f=>!f.name.includes('BOEKING')));
 } finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('money logs retry failures and record deliveries without changing balances',async t=>{
 const s=fixture(t);s.initializeMoney('g');s.changeMoney(event);
 const before=s.moneyBalances('g');let fail=true;const sent=[];
 const guild={id:'g',channels:{fetch:async id=>{assert.equal(id,moneyLogChannel);return {send:async payload=>{if(fail)throw new Error('offline');sent.push(payload);return {id:String(sent.length)};}};}}};
 await assert.rejects(flushMoneyLogs(guild,s),/offline/);assert.equal(s.pendingMoneyLogs('g').length,3);
 fail=false;await flushMoneyLogs(guild,s);await flushMoneyLogs(guild,s);
 assert.equal(sent.length,3);assert.equal(s.pendingMoneyLogs('g').length,0);assert.deepEqual(s.moneyBalances('g'),before);
 for(const p of sent){assert.deepEqual(p.allowedMentions,{parse:[]});assert.equal(p.files.length,2);assert.equal(p.enforceNonce,true);assert.ok(p.nonce.length<=25);p.embeds[0].toJSON();}
 s.changeMoney({...event,id:'withdraw',action:'remove',pot:'gang',amount:100});
 const log=moneyLogPayload(s.pendingMoneyLogs('g')[0]).embeds[0].toJSON();
 assert.match(log.description,/VERWIJDERD/);assert.match(log.fields.find(f=>f.name.includes('PER POTJE')).value,/−\$ 100/);
});

test('reset clears both money types once and preserves subsequent bookings and percentages',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-money-reset-'));let s=createStore(dir);
 try {
  s.initializeMoney('g');s.changeMoney(event);
  assert.equal(s.resetMoneyOnce('g'),true);
  assert.ok(s.moneyBalances('g').every(b=>b.amount===0));
  const logs=s.moneyHistory('g').filter(t=>t.action==='reset');assert.equal(logs.length,2);
  assert.match(moneyLogPayload(logs[0]).embeds[0].toJSON().description,/NUL/);
  s.changeMoney({...event,id:'after-reset'});s.close();s=createStore(dir);
  s.initializeMoney('g');assert.equal(s.resetMoneyOnce('g'),false);
  assert.equal(s.moneyBalances('g').reduce((n,b)=>n+b.amount,0),1000000);
  assert.deepEqual(allocation(1000000,'zwart'),[100000,450000,450000]);
  assert.deepEqual(allocation(1000000,'wit'),[400000,600000,0]);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('one-time log reset deletes only old bot money logs, retains balances and new logs',async t=>{
 const s=fixture(t);s.initializeMoney('g');s.beginMoneyLogReset('g');
 const before=s.moneyBalances('g');assert.equal(s.pendingMoneyLogs('g').length,0);
 const cutoff=Number(s.getMeta('money-log-reset-2026-10-27-1:g'));
 const deleted=[];const sent=[];
 const messages=[['old','bot',cutoff-1,'💰 LA NOCHE • GELDLOG'],['other-user','human',cutoff-1,'💰 LA NOCHE • GELDLOG'],['other-embed','bot',cutoff-1,'Ticket'],['new','bot',cutoff+1,'💰 LA NOCHE • GELDLOG']].map(([id,author,createdTimestamp,title])=>({id,author:{id:author},createdTimestamp,embeds:[{title}],delete:async()=>deleted.push(id)}));
 const {Collection}=await import('discord.js');
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>({messages:{fetch:async()=>new Collection(messages.map(m=>[m.id,m]))},send:async p=>{sent.push(p);return {id:'sent'};}})}};
 await flushMoneyLogs(guild,s);assert.deepEqual(deleted,['old']);assert.deepEqual(s.moneyBalances('g'),before);
 s.changeMoney(event);s.beginMoneyLogReset('g');await flushMoneyLogs(guild,s);await flushMoneyLogs(guild,s);
 assert.equal(sent.length,1);assert.deepEqual(deleted,['old']);assert.equal(s.moneyHistory('g').length,3);
});

test('selected pot reset clears only chosen kind, keeps other pots and is idempotent',t=>{
 const s=fixture(t);s.initializeMoney('g');
 assert.equal(s.resetMoney({guild:'g',actor:'boss',id:'reset-one',pot:'drugs',kind:'zwart'}),true);
 const balances=s.moneyBalances('g');assert.ok(balances.filter(b=>b.pot==='drugs'&&b.kind==='zwart').every(b=>b.amount===0));
 assert.equal(balances.find(b=>b.pot==='gang'&&b.kind==='wit').amount,892000);
 assert.equal(balances.find(b=>b.pot==='wapens'&&b.kind==='zwart').amount,512000);
 const log=s.moneyHistory('g').find(t=>t.id==='reset-one:zwart');
 assert.equal(log.actor,'boss');assert.equal(log.pot,'drugs');assert.deepEqual(JSON.parse(log.deltas),[0,-512000,0]);
 s.changeMoney(event);assert.equal(s.resetMoney({guild:'g',actor:'boss',id:'reset-one',pot:'drugs',kind:'zwart'}),false);
 assert.equal(s.moneyBalances('g').find(b=>b.pot==='drugs'&&b.kind==='zwart').amount,450000);
 assert.throws(()=>s.resetMoney({guild:'g',actor:'boss',id:'invalid',pot:'invalid'}),/geldig/);
 s.resetMoney({guild:'g',actor:'boss',id:'reset-all',pot:'all',kind:'wit'});assert.ok(s.moneyBalances('g').every(b=>b.amount===0));
});
test('geldreset restricts both command and selection to the exact reset role',async t=>{
 const s=fixture(t);s.initializeMoney('g');
 const {moneyResetRole}=await import('../src/money.js');
 const i=interaction();i.commandName='geldreset';
 await handleMoney(i,'g',s);assert.match(i.replies.at(-1).content,/resetrol/); // lead role is insufficient
 i.guild.members.fetch=async()=>({roles:{cache:new Map([[moneyResetRole,{}]])}});
 await handleMoney(i,'g',s);
 assert.deepEqual(i.replies.at(-1).components[0].toJSON().components[0].options.map(o=>o.value),['zwart','wit']);
 i.commandName=undefined;i.customId='ln-money:reset-kind';i.values=['wit'];await handleMoney(i,'g',s);
 assert.deepEqual(i.replies.at(-1).components[0].toJSON().components[0].options.map(o=>o.value),['gang','drugs','wapens','all']);
 i.commandName=undefined;i.customId='ln-money:reset-select:wit';i.values=['gang'];
 i.guild.members.fetch=async()=>({roles:{cache:new Map()}});
 await handleMoney(i,'g',s);assert.match(i.replies.at(-1).content,/resetrol/);
 assert.equal(s.moneyBalances('g').find(b=>b.pot==='gang'&&b.kind==='wit').amount,892000);
 i.guild.members.fetch=async()=>({roles:{cache:new Map([[moneyResetRole,{}]])}});
 i.guild.channels={fetch:async()=>{throw new Error('offline');}};
 await handleMoney(i,'g',s);assert.match(i.replies.at(-1).content,/opgeslagen/);
 assert.ok(s.moneyBalances('g').filter(b=>b.pot==='gang'&&b.kind==='wit').every(b=>b.amount===0));
 assert.equal(s.moneyBalances('g').find(b=>b.pot==='gang'&&b.kind==='zwart').amount,250000);
});
