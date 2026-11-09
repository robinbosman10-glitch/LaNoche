import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {createEmbedStudioApi,normalizeStudioDesign,studioPayload} from '../src/embed-studio-api.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {sessionCookie} from '../src/logsite-auth.js';
const G='1311580149094809650',C='333333333333333333',BOT='444444444444444444',OTHER='555555555555555555',M='666666666666666666';
const draft=()=>({title:'La Noche',description:'Test **bericht** <@123456789012345678>',color:'#ff7900',author:'La Noche',footer:'Familie',logo:'https://cdn.discordapp.com/attachments/1/2/logo.gif',banner:'',fields:[],buttons:[{label:'Website',url:'https://la-noche-logs.nl'}]});
async function call(api,path,method='GET',headers={},body){const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url:'/api/embed-studio/'+path,method,headers});const result={};await api(req,{writeHead(status){result.status=status;},end(raw){result.body=JSON.parse(raw);}});return result;}
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'ln-studio-')),store=createStore(dir);const token=store.loginLogsite(G,LOGSITE_OWNER,'Owner'),session=store.logsiteSession(token);store.changeLogsiteAccess(G,LOGSITE_OWNER,OTHER,true);const other=store.loginLogsite(G,OTHER,'Owner');let sends=0,edits=[];
 const message={id:M,author:{id:BOT},embeds:[{title:'Original',description:'Original',color:16742400}],components:[],attachments:[{id:'file'}],content:'Keep me',url:'https://discord.com/channels/'+G+'/'+C+'/'+M,createdTimestamp:Date.now(),edit:async payload=>{edits.push(payload);return message;}};
 const channel={id:C,name:'test',type:0,guild:{id:G},permissionsFor:()=>({has:()=>true}),send:async payload=>{sends++;assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.enforceNonce,true);return message;},messages:{fetch:async arg=>typeof arg==='string'?message:new Map([[M,message]])}};
 const guild={members:{fetchMe:async()=>({id:BOT})},channels:{cache:new Map([[C,channel]]),fetch:async id=>id?channel:new Map([[C,channel]])}};
 const client={isReady:()=>true,user:{id:BOT},guilds:{cache:new Map([[G,guild]])}};
 return {store,dir,message,channel,edits,api:createEmbedStudioApi(store,()=>client,G),headers:{cookie:sessionCookie+'='+token,origin:'https://la-noche-logs.nl','x-csrf-token':session.csrf,'content-type':'application/json'},other,sends:()=>sends,close(){store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('studio fixed owner, CSRF and same origin required; normal allowed user cannot inspect designs',async()=>{const f=fixture();try{
 assert.equal((await call(f.api,'designs')).status,401);
 assert.equal((await call(f.api,'designs','GET',{...f.headers,cookie:sessionCookie+'='+f.other,'x-user-id':LOGSITE_OWNER})).status,403);
 assert.equal((await call(f.api,'preview','POST',{...f.headers,origin:'https://evil.example'},{design:draft()})).status,403);
 assert.equal((await call(f.api,'preview','POST',{...f.headers,'x-csrf-token':'wrong'},{design:draft()})).status,403);
 assert.equal((await call(f.api,'preview','POST',f.headers,{design:draft()})).status,200);
}finally{f.close();}});
test('embed and image/link validation enforce limits and no mentions',()=>{
 assert.throws(()=>normalizeStudioDesign({...draft(),title:'a'.repeat(257)}));assert.throws(()=>normalizeStudioDesign({...draft(),description:'a'.repeat(4097)}));assert.throws(()=>normalizeStudioDesign({...draft(),description:'a'.repeat(4096),footer:'a'.repeat(2000)}));
 for(const logo of ['javascript:alert(1)','http://127.0.0.1/a.png','https://evil.example/a.gif'])assert.throws(()=>normalizeStudioDesign({...draft(),logo}));
 assert.throws(()=>normalizeStudioDesign({...draft(),buttons:[{label:'x',url:'javascript:alert(1)'}]}));assert.throws(()=>normalizeStudioDesign({...draft(),fields:Array(26).fill({name:'x',value:'y'})}));
 assert.deepEqual(studioPayload(draft()).allowedMentions,{parse:[]});assert.equal(studioPayload(draft()).components[0].components[0].style,5);
});
test('saved designs persist and concurrent old versions cannot overwrite or archive',async()=>{const f=fixture();try{
 const r=await call(f.api,'designs','POST',f.headers,{id:null,revision:0,name:'Ontwerp',design:draft()});assert.equal(r.status,200);const d=r.body.design;
 const store2=createStore(f.dir);try{assert.equal(store2.studioDesigns(G)[0].name,'Ontwerp');}finally{store2.close();}
 assert.equal((await call(f.api,'designs','POST',f.headers,{id:d.id,revision:0,name:'Outdated',design:draft()})).status,409);
 assert.equal((await call(f.api,'designs','DELETE',f.headers,{id:d.id,revision:0})).status,409);
 assert.equal((await call(f.api,'designs','DELETE',f.headers,{id:d.id,revision:1})).status,200);assert.equal(f.store.studioDesigns(G).length,0);
}finally{f.close();}});
test('new publish is durable idempotent and cannot be replayed with changed payload',async()=>{const f=fixture();try{
 const body={requestId:randomUUID(),channel:C,design:draft()};const first=await call(f.api,'publish','POST',f.headers,body);assert.equal(first.status,200);assert.equal(f.sends(),1);
 const second=await call(f.api,'publish','POST',f.headers,body);assert.equal(second.status,200);assert.equal(second.body.replayed,true);assert.equal(f.sends(),1);
 assert.equal((await call(f.api,'publish','POST',f.headers,{...body,design:{...draft(),title:'Other'}})).status,409);assert.equal(f.sends(),1);
 assert.equal(f.store.queryWebLogs(G).logs.filter(x=>x.action==='Embed gepubliceerd').length,1);
}finally{f.close();}});
test('editing preserves functional menus, other embeds, content and attachments; rejects other bot/user and cross guild',async()=>{const f=fixture();try{
 f.message.components=[{type:1,components:[{type:3,custom_id:'ln-ticket:open',options:[]}]}];f.message.embeds.push({title:'Second embed'});
 let body={requestId:randomUUID(),channel:C,message:M,design:{...draft(),buttons:[]}};
 const result=await call(f.api,'publish','POST',f.headers,body);assert.equal(result.status,200);assert.equal(f.edits.length,1);const edit=f.edits[0];assert(!('components'in edit));assert(!('attachments'in edit));assert(!('content'in edit));assert.equal(edit.embeds[1].title,'Second embed');
 assert.equal((await call(f.api,'publish','POST',f.headers,{...body,requestId:randomUUID(),design:draft()})).status,400);
 f.message.author.id=OTHER;assert.equal((await call(f.api,'publish','POST',f.headers,{...body,requestId:randomUUID()})).status,403);
 f.channel.guild.id=OTHER;assert.equal((await call(f.api,'publish','POST',f.headers,{...body,requestId:randomUUID()})).status,400);
}finally{f.close();}});
test('link-only messages import and update ordinary link buttons',async()=>{const f=fixture();try{
 f.message.components=[{type:1,components:[{type:2,style:5,label:'Old',url:'https://example.com'}]}];
 const list=await call(f.api,'messages?channel='+C,'GET',f.headers);assert.equal(list.body.messages[0].protectedComponents,false);assert.equal(list.body.messages[0].design.buttons[0].label,'Old');
 const r=await call(f.api,'publish','POST',f.headers,{requestId:randomUUID(),channel:C,message:M,design:draft()});assert.equal(r.status,200);assert.equal(f.edits[0].components[0].components[0].label,'Website');
}finally{f.close();}});
test('uncertain send outcome stays pending and cannot silently publish a duplicate on retry',async()=>{const f=fixture();try{
 let calls=0;f.channel.send=async()=>{calls++;throw Error('connection lost');};const body={requestId:randomUUID(),channel:C,design:draft()};
 assert.equal((await call(f.api,'publish','POST',f.headers,body)).status,503);assert.equal((await call(f.api,'publish','POST',f.headers,body)).status,409);assert.equal(calls,1);
}finally{f.close();}});
