import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../src/store.js';
import {createLogRetirement,retirementKey} from '../src/log-retirement.js';
import {retiredLogChannels} from '../src/log-destination.js';
import {flushServerLogs} from '../src/server-logs.js';
import {flushMoneyLogs} from '../src/money.js';
import {flushVaultLogs,syncVault} from '../src/vault.js';
import {flushBlacklistLogs} from '../src/blacklist.js';
import {flushAudit,upgradeTicketLogs} from '../src/audit.js';
const G='1311580149094809650';
const withStore=fn=>async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-retire-'));const store=createStore(dir);
 process.env.LOG_DESTINATION='web';process.env.RETIRE_LOG_CHANNELS='2026-10-28';
 try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});delete process.env.LOG_DESTINATION;delete process.env.RETIRE_LOG_CHANNELS;}
};
const message=(id,attachments=[])=>({id,createdTimestamp:Date.now(),author:{id:'123'},content:'Historisch logbericht',embeds:[],components:[],attachments:new Map(attachments.map(a=>[a.id,a]))});
function fakeGuild(store,messages){
 const deleted=[];const channels=new Map([...retiredLogChannels].map(([id])=>[id,{
  id,name:'log-'+id,isTextBased:()=>true,isThread:()=>false,
  messages:{fetch:async()=>new Map(messages.map(m=>[m.id,m]))},
  threads:{fetchActive:async()=>({threads:new Map()}),fetchArchived:async()=>({threads:new Map()})},
  delete:async()=>{assert.ok(messages.every(m=>store.archivedDiscordMessage(m.id)));deleted.push(id);channels.delete(id);}
 }]));return {id:G,channels:{fetch:async id=>channels.get(id)},deleted,fixture:channels};
}
test('retirement targets exactly the six requested IDs, including vault overview, excluding blacklist and operational channels',()=>{
 assert.deepEqual([...retiredLogChannels.keys()].sort(),['1564621640271265792','1564635987160600707','1564634188278267914','1420469739725000744','1564898831898779658','1557653747654729748'].sort());
});
test('website delivery preserves source events and transcripts and never fetches Discord log channels',withStore(async store=>{
 store.queueServerLog(G,{id:'event',title:'Bot online',description:'Test',time:Date.now()});
 store.queueAudit({id:'ticket:t:closed',guild:G,type:'ticket',action:'closed',time:Date.now(),user:'u',actor:'a',kind:'witwas',channel:'t',transcript:{html:'<p>Saved conversation</p>',name:'ticket.html'}});
 const guild={id:G,channels:{fetch(){throw new Error('Discord must not be accessed');}}};
 for(const fn of [flushServerLogs,flushMoneyLogs,flushVaultLogs,syncVault,flushBlacklistLogs,flushAudit,upgradeTicketLogs])await fn(guild,store);
 assert.equal(store.pendingServerLogs(G).length,0);assert.equal(store.pendingAudit(G).length,0);
 assert.equal(store.queryWebLogs(G).total,2);assert.match(store.auditEvent('ticket:t:closed').transcript.html,/Saved conversation/);
}));
test('archive stores text and attachment bytes before deleting and can be resumed without repeated deletion',withStore(async(store,dir)=>{
 const m=message('111',[{id:'222',name:'transcript.html',url:'https://cdn.discordapp.com/file'}]);const guild=fakeGuild(store,[m]);
 const run=createLogRetirement(guild,store,{download:async()=>Buffer.from('archived attachment')});await run();
 assert.equal(guild.deleted.length,6);assert.ok(existsSync(join(dir,'before-log-channel-retirement.sqlite')));
 assert.equal(Buffer.from(store.archivedAttachment(G,'222').body).toString(),'archived attachment');
 assert.equal(JSON.parse(store.getMeta(retirementKey(G))).done,true);await run();assert.equal(guild.deleted.length,6);
}));
test('failed attachment or history fetch prevents channel deletion; subsequent retry recovers',withStore(async store=>{
 const m=message('333',[{id:'444',name:'file.txt',url:'https://cdn.discordapp.com/file'}]);const guild=fakeGuild(store,[m]);let fail=true;
 const run=createLogRetirement(guild,store,{download:async()=>{if(fail)throw new Error('failed download');return Buffer.from('ok');}});
 await run();assert.equal(guild.deleted.length,0);assert.equal(store.archivedDiscordMessage(m.id),false);
 fail=false;await run();assert.equal(guild.deleted.length,6);
}));
test('retirement refuses other guilds, disabled mode and channels containing private threads',withStore(async store=>{
 const guild=fakeGuild(store,[]);guild.id='other';await createLogRetirement(guild,store)();assert.equal(guild.deleted.length,0);
 guild.id=G;delete process.env.RETIRE_LOG_CHANNELS;await createLogRetirement(guild,store)();assert.equal(guild.deleted.length,0);
 process.env.RETIRE_LOG_CHANNELS='2026-10-28';for(const c of guild.fixture.values())c.threads.fetchArchived=async({type})=>({threads:new Map(type==='private'?[['x',{}]]:[])});
 await createLogRetirement(guild,store)();assert.equal(guild.deleted.length,0);
}));
