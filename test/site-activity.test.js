import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createSiteActivityApi} from '../src/site-activity-api.js';
import {createLogsiteAuth,sessionCookie} from '../src/logsite-auth.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {allLogsitePages} from '../src/logsite-pages.js';
const G='1311580149094809650',V='111111111111111111',X='222222222222222222',origin='https://la-noche-logs.nl';
const fixture=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'ln-site-activity-'));const store=createStore(dir);try{await fn(store,dir);}finally{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});}};
async function dispatch(handler,path,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url:path,method,headers:{host:'la-noche-logs.nl',...headers}});const result={headers:{}};
 await handler(req,{setHeader(k,v){result.headers[k.toLowerCase()]=v;},writeHead(status,h={}){result.status=status;for(const [k,v]of Object.entries(h))result.headers[k.toLowerCase()]=v;},end(body){result.body=body?.toString()||'';}});return result;
}
function login(store,user){const token=store.loginLogsite(G,user,'Discord '+user,'https://cdn.discordapp.com/avatar.png'),session=store.logsiteSession(token);return {cookie:sessionCookie+'='+token,origin,'x-csrf-token':session.csrf,'content-type':'application/json'};}
test('activity is fixed owner-only despite full page grants or impersonation headers',fixture(async store=>{
 const api=createSiteActivityApi(store,G);assert.equal((await dispatch(api,'/api/site-activity')).status,401);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true,{label:'Private admin alias',pages:allLogsitePages});const viewer=login(store,V),owner=login(store,LOGSITE_OWNER);
 assert.equal((await dispatch(api,'/api/site-activity','GET',{...viewer,'x-user-id':LOGSITE_OWNER})).status,403);
 assert.equal((await dispatch(api,'/api/site-activity','GET',owner)).status,200);
 assert.equal((await dispatch(api,'/api/site-activity','DELETE',owner)).status,405);
 assert.ok(!allLogsitePages.includes('siteactivity'));
 assert.throws(()=>store.updateLogsiteAccount(G,LOGSITE_OWNER,V,'Promoted',['siteactivity']),/invalid_settings/);
}));
test('site visit uses server identity/time and CSRF; refresh debounce prevents duplicate visits',fixture(async store=>{
 const api=createSiteActivityApi(store,G);store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);const h=login(store,V);
 assert.equal((await dispatch(api,'/api/site-visit','POST',{...h,origin:'https://evil.test'},'{}')).status,403);
 assert.equal((await dispatch(api,'/api/site-visit','POST',{...h,'x-csrf-token':'bad'},'{}')).status,403);
 assert.equal((await dispatch(api,'/api/site-visit','POST',h,'{bad')).status,400);
 const first=await dispatch(api,'/api/site-visit','POST',h,JSON.stringify({user:X,name:'Fake name',time:1}));assert.equal(first.status,200);assert.equal(JSON.parse(first.body).changed,true);
 assert.equal(JSON.parse((await dispatch(api,'/api/site-visit','POST',h,'{}')).body).changed,false);
 const result=store.querySiteActivity(G);assert.equal(result.events.length,1);assert.equal(result.events[0].user,V);assert.equal(result.events[0].name,'Discord '+V);assert.ok(result.events[0].time>1);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal((await dispatch(api,'/api/site-visit','POST',h,'{}')).status,401);
}));
test('activity timeline filters/paginates and persists; last seen updates do not create timeline spam',fixture(async(store,dir)=>{
 for(let i=0;i<55;i++)store.recordSiteEvent(G,V,'Name','',i%2?'login':'visit',Date.now()+i);
 store.recordSiteEvent('other',X,'Hidden','', 'visit');
 store.noteSiteSeen(G,V,'Name','','pots');store.noteSiteSeen(G,V,'Name','','pots');
 const result=store.querySiteActivity(G);assert.equal(result.total,55);assert.equal(result.events.length,50);assert.equal(result.pages,2);assert.equal(result.presence[0].page,'pots');
 assert.equal(store.querySiteActivity(G,{kind:'visit'}).total,28);assert.equal(store.querySiteActivity(G,{page:2}).events.length,5);assert.equal(store.querySiteActivity(G,{page:NaN}).page,1);
 assert.doesNotMatch(JSON.stringify(result),/Hidden|other|csrf|token|Private admin alias/);
 const since=result.since;store.close();const reopened=createStore(dir);try{assert.equal(reopened.querySiteActivity(G).total,55);assert.equal(reopened.querySiteActivity(G).since,since);}finally{reopened.close();}
}));
test('real OAuth callbacks and logout create activity events; identity endpoint tracks existing sessions',fixture(async store=>{
 let identity=V;store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);
 const auth=createLogsiteAuth(store,()=>null,G,{env:{DISCORD_OAUTH_CLIENT_ID:'333333333333333333',DISCORD_OAUTH_CLIENT_SECRET:'test-only-secret'},fetcher:async url=>url.endsWith('/token')?{ok:true,json:async()=>({access_token:'test-token',token_type:'Bearer',scope:'identify'})}:{ok:true,json:async()=>({id:identity,username:'Actual Discord user',discriminator:'0'})}});
 async function oauth(){const start=await dispatch(auth,'/auth/discord');const state=new URL(start.headers.location).searchParams.get('state');const cookie=start.headers['set-cookie'].split(';')[0];return dispatch(auth,'/auth/discord/callback?code=test&state='+state,'GET',{cookie});}
 const good=await oauth();assert.equal(store.querySiteActivity(G,{kind:'login'}).events[0].kind,'login');
 const cookie=good.headers['set-cookie'].map(c=>c.split(';')[0]).join('; '),me=JSON.parse((await dispatch(auth,'/api/me','GET',{cookie})).body);
 assert.ok(store.querySiteActivity(G).presence.find(p=>p.user===V));
 await dispatch(auth,'/api/logout','POST',{cookie,origin,'x-csrf-token':me.user.csrf});assert.equal(store.querySiteActivity(G).events[0].kind,'logout');
 identity=X;await oauth();assert.equal(store.querySiteActivity(G).events[0].kind,'login_denied');assert.ok(!store.querySiteActivity(G).presence.some(p=>p.user===X));
}));
