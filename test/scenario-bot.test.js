import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {Collection,PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {scenarioStore} from '../src/scenario-store.js';
import {ScenarioClipError} from '../src/scenario-clips.js';
import {createScenarioRuntime,scenarioChannel,scenarioDataModal,scenarioClipModal,scenarioPayload} from '../src/scenario.js';
import {settings} from '../src/settings.js';
import {blacklistRole} from '../src/blacklist.js';

const guildId='1311580149094809650',author='424086753327054849',other='424086753327054850',botId='424086753327054851',messageId='1570195746676805703';
const draftId='11111111-1111-4111-8111-111111111111';
const clip={type:'file',key:'22222222-2222-4222-8222-222222222222.mp4',filename:'scenario.mp4',mime:'video/mp4',size:100};
const link='https://medal.tv/clips/scenario';
function setup(t,options={}){
 const db=new DatabaseSync(':memory:'),store=scenarioStore(db);t.after(()=>db.close());
 const members=new Map([author,other].map((id,i)=>[id,{id,displayName:i?'Milan':'Robin',user:{id,username:i?'Milan':'Robin',bot:false},roles:{cache:new Map([[settings.memberlistRanks[0],{}]])}}]));
 const sends=[],errors=[],messages=new Map();let sendError=null,clock=1800000000000;
 const channel={id:scenarioChannel,guildId,isThread:()=>false,permissionsFor:()=>new PermissionsBitField(P.Administrator),messages:{fetch:async()=>messages},send:async payload=>{sends.push(payload);if(sendError)throw sendError;return {id:messageId};}};
 const guild={id:guildId,members:{me:{id:botId},fetch:async({user})=>{if(!members.has(user))throw Object.assign(new Error('unknown'),{code:10007});return members.get(user);}},channels:{fetch:async()=>channel}};
 const client={user:{id:botId},isReady:()=>true,guilds:{cache:new Map([[guildId,guild]])}};
 const runtime=createScenarioRuntime(client,guildId,store,{now:()=>clock,onError:e=>errors.push(e),...options});t.after(()=>runtime.stop());
 const interaction=(kind,action,id=draftId,user=author)=>{
  const i={id:'1570195746676805704',guildId,guild,user:{id:user},replied:false,deferred:false,commandName:kind==='command'?'scenario':undefined,customId:'ln-scenario:'+action+':'+id,replies:[],modal:null,
   inGuild:()=>true,isChatInputCommand:()=>kind==='command',isButton:()=>kind==='button',isModalSubmit:()=>kind==='modal',
   showModal:async form=>{i.modal=form.toJSON();i.replied=true;},reply:async payload=>{i.replies.push(payload);i.replied=true;},deferReply:async()=>{i.deferred=true;},editReply:async payload=>{i.replies.push(payload);},
   fields:{getTextInputValue:name=>({name:'Robin',kind:'Bankoverval',points:'10',times:'2',clip_url:link}[name]),getSelectedUsers:()=>new Collection([[author,{id:author}],[other,{id:other}]]),getUploadedFiles:()=>new Collection()}
  };return i;
 };
 function draft(){return store.createScenarioDraft(guildId,author,{name:'Robin',kind:'Bankoverval',points:10,times:2,participants:[{id:author,name:'Robin'},{id:other,name:'Milan'}]},{id:draftId,now:clock});}
 function saved(){draft();return store.finalizeScenario(guildId,draftId,author,{clip:{type:'link',url:link},now:clock});}
 return {store,runtime,interaction,members,guild,client,channel,sends,errors,messages,draft,saved,setError:e=>{sendError=e;},advance:n=>{clock+=n;}};
}

test('scenario modals use five native labelled fields and file/link second step',()=>{
 const form=scenarioDataModal('Robin',draftId).toJSON();assert.equal(form.components.length,5);
 assert.deepEqual(form.components.map(c=>c.component.type),[4,5,4,4,4]);
 assert.equal(form.components[0].component.value,'Robin');assert.equal(form.components[1].component.max_values,25);assert.equal(form.components[1].component.required,false);
 const next=scenarioClipModal(draftId).toJSON();assert.deepEqual(next.components.map(c=>c.component.type),[19,4]);assert.equal(next.components[0].component.max_values,1);assert.equal(next.components[0].component.required,false);
});
test('branded payload awards one gang amount with max participants, no pings and stable nonce',()=>{
 const entry={id:draftId,author,name:'Robin **',kind:'Bankoverval',points:10,times:2,time:Date.now(),participants:Array.from({length:26},(_,i)=>({id:String(BigInt(author)+BigInt(i)),name:'Lid'})),clip:{type:'link',url:link}};
 const payload=scenarioPayload(entry),embed=payload.embeds[0].toJSON();
 assert.equal(embed.fields.at(-1).value,'**+20 punten**\n26 aanwezigen · één keer bijgeschreven');
 assert.ok(embed.fields.every(f=>f.value.length<=1024));assert.equal(embed.image.url,'attachment://ticket-banner.gif');assert.equal(embed.thumbnail.url,'attachment://ticket-logo.gif');
 assert.deepEqual(payload.allowedMentions,{parse:[]});assert.equal(payload.enforceNonce,true);assert.equal(payload.nonce,scenarioPayload(entry).nonce);
 assert.ok(payload.components[0].toJSON().components[1].url.endsWith('/#/scenarios'));
});
test('complete link workflow saves attendance once and gang points once, retry never reposts',async t=>{
 const updates=[];const s=setup(t,{onSaved:entry=>updates.push(entry.id)});const command=s.interaction('command');await s.runtime.handle(command);assert.equal(command.modal.components.length,5);
 const data=s.interaction('modal','data');await s.runtime.handle(data);assert.equal(s.store.listScenarios(guildId).summary.points,0);assert.match(data.replies.at(-1).content,/20 punten voor de hele gang/);
 assert.equal(s.store.scenarioDraft(guildId,draftId,author).participants.length,2);
 const button=s.interaction('button','clip');await s.runtime.handle(button);assert.equal(button.modal.components[0].component.type,19);
 const submit=s.interaction('modal','submit');await s.runtime.handle(submit);
 assert.equal(s.store.listScenarios(guildId).summary.points,20);assert.equal(s.sends.length,1);assert.equal(s.store.scenario(guildId,draftId).publish.status,'sent');
 const again=s.interaction('modal','submit');await s.runtime.handle(again);assert.equal(s.sends.length,1);assert.equal(s.store.listScenarios(guildId).summary.points,20);
 assert.deepEqual(updates,[draftId]);
});
test('old submission after a reset stays archived without crediting points or refreshing twice',async t=>{
 const updates=[];const s=setup(t,{onSaved:entry=>updates.push(entry.id)});s.draft();await s.runtime.handle(s.interaction('modal','submit'));
 s.store.resetScenarioPoints(guildId,author,'1570202824699158739');
 const retry=s.interaction('modal','submit');await s.runtime.handle(retry);
 assert.equal(s.store.listScenarios(guildId).summary.points,0);assert.equal(s.sends.length,1);assert.deepEqual(updates,[draftId]);
 assert.match(retry.replies.at(-1).content,/vóór de laatste puntenreset/);
});
test('list refresh failure never loses a saved scenario or adds its points twice',async t=>{
 const s=setup(t,{onSaved:()=>{throw new Error('refresh failed');}});s.draft();await s.runtime.handle(s.interaction('modal','submit'));
 assert.equal(s.store.listScenarios(guildId).summary.points,20);assert.equal(s.sends.length,1);assert.equal(s.errors.length,1);
 await s.runtime.handle(s.interaction('modal','submit'));assert.equal(s.store.listScenarios(guildId).summary.points,20);assert.equal(s.sends.length,1);
});
test('wrong guild, nongang, blacklist and stolen drafts cannot create points',async t=>{
 const s=setup(t);const wrong=s.interaction('command');wrong.guildId='1311580149094809651';await s.runtime.handle(wrong);assert.equal(wrong.modal,null);
 s.members.get(author).roles.cache.clear();const outsider=s.interaction('command');await s.runtime.handle(outsider);assert.match(outsider.replies.at(-1).content,/Alleen gangleden/);
 s.members.get(author).roles.cache.set(settings.memberlistRanks[0],{});s.members.get(author).roles.cache.set(blacklistRole,{});
 const blocked=s.interaction('command');await s.runtime.handle(blocked);assert.equal(blocked.modal,null);
 s.members.get(author).roles.cache.delete(blacklistRole);s.draft();const stolen=s.interaction('modal','submit',draftId,other);await s.runtime.handle(stolen);
 assert.match(stolen.replies.at(-1).content,/ander account/);assert.equal(s.store.listScenarios(guildId).summary.points,0);assert.equal(s.sends.length,0);
});
test('missing clip and unsupported upload show actionable feedback while leaving draft intact',async t=>{
 const s=setup(t,{archive:async()=>{throw new ScenarioClipError('Gebruik een geldig MP4-bestand.');}});s.draft();
 const missing=s.interaction('modal','submit');missing.fields.getTextInputValue=()=>'';await s.runtime.handle(missing);
 assert.match(missing.replies.at(-1).content,/één clipbestand/);
 const invalid=s.interaction('modal','submit');invalid.fields.getTextInputValue=()=>'';invalid.fields.getUploadedFiles=()=>new Collection([['file',{name:'bad.mp4'}]]);await s.runtime.handle(invalid);
 assert.equal(invalid.replies.at(-1).content,'Gebruik een geldig MP4-bestand.');assert.equal(s.store.listScenarios(guildId).summary.points,0);assert.ok(s.store.scenarioDraft(guildId,draftId,author));
});
test('revoked membership during clip download aborts commit and cleans newly stored file',async t=>{
 const removed=[];let s;s=setup(t,{archive:async()=>{s.members.get(author).roles.cache.clear();return clip;},removeClip:async entry=>removed.push(entry)});s.draft();
 const i=s.interaction('modal','submit');i.fields.getTextInputValue=()=>'';i.fields.getUploadedFiles=()=>new Collection([['file',{name:'clip.mp4'}]]);
 await s.runtime.handle(i);assert.equal(s.store.listScenarios(guildId).summary.points,0);assert.deepEqual(removed,[clip]);assert.equal(s.sends.length,0);
});
test('concurrent same-draft submissions archive once and score once',async t=>{
 let release,archives=0;const wait=new Promise(r=>{release=r;});const s=setup(t,{archive:async()=>{archives++;await wait;return clip;}});s.draft();
 const first=s.interaction('modal','submit'),second=s.interaction('modal','submit');
 for(const i of [first,second]){i.fields.getTextInputValue=()=>'';i.fields.getUploadedFiles=()=>new Collection([['file',{name:'clip.mp4'}]]);}
 const run=s.runtime.handle(first);await new Promise(r=>setImmediate(r));await s.runtime.handle(second);release();await run;
 assert.equal(archives,1);assert.equal(s.store.listScenarios(guildId).summary.points,20);assert.equal(s.sends.length,1);assert.match(second.replies.at(-1).content,/al opgeslagen/);
});
test('ambiguous delivery is reconciled from own bot footer and never blindly resent',async t=>{
 const s=setup(t);s.saved();s.setError(new Error('network reset'));await s.runtime.flush();
 assert.equal(s.store.scenario(guildId,draftId).publish.status,'uncertain');assert.equal(s.sends.length,1);
 await s.runtime.flush();assert.equal(s.sends.length,1);assert.equal(s.store.scenario(guildId,draftId).publish.status,'uncertain');
 s.messages.set(messageId,{id:messageId,author:{id:botId},embeds:[{footer:{text:'LA NOCHE • Scenario '+draftId}}]});s.advance(300001);
 await s.runtime.flush();assert.equal(s.store.scenario(guildId,draftId).publish.status,'sent');assert.equal(s.sends.length,1);
});
test('definite rejection remains pending with backoff and is sent after permissions recover',async t=>{
 const s=setup(t);s.saved();s.setError(Object.assign(new Error('missing permissions'),{status:403}));await s.runtime.flush();
 assert.equal(s.store.scenario(guildId,draftId).publish.status,'pending');await s.runtime.flush();assert.equal(s.sends.length,1);
 s.setError(null);s.advance(15000);await s.runtime.flush();assert.equal(s.sends.length,2);assert.equal(s.store.scenario(guildId,draftId).publish.status,'sent');assert.equal(s.store.listScenarios(guildId).summary.points,20);
});
test('a reset during a queued Discord post labels the record as a previous period',async t=>{
 const s=setup(t);s.saved();s.guild.channels.fetch=async()=>{s.store.resetScenarioPoints(guildId,author,'1570202824699158740');return s.channel;};
 await s.runtime.flush();
 assert.equal(s.sends[0].embeds[0].toJSON().fields.at(-1).name,'VORIGE PERIODE');
 assert.equal(s.store.listScenarios(guildId).summary.points,0);
});
