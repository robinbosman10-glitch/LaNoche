import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {handleVault,vaultInput,vaultPayload,flushVaultLogs,vaultChannel,vaultLogChannel,vaultOverviewChannel,syncVault,flushVaultPosts,vaultOverviewPayload} from '../src/vault.js';
const fields=(patch={})=>({getTextInputValue:id=>({datum:'27/10/2026',bedrag:'1 miljoen',waarvoor:'Voorbeeld uitgave',...patch})[id]});
test('vault validates dates, amounts and description',()=>{
 assert.equal(vaultInput(fields()).amount,1000000);
 for(const datum of ['31/02/2026','27-10-2026','1/10/2026'])assert.throws(()=>vaultInput(fields({datum})),/datum/);
 assert.throws(()=>vaultInput(fields({bedrag:'-10'})),/positief/);
 assert.throws(()=>vaultInput(fields({waarvoor:'  '})),/waarvoor/);
});
test('compact vault embeds support deposits and withdrawals without a pot field',()=>{
 for(const action of ['add','remove']) {
 const payload=vaultPayload({action,kind:'wit',date:'27/10/2026',amount:1380000,reason:'**tekst**',actor:'user'});
 const e=payload.embeds[0].toJSON();assert.match(e.title,action==='add'?/TOEGEVOEGD/:/VERWIJDERD/);
 assert.match(e.description,/1.380.000/);assert.match(e.description,/Wit geld/);assert.doesNotMatch(e.description,/Potje/);assert.equal(e.fields,undefined);
 assert.equal(payload.files.length,2);assert.deepEqual(payload.allowedMentions,{parse:[]});
 }
});

test('vault enforces command channel and role, publishes publicly and retries separate logs',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-vault-'));let store=createStore(dir);
 try {
 let authorized=true,modal=false,failLog=true;const replies=[],publicMessages=[],logs=[];
 const channel={isThread:()=>false,permissionsFor:()=>new PermissionsBitField(P.Administrator),send:async payload=>{publicMessages.push(payload);return {url:'https://discord.com/channels/g/c/m'};}};
 const i={id:'command',commandName:'kluis',guildId:'g',channelId:'wrong',user:{id:'user'},inGuild:()=>true,isModalSubmit:()=>modal,options:{getString:k=>k==='actie'?'add':'zwart'},fields:fields(),reply:async p=>replies.push(p),editReply:async p=>replies.push(p),deferReply:async()=>{},showModal:async m=>m.toJSON(),guild:{id:'g',client:{user:{id:'bot'}},members:{me:{},fetch:async()=>({roles:{cache:new Map(authorized?[['1553521476378824796',{}]]:[])}})},channels:{fetch:async id=>{
 if(id===vaultChannel)return channel;
 if(id===vaultOverviewChannel)return {messages:{fetch:async()=>new Map()},send:async()=>({id:'overview'})};
 assert.equal(id,vaultLogChannel);return {send:async p=>{if(failLog)throw new Error('offline');logs.push(p);return {id:'log-message'};}};
 }}}};
 await handleVault(i,'g',store);assert.match(replies.at(-1).content,/alleen in/);assert.equal(publicMessages.length,0);
 i.channelId=vaultChannel;const form=await handleVault(i,'g',store);assert.equal(form.components.length,3);
 modal=true;i.customId=form.custom_id;authorized=false;
 await handleVault(i,'g',store);assert.equal(publicMessages.length,0);assert.match(replies.at(-1).content,/leidingrol/);
 authorized=true;i.channelId='wrong';await handleVault(i,'g',store);assert.match(replies.at(-1).content,/alleen in/);
 i.channelId=vaultChannel;await handleVault(i,'g',store);assert.equal(publicMessages.length,1);assert.equal(publicMessages[0].flags,undefined);
 assert.equal(store.pendingVaultLogs('g').length,1);assert.match(replies.at(-1).content,/opnieuw geprobeerd/);
 store.close();store=createStore(dir);failLog=false;
 await flushVaultLogs(i.guild,store);await flushVaultLogs(i.guild,store);await handleVault(i,'g',store);
 assert.equal(publicMessages.length,1);assert.equal(logs.length,1);assert.equal(store.pendingVaultLogs('g').length,0);
 assert.match(logs[0].embeds[0].toJSON().title,/KLUISLOG/);
 assert.deepEqual(store.moneyBalances('g'),[]);assert.deepEqual(store.moneyHistory('g'),[]);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('opening stock is exact, once only and persists; atomic withdrawals and aliases',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-stock-'));let store=createStore(dir);
 try{
  assert.equal(store.initializeVault('g'),true);
  const balances=()=>Object.fromEntries(store.vaultBalances('g').map(b=>[b.item||b.kind,b.amount]));
  assert.deepEqual(balances(),{wit:1020000,zwart:1524000,mes:1,pistol:2,'9mm kogel':27,cocazaden:83,'goede zakjes coke':23,'goede wietzaden':100});
  const entry={kind:'wapen',item:' MESSEN ',action:'remove',amount:1};
  assert.equal(store.bookVault('one','g',entry),true);
  assert.equal(store.bookVault('one','g',entry),false);
  assert.equal(balances().mes,0);
  assert.throws(()=>store.bookVault('two','g',entry),/onvoldoende/);
  assert.equal(store.pendingVaultPosts('g').length,1);
  store.bookVault('three','g',{kind:'wapen',item:'pistool',action:'add',amount:2});
  store.bookVault('four','g',{kind:'wit',action:'remove',amount:20000});
  store.close();store=createStore(dir);
  assert.equal(store.initializeVault('g'),false);
  assert.equal(balances().mes,0);assert.equal(balances().pistol,4);assert.equal(balances().wit,1000000);
  assert.deepEqual(store.moneyBalances('g'),[]);
  const embed=vaultOverviewPayload(store,'g').embeds[0].toJSON();
  assert.equal(embed.image.url,'attachment://ticket-banner.gif');
  assert.match(embed.fields.find(f=>f.name.includes('WAPENS')).value,/4×.*pistol/);
  assert.doesNotMatch(embed.fields.find(f=>f.name.includes('WAPENS')).value,/mes/);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('item inputs and shorthand amounts',()=>{
 assert.equal(vaultInput(fields({bedrag:'350k'})).amount,350000);
 assert.equal(vaultInput(fields({bedrag:'700,000'})).amount,700000);
 assert.equal(vaultInput(fields({bedrag:'2',voorwerp:'Pistolen'}),'wapen').item,'pistol');
 assert.throws(()=>vaultInput(fields({bedrag:'1.5',voorwerp:'mes'}),'wapen'),/heel aantal/);
});

test('public outbox retries after failure without double accounting; overview edits one message',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-vault-retry-'));const store=createStore(dir);
 try{
  store.initializeVault('g');
  store.bookVault('booking','g',{kind:'wapen',item:'mes',amount:1,action:'add',date:'27/10/2026',reason:'terug',actor:'u',time:Date.now()});
  let fail=true,sends=0,edits=0;
  const message={id:'overview',edit:async()=>{edits++;}};
  const guild={id:'g',client:{user:{id:'bot'}},members:{me:{}},channels:{fetch:async id=>id===vaultChannel?{isThread:()=>false,permissionsFor:()=>new PermissionsBitField(P.Administrator),send:async()=>{if(fail)throw new Error('offline');sends++;return {url:'https://discord.com/channels/g/c/m'};}}:{messages:{fetch:async arg=>typeof arg==='string'?message:new Map()},send:async()=>{sends++;return message;}}}};
  await assert.rejects(flushVaultPosts(guild,store),/offline/);
  assert.equal(store.pendingVaultPosts('g').length,1);
  fail=false;await flushVaultPosts(guild,store);await flushVaultPosts(guild,store);
  assert.equal(sends,1);assert.equal(store.pendingVaultLogs('g').length,1);
  assert.equal(store.vaultBalances('g').find(b=>b.item==='mes').amount,2);
  await syncVault(guild,store);await syncVault(guild,store);
  assert.equal(sends,2);assert.equal(edits,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
