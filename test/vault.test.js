import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {handleVault,vaultInput,vaultPayload,flushVaultLogs,vaultChannel,vaultLogChannel} from '../src/vault.js';
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
 const i={id:'command',commandName:'kluis',guildId:'g',channelId:'wrong',user:{id:'user'},inGuild:()=>true,isModalSubmit:()=>modal,options:{getString:k=>k==='actie'?'add':'zwart'},fields:fields(),reply:async p=>replies.push(p),editReply:async p=>replies.push(p),deferReply:async()=>{},showModal:async m=>m.toJSON(),guild:{id:'g',members:{me:{},fetch:async()=>({roles:{cache:new Map(authorized?[['1553521476378824796',{}]]:[])}})},channels:{fetch:async id=>{
 if(id===vaultChannel)return channel;
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
