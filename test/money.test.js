import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {allocation,parseAmount} from '../src/money-store.js';
import {handleMoney,moneyRole,moneyPayload,syncMoney} from '../src/money.js';
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
 return {id:'source',customId,replies,inGuild:()=>true,guildId:'g',user:{id:'lead'},guild:{members:{fetch:async()=>member}},reply:async p=>{replies.push(p);return p;},update:async p=>{replies.push(p);return p;},showModal:async m=>m.toJSON(),deferReply:async function(){this.deferred=true;},editReply:async p=>{replies.push(p);return p;}};
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
 const payload=moneyPayload(s,'g');assert.equal(payload.embeds[0].toJSON().fields.length,5);assert.equal(payload.files.length,2);
});
test('dashboard edits existing message after reload instead of sending duplicates',async t=>{
 const s=fixture(t);let sends=0,edits=0;const message={id:'panel',attachments:[],edit:async()=>{edits++;}};
 const channel={messages:{fetch:async options=>typeof options==='string'?message:new Map()},send:async()=>{sends++;return message;}};
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>channel}};
 await syncMoney(guild,s);s.changeMoney(event);await syncMoney(guild,s);
 assert.equal(sends,1);assert.equal(edits,1);assert.equal(s.getMeta('money-panel:g'),'panel');
});
