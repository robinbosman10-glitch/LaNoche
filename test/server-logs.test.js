import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Events,AuditLogEvent} from 'discord.js';
import {createStore} from '../src/store.js';
import {installServerLogs,flushServerLogs,serverLogPayload,allLogsChannel} from '../src/server-logs.js';
function temporary(fn){return async()=>{const dir=mkdtempSync(join(tmpdir(),'ln-serverlog-'));const store=createStore(dir);try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});}};}
test('events stay in the configured guild, ignore bot messages and never log log-channel messages',temporary(async store=>{
 const client=new EventEmitter();client.guilds={cache:new Map()};const logger=installServerLogs(client,'g',store,e=>{throw e;});
 try {
  const m={id:'m',guildId:'g',channelId:'c',author:{id:'u',bot:false},content:'Hallo @everyone',createdTimestamp:1000};
  client.emit(Events.MessageCreate,{...m,guildId:'other'});client.emit(Events.MessageCreate,{...m,channelId:allLogsChannel});client.emit(Events.MessageCreate,{...m,author:{id:'b',bot:true}});
  assert.equal(store.pendingServerLogs('g').length,0);
  client.emit(Events.MessageCreate,m);client.emit(Events.MessageCreate,m);
  client.emit(Events.MessageUpdate,m,{...m,content:'Aangepast',editedTimestamp:2000});
  client.emit(Events.MessageDelete,{id:'uncached',guildId:'g',channelId:'c',partial:true});
  const rows=store.pendingServerLogs('g');assert.equal(rows.length,3);assert.match(rows[2].description,/niet beschikbaar/);
  const payload=serverLogPayload(rows[0]);assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.files,undefined);assert.equal(payload.embeds[0].toJSON().image,undefined);
 }finally{logger.stop();}
}));
test('voice events and audit events log facts and real executor without exposing arbitrary data',temporary(async store=>{
 const client=new EventEmitter();client.guilds={cache:new Map()};const logger=installServerLogs(client,'g',store,e=>{throw e;});
 try {
  client.emit(Events.VoiceStateUpdate,{channelId:null},{guild:{id:'g'},id:'u',channelId:'voice'});
  client.emit(Events.GuildAuditLogEntryCreate,{id:'kick',action:AuditLogEvent.MemberKick,executorId:'admin',targetId:'u',createdTimestamp:1000,reason:'Regels',changes:[{key:'token',new:'SECRET'}]},{id:'g'});
  client.emit(Events.GuildAuditLogEntryCreate,{id:'kick',action:AuditLogEvent.MemberKick,executorId:'admin',targetId:'u',createdTimestamp:1000},{id:'g'});
  const rows=store.pendingServerLogs('g');assert.equal(rows.length,2);assert.match(rows[1].title,/gekickt/);assert.match(rows[1].description,/<@admin>/);assert.doesNotMatch(rows[1].description,/SECRET/);
 }finally{logger.stop();}
}));
test('failed deliveries survive reopening and successful sends are not repeated',temporary(async(store,dir)=>{
 store.queueServerLog('g',{id:'event',title:'Test',description:'Test',time:1000});let fail=true,sends=0;
 const guild={id:'g',channels:{fetch:async id=>{assert.equal(id,allLogsChannel);return {send:async()=>{if(fail)throw new Error('offline');sends++;return {id:'log'};}};}}};
 await assert.rejects(flushServerLogs(guild,store),/offline/);const reopened=createStore(dir);
 try{fail=false;await flushServerLogs(guild,reopened);await flushServerLogs(guild,reopened);assert.equal(sends,1);assert.equal(reopened.pendingServerLogs('g').length,0);}finally{reopened.close();}
}));
