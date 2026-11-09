import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {Client,TextChannel,VoiceChannel,CategoryChannel,ForumChannel,PermissionFlagsBits as P} from 'discord.js';
import {createPermissionsMapApi,explainChannelPermissions} from '../src/permissions-map-api.js';
import {sessionCookie} from '../src/logsite-auth.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
const G='1311580149094809650',U='111111111111111111',A='222222222222222222',B='444444444444444444',C='333333333333333333';
function fixture({base=P.ViewChannel|P.SendMessages|P.ReadMessageHistory|P.Connect|P.Speak|P.ManageChannels|P.ManageMessages,admin=false,overwrites=[],type=0,owner=false,timeout=false}={}){
 const client=new Client({intents:[]});
 const guild=client.guilds._add({id:G,name:'Test',owner_id:owner?U:LOGSITE_OWNER,roles:[{id:G,name:'@everyone',permissions:String(base)},{id:A,name:'Rol A',permissions:admin?String(P.Administrator):'0'},{id:B,name:'Rol B',permissions:'0'}]});
 const member=guild.members._add({user:{id:U,username:'tester'},roles:[A,B],communication_disabled_until:timeout?new Date(Date.now()+60000).toISOString():null});
 const Klass=type===2?VoiceChannel:type===4?CategoryChannel:TextChannel;
 const channel=new Klass(guild,{id:C,guild_id:G,name:'kanaal',type,permission_overwrites:overwrites},client);guild.channels.cache.set(C,channel);
 client.isReady=()=>true;guild.roles.fetch=async()=>guild.roles.cache;guild.channels.fetch=async()=>guild.channels.cache;guild.members.fetch=async()=>member;
 return {client,guild,member,channel,close(){client.destroy();}};
}
const overwrite=(id,allow=0n,deny=0n,type=0)=>({id,type,allow:String(allow),deny:String(deny)});
test('effective outcome follows Discord role-overwrite merge and member overwrite priority',()=>{
 const f=fixture({overwrites:[overwrite(A,0n,P.ViewChannel),overwrite(B,P.ViewChannel)]});try{
  const result=explainChannelPermissions(f.channel,f.member,'member');assert.equal(result.permissions.view.allowed,true);assert(result.permissions.view.steps.some(s=>s.detail.includes('ranghoogte')));
  f.channel.permissionOverwrites.cache.clear();f.channel.permissionOverwrites._add(overwrite(A,P.ViewChannel));f.channel.permissionOverwrites._add(overwrite(U,0n,P.ViewChannel,1));
  const denied=explainChannelPermissions(f.channel,f.member,'member');assert.equal(denied.permissions.view.allowed,false);assert.equal(denied.permissions.send.configured,true);assert.equal(denied.permissions.send.allowed,false);assert(denied.permissions.view.steps.some(s=>s.label==='Kanaal: persoonlijk'&&!s.allowed));
 }finally{f.close();}
});
test('administrator and server owner bypass channel denies, including stale timeout',()=>{
 for(const config of [{admin:true},{owner:true}]){const f=fixture({...config,timeout:true,overwrites:[overwrite(U,0n,P.ViewChannel|P.SendMessages,1)]});try{const r=explainChannelPermissions(f.channel,f.member,'member');assert.equal(r.permissions.view.allowed,true);assert.equal(r.permissions.send.allowed,true);assert(r.notes.some(n=>n.includes('geen effect')));}finally{f.close();}}
});
test('timeout preserves view/history while disabling other actions; role simulation ignores personal deny and other role allow',()=>{
 const f=fixture({timeout:true,overwrites:[overwrite(A,0n,P.ViewChannel),overwrite(B,P.ViewChannel),overwrite(U,0n,P.SendMessages,1)]});try{
  const m=explainChannelPermissions(f.channel,f.member,'member');assert.equal(m.permissions.view.allowed,true);assert.equal(m.permissions.history.allowed,true);assert.equal(m.permissions.manage.allowed,false);assert(m.permissions.manage.steps.some(s=>s.detail.includes('time-out')));
  const r=explainChannelPermissions(f.channel,f.guild.roles.cache.get(A),'role');assert.equal(r.permissions.view.allowed,false);assert(!r.permissions.send.steps.some(s=>s.label==='Kanaal: persoonlijk'));
 }finally{f.close();}
});
test('missing Connect masks voice actions including message history; category send is not applicable',()=>{
 const f=fixture({type:2,overwrites:[overwrite(U,0n,P.Connect,1)]});try{const r=explainChannelPermissions(f.channel,f.member,'member');assert.equal(r.permissions.view.allowed,true);assert.equal(r.permissions.speak.configured,true);assert.equal(r.permissions.speak.allowed,false);assert.equal(r.permissions.history.allowed,false);assert.equal(r.permissions.manage.allowed,false);}finally{f.close();}
 const c=fixture({type:4});try{assert.equal(explainChannelPermissions(c.channel,c.member,'member').permissions.send.allowed,null);}finally{c.close();}
});
async function dispatch(api,url,token,method='GET'){
 const req=Readable.from([]);req.url=url;req.method=method;req.headers={cookie:sessionCookie+'='+token,'x-user-id':LOGSITE_OWNER};const out={};await api(req,{writeHead(status){out.status=status},end(body){out.body=JSON.parse(body)}});return out;
}
test('all endpoints enforce fixed owner and read-only behavior regardless of labels/page grants',async()=>{
 const f=fixture();try{
  const store={logsiteSession:t=>t==='owner'?{guild:G,user:LOGSITE_OWNER}:t==='other'?{guild:G,user:U,username:'Website Development',pages:['permissions']}:null};const api=createPermissionsMapApi(store,()=>f.client,G);
  for(const url of ['/api/permissions-map/options','/api/permissions-map?mode=member&id='+U]){
   assert.equal((await dispatch(api,url,'missing')).status,401);assert.equal((await dispatch(api,url,'other')).status,403);assert.equal((await dispatch(api,url,'owner','POST')).status,405);assert.equal((await dispatch(api,url,'owner')).status,200);
  }
  assert.equal((await dispatch(api,'/api/permissions-map?mode=member&id=wrong','owner')).status,400);
  assert.equal((await dispatch(api,'/api/permissions-map?mode=role&id=555555555555555555','owner')).status,404);
 }finally{f.close();}
});
test('category visibility derives from visible child channels, independent of template view bit',async()=>{
 const f=fixture({type:4,overwrites:[overwrite(U,0n,P.ViewChannel,1)]});try{
  const child=new TextChannel(f.guild,{id:'555555555555555555',guild_id:G,parent_id:C,name:'child',type:0,permission_overwrites:[]},f.client);f.guild.channels.cache.set(child.id,child);
  const store={logsiteSession:()=>({guild:G,user:LOGSITE_OWNER})},api=createPermissionsMapApi(store,()=>f.client,G);
  const r=await dispatch(api,'/api/permissions-map?mode=member&id='+U,'owner');assert.equal(r.status,200);
  const category=r.body.channels.find(c=>c.id===C);assert.equal(category.permissions.view.configured,false);assert.equal(category.permissions.view.allowed,true);assert(category.permissions.view.steps.at(-1).detail.includes('1 zichtbare'));
 }finally{f.close();}
});

test('a visible forum-only child makes its category visible even though forum is outside matrix',async()=>{
 const f=fixture({type:4,overwrites:[overwrite(U,0n,P.ViewChannel,1)]});try{
  const forum=new ForumChannel(f.guild,{id:'666666666666666666',guild_id:G,parent_id:C,name:'forum',type:15,permission_overwrites:[]},f.client);f.guild.channels.cache.set(forum.id,forum);
  const store={logsiteSession:()=>({guild:G,user:LOGSITE_OWNER})},api=createPermissionsMapApi(store,()=>f.client,G);
  const r=await dispatch(api,'/api/permissions-map?mode=member&id='+U,'owner');assert.equal(r.status,200);
  const category=r.body.channels.find(c=>c.id===C);assert.equal(category.permissions.view.configured,false);assert.equal(category.permissions.view.allowed,true);assert(category.permissions.view.steps.at(-1).detail.includes('forum-'));assert.equal(r.body.channels.some(c=>c.id===forum.id),false);
 }finally{f.close();}
});
