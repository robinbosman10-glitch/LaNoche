import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Collection,PermissionsBitField,PermissionFlagsBits as P} from 'discord.js';
import {createStore} from '../src/store.js';
import {handleBlacklist,syncBlacklist,blacklistKeepRole,blacklistRole,blacklistVisibleChannels,blacklistLogPayload,flushBlacklistLogs,blacklistLogChannel,blacklistNoticeChannel,blacklistNoticePayload,syncBlacklistNotice} from '../src/blacklist.js';
const permissions=bits=>new PermissionsBitField(bits);
function fixture() {
 const role=(id,position,bits=0n)=>({id,position,editable:true,managed:false,permissions:permissions(bits),comparePositionTo:other=>position-other.position});
 const everyone=role('g',0),keep=role(blacklistKeepRole,1),rank=role('rank',2),admin=role('admin',8,P.Administrator);
 const roles=new Collection([[everyone.id,everyone],[keep.id,keep],[rank.id,rank],[admin.id,admin],[blacklistRole,role(blacklistRole,1)]]);
 const memberRoles=new Collection([[everyone.id,everyone],[keep.id,keep],[rank.id,rank]]);
 let removed=0,added=0,action='toevoegen',fail=false,authorized=true;
 const member={id:'target',manageable:true,roles:{cache:memberRoles,get highest(){return [...memberRoles.values()].sort((a,b)=>b.position-a.position)[0];},remove:async ids=>{removed++;(Array.isArray(ids)?ids:[ids]).forEach(id=>memberRoles.delete(id));},add:async id=>{added++;memberRoles.set(id,roles.get(id));}}};
 const actor={id:'actor',get permissions(){return permissions(authorized?P.Administrator:0n);},roles:{highest:admin}};
 const replies=[];
 const makeChannel=(id,view,extra=0n)=>{
  const cache=new Collection();
  if(view!==undefined)cache.set('target',{allow:permissions((view===true?P.ViewChannel:0n)|extra),deny:permissions(view===false?P.ViewChannel:0n)});
  return {id,isThread:()=>false,permissionsFor:()=>permissions(P.Administrator),permissionOverwrites:{cache,delete:async user=>cache.delete(user),edit:async(user,{ViewChannel})=>{
   if(fail && id==='two')throw new Error('blocked');
   const old=cache.get(user);const allow=(old?.allow.bitfield??0n)&~P.ViewChannel;const deny=(old?.deny.bitfield??0n)&~P.ViewChannel;
   cache.set(user,{allow:permissions(allow|(ViewChannel===true?P.ViewChannel:0n)),deny:permissions(deny|(ViewChannel===false?P.ViewChannel:0n))});
  }}};
 };
 const channels=new Collection([['one',makeChannel('one',true,P.SendMessages)],['two',makeChannel('two')],['three',makeChannel('three',false)]]);
 for(const id of blacklistVisibleChannels)channels.set(id,makeChannel(id));
 const guild={id:'g',ownerId:'owner',members:{me:{permissions:permissions(P.Administrator)},fetch:async({user})=>user==='actor'?actor:member},roles:{cache:roles,fetch:async()=>roles},channels:{fetch:async()=>channels}};
 const i={guild,guildId:'g',inGuild:()=>true,user:{id:'actor'},deferReply:async()=>{},editReply:async p=>replies.push(p),reply:async p=>replies.push(p),options:{getUser:()=>({id:'target',bot:false}),getSubcommand:()=>action}};
 return {i,guild,member,channels,makeChannel,replies,removed:()=>removed,added:()=>added,setAction:x=>action=x,setFail:x=>fail=x,setAuthorized:x=>authorized=x};
}
function temporary(fn) {return async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-blacklist-'));const store=createStore(dir);
 try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
};}
test('blacklist removes roles, blocks member-specific allows and removal never returns roles',temporary(async store=>{
 const f=fixture();await handleBlacklist(f.i,'g',store);
 assert.equal(f.removed(),1);assert.ok(f.member.roles.cache.has(blacklistKeepRole));assert.ok(!f.member.roles.cache.has('rank'));
 for(const c of f.channels.values()) {
  const visible=blacklistVisibleChannels.has(c.id);
  assert.equal(c.permissionOverwrites.cache.get('target').allow.has(P.ViewChannel),visible);
  assert.equal(c.permissionOverwrites.cache.get(blacklistRole).allow.has(P.ViewChannel),visible);
 }
 assert.ok(f.member.roles.cache.has(blacklistRole));
 assert.ok(f.channels.get('one').permissionOverwrites.cache.get('target').allow.has(P.SendMessages));
 await handleBlacklist(f.i,'g',store);assert.equal(f.removed(),1);
 f.setAction('verwijderen');await handleBlacklist(f.i,'g',store);
 assert.equal(f.added(),1);assert.ok(!f.member.roles.cache.has(blacklistRole));assert.ok(!f.member.roles.cache.has('rank'));assert.deepEqual(store.blacklistEntries('g'),[]);
 assert.ok(f.channels.get('one').permissionOverwrites.cache.get('target').allow.has(P.ViewChannel));
 assert.equal(f.channels.get('two').permissionOverwrites.cache.has('target'),false);
 assert.ok(f.channels.get('three').permissionOverwrites.cache.get('target').deny.has(P.ViewChannel));
 assert.equal(f.replies.at(-1).content,'Perm Blacklist op <@target> Verwijderd');
}));
test('partial block persists and retries; new channels and later roles are covered',temporary(async(store,dir)=>{
 const f=fixture();
 // Role rules already exist; simulate a member overwrite failure only.
 for(const c of f.channels.values())await c.permissionOverwrites.edit(blacklistRole,{ViewChannel:blacklistVisibleChannels.has(c.id)});
 f.setFail(true);await handleBlacklist(f.i,'g',store);
 assert.match(f.replies.at(-1).content,/nog niet gelukt/);assert.equal(store.blacklistEntries('g').length,1);
 const reopened=createStore(dir);
 try {
  f.setFail(false);await syncBlacklist(f.guild,reopened);
  f.channels.set('new',f.makeChannel('new',true));
  f.member.roles.cache.set('rank',f.guild.roles.cache.get('rank'));
  await syncBlacklist(f.guild,reopened);
  assert.ok(f.channels.get('new').permissionOverwrites.cache.get('target').deny.has(P.ViewChannel));
  assert.ok(!f.member.roles.cache.has('rank'));
  f.setAction('verwijderen');await handleBlacklist(f.i,'g',reopened);
  assert.ok(f.channels.get('new').permissionOverwrites.cache.get('target').allow.has(P.ViewChannel));
 }finally{reopened.close();}
}));
test('non-admin actors and retained Administrator roles are rejected',temporary(async store=>{
 const f=fixture();f.setAuthorized(false);await handleBlacklist(f.i,'g',store);
 assert.match(f.replies.at(-1).content,/beheerdersrechten/);assert.equal(f.removed(),0);
 f.setAuthorized(true);f.member.roles.cache.get(blacklistKeepRole).permissions=permissions(P.Administrator);
 await handleBlacklist(f.i,'g',store);assert.match(f.replies.at(-1).content,/Administrator/);assert.equal(f.removed(),0);
 assert.deepEqual(store.blacklistEntries('g'),[]);
}));

test('existing all-hidden blacklists migrate to the three exceptions without losing original permissions',temporary(async store=>{
 const f=fixture();const original={};
 for(const c of f.channels.values()) {
  const old=c.permissionOverwrites.cache.get('target');
  original[c.id]={existed:Boolean(old),view:old?.deny.has(P.ViewChannel)?false:old?.allow.has(P.ViewChannel)?true:null};
  await c.permissionOverwrites.edit('target',{ViewChannel:false});
 }
 store.setMeta('blacklist:g:target',JSON.stringify({user:'target',channels:original,status:'active',actor:'actor'}));
 await syncBlacklist(f.guild,store);
 assert.ok(f.member.roles.cache.has(blacklistRole));
 for(const c of f.channels.values())assert.equal(c.permissionOverwrites.cache.get('target').allow.has(P.ViewChannel),blacklistVisibleChannels.has(c.id));
 assert.deepEqual(store.blacklistEntries('g')[0].channels,original);
 f.setAction('verwijderen');await handleBlacklist(f.i,'g',store);
 assert.ok(!f.member.roles.cache.has(blacklistRole));assert.ok(!f.member.roles.cache.has('rank'));
 for(const id of blacklistVisibleChannels)assert.equal(f.channels.get(id).permissionOverwrites.cache.has('target'),false);
}));

test('missing exception channels or an Administrator blacklist role stop addition before removing roles',temporary(async store=>{
 const f=fixture();const id=[...blacklistVisibleChannels][0];const channel=f.channels.get(id);f.channels.delete(id);
 await handleBlacklist(f.i,'g',store);assert.match(f.replies.at(-1).content,/ontbreekt/);assert.equal(f.removed(),0);
 f.channels.set(id,channel);f.guild.roles.cache.get(blacklistRole).permissions=permissions(P.Administrator);
 await handleBlacklist(f.i,'g',store);assert.match(f.replies.at(-1).content,/Administrator/);assert.equal(f.removed(),0);
}));

test('compact logs contain actor and target, without banner or attachments',()=>{
 for(const action of ['toevoegen','verwijderen']) {
  const payload=blacklistLogPayload({action,user:'target',actor:'actor',time:1000});const embed=payload.embeds[0].toJSON();
  assert.match(embed.title,action==='toevoegen'?/Toegevoegd/:/Verwijderd/);
  assert.match(embed.description,/<@target>/);assert.match(embed.description,/<@actor>/);
  assert.equal(embed.image,undefined);assert.equal(payload.files,undefined);assert.deepEqual(payload.allowedMentions,{parse:[]});
 }
});

test('logs queue only completed changes and retry after restart without repeating deliveries',temporary(async(store,dir)=>{
 const f=fixture();await handleBlacklist(f.i,'g',store);await handleBlacklist(f.i,'g',store);
 assert.equal(store.pendingBlacklistLogs('g').length,1);
 f.setAction('verwijderen');await handleBlacklist(f.i,'g',store);
 assert.deepEqual(store.pendingBlacklistLogs('g').map(e=>e.action),['toevoegen','verwijderen']);
 const reopened=createStore(dir);const sent=[];let fail=true;
 const guild={id:'g',channels:{fetch:async id=>{assert.equal(id,blacklistLogChannel);return {send:async p=>{if(fail)throw new Error('offline');sent.push(p);return {id:String(sent.length)};}};}}};
 try {
  await assert.rejects(flushBlacklistLogs(guild,reopened),/offline/);assert.equal(reopened.pendingBlacklistLogs('g').length,2);
  fail=false;await flushBlacklistLogs(guild,reopened);await flushBlacklistLogs(guild,reopened);
  assert.equal(sent.length,2);assert.equal(reopened.pendingBlacklistLogs('g').length,0);
 }finally{reopened.close();}
}));

test('notice keeps readable text above the banner and reuses the saved or recovered message',temporary(async store=>{
 const title='Als je dit kanaal ziet betekent het dat je een Permanent Blacklist hebt ontvangen';
 const payload=blacklistNoticePayload();assert.equal(payload.flags,32768);assert.equal(payload.components[0].toJSON().components[0].content,`## ${title}`);assert.equal(payload.embeds,undefined);assert.equal(payload.files.length,1);assert.equal(payload.components[0].toJSON().components[2].items[0].media.url,'attachment://permanent-blacklist-banner.png');
 assert.ok(blacklistVisibleChannels.has(blacklistNoticeChannel));
 let sends=0;const messages=new Collection();
 const channel={messages:{fetch:async input=>typeof input==='string'?messages.get(input):messages},send:async p=>{
  sends++;const message={id:'notice',author:{id:'bot'},embeds:[],components:p.components.map(c=>c.toJSON()),edit:async()=>assert.fail('unchanged notice should not be edited')};messages.set(message.id,message);return message;
 }};
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async id=>{assert.equal(id,blacklistNoticeChannel);return channel;}}};
 await syncBlacklistNotice(guild,store);await syncBlacklistNotice(guild,store);assert.equal(sends,1);
 store.setMeta('blacklist-notice:g','');await syncBlacklistNotice(guild,store);assert.equal(sends,1);assert.equal(store.getMeta('blacklist-notice:g'),'notice');
}));

test('blacklist role is configured for the notice even before the first blacklist',temporary(async store=>{
 const f=fixture();await syncBlacklist(f.guild,store);
 assert.ok(f.channels.get(blacklistNoticeChannel).permissionOverwrites.cache.get(blacklistRole).allow.has(P.ViewChannel));
 assert.ok(f.channels.get('one').permissionOverwrites.cache.get(blacklistRole).deny.has(P.ViewChannel));
 assert.equal(f.removed(),0);
}));


test('old small notice is converted in place to readable text and a banner',temporary(async store=>{
 let edited;const message={id:'old',author:{id:'bot'},embeds:[{title:'Als je dit kanaal ziet betekent het dat je een Permanent Blacklist hebt ontvangen'}],components:[],edit:async payload=>{edited=payload;}};
 store.setMeta('blacklist-notice:g','old');
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>({messages:{fetch:async()=>message},send:async()=>assert.fail('must update existing notice')})}};
 await syncBlacklistNotice(guild,store);
 assert.equal(edited.flags,32768);assert.deepEqual(edited.embeds,[]);assert.equal(edited.content,null);assert.deepEqual(edited.attachments,[]);
 assert.match(edited.components[0].toJSON().components[0].content,/^## /);assert.equal(edited.files.length,1);assert.equal(edited.components[0].toJSON().components[2].type,12);
}));
