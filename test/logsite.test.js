import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {classifyLog} from '../src/logsite-store.js';
import {createLogsiteApi,dashboardOrigin} from '../src/logsite-api.js';
const temporary=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'ln-web-'));const store=createStore(dir);try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});}};
test('sessions are scoped, rotated, persisted and reject invalid credentials',temporary(async(store,dir)=>{
 const first=store.createWebSession('g','u');assert.equal(store.webSession(first).user,'u');assert.equal(store.webSession('guess'),null);
 const second=store.createWebSession('g','u');assert.equal(store.webSession(first),undefined);
 const reopened=createStore(dir);try{assert.equal(reopened.webSession(second).guild,'g');}finally{reopened.close();}
}));
test('existing ledgers import once, preserve real amounts, timestamps and category',temporary(async store=>{
 const time=Date.now();store.queueServerLog('g',{id:'audit',title:'🛡️ Serverwijziging',auditAction:'ThreadCreate',description:'Created',time});
 store.queueAudit({id:'absence',guild:'g',type:'absence',action:'approved',time,user:'u',actor:'reviewer',start:time,end:time+1000,reason:'Afspraak'});
 store.initializeVault('g');store.bookVault('v','g',{time,actor:'u',kind:'wit',amount:10,action:'remove',reason:'Test',date:'28/10/2026'});
 store.changeMoney({id:'m',guild:'g',actor:'u',kind:'zwart',amount:100,action:'add'});
 store.finishBlacklist('g','b',{}, {id:'b',time,actor:'u',user:'b',action:'toevoegen'});
 store.syncWebLogs('g');store.syncWebLogs('g');const result=store.queryWebLogs('g');assert.equal(result.total,5);
 assert.equal(result.logs.find(l=>l.cat==='absence').actor,'reviewer');assert.match(result.logs.find(l=>l.cat==='vault').detail,/Hoeveelheid: 10/);
 assert.equal(result.logs.find(l=>l.cat==='channels').time,time);assert.equal(store.queryWebLogs('other').total,0);
 assert.equal(store.queryWebLogs('g',{cat:'money'}).logs[0].action,'Geld toegevoegd');
 assert.equal(store.queryWebLogs('g',{q:'Afspraak'}).total,1);
}));
test('server filtering, pagination, date bounds and action counts remain consistent',temporary(async store=>{
 for(let i=0;i<123;i++)store.recordWebLog('g',{id:String(i),time:1000+i,cat:'tickets',action:i%2?'Ticket gesloten':'Ticket geopend',actor:'u',detail:'needle'});
 let r=store.queryWebLogs('g',{cat:'tickets',action:'Ticket gesloten',page:2,limit:50});assert.equal(r.total,61);assert.equal(r.logs.length,11);assert.equal(r.page,2);
 assert.equal(store.queryWebLogs('g',{from:1000,to:1010}).total,11);
 assert.equal(store.queryWebLogs('g',{q:"' OR 1=1--"}).total,0);
 assert.equal(store.queryWebLogs('g',{q:'Robin',ids:['u']}).total,123);
}));
test('audit classifications separate channel, moderation, role and message actions',()=>{
 assert.equal(classifyLog({auditAction:'MemberBanAdd'}),'moderation');assert.equal(classifyLog({auditAction:'MemberRoleUpdate'}),'roles');assert.equal(classifyLog({auditAction:'MessageDelete'}),'messages');assert.equal(classifyLog({auditAction:'ThreadDelete'}),'channels');
});

test('history importer only saves recognized own-bot announcements and resumes without duplicates',temporary(async store=>{
 const {createLogHistory}=await import('../src/logsite-history.js');
 let calls=0;const make=(id,author,title)=>({id,author:{id:author},createdTimestamp:1000,url:'https://discord.com/channels/g/c/'+id,embeds:[{title,description:'Test',fields:[{name:'Lid',value:'<@123>'},{name:'Uitgevoerd door',value:'<@456>'}]}]});
 const messages=new Map([['a',make('a','bot','⚠️ OFFICIËLE WAARSCHUWING')],['b',make('b','human','⚠️ OFFICIËLE WAARSCHUWING')],['c',make('c','bot','Unrelated')]]);
 const channel={id:'c',isTextBased:()=>true,permissionsFor:()=>({has:()=>true}),messages:{fetch:async()=>{calls++;return messages;}}};
 const guild={id:'g',client:{user:{id:'bot'}},members:{me:{}},channels:{cache:new Map([['c',channel]]),fetch:async id=>id?channel:null}};
 const run=createLogHistory(guild,store);await run();await run();await createLogHistory(guild,store)();
 const result=store.queryWebLogs('g');assert.equal(result.total,1);assert.equal(result.logs[0].cat,'warns');assert.equal(result.logs[0].actor,'456');assert.equal(calls,1);
}));
