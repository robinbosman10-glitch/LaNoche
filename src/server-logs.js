import {Events,AuditLogEvent,EmbedBuilder,PermissionFlagsBits as P,escapeMarkdown} from 'discord.js';
import {randomUUID,createHash} from 'node:crypto';
export const allLogsChannel='1564898831898779658';
const shorten=(value,max=650)=>{const s=escapeMarkdown(String(value??''));return s.length>max?s.slice(0,max-1)+'…':s;};
const who=id=>id?`<@${id}>`:'Onbekend';
const where=id=>id?`<#${id}>`:'Geen';
export function serverLogPayload(event) {
 return {embeds:[new EmbedBuilder().setColor(event.color??0xff7900).setTitle(event.title.slice(0,256))
  .setDescription(event.description.slice(0,3900)).setFooter({text:'LA NOCHE • All logs'}).setTimestamp(event.time)],allowedMentions:{parse:[]}};
}
const flushes=new Map();
export function flushServerLogs(guild,store) {
 if(flushes.has(guild.id))return flushes.get(guild.id);
 const run=(async()=>{
  const pending=store.pendingServerLogs(guild.id);if(!pending.length)return;
  const channel=await guild.channels.fetch(allLogsChannel);
  if(!channel?.send)throw new Error('All-logs kanaal ontbreekt');
  for(const event of pending) {
   const payload=serverLogPayload(event);payload.nonce=createHash('sha256').update(event.id).digest('hex').slice(0,24);payload.enforceNonce=true;
   const message=await channel.send(payload);store.markServerLogged(event.id,message.id);
  }
 })();flushes.set(guild.id,run);return run.finally(()=>flushes.delete(guild.id));
}
const auditTitles=new Map([
 [AuditLogEvent.ChannelCreate,'📁 Kanaal aangemaakt'],[AuditLogEvent.ChannelDelete,'🗑️ Kanaal verwijderd'],[AuditLogEvent.ChannelUpdate,'📁 Kanaal aangepast'],
 [AuditLogEvent.ChannelOverwriteCreate,'🔐 Kanaalrechten toegevoegd'],[AuditLogEvent.ChannelOverwriteUpdate,'🔐 Kanaalrechten aangepast'],[AuditLogEvent.ChannelOverwriteDelete,'🔐 Kanaalrechten verwijderd'],
 [AuditLogEvent.RoleCreate,'🏷️ Rol aangemaakt'],[AuditLogEvent.RoleDelete,'🏷️ Rol verwijderd'],[AuditLogEvent.RoleUpdate,'🏷️ Rol aangepast'],
 [AuditLogEvent.MemberKick,'👢 Lid gekickt'],[AuditLogEvent.MemberBanAdd,'🔨 Lid verbannen'],[AuditLogEvent.MemberBanRemove,'✅ Ban opgeheven'],
 [AuditLogEvent.MemberRoleUpdate,'🏷️ Rollen van lid aangepast'],[AuditLogEvent.MemberUpdate,'👤 Lid aangepast'],[AuditLogEvent.BotAdd,'🤖 Bot toegevoegd'],
 [AuditLogEvent.MessageDelete,'🗑️ Bericht verwijderd door beheer'],[AuditLogEvent.MessageBulkDelete,'🗑️ Berichten opgeschoond'],
 [AuditLogEvent.MemberMove,'🔊 Lid verplaatst'],[AuditLogEvent.MemberDisconnect,'🔇 Lid uit voice gehaald']
]);
export function installServerLogs(client,guildId,store,onError=()=>{}) {
 let timer;let stopped=false;
 const emit=(title,description,{id=randomUUID(),time=Date.now(),color,...data}={})=>{
  if(stopped)return;
  try{store.queueServerLog(guildId,{id,title,description,time,color,...data});}catch(e){onError(e);return;}
  if(!timer){timer=setTimeout(()=>{timer=null;const guild=client.guilds.cache.get(guildId);if(guild)void flushServerLogs(guild,store).catch(onError);},1000);timer.unref();}
 };
 const on=(name,handler)=>client.on(name,(...args)=>{try{handler(...args);}catch(e){onError(e);}});
 const messageOK=m=>m.guildId===guildId && m.channelId!==allLogsChannel && !m.author?.bot && !m.webhookId;
 const body=m=>m.content?shorten(m.content):m.attachments?.size?'[Alleen bijlage(s)]':'[Inhoud niet beschikbaar]';
 const messageDetails=m=>`**Lid:** ${who(m.author?.id)} · **Kanaal:** ${where(m.channelId)}\n**Bericht-ID:** ${m.id}`;
 on(Events.MessageCreate,m=>{if(messageOK(m))emit('💬 Bericht verstuurd',`${messageDetails(m)}\n${body(m)}`,{id:`message-create:${m.id}`,time:m.createdTimestamp,cat:'messages',user:m.author?.id,channel:m.channelId});});
 on(Events.MessageUpdate,(before,after)=>{
  if(!messageOK(after) || (before.content===after.content && before.attachments?.size===after.attachments?.size))return;
  emit('✏️ Bericht aangepast',`${messageDetails(after)}\n**Voor:** ${body(before)}\n**Na:** ${body(after)}`,{id:`message-edit:${after.id}:${after.editedTimestamp??Date.now()}`,cat:'messages',user:after.author?.id,channel:after.channelId});
 });
 on(Events.MessageDelete,m=>{if(messageOK(m))emit('🗑️ Bericht verwijderd',`${messageDetails(m)}\n${body(m)}`,{id:`message-delete:${m.id}`,color:0xed4245,cat:'messages',user:m.author?.id,channel:m.channelId});});
 on(Events.MessageBulkDelete,(messages,channel)=>{if(channel.guild?.id===guildId && channel.id!==allLogsChannel)emit('🗑️ Berichten in bulk verwijderd',`**Kanaal:** ${where(channel.id)}\n**Aantal:** ${messages.size}`,{color:0xed4245});});
 on(Events.GuildMemberAdd,m=>{if(m.guild.id===guildId)emit('👋 Lid toegetreden',`**Lid:** ${who(m.id)}\n**Naam:** ${shorten(m.user.tag,100)}`,{color:0x57f287});});
 on(Events.GuildMemberRemove,m=>{if(m.guild.id===guildId)emit('🚪 Lid niet meer in server',`**Lid:** ${who(m.id)}\n**Naam:** ${shorten(m.user.tag,100)}`,{color:0xed4245});});
 on(Events.VoiceStateUpdate,(before,after)=>{
  if(after.guild.id!==guildId)return;
  const lines=[`**Lid:** ${who(after.id)}`];let title;
  if(before.channelId!==after.channelId) {
   title=!before.channelId?'🔊 Voice binnengekomen':!after.channelId?'🔇 Voice verlaten':'🔊 Voice verplaatst';
   lines.push(`**Van:** ${where(before.channelId)}\n**Naar:** ${where(after.channelId)}`);
  }else {
   const changes=[['selfMute','Microfoon uit'],['selfDeaf','Geluid uit'],['serverMute','Servermute'],['serverDeaf','Serverdeafen'],['streaming','Stream'],['selfVideo','Camera']].filter(([key])=>before[key]!==after[key]);
   if(!changes.length)return;title='🎙️ Voice-status';lines.push(`**Kanaal:** ${where(after.channelId)}`,...changes.map(([key,label])=>`**${label}:** ${after[key]?'Ja':'Nee'}`));
  }
  emit(title,lines.join('\n'),{cat:'voice',user:after.id,channel:after.channelId||before.channelId});
 });
 on(Events.GuildAuditLogEntryCreate,(entry,guild)=>{
  if(guild.id!==guildId)return;
  const lines=[`**Door:** ${who(entry.executorId)}`];
  const target=entry.target;const targetId=entry.targetId??target?.id;
  if(targetId)lines.push(`**Doel:** ${shorten(target?.name??target?.tag??targetId,120)} · \`${targetId}\``);
  const action=AuditLogEvent[entry.action]??String(entry.action);
  if(!auditTitles.has(entry.action))lines.push(`**Actie:** ${shorten(action,100)}`);
  if(entry.reason)lines.push(`**Reden:** ${shorten(entry.reason,300)}`);
  // Only named public properties, never tokens or arbitrary audit payloads.
  for(const change of (entry.changes??[]).slice(0,4)) {
   if(['name','nick','topic','permissions','allow','deny','communication_disabled_until','mute','deaf'].includes(change.key))lines.push(`**${change.key}:** ${shorten(change.old??'—',100)} → ${shorten(change.new??'—',100)}`);
   if(['$add','$remove'].includes(change.key))lines.push(`**Rollen ${change.key==='$add'?'erbij':'eraf'}:** ${shorten((change.new??[]).map(r=>r.name??r.id).join(', '),300)}`);
  }
  emit(auditTitles.get(entry.action)??`🛡️ ${action}`,lines.join('\n'),{id:`audit:${entry.id}`,time:entry.createdTimestamp,auditAction:action,cat:(entry.changes??[]).some(c=>c.key==='communication_disabled_until')?'moderation':undefined,actor:entry.executorId,channel:entry.extra?.channel?.id});
 });
 for(const [event,title] of [[Events.GuildBanAdd,'🔨 Lid verbannen'],[Events.GuildBanRemove,'✅ Ban opgeheven']])on(event,ban=>{
  if(ban.guild.id===guildId && !ban.guild.members.me?.permissions.has(P.ViewAuditLog))emit(title,`**Lid:** ${who(ban.user.id)}\n**Door:** Niet beschikbaar zonder auditlogtoegang`);
 });
 on(Events.InteractionCreate,i=>{if(i.guildId===guildId && i.isChatInputCommand())emit('🤖 Command gebruikt',`**Lid:** ${who(i.user.id)}\n**Command:** /${shorten(i.commandName,100)}\n**Kanaal:** ${where(i.channelId)}`,{id:`command:${i.id}`,cat:'commands',user:i.user.id,channel:i.channelId});});
 // Events without a reliable executor never invent an actor.
 for(const [name,action] of [[Events.MessageReactionAdd,'Reactie toegevoegd'],[Events.MessageReactionRemove,'Reactie verwijderd']])on(name,(reaction,user)=>{
  const m=reaction.message;if(m.guildId!==guildId||m.channelId===allLogsChannel||user.bot)return;
  emit(action,`**Lid:** ${who(user.id)}\n**Kanaal:** ${where(m.channelId)}\n**Bericht-ID:** ${m.id}\n**Reactie:** ${shorten(reaction.emoji.name,100)}`,{cat:'messages',user:user.id,channel:m.channelId});
 });
 on(Events.GuildMemberUpdate,(before,after)=>{
  if(after.guild.id!==guildId)return;
  if(before.nickname!==after.nickname)emit('Bijnaam gewijzigd',`**Lid:** ${who(after.id)}\n**Voor:** ${shorten(before.nickname??before.user.username,100)}\n**Na:** ${shorten(after.nickname??after.user.username,100)}`,{cat:'members',user:after.id});
 });
 on(Events.AutoModerationActionExecution,e=>{if(e.guild.id===guildId)emit('AutoMod ingegrepen',`**Lid:** ${who(e.userId)}\n**Kanaal:** ${where(e.channelId)}\n**Regel-ID:** ${e.ruleId}\n**Actietype:** ${e.action.type}`,{cat:'moderation',user:e.userId,channel:e.channelId});});
 for(const [name,label] of [[Events.GuildScheduledEventCreate,'Serverevent aangemaakt'],[Events.GuildScheduledEventDelete,'Serverevent verwijderd']])on(name,e=>{if(e.guildId===guildId)emit(label,`**Evenement:** ${shorten(e.name,150)}\n**ID:** ${e.id}`,{cat:'server'});});
 // Audit entries carry the actor; these fallback channel events exist only if that permission is missing.
 for(const [name,label] of [[Events.ChannelCreate,'Kanaal aangemaakt'],[Events.ChannelDelete,'Kanaal verwijderd'],[Events.ThreadCreate,'Thread aangemaakt'],[Events.ThreadDelete,'Thread verwijderd']])on(name,c=>{
  if(c.guild?.id!==guildId||c.guild.members.me?.permissions.has(P.ViewAuditLog))return;
  emit(label,`**Kanaal:** ${shorten(c.name,150)} · ${c.id}\n**Uitvoerder:** Niet beschikbaar zonder auditlogtoegang`,{cat:'channels',channel:c.id});
 });
 return {
  async start(guild) {
   const channel=await guild.channels.fetch(allLogsChannel);
   if(!channel?.send)throw new Error('All-logs kanaal ontbreekt');
   emit('🟢 Bot online','Algemene serverlogs worden hier verzameld.',{color:0x57f287});
   if(!guild.members.me?.permissions.has(P.ViewAuditLog))emit('⚠️ Auditlogtoegang ontbreekt','Geef de bot **Auditlogboek bekijken** voor kanaal-, rol-, kick- en overige beheerlogs.');
   await flushServerLogs(guild,store);
  },
  error(label,error){emit('⚠️ Botmelding',`**Onderdeel:** ${shorten(label,180)}\n**Code:** ${shorten(error?.code??error?.name??'Onbekend',80)}`,{color:0xed4245});},
  stop(){stopped=true;clearTimeout(timer);}
 };
}
