import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {createStore} from '../src/store.js';
import {panelPayload,handleTicketInteraction} from '../src/tickets.js';
const admin={permissions:new PermissionsBitField(P.Administrator),roles:{cache:new Map()}};
function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'ln-tickets-')); const store=createStore(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 store.setTicketPanel('g','panel','panel-message','support',null);
 const changes=[]; const sends=[]; let creates=0;
 const channel={id:'ticket',name:'sollicitaties-user',send:async p=>{sends.push(p);return {id:'first',pin:async()=>{}}},messages:{fetch:async()=>({edit:async p=>changes.push(p)})},permissionOverwrites:{edit:async(...args)=>changes.push(args)},setName:async()=>{},delete:async()=>{}};
 const guild={id:'g',members:{fetch:async()=>admin,fetchMe:async()=>({id:'bot',permissions:new PermissionsBitField(P.ManageChannels)})},roles:{fetch:async()=>({id:'support'})},channels:{create:async options=>{creates++;assert.equal(options.permissionOverwrites[0].deny[0],P.ViewChannel);return channel;},fetch:async()=>channel}};
 function interaction(action,user='user') { const replies=[];return {replies,guild,guildId:'g',channelId:action==='open'?'panel':'ticket',channel,customId:`ln-ticket:${action}`,user:{id:user,username:user},values:['sollicitaties'],message:{id:action==='open'?'panel-message':'first'},inGuild:()=>true,deferReply:async()=>{},editReply:async p=>{replies.push(p);return p;},reply:async p=>p}; }
 return {store,interaction,changes,sends,guild,creates:()=>creates};
}
test('panel contains four categories and serializes Discord embed limits',()=>{
 const p=panelPayload();const e=p.embeds[1].toJSON();const row=p.components[0].toJSON();
 assert.equal(p.embeds[0].toJSON().image.url,'attachment://ticket-banner.gif');assert.equal(p.files[1].name,'ticket-banner.gif');assert.equal(row.components[0].options.length,4);assert.ok(e.description.length<4096);assert.ok(e.fields.length<=25);
});
test('opening creates private ticket and repeat click reuses it',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 assert.equal(s.store.openTicket('g','user').message,'first');
 const repeat=s.interaction('open');await handleTicketInteraction(repeat,'g',s.store);
 assert.equal(s.creates(),1);assert.match(repeat.replies.at(-1).content,/al een open ticket/);
});
test('claim is exclusive; another support member cannot unclaim; admin can release',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 await handleTicketInteraction(s.interaction('claim','staff1'),'g',s.store);
 const second=s.interaction('claim','staff2');await handleTicketInteraction(second,'g',s.store);
 assert.match(second.replies.at(-1).content,/al geclaimd/);
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map([['support',{}]])}});
 await handleTicketInteraction(s.interaction('unclaim','staff2'),'g',s.store);assert.equal(s.store.ticket('ticket').claimed,'staff1');
 s.guild.members.fetch=async()=>admin;
 await handleTicketInteraction(s.interaction('unclaim','staff2'),'g',s.store);assert.equal(s.store.ticket('ticket').claimed,null);
});
test('ordinary users cannot manage tickets and closing requires confirmation',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map()}});
 await handleTicketInteraction(s.interaction('confirm-close'),'g',s.store);assert.equal(s.store.ticket('ticket').closed,0);
 s.guild.members.fetch=async()=>admin;
 await handleTicketInteraction(s.interaction('close'),'g',s.store);assert.equal(s.store.ticket('ticket').closed,0);
 await handleTicketInteraction(s.interaction('confirm-close'),'g',s.store);assert.equal(s.store.ticket('ticket').closed,1);
 assert.equal(s.store.openTicket('g','user'),undefined);assert.ok(s.changes.some(c=>Array.isArray(c)&&c[1].SendMessages===false));
});
test('ticket and panel survive database reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-persist-'));let store=createStore(dir);
 try {store.setTicketPanel('g','p','m',null,null);store.addTicket({guild:'g',channel:'c',user:'u',kind:'witwas',support:null,claimed:'staff',closed:0,message:'m'});store.close();store=createStore(dir);assert.equal(store.ticket('c').claimed,'staff');assert.equal(store.ticketPanel('g','p').message,'m');}finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
