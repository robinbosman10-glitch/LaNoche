import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../src/store.js';
import {retiredOperationalChannels} from '../src/log-destination.js';
import {createLogRetirement,operationalRetirementKey} from '../src/log-retirement.js';
import {flushVaultPosts,flushVaultLogs,syncVault,handleVault} from '../src/vault.js';
import {syncMoney} from '../src/money.js';
const G='1311580149094809650';
const flags={LOG_DESTINATION:'web',RETIRE_OPERATIONAL_CHANNELS:'2026-10-28',VAULT_MANAGEMENT:'web',POT_MANAGEMENT:'web',OPERATIONAL_CHANNELS:'web'};
const temporary=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-operational-')),store=createStore(dir),previous=Object.fromEntries(Object.keys(flags).map(k=>[k,process.env[k]]));
 Object.assign(process.env,flags);
 try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});for(const [k,v] of Object.entries(previous)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
};
function fixture(store,{file=false}={}){
 const deleted=[],channels=new Map();
 for(const [index,[id]] of [...retiredOperationalChannels].entries()){
  const messageId=String(1000+index),attachmentId=String(2000+index);
  const message={id:messageId,createdTimestamp:Date.now(),author:{id:'old-author'},content:'Old operational record',embeds:[],components:[],attachments:new Map(file?[[attachmentId,{id:attachmentId,name:'record.txt',url:'https://cdn.discordapp.com/record'}]]:[])};
  channels.set(id,{id,name:id=== '1561810060462661763'?'boss-kluis':'potjes',isTextBased:()=>true,isThread:()=>false,messages:{fetch:async()=>new Map([[message.id,message]])},threads:{fetchActive:async()=>({threads:new Map()}),fetchArchived:async()=>({threads:new Map()})},delete:async()=>{assert.ok(store.archivedDiscordMessage(messageId));if(file)assert.ok(store.archivedAttachment(G,attachmentId));deleted.push(id);channels.delete(id);}});
 }
 return {id:G,channels:{fetch:async id=>channels.get(id)},deleted};
}
test('operational retirement targets only requested boss vault and pot channels',()=>{
 assert.deepEqual([...retiredOperationalChannels],[['1561810060462661763','vault'],['1563644518991925318','money']]);
});
test('all web-management flags are required before operational channel deletion',temporary(async store=>{
 const guild=fixture(store),run=createLogRetirement(guild,store,{operational:true});
 for(const key of Object.keys(flags)){
  delete process.env[key];await run();assert.equal(guild.deleted.length,0,key+' missing must block retirement');process.env[key]=flags[key];
 }
 guild.id='other';await run();assert.equal(guild.deleted.length,0);guild.id=G;
 await run();assert.equal(guild.deleted.length,2);
}));
test('operational messages are saved before deletion with a separate backup and unchanged balances',temporary(async(store,dir)=>{
 store.initializeVault(G);store.changeMoney({id:'source-money',guild:G,actor:'lead',kind:'wit',action:'add',amount:1000});
 const vaultBefore=store.vaultBalances(G),moneyBefore=store.moneyBalances(G),guild=fixture(store),run=createLogRetirement(guild,store,{operational:true});
 await run();assert.equal(guild.deleted.length,2);
 const path=join(dir,'before-operational-channel-retirement.sqlite');assert.ok(existsSync(path));
 const backup=new DatabaseSync(path,{readOnly:true});try{assert.equal(backup.prepare('SELECT SUM(amount) n FROM money_balances WHERE guild=?').get(G).n,1000);assert.equal(backup.prepare('SELECT COUNT(*) n FROM vault_balances WHERE guild=?').get(G).n,vaultBefore.length);}finally{backup.close();}
 assert.deepEqual(store.vaultBalances(G),vaultBefore);assert.deepEqual(store.moneyBalances(G),moneyBefore);
 const state=JSON.parse(store.getMeta(operationalRetirementKey(G)));assert.equal(state.done,true);assert.deepEqual(Object.keys(state.channels).sort(),[...retiredOperationalChannels.keys()].sort());
 await run();assert.equal(guild.deleted.length,2,'retirement resumes without repeated deletion');
}));
test('failed attachment archive keeps both channels and retry preserves bytes before deleting',temporary(async store=>{
 const guild=fixture(store,{file:true});let fail=true;
 const run=createLogRetirement(guild,store,{operational:true,download:async()=>{if(fail)throw new Error('archive unavailable');return Buffer.from('preserved record');}});
 await run();assert.equal(guild.deleted.length,0);assert.equal(JSON.parse(store.getMeta(operationalRetirementKey(G))).done,false);
 fail=false;await run();assert.equal(guild.deleted.length,2);assert.equal(Buffer.from(store.archivedAttachment(G,'2000').body).toString(),'preserved record');
}));
test('website mode drains vault delivery and updates pots without accessing Discord channels',temporary(async store=>{
 store.initializeVault(G);store.bookVault('new-web-vault',G,{action:'add',kind:'wapen',item:'mes',amount:2,date:'28/10/2026',reason:'Returned',actor:'lead',time:Date.now()});
 const before=store.vaultBalances(G),guild={id:G,channels:{fetch(){throw new Error('Discord channels must not be accessed');}}};
 await flushVaultPosts(guild,store);await flushVaultPosts(guild,store);await flushVaultLogs(guild,store);await syncVault(guild,store);await syncMoney(guild,store);
 assert.equal(store.pendingVaultPosts(G).length,0);assert.equal(store.pendingVaultLogs(G).length,0);assert.deepEqual(store.vaultBalances(G),before);
 assert.equal(store.queryWebLogs(G,{cat:'vault'}).logs.filter(l=>l.id==='vault_bookings:new-web-vault').length,1);
 let response;await handleVault({reply:async p=>{response=p;}},G,store);assert.match(response.content,/website/);assert.equal(response.components[0].components[0].data.url,'https://la-noche-logs.nl/#/kluis');
}));
