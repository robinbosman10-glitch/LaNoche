import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Collection,PermissionsBitField,PermissionFlagsBits as P,MessageFlags} from 'discord.js';
import {scenarioStore} from '../src/scenario-store.js';
import {settings} from '../src/settings.js';
import {blacklistRole} from '../src/blacklist.js';
import {pointsDescriptions,pointsChannel,pointsResetRole,updatePointsList,createPointsRuntime} from '../src/points.js';

const guildId='1311580149094809650',owner='424086753327054849',other='424086753327054850',bot='424086753327054851';
const low=settings.memberlistRanks[0],high=settings.memberlistRanks.at(-1);
function member(id,name,roles=[low]){return {id,displayName:name,user:{id,bot:false},roles:{cache:new Map(roles.map(id=>[id,{}]))}};}
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 const meta=new Map(),store={...scenarioStore(db),getMeta:key=>meta.get(key),setMeta:(key,value)=>meta.set(key,value)};
 const members=new Collection([[owner,member(owner,'Robin')],[other,member(other,'Milan')]]);
 const messages=new Collection(),sends=[],edits=[],fetches=[],errors=[];
 let sequence=1570202824699158739n,sendError=null,fetchError=null;
 const channel={id:pointsChannel,guildId,isThread:()=>false,permissionsFor:()=>new PermissionsBitField(P.Administrator),
  messages:{fetch:async id=>{if(fetchError)throw fetchError;if(typeof id==='object')return messages;const m=messages.get(id);if(!m)throw Object.assign(new Error('Missing'),{code:10008});return m;},delete:async id=>messages.delete(id)},
  send:async payload=>{sends.push(payload);if(sendError)throw sendError;const id=String(sequence++);const m={id,author:{id:bot},createdTimestamp:Date.now(),embeds:payload.embeds.map(e=>e.toJSON()),attachments:new Collection([['logo',{name:'ticket-logo.gif',url:'https://cdn.discordapp.com/logo.gif'}],['banner',{name:'ticket-banner.gif',url:'https://cdn.discordapp.com/banner.gif'}]]),edit:async payload=>{edits.push(payload);m.embeds=payload.embeds.map(e=>e.toJSON());return m;}};messages.set(id,m);return m;}
 };
 const guild={id:guildId,channels:{fetch:async id=>{assert.equal(id,pointsChannel);return channel;}},roles:{cache:new Map(settings.memberlistRanks.map(id=>[id,{}])),fetch:async()=>{}},members:{me:{id:bot},cache:members,fetch:async options=>{fetches.push(options);return options?members.get(options.user):members;}}};
 const client={user:{id:bot},guilds:{cache:new Map([[guildId,guild]])}};guild.client=client;
 const interaction=(user=other,id='1570202824699158800')=>{const i={id,guild,guildId,user:{id:user},commandName:'puntenreset',isChatInputCommand:()=>true,inGuild:()=>true,replies:[],reply:async p=>{i.replies.push(p);},deferReply:async p=>{i.defer=p;},editReply:async p=>{i.replies.push(p);}};return i;};
 const scenario=(id='11111111-1111-4111-8111-111111111111')=>{store.createScenarioDraft(guildId,owner,{name:'Robin',kind:'Bank',points:10,times:2,participants:[{id:owner,name:'Robin'},{id:other,name:'Milan'}]},{id});return store.finalizeScenario(guildId,id,owner,{clip:{type:'link',url:'https://medal.tv/clips/example'}});};
 return {store,meta,members,messages,sends,edits,errors,channel,guild,client,interaction,scenario,fetches,setSendError:e=>{sendError=e;},setFetchError:e=>{fetchError=e;}};
}

test('points list uses highest rank once, includes zero members, excludes bots and blacklist',()=>{
 const blocked=member('424086753327054852','Blocked',[high,blacklistRole]);
 const robot=member('424086753327054853','Bot',[high]);robot.user.bot=true;
 const members=new Collection([[owner,member(owner,'Robin',[low,high])],[other,member(other,'Milan')],[blocked.id,blocked],[robot.id,robot]]);
 const pages=pointsDescriptions(members,[low,high],{points:20,members:[{id:owner,points:20}],resetAt:null});
 const content=pages.join('\n');assert.equal(content.match(new RegExp(`<@${owner}>`,'g')).length,1);
 assert.ok(content.indexOf(`<@&${high}>`)<content.indexOf(`<@${owner}>`));assert.match(content,new RegExp(`<@${other}> — \\*\\*0 punten\\*\\*`));assert.ok(!content.includes(blocked.id)&&!content.includes(robot.id));
 assert.match(content,/GANGTOTAAL · 20 punten/);
});
test('large points list stays within Discord embed limits without omitting anyone',()=>{
 const members=new Collection(Array.from({length:500},(_,i)=>{const id=String(BigInt(owner)+BigInt(i));return [id,member(id,'Member '+i)];}));
 const pages=pointsDescriptions(members,[low],{points:1000000000000,members:[...members.keys()].map(id=>({id,points:1000000000000})),resetAt:Date.now()});
 assert.ok(pages.length>1);assert.ok(pages.every(p=>p.length<=3500));
 for(const id of members.keys())assert.equal(pages.join('\n').split(`<@${id}>`).length-1,1);
});
test('live list is created automatically, then updated in place without reuploading GIFs',async t=>{
 const f=fixture(t);const first=await updatePointsList(f.guild,f.store);assert.equal(first.created,1);assert.equal(first.updated,0);
 assert.equal(f.sends.length,1);assert.deepEqual(f.sends[0].allowedMentions,{parse:[]});assert.equal(f.sends[0].embeds[0].toJSON().image.url,'attachment://ticket-banner.gif');
 const again=await updatePointsList(f.guild,f.store);assert.equal(again.created,0);assert.equal(again.updated,0);assert.equal(f.edits.length,0);
 f.scenario();const changed=await updatePointsList(f.guild,f.store);assert.equal(changed.updated,1);assert.equal(f.sends.length,1);assert.equal(f.edits[0].files,undefined);assert.match(f.edits[0].embeds[0].toJSON().description,/20 punten/);
});
test('missing list is recreated, but API access failures do not create duplicates',async t=>{
 const f=fixture(t);await updatePointsList(f.guild,f.store);f.setFetchError(Object.assign(new Error('Forbidden'),{code:50001}));
 await assert.rejects(updatePointsList(f.guild,f.store),/Forbidden/);assert.equal(f.sends.length,1);
 f.setFetchError(null);f.messages.clear();await updatePointsList(f.guild,f.store);assert.equal(f.sends.length,2);assert.equal(f.store.pointsList(guildId).messages.length,1);
});
test('uncertain list send blocks duplicates and recovers the original bot message',async t=>{
 const f=fixture(t);f.setSendError(new Error('Connection lost'));await assert.rejects(updatePointsList(f.guild,f.store),/Connection/);
 f.setSendError(null);await assert.rejects(updatePointsList(f.guild,f.store),/nog niet bevestigd/);assert.equal(f.sends.length,1);
 const payload=f.sends[0];f.messages.set('1570202824699158739',{id:'1570202824699158739',author:{id:bot},createdTimestamp:Date.now(),embeds:payload.embeds.map(e=>e.toJSON()),attachments:new Collection(),edit:async()=>{}});
 const recovered=await updatePointsList(f.guild,f.store);assert.equal(recovered.created,0);assert.equal(f.sends.length,1);assert.equal(f.store.pointsList(guildId).messages[0],'1570202824699158739');
});
test('definite list rejection may retry after permissions recover',async t=>{
 const f=fixture(t);f.setSendError(Object.assign(new Error('Forbidden'),{status:403}));await assert.rejects(updatePointsList(f.guild,f.store));f.setSendError(null);
 await updatePointsList(f.guild,f.store);assert.equal(f.sends.length,2);assert.equal(f.store.pointsList(guildId).messages.length,1);
});
test('reset requires a fresh highest role or fixed owner, and is private',async t=>{
 const f=fixture(t);f.scenario();let resets=0;const runtime=createPointsRuntime(f.client,guildId,f.store,{onReset:()=>{resets++;},onError:e=>f.errors.push(e)});
 const denied=f.interaction();denied.member={roles:{cache:new Map([[pointsResetRole,{}]])}};await runtime.handle(denied);assert.match(denied.replies[0].content,/Alleen Website Development/);assert.equal(f.store.scenarioPoints(guildId).points,20);assert.equal(resets,0);
 assert.deepEqual(f.fetches.at(-1),{user:other,force:true});assert.equal(denied.defer.flags,MessageFlags.Ephemeral);
 const admin=f.interaction(owner);await runtime.handle(admin);assert.equal(f.store.scenarioPoints(guildId).points,0);assert.equal(resets,1);assert.equal(f.store.listScenarios(guildId).items.length,1);assert.match(admin.replies[0].embeds[0].toJSON().description,/clips blijven bewaard/);
});
test('highest role can reset and duplicate interaction cannot wipe later points',async t=>{
 const f=fixture(t);f.scenario();f.members.get(other).roles.cache.set(pointsResetRole,{});const runtime=createPointsRuntime(f.client,guildId,f.store);
 const first=f.interaction();await runtime.handle(first);assert.equal(f.store.scenarioPoints(guildId).points,0);
 f.scenario('22222222-2222-4222-8222-222222222222');const retry=f.interaction();await runtime.handle(retry);assert.equal(f.store.scenarioPoints(guildId).points,20);assert.match(retry.replies[0].embeds[0].toJSON().title,/AL VERWERKT/);
 const wrong=f.interaction(owner,'1570202824699158801');wrong.guildId='1311580149094809651';await runtime.handle(wrong);assert.equal(f.store.scenarioPoints(guildId).points,20);assert.equal(wrong.defer,undefined);
});

test('a failed confirmation never describes a committed reset as failed',async t=>{
 const f=fixture(t);f.scenario();const runtime=createPointsRuntime(f.client,guildId,f.store,{onError:e=>f.errors.push(e)});
 const i=f.interaction(owner);let count=0;i.editReply=async payload=>{if(count++===0)throw new Error('Reply unavailable');i.replies.push(payload);};
 await runtime.handle(i);assert.equal(f.store.scenarioPoints(guildId).points,0);assert.match(i.replies[0].content,/reset is al opgeslagen/);assert.match(i.replies[0].content,/voer geen nieuwe reset/);
});
