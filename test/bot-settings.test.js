import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createBotSettingsApi} from '../src/bot-settings-api.js';
import {defaultBotValues,applyBotValues,loadBotSettings} from '../src/bot-settings.js';
import {settings} from '../src/settings.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {sessionCookie} from '../src/logsite-auth.js';
import {allLogsitePages} from '../src/logsite-pages.js';
const G='1311580149094809650',V='111111111111111111',ROLE='222222222222222222',CHANNEL='333333333333333333';
async function dispatch(api,method,headers={},body){
 const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url='/api/bot-settings';req.method=method;req.headers=headers;
 const r={};await api(req,{writeHead(code){r.status=code;},end(body){r.body=JSON.parse(body);}});return r;
}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ln-bot-settings-')),store=createStore(dir);
 const token=store.loginLogsite(G,LOGSITE_OWNER,'Owner'),owner=store.logsiteSession(token);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true,{label:'Website Development',pages:allLogsitePages});const visitor=store.loginLogsite(G,V,'Owner');
 const roles=new Map([[ROLE,{id:ROLE,name:'Reviewer',guild:{id:G},managed:false}]]);
 const channels=new Map([[CHANNEL,{id:CHANNEL,name:'channel',type:0,guild:{id:G},permissionsFor:()=>({has:()=>true})}]]);
 const guild={roles:{cache:roles,fetch:async id=>id?roles.get(id):roles},channels:{cache:channels,fetch:async id=>id?channels.get(id):channels},members:{fetchMe:async()=>({id:'bot'})}};
 const client={isReady:()=>true,guilds:{cache:new Map([[G,guild]])}};
 const api=createBotSettingsApi(store,()=>client,G);
 const headers={cookie:sessionCookie+'='+token,origin:'https://la-noche-logs.nl','x-csrf-token':owner.csrf,'content-type':'application/json'};
 return {dir,store,api,headers,roles,channels,visitor,close(){applyBotValues(defaultBotValues);store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('fixed owner only; page grants and labels cannot grant access; CSRF and Origin enforced',async()=>{
 const f=fixture();try{
  assert.equal((await dispatch(f.api,'GET')).status,401);
  const headers={...f.headers,cookie:sessionCookie+'='+f.visitor,'x-user-id':LOGSITE_OWNER};
  assert.equal((await dispatch(f.api,'GET',headers)).status,403);
  assert.equal((await dispatch(f.api,'PUT',headers,{revision:0,values:defaultBotValues})).status,403);
  assert.equal((await dispatch(f.api,'GET',f.headers)).status,200);assert(!allLogsitePages.includes('botsettings'));
  for(const bad of [{origin:'https://evil.example'},{'x-csrf-token':'bad'}])assert.equal((await dispatch(f.api,'PUT',{...f.headers,...bad},{revision:0,values:defaultBotValues})).status,403);
 }finally{f.close();}
});
test('saved settings apply live, survive reopening, log once and reject stale revision',async()=>{
 const f=fixture();try{
  const values={...defaultBotValues,'ticketPanel.title':'Nieuwe titel','channels.afwezig':CHANNEL,'absenceReviewerRole':ROLE};
  const r=await dispatch(f.api,'PUT',f.headers,{revision:0,values});assert.equal(r.status,200);assert.equal(r.body.revision,1);
  assert.equal(settings.ticketPanel.title,'Nieuwe titel');assert.equal(settings.channels.afwezig,CHANNEL);assert.equal(settings.absenceReviewerRole,ROLE);
  assert.equal(f.store.queryWebLogs(G).logs.filter(l=>l.action==='Botinstellingen gewijzigd').length,1);
  assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:0,values:{...values,'ticketPanel.title':'Stale'}})).status,409);assert.equal(settings.ticketPanel.title,'Nieuwe titel');
  const reopened=createStore(f.dir);try{applyBotValues(defaultBotValues);loadBotSettings(reopened,G);assert.equal(settings.ticketPanel.title,'Nieuwe titel');}finally{reopened.close();}
  assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:1,values})).body.revision,1);
 }finally{f.close();}
});
test('reject invalid input, unknown keys, wrong channel type, permissions, managed role without writing',async()=>{
 const f=fixture();try{
  for(const changes of [{'branding.logoUrl':'http://localhost/a.png'},{'branding.bannerUrl':'https://example.com/a.gif'},{'branding.color':'orange'},{'ticketPanel.title':'a'.repeat(151)},{allTicketRole:ROLE},{'channels.afwezig':'oops'}])assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:0,values:{...defaultBotValues,...changes}})).status,400);
  f.channels.get(CHANNEL).type=4;
  assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:0,values:{...defaultBotValues,'channels.afwezig':CHANNEL}})).status,400);
  f.channels.get(CHANNEL).type=0;f.channels.get(CHANNEL).permissionsFor=()=>({has:()=>false});
  assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:0,values:{...defaultBotValues,'channels.afwezig':CHANNEL}})).status,400);
  f.roles.get(ROLE).managed=true;
  assert.equal((await dispatch(f.api,'PUT',f.headers,{revision:0,values:{...defaultBotValues,absenceReviewerRole:ROLE}})).status,400);
  assert.equal(f.store.botSettings(G).revision,0);assert.equal(f.store.queryWebLogs(G).logs.length,0);
 }finally{f.close();}
});
