import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {ChannelType,PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {settings} from '../src/settings.js';
import {createStore} from '../src/store.js';
import {panelPayload,handleTicketInteraction,handleTicketMessage} from '../src/tickets.js';
const admin={permissions:new PermissionsBitField(P.Administrator),roles:{cache:new Map()}};
function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'ln-tickets-')); const store=createStore(dir);
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 store.setTicketPanel('g','panel','panel-message','support',null);
 const changes=[]; const sends=[]; const createdOptions=[]; const channels=new Map(); let creates=0; let deleted=0;
 const channel={id:'ticket',name:'sollicitaties-user',send:async p=>{sends.push(p);return {id:'first',pin:async()=>{},edit:async p=>changes.push(p)}},messages:{fetch:async()=>({edit:async p=>changes.push(p)})},permissionOverwrites:{edit:async(...args)=>changes.push(args)},setName:async()=>{},delete:async()=>{deleted++;}};
 const guild={id:'g',members:{fetch:async()=>admin,fetchMe:async()=>({id:'bot',permissions:new PermissionsBitField(P.ManageChannels)})},roles:{fetch:async id=>({id})},channels:{create:async options=>{creates++;createdOptions.push(options);assert.equal(options.permissionOverwrites[0].deny[0],P.ViewChannel);const created={...channel,id:creates===1?'ticket':`ticket${creates}`};channels.set(created.id,created);return created;},fetch:async id=>channels.get(id)||({id,type:ChannelType.GuildCategory})}};
 function interaction(action,user='user') { const replies=[];return {replies,guild,guildId:'g',channelId:action==='open'?'panel':'ticket',channel,customId:`ln-ticket:${action}`,user:{id:user,username:user},values:['sollicitaties'],message:{id:action==='open'?'panel-message':'first'},inGuild:()=>true,deferReply:async()=>{},editReply:async p=>{replies.push(p);return {id:'confirmation',...p};},reply:async p=>p}; }
 return {store,interaction,changes,sends,guild,createdOptions,deleted:()=>deleted,creates:()=>creates};
}
test('panel contains four categories and serializes Discord embed limits',()=>{
 const p=panelPayload();const e=p.embeds[0].toJSON();const row=p.components[0].toJSON();
 assert.equal(e.thumbnail.url,'attachment://ticket-logo.gif');assert.equal(p.files[0].name,'ticket-logo.gif');assert.equal(p.embeds.length,1);assert.equal(e.fields.filter(f=>f.name.includes('DRUGS')).length,1);assert.equal(p.embeds[0].toJSON().image.url,'attachment://ticket-banner.gif');assert.equal(p.files[1].name,'ticket-banner.gif');assert.equal(row.components[0].options.length,4);assert.ok(e.description.length<4096);assert.ok(e.fields.length<=25);
});
test('two tickets allowed across types; third blocked; closing frees a slot',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 const second=s.interaction('open');second.values=['witwas'];await handleTicketInteraction(second,'g',s.store);
 assert.equal(s.store.openTickets('g','user').length,2);
 const third=s.interaction('open');await handleTicketInteraction(third,'g',s.store);
 assert.equal(s.creates(),2);assert.match(third.replies.at(-1).content,/twee open tickets/);
 s.store.updateTicket('ticket',{closed:1});
 await handleTicketInteraction(s.interaction('open'),'g',s.store);
 assert.equal(s.creates(),3);assert.equal(s.store.openTickets('g','user').length,2);
});
test('claim is exclusive; another support member cannot unclaim; admin can release',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 await handleTicketInteraction(s.interaction('claim','staff1'),'g',s.store);
 const second=s.interaction('claim','staff2');await handleTicketInteraction(second,'g',s.store);
 assert.match(second.replies.at(-1).content,/al geclaimd/);
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map([[settings.tickets.sollicitaties.support,{}]])}});
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

for (const [kind,parent,support] of [
 ['sollicitaties','1557638802934337616','1328812727287677061'],
 ['drugs-inkoop','1557639006991155271','1311585567921934367'],
 ['drugs-verkoop','1557639006991155271','1311585567921934367'],
 ['witwas','1557639163807932516','1384749084694286356'],
]) test(`${kind} routes to its category and only its support role`,async t=>{
 const s=setup(t);const i=s.interaction('open');i.values=[kind];
 await handleTicketInteraction(i,'g',s.store);
 assert.equal(s.createdOptions[0].parent,parent);
 assert.deepEqual(s.createdOptions[0].permissionOverwrites.map(o=>o.id),['g','bot','user',support]);
 assert.equal(s.store.ticket('ticket').support,support);
 assert.equal(s.sends[0].content,`<@&${support}>`);assert.deepEqual(s.sends[0].allowedMentions,{parse:[],roles:[support]});
 assert.deepEqual(s.changes[0],{content:'',allowedMentions:{parse:[]}});
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map([['unrelated-role',{}]])}});
 await handleTicketInteraction(s.interaction('claim','other-staff'),'g',s.store);
 assert.equal(s.store.ticket('ticket').claimed,null);
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map([[support,{}]])}});
 await handleTicketInteraction(s.interaction('claim','assigned-staff'),'g',s.store);
 assert.equal(s.store.ticket('ticket').claimed,'assigned-staff');
});
test('missing route category prevents ticket creation',async t=>{
 const s=setup(t);s.guild.channels.fetch=async()=>null;
 const i=s.interaction('open');await handleTicketInteraction(i,'g',s.store);
 assert.equal(s.creates(),0);assert.match(i.replies.at(-1).content,/ticketcategorie/);
});

test('deleted channels free slots and concurrent opens cannot exceed the limit',async t=>{
 const s=setup(t);
 await handleTicketInteraction(s.interaction('open'),'g',s.store);
 await handleTicketInteraction(s.interaction('open'),'g',s.store);
 const originalFetch=s.guild.channels.fetch;
 s.guild.channels.fetch=async id=>id==='ticket'?null:originalFetch(id);
 await Promise.all([handleTicketInteraction(s.interaction('open'),'g',s.store),handleTicketInteraction(s.interaction('open'),'g',s.store)]);
 assert.equal(s.store.openTickets('g','user').length,2);assert.equal(s.creates(),3);
});
test('existing one-ticket database migrates and database rejects a third active ticket',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-migrate-'));let old=new DatabaseSync(join(dir,'lanoche.sqlite'));
 old.exec('CREATE TABLE tickets (guild TEXT, channel TEXT PRIMARY KEY, user TEXT, kind TEXT, support TEXT, claimed TEXT, closed INTEGER DEFAULT 0, message TEXT); CREATE UNIQUE INDEX one_open_ticket ON tickets(guild,user) WHERE closed=0;');
 old.prepare('INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?)').run('g','old','u','witwas',null,null,0,'m');old.close();
 const store=createStore(dir);
 try {const ticket={guild:'g',channel:'second',user:'u',kind:'witwas',support:null,claimed:null,closed:0,message:'m'};store.addTicket(ticket);assert.throws(()=>store.addTicket({...ticket,channel:'third'}),/max_two_open_tickets/);assert.equal(store.openTickets('g','u').length,2);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('hidden delete requires authorized actor and confirmation; works on closed ticket',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);s.store.updateTicket('ticket',{closed:1});
 let commandRemoved=false;
 const message={guildId:'g',channelId:'ticket',guild:s.guild,channel:s.interaction('close').channel,author:{id:'staff',bot:false},content:'$delete',delete:async()=>{commandRemoved=true;}};
 await handleTicketMessage(message,'g',s.store);assert.equal(commandRemoved,true);assert.equal(s.deleted(),0);
 const id=s.sends.at(-1).components[0].toJSON().components[0].custom_id;
 const wrong=s.interaction('delete-confirm','other');wrong.customId=id;await handleTicketInteraction(wrong,'g',s.store);assert.equal(s.deleted(),0);
 const confirm=s.interaction('delete-confirm','staff');confirm.customId=id;await handleTicketInteraction(confirm,'g',s.store);assert.equal(s.deleted(),1);
});
test('hidden delete ignores ordinary users and non-ticket channels',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map()}});
 const count=s.sends.length;
 const message={guildId:'g',channelId:'ticket',guild:s.guild,channel:s.interaction('close').channel,author:{id:'user'},content:'$delete',delete:async()=>{}};
 await handleTicketMessage(message,'g',s.store);await handleTicketMessage({...message,channelId:'general'},'g',s.store);
 assert.equal(s.sends.length,count);assert.equal(s.deleted(),0);
});

test('closed notice offers delete button; authorized user confirms privately',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 await handleTicketInteraction(s.interaction('confirm-close','staff'),'g',s.store);
 const notice=s.sends.at(-1);assert.equal(notice.components[0].toJSON().components[0].custom_id,'ln-ticket:delete-request');
 const request=s.interaction('delete-request','staff');request.message.id='closed-notice';
 await handleTicketInteraction(request,'g',s.store);assert.equal(s.deleted(),0);
 const confirm=s.interaction('delete-confirm','staff');confirm.message.id='confirmation';
 confirm.customId=request.replies.at(-1).components[0].toJSON().components[0].custom_id;
 await handleTicketInteraction(confirm,'g',s.store);assert.equal(s.deleted(),1);
});
test('delete button rejects regular members and open tickets',async t=>{
 const s=setup(t);await handleTicketInteraction(s.interaction('open'),'g',s.store);
 const open=s.interaction('delete-request','staff');await handleTicketInteraction(open,'g',s.store);assert.match(open.replies.at(-1).content,/Sluit het ticket eerst/);
 s.store.updateTicket('ticket',{closed:1});
 s.guild.members.fetch=async()=>({permissions:new PermissionsBitField(),roles:{cache:new Map()}});
 const denied=s.interaction('delete-request');await handleTicketInteraction(denied,'g',s.store);
 assert.match(denied.replies.at(-1).content,/Alleen beheerders/);assert.equal(s.deleted(),0);
});
