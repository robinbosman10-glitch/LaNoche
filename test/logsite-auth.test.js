import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createLogsiteAuth,discordAvatar,sessionCookie,logsiteOrigin} from '../src/logsite-auth.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {createLogsiteApi} from '../src/logsite-api.js';
const G='1311580149094809650',V='111111111111111111',X='222222222222222222';
const origin='https://la-noche-logs.nl';
const temporary=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'ln-oauth-'));const store=createStore(dir);try{await fn(store);}finally{store.close();rmSync(dir,{recursive:true,force:true});}};
const mockClient=()=>({application:{id:'333333333333333333'},isReady:()=>true,users:{cache:new Map()},options:{intents:{has:()=>true}},guilds:{cache:new Map([[G,{id:G,name:'La Noche',icon:'a_abc',iconURL:()=>'https://cdn.discordapp.com/icons/g/a_abc.gif',members:{cache:new Map(),me:{permissions:{has:()=>true}}},roles:{cache:new Map()},channels:{cache:new Map()}}]])}});
async function dispatch(handler,path,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);req.url=path;req.method=method;req.headers={host:'la-noche-logs.nl',...headers};const result={headers:{}};
 await handler(req,{setHeader(k,v){result.headers[k.toLowerCase()]=v;},writeHead(code,hs={}){result.status=code;for(const[k,v]of Object.entries(hs))result.headers[k.toLowerCase()]=v;},end(b){result.body=b?.toString()||'';}});return result;
}
const cookies=r=>(Array.isArray(r.headers['set-cookie'])?r.headers['set-cookie']:[r.headers['set-cookie']]).filter(Boolean).map(c=>c.split(';')[0]).join('; ');
const config={DISCORD_OAUTH_CLIENT_ID:'333333333333333333',DISCORD_OAUTH_CLIENT_SECRET:'test-secret'};
test('only fixed Discord owner can manage access and cannot remove own admin; sessions revoke immediately',temporary(async store=>{
 assert.equal(store.logsiteAllowed(G,LOGSITE_OWNER),true);assert.equal(store.logsiteAllowed(G,V),false);
 assert.throws(()=>store.changeLogsiteAccess(G,V,X,true),/owner_only/);assert.throws(()=>store.changeLogsiteAccess(G,LOGSITE_OWNER,LOGSITE_OWNER,false),/owner_immutable/);
 assert.equal(store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true),true);assert.equal(store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true),false);
 const token=store.loginLogsite(G,V,'Viewer');assert.ok(store.logsiteSession(token));store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal(store.logsiteSession(token),undefined);assert.equal(store.logsiteAllowed(G,V),false);
 assert.throws(()=>store.changeLogsiteAccess(G,LOGSITE_OWNER,'1 OR 1=1',true),/invalid_id/);
}));
test('OAuth state is bound to browser, expires independently and is single use',temporary(async store=>{
 const pending=store.beginLogsiteOAuth();assert.equal(store.consumeLogsiteOAuth(pending.state,'0'.repeat(64)),undefined);
 assert.equal(store.consumeLogsiteOAuth(pending.state,pending.binding).verifier,pending.verifier);assert.equal(store.consumeLogsiteOAuth(pending.state,pending.binding),undefined);
}));
test('Discord identity is verified server-side; secure session, real avatar and owner permissions',temporary(async store=>{
 const client=mockClient();let count=0;
 const fetcher=async(url,options)=>{count++;if(url.endsWith('/token')){assert.equal(options.body.get('client_secret'),'test-secret');assert.ok(options.body.get('code_verifier'));return {ok:true,json:async()=>({access_token:'test-access',token_type:'Bearer',scope:'identify'})};}assert.equal(options.headers.Authorization,'Bearer test-access');return {ok:true,json:async()=>({id:LOGSITE_OWNER,username:'owner',global_name:'Robin',avatar:'a_abcdef'})};};
 const auth=createLogsiteAuth(store,()=>client,G,{env:config,fetcher});const start=await dispatch(auth,'/auth/discord');const target=new URL(start.headers.location);
 assert.equal(target.origin,'https://discord.com');assert.equal(target.searchParams.get('scope'),'identify');assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.match(start.headers['set-cookie'],/HttpOnly; Secure; SameSite=Lax/);
 const callback='/auth/discord/callback?code=test&state='+target.searchParams.get('state');const result=await dispatch(auth,callback,'GET',{cookie:cookies(start)});assert.equal(result.headers.location,'/');assert.doesNotMatch(JSON.stringify(result),/test-access|test-secret/);
 const me=JSON.parse((await dispatch(auth,'/api/me','GET',{cookie:cookies(result)})).body);assert.equal(me.user.id,LOGSITE_OWNER);assert.equal(me.user.admin,true);assert.equal(me.user.allowed,true);assert.match(me.user.avatar,/a_abcdef.gif/);assert.match(me.guild.icon,/a_abc.gif/);
 const replay=await dispatch(auth,callback,'GET',{cookie:cookies(start)});assert.equal(replay.headers.location,'/?auth=invalid');assert.equal(count,2);
}));
test('not allowed Discord identity gets no logs; headers cannot impersonate owner or revive old bearer links',temporary(async store=>{
 const client=mockClient(),api=createLogsiteApi(store,()=>client,G);const denied=store.loginLogsite(G,X,'No access');
 assert.equal((await dispatch(api,'/api/logsite','GET',{cookie:sessionCookie+'='+denied,'x-user-id':LOGSITE_OWNER})).status,403);
 const legacy=store.createWebSession(G,LOGSITE_OWNER);assert.equal((await dispatch(api,'/api/logsite','GET',{authorization:'Bearer '+legacy})).status,401);
 const owner=store.loginLogsite(G,LOGSITE_OWNER,'Owner');assert.equal((await dispatch(api,'/api/logsite','GET',{cookie:sessionCookie+'='+owner})).status,200);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);const viewer=store.loginLogsite(G,V,'Viewer');assert.equal((await dispatch(api,'/api/logsite','GET',{cookie:sessionCookie+'='+viewer})).status,200);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal((await dispatch(api,'/api/logsite','GET',{cookie:sessionCookie+'='+viewer})).status,401);
}));
test('account mutation endpoints require owner cookie, matching CSRF and same origin; logout clears session',temporary(async store=>{
 const auth=createLogsiteAuth(store,mockClient,G,{env:config});store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);
 const viewer=store.loginLogsite(G,V,'Viewer');const v=store.logsiteSession(viewer);assert.equal((await dispatch(auth,'/api/access','GET',{cookie:sessionCookie+'='+viewer})).status,403);
 assert.equal((await dispatch(auth,'/api/access','POST',{cookie:sessionCookie+'='+viewer,origin,'x-csrf-token':v.csrf,'content-type':'application/json'},JSON.stringify({id:X}))).status,403);
 const owner=store.loginLogsite(G,LOGSITE_OWNER,'Owner');const o=store.logsiteSession(owner);const headers={cookie:sessionCookie+'='+owner,origin,'x-csrf-token':o.csrf,'content-type':'application/json'};
 assert.equal((await dispatch(auth,'/api/access','POST',{...headers,origin:'https://evil.test'},JSON.stringify({id:X}))).status,403);
 assert.equal((await dispatch(auth,'/api/access','POST',{...headers,'x-csrf-token':'wrong'},JSON.stringify({id:X}))).status,403);
 assert.equal((await dispatch(auth,'/api/access','POST',headers,JSON.stringify({id:X,admin:true}))).status,200);assert.equal(store.logsiteAllowed(G,X),true);
 const x=store.loginLogsite(G,X,'New viewer');const me=JSON.parse((await dispatch(auth,'/api/me','GET',{cookie:sessionCookie+'='+x})).body);assert.equal(me.user.admin,false);
 assert.equal((await dispatch(auth,'/api/access','DELETE',headers,JSON.stringify({id:LOGSITE_OWNER}))).status,400);
 assert.equal((await dispatch(auth,'/api/logout','POST',headers)).status,200);assert.equal(store.logsiteSession(owner),undefined);
}));
test('public assets contain no logs and auth configuration fails closed without secrets',temporary(async store=>{
 const auth=createLogsiteAuth(store,mockClient,G,{env:{}});const page=await dispatch(auth,'/');assert.equal(page.status,200);assert.match(page.body,/Inloggen met Discord/);assert.doesNotMatch(page.body,/test-secret/);
 assert.equal((await dispatch(auth,'/auth/discord')).headers.location,'/?auth=unconfigured');
 assert.throws(()=>logsiteOrigin({LOGSITE_BASE_URL:'http://unsafe.test'}));
 assert.match(discordAvatar({id:LOGSITE_OWNER,avatar:null,discriminator:'0'}),/embed\/avatars\/\d.png/);
}));

test('live member list requires access, groups by highest rank, excludes bots and reflects member changes',temporary(async store=>{
 const client=mockClient(),guild=client.guilds.cache.get(G);const high='1399490155194220614',low='1311587016928133160';
 const make=(id,name,roles,bot=false)=>({id,displayName:name,user:{username:name,bot},roles:{cache:new Map(roles.map(r=>[r,{}]))},displayAvatarURL:()=>'/brand/logo.gif'});
 guild.roles.cache.set(high,{name:'Boss'});guild.roles.cache.set(low,{name:'Nieuw'});guild.members.fetch=async()=>guild.members.cache;
 guild.members.cache.set(V,make(V,'Robin',[high,low]));guild.members.cache.set(X,make(X,'Lid',[low,'1557648943565774878']));guild.members.cache.set('bot',make('bot','Bot',[high],true));
 const api=createLogsiteApi(store,()=>client,G);assert.equal((await dispatch(api,'/api/members')).status,401);
 const owner=store.loginLogsite(G,LOGSITE_OWNER,'Owner'),h={cookie:sessionCookie+'='+owner};let result=JSON.parse((await dispatch(api,'/api/members','GET',h)).body);
 assert.equal(result.total,2);assert.equal(result.groups[0].id,high);assert.equal(result.groups[0].members.length,1);assert.equal(result.groups.at(-1).members.length,1);assert.equal(result.groups.at(-1).members[0].absent,true);
 guild.members.cache.delete(X);result=JSON.parse((await dispatch(api,'/api/members','GET',h)).body);assert.equal(result.total,1);
}));

test('archived attachments require an allowed session and migration status remains owner-only',temporary(async store=>{
 const api=createLogsiteApi(store,mockClient,G);store.archiveAttachment(G,'555','old.html',Buffer.from('<script>archived</script>'));
 assert.equal((await dispatch(api,'/api/log-attachment?id=555')).status,401);
 const denied=store.loginLogsite(G,X,'Denied');assert.equal((await dispatch(api,'/api/log-attachment?id=555','GET',{cookie:sessionCookie+'='+denied})).status,403);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);const token=store.loginLogsite(G,V,'Viewer');const h={cookie:sessionCookie+'='+token};
 const file=await dispatch(api,'/api/log-attachment?id=555','GET',h);assert.equal(file.status,200);assert.equal(file.headers['content-type'],'application/octet-stream');assert.match(file.headers['content-disposition'],/^attachment/);
 assert.equal((await dispatch(api,'/api/log-retirement','GET',h)).status,403);
 const owner=store.loginLogsite(G,LOGSITE_OWNER,'Owner');assert.equal((await dispatch(api,'/api/log-retirement','GET',{cookie:sessionCookie+'='+owner})).status,200);
}));
test('vault overview uses current balances and isolated recent bookings behind Discord access',temporary(async store=>{
 const api=createLogsiteApi(store,mockClient,G);
 assert.equal((await dispatch(api,'/api/vault')).status,401);
 const denied=store.loginLogsite(G,X,'Denied');assert.equal((await dispatch(api,'/api/vault','GET',{cookie:sessionCookie+'='+denied})).status,403);
 store.initializeVault(G);const initial=store.vaultBalances(G).find(b=>b.kind==='wit').amount;
 store.bookVault('test-add',G,{kind:'wit',action:'add',amount:500,actor:LOGSITE_OWNER,date:'28/10/2026',time:1,reason:'test'});
 store.bookVault('test-remove',G,{kind:'wit',action:'remove',amount:200,actor:LOGSITE_OWNER,date:'28/10/2026',time:2,reason:'test removal'});
 store.bookVault('other','other-guild',{kind:'wapen',item:'private',action:'add',amount:1});
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);const token=store.loginLogsite(G,V,'Viewer'),headers={cookie:sessionCookie+'='+token};
 const r=await dispatch(api,'/api/vault','GET',headers),body=JSON.parse(r.body);
 assert.equal(r.status,200);assert.equal(body.balances.find(b=>b.kind==='wit').amount,initial+300);
 assert.deepEqual(body.recent.map(b=>b.id),['test-remove','test-add']);assert.doesNotMatch(r.body,/private|other-guild/);
 assert.equal((await dispatch(api,'/api/vault','POST',headers)).status,405);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal((await dispatch(api,'/api/vault','GET',headers)).status,401);
}));
test('pot overview reads actual split balances, withdrawals and resets without changing percentages',temporary(async store=>{
 const api=createLogsiteApi(store,mockClient,G);
 assert.equal((await dispatch(api,'/api/pots')).status,401);
 const denied=store.loginLogsite(G,X,'Denied');assert.equal((await dispatch(api,'/api/pots','GET',{cookie:sessionCookie+'='+denied})).status,403);
 const token=store.loginLogsite(G,LOGSITE_OWNER,'Owner'),headers={cookie:sessionCookie+'='+token};
 const read=async()=>JSON.parse((await dispatch(api,'/api/pots','GET',headers)).body);
 assert.deepEqual((await read()).pots.map(p=>p.balances),Array(3).fill({wit:0,zwart:0}));
 store.changeMoney({id:'a',guild:G,actor:LOGSITE_OWNER,kind:'wit',action:'add',amount:1000});
 store.changeMoney({id:'b',guild:G,actor:LOGSITE_OWNER,kind:'zwart',action:'add',amount:1000});
 store.changeMoney({id:'c',guild:G,actor:LOGSITE_OWNER,kind:'wit',action:'remove',amount:100,pot:'gang'});
 store.changeMoney({id:'private',guild:'other',actor:X,kind:'wit',action:'add',amount:9999});
 const body=await read();assert.deepEqual(body.pots.map(p=>p.balances),[{wit:300,zwart:100},{wit:600,zwart:450},{wit:0,zwart:450}]);
 assert.deepEqual(body.pots.map(p=>p.shares),[{wit:40,zwart:10},{wit:60,zwart:45},{wit:0,zwart:45}]);
 store.resetMoney({id:'reset',guild:G,actor:LOGSITE_OWNER,pot:'gang',kind:'wit'});
 const reset=await read();assert.equal(reset.pots[0].balances.wit,0);assert.equal(reset.pots[0].balances.zwart,100);assert.deepEqual(reset.pots.map(p=>p.shares),body.pots.map(p=>p.shares));
 assert.equal((await dispatch(api,'/api/pots','POST',headers)).status,405);
}));
test('website money operations reuse allocation and enforce role, CSRF, balance checks and idempotent retries',temporary(async store=>{
 const {moneyRole,moneyResetRole}=await import('../src/money.js');
 const client=mockClient(),guild=client.guilds.cache.get(G),roles=new Set([moneyRole]);guild.members.fetch=async()=>({roles:{cache:roles}});guild.members.cache.set(V,{roles:{cache:roles}});
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true);const token=store.loginLogsite(G,V,'Lead'),session=store.logsiteSession(token),headers={cookie:sessionCookie+'='+token,origin,'x-csrf-token':session.csrf,'content-type':'application/json'};
 const api=createLogsiteApi(store,()=>client,G),send=(path,input,h=headers)=>dispatch(api,path,'POST',h,JSON.stringify(input));
 const add={kind:'zwart',action:'add',amount:'101',requestId:'11111111-1111-4111-8111-111111111111'};
 assert.equal((await send('/api/pots/book',add,{...headers,origin:'https://evil.test'})).status,403);
 assert.equal((await send('/api/pots/book',add,{...headers,'x-csrf-token':'bad'})).status,403);
 const preview=await send('/api/pots/preview',add);assert.equal(preview.status,200);assert.deepEqual(JSON.parse(preview.body).changes.map(c=>c.delta),[10,46,45]);assert.equal(store.moneyBalances(G).length,0);
 const first=await send('/api/pots/book',add);assert.equal(first.status,200);assert.equal(JSON.parse(first.body).changed,true);
 assert.equal(JSON.parse((await send('/api/pots/book',add)).body).changed,false);assert.equal(store.moneyBalances(G).reduce((n,b)=>n+b.amount,0),101);
 assert.equal((await send('/api/pots/book',{...add,amount:'102'})).status,409);
 const remove={...add,action:'remove',pot:'gang',amount:'10',requestId:'22222222-2222-4222-8222-222222222222'};
 assert.equal((await send('/api/pots/book',{...remove,amount:'11'})).status,400);assert.equal((await send('/api/pots/book',remove)).status,200);assert.equal(JSON.parse((await send('/api/pots/book',remove)).body).changed,false);
 roles.clear();assert.equal((await send('/api/pots/book',{...add,requestId:'33333333-3333-4333-8333-333333333333'})).status,403);
 const reset={kind:'wit',action:'reset',pot:'all',requestId:'44444444-4444-4444-8444-444444444444'};assert.equal((await send('/api/pots/book',reset)).status,403);roles.add(moneyResetRole);
 assert.equal((await send('/api/pots/book',reset)).status,200);assert.equal(store.moneyBalances(G).reduce((n,b)=>n+b.amount,0),0);assert.equal(JSON.parse((await send('/api/pots/book',reset)).body).changed,false);
 assert.equal((await send('/api/pots/book',add)).status,403);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal((await send('/api/pots/book',reset)).status,401);
}));
