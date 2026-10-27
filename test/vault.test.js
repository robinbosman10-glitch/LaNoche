import test from 'node:test';
import assert from 'node:assert/strict';
import {PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {handleVault,vaultInput,vaultPayload} from '../src/vault.js';
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
test('vault checks lead role at command and submission; posts once in dedicated log channel',async()=>{
 let authorized=true,modal=false;const replies=[],sent=[];const meta=new Map();
 const store={getMeta:k=>meta.get(k),setMeta:(k,v)=>meta.set(k,v),changeMoney:()=>{throw new Error('must not touch pot balances');}};
 const channel={isThread:()=>false,permissionsFor:()=>new PermissionsBitField(P.Administrator),send:async payload=>{sent.push(payload);return {url:'https://discord.com/channels/g/c/m'};}};
 const i={id:'command',commandName:'kluis',guildId:'g',channelId:'current',user:{id:'user'},inGuild:()=>true,isModalSubmit:()=>modal,options:{getString:k=>k==='actie'?'add':'zwart'},fields:fields(),reply:async p=>replies.push(p),editReply:async p=>replies.push(p),deferReply:async()=>{},showModal:async m=>m.toJSON(),guild:{members:{me:{},fetch:async()=>({roles:{cache:new Map(authorized?[['1553521476378824796',{}]]:[])}})},channels:{fetch:async id=>{assert.equal(id,'1564634188278267914');return channel;}}}};
 const form=await handleVault(i,'g',store);assert.equal(form.components.length,3);
 modal=true;i.customId=form.custom_id;authorized=false;
 await handleVault(i,'g',store);assert.equal(sent.length,0);assert.match(replies.at(-1).content,/leidingrol/);
 authorized=true;await handleVault(i,'g',store);await handleVault(i,'g',store);assert.equal(sent.length,1);assert.match(replies.at(-1).content,/al geplaatst/);
});
