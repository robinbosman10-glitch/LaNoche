import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {createStore} from '../src/store.js';
import {settings} from '../src/settings.js';
import {absencePayload,submitAbsenceRequest,handleAbsenceInteraction,refreshAbsences} from '../src/absences.js';
function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'ln-absence-'));const store=createStore(dir);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const changes=[],sends=[];let adds=0,removes=0;let failRemove=false,failAdd=false;
 const member={manageable:true,roles:{cache:new Map(),add:async id=>{if(failAdd)throw new Error('Discord error');adds++;member.roles.cache.set(id,{});},remove:async id=>{if(failRemove)throw new Error('Discord error');removes++;member.roles.cache.delete(id);}}};
 const actor={permissions:new PermissionsBitField(),roles:{cache:new Map([[settings.absenceReviewerRole,{}]])}};
 const message={id:'m',url:'https://discord.com/channels/g/c/m',edit:async p=>changes.push(p)};
 const channel={id:settings.channels.afwezig,permissionsFor:()=>new PermissionsBitField(P.Administrator),send:async p=>{sends.push(p);return message;},messages:{fetch:async()=>message}};
 const guild={id:'g',channels:{fetch:async()=>channel},roles:{fetch:async id=>({id,editable:true,mentionable:true})},members:{fetchMe:async()=>({permissions:new PermissionsBitField(P.Administrator)}),fetch:async({user})=>user==='u'?member:actor}};
 const r={id:'request',guild:'g',user:'u',start:Date.now(),end:Date.now()+86400000,reason:'Vakantie',channel:channel.id};
 function addRequest(extra={}){store.createAbsenceRequest({...r,...extra});store.updateAbsenceRequest(r.id,{message:'m',dirty:0});}
 function interaction(action='approve',user='reviewer') {const replies=[];return {guild,guildId:'g',channelId:channel.id,message,user:{id:user},customId:`ln-absence:${action}:${r.id}`,inGuild:()=>true,deferReply:async()=>{},reply:async p=>p,editReply:async p=>{replies.push(p);return p;},replies};}
 return {store,guild,actor,member,r,addRequest,interaction,sends,changes,adds:()=>adds,removes:()=>removes,failRemove:value=>{failRemove=value;},failAdd:value=>{failAdd=value;}};
}
test('absence submission pings reviewer and remains pending without role or active absence',async t=>{
 const s=setup(t);const i=s.interaction();i.user.id='u';i.fields={getTextInputValue:name=>({begin:'01-01-2099',eind:'03-01-2099',reden:'Vakantie'})[name]};
 await submitAbsenceRequest(i,s.store);
 assert.equal(s.sends[0].content,`<@&${settings.absenceReviewerRole}>`);assert.deepEqual(s.sends[0].allowedMentions,{parse:[],roles:[settings.absenceReviewerRole]});
 assert.equal(s.store.activeAbsenceRequest('g','u').status,'pending');assert.equal(s.store.absent('g','u'),undefined);assert.equal(s.adds(),0);
 await assert.rejects(submitAbsenceRequest(i,s.store),/openstaande/);
});
test('absence embed has animated assets and correct green/red review buttons',()=>{
 const p=absencePayload({id:'id',user:'u',status:'pending',start:0,end:1000,reason:'test'});
 const e=p.embeds[0].toJSON();assert.equal(e.image.url,'attachment://ticket-banner.gif');assert.equal(e.thumbnail.url,'attachment://ticket-logo.gif');
 assert.deepEqual(p.components[0].toJSON().components.map(b=>[b.style,b.label,b.disabled]),[[3,'Goedgekeuren',false],[4,'Afgekeuren',false]]);
});
test('reviewer approval grants role once, activates absence and prevents second decision',async t=>{
 const s=setup(t);s.addRequest();await handleAbsenceInteraction(s.interaction(),'g',s.store);
 assert.equal(s.adds(),1);assert.equal(s.store.absenceRequest('request').status,'approved');assert.equal(s.store.absent('g','u').end,s.r.end);
 const again=s.interaction('deny');await handleAbsenceInteraction(again,'g',s.store);assert.match(again.replies[0].content,/al behandeld/);assert.equal(s.adds(),1);
 assert.ok(s.changes[0].components[0].toJSON().components.every(b=>b.disabled));
});
test('rejection grants no role and unrelated ticket managers cannot review',async t=>{
 const s=setup(t);s.addRequest();s.actor.roles.cache=new Map([[settings.allTicketRole,{}]]);
 const denied=s.interaction();await handleAbsenceInteraction(denied,'g',s.store);assert.match(denied.replies[0].content,/coördinatorrol/);assert.equal(s.store.absenceRequest('request').status,'pending');
 s.actor.permissions=new PermissionsBitField(P.Administrator);const admin=s.interaction('approve');await handleAbsenceInteraction(admin,'g',s.store);assert.match(admin.replies[0].content,/coördinatorrol/);assert.equal(s.store.absenceRequest('request').status,'pending');
 s.actor.roles.cache.set(settings.absenceReviewerRole,{});await handleAbsenceInteraction(s.interaction('deny'),'g',s.store);
 assert.equal(s.store.absenceRequest('request').status,'denied');assert.equal(s.adds(),0);assert.equal(s.store.absent('g','u'),undefined);
});
test('end date stays inclusive, removal retries after failure and clears approved absence',async t=>{
 const s=setup(t);s.addRequest();await handleAbsenceInteraction(s.interaction(),'g',s.store);
 await refreshAbsences(s.guild,s.store,s.r.end);assert.equal(s.removes(),0);
 s.failRemove(true);assert.equal((await refreshAbsences(s.guild,s.store,s.r.end+1)).failed,1);assert.equal(s.store.absenceRequest('request').status,'approved');
 s.failRemove(false);await refreshAbsences(s.guild,s.store,s.r.end+1);
 assert.equal(s.removes(),1);assert.equal(s.store.absenceRequest('request').status,'expired');assert.equal(s.store.absent('g','u'),undefined);
});
test('startup recovers interrupted approval and expired pending requests get no role',async t=>{
 const s=setup(t);s.addRequest();s.store.updateAbsenceRequest('request',{status:'approving',reviewer:'reviewer'});
 await refreshAbsences(s.guild,s.store);assert.equal(s.adds(),1);assert.equal(s.store.absenceRequest('request').status,'approved');
 s.store.deleteAbsenceRequest('request');s.store.clearAbsent('g','u');s.addRequest({end:Date.now()-1});
 await refreshAbsences(s.guild,s.store);assert.equal(s.adds(),1);assert.equal(s.store.absenceRequest('request').status,'expired');
});
test('failed grant leaves request pending and repeat review can succeed',async t=>{
 const s=setup(t);s.addRequest();s.failAdd(true);
 await assert.rejects(handleAbsenceInteraction(s.interaction(),'g',s.store),/Discord error/);
 assert.equal(s.store.absenceRequest('request').status,'pending');assert.equal(s.store.absent('g','u'),undefined);
 s.failAdd(false);await handleAbsenceInteraction(s.interaction(),'g',s.store);assert.equal(s.adds(),1);
});
