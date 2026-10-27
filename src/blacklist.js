import {randomUUID,createHash} from 'node:crypto';
import {PermissionFlagsBits as P,OverwriteType,MessageFlags,EmbedBuilder} from 'discord.js';
import {UserError} from './logic.js';
export const blacklistKeepRole='1553520983628062810';
export const blacklistRole='1564650582080364704';
export const blacklistNoticeChannel='1564657779686379571';
export const blacklistVisibleChannels=new Set([blacklistNoticeChannel,'1553516146773463162','1374423843007103097','1553516237462704229']);
export const blacklistLogChannel='1564654956185780234';
const runs=new Map();
function exclusive(guild,fn) {
 const previous=runs.get(guild)??Promise.resolve();
 const run=previous.catch(()=>{}).then(fn);runs.set(guild,run);
 return run.finally(()=>{if(runs.get(guild)===run)runs.delete(guild);});
}
const viewState=overwrite=>overwrite?.deny.has(P.ViewChannel)?false:overwrite?.allow.has(P.ViewChannel)?true:null;
const key=(guild,user)=>`blacklist:${guild}:${user}`;
function save(store,guild,entry){store.setMeta(key(guild,entry.user),JSON.stringify(entry));}
function read(store,guild,user){const raw=store.getMeta(key(guild,user));return raw?JSON.parse(raw):null;}
async function channelsFor(guild) {
 const channels=await guild.channels.fetch();
 return [...channels.values()].filter(c=>c && !c.isThread() && c.permissionOverwrites);
}
function checkBlacklistRole(guild,channels) {
 const role=guild.roles.cache.get(blacklistRole);
 if(!role || role.managed || !role.editable)throw new UserError('De blacklistrol ontbreekt of staat boven mijn botrol. Zet mijn botrol boven de blacklistrol.');
 if(role.permissions.has(P.Administrator))throw new UserError('De blacklistrol mag geen Administrator hebben.');
 if([...blacklistVisibleChannels].some(id=>!channels.some(c=>c.id===id)))throw new UserError('Een van de toegestane blacklistkanalen ontbreekt. Controleer de kanaal-ID’s en mijn toegang.');
}
async function syncBlacklistRole(guild,channels) {
 checkBlacklistRole(guild,channels);
 const failed=[];
 for(const channel of channels) {
  const visible=blacklistVisibleChannels.has(channel.id);
  if(viewState(channel.permissionOverwrites.cache.get(blacklistRole))===visible)continue;
  try{await channel.permissionOverwrites.edit(blacklistRole,{ViewChannel:visible},{type:OverwriteType.Role,reason:'Blacklist: alleen informatiekanalen en blacklistmelding zichtbaar'});}catch{failed.push(channel.id);}
 }
 if(failed.length)throw new UserError(`De blacklistrol kon in ${failed.length} kanaal/kanalen nog niet worden ingesteld. Controleer mijn kanaalrechten en probeer opnieuw.`);
}
function checkRoles(guild,member) {
 if(!guild.members.me.permissions.has(P.ManageRoles))throw new UserError('Ik mis de servertoestemming Rollen beheren.');
 if(member.id===guild.ownerId || !member.manageable)throw new UserError('Ik kan dit lid niet beheren. De servereigenaar kan niet worden geblacklist; mijn botrol moet boven de rollen van het lid staan.');
 const retained=[...member.roles.cache.values()].filter(r=>r.id===guild.id || r.id===blacklistKeepRole || r.id===blacklistRole || r.managed);
 if(retained.some(r=>r.permissions.has(P.Administrator)))throw new UserError('Een rol die moet blijven heeft Administrator. Daarmee kan Discord kanaalblokkades omzeilen; pas die rol eerst aan.');
 const removable=[...member.roles.cache.values()].filter(r=>r.id!==guild.id && r.id!==blacklistKeepRole && r.id!==blacklistRole && !r.managed);
 if(removable.some(r=>!r.editable))throw new UserError('Zet de botrol boven alle rollen die moeten worden afgenomen.');
 return removable.map(r=>r.id);
}
async function applyEntry(guild,store,entry,channels) {
 const reason=`Blacklist ${entry.status==='removing'?'verwijderen':'toevoegen'} door ${entry.actor}`;
 let member;
 try{member=await guild.members.fetch({user:entry.user,force:true});}catch(e){if(e.code!==10007)throw e;}
 if(entry.status==='removing') {
  // Restore only this member's ViewChannel bit. Other permission changes remain intact.
  for(const channel of [...channels].sort((a,b)=>Number(Boolean(b.parentId))-Number(Boolean(a.parentId)))) {
   const original=entry.channels[channel.id];if(!original)continue;
   const overwrite=channel.permissionOverwrites.cache.get(entry.user);
   if(!overwrite)continue;
   if(original.view===null && !original.existed && (overwrite.allow.bitfield & ~P.ViewChannel)===0n && (overwrite.deny.bitfield & ~P.ViewChannel)===0n) {
    await channel.permissionOverwrites.delete(entry.user,reason);
   }else if(viewState(overwrite)!==original.view) {
    await channel.permissionOverwrites.edit(entry.user,{ViewChannel:original.view},{type:OverwriteType.Member,reason});
   }
  }
  if(member?.roles.cache.has(blacklistRole))await member.roles.remove(blacklistRole,reason);
  store.finishBlacklist(guild.id,entry.user,null,entry.event);return;
 }
 // Capture every original overwrite before category edits propagate to children.
 for(const channel of channels)if(!Object.hasOwn(entry.channels,channel.id)) {
  const overwrite=channel.permissionOverwrites.cache.get(entry.user);
  const parent=channel.parentId && entry.channels[channel.parentId];
  entry.channels[channel.id]=channel.permissionsLocked && parent?{...parent}:{existed:Boolean(overwrite),view:viewState(overwrite)};
 }
 if(member) {
  const removed=checkRoles(guild,member);
  save(store,guild.id,entry);
  if(removed.length)await member.roles.remove(removed,reason);
  if(!member.roles.cache.has(blacklistRole))await member.roles.add(blacklistRole,reason);
 }else save(store,guild.id,entry);
 const failed=[];
 for(const channel of channels) {
  const visible=blacklistVisibleChannels.has(channel.id);
  if(viewState(channel.permissionOverwrites.cache.get(entry.user))===visible)continue;
  // Member rules also override old ticket access and allows from retained roles.
  try{await channel.permissionOverwrites.edit(entry.user,{ViewChannel:visible},{type:OverwriteType.Member,reason});}catch{failed.push(channel.id);}
 }
 if(member?.voice?.channelId)await member.voice.disconnect(reason);
 if(failed.length)throw new UserError(`Blacklist opgeslagen, maar ${failed.length} kanaalblokkade(s) zijn nog niet gelukt. Controleer mijn kanaalrechten; de bot probeert dit automatisch opnieuw.`);
 entry.status='active';const event=entry.event;delete entry.event;
 store.finishBlacklist(guild.id,entry.user,entry,event);
}
export function syncBlacklist(guild,store) {
 if(runs.has(guild.id))return runs.get(guild.id);
 return exclusive(guild.id,async()=>{
  const entries=store.blacklistEntries(guild.id);
  await guild.roles.fetch();const channels=await channelsFor(guild);const errors=[];
  let roleError;
  try{await syncBlacklistRole(guild,channels);}catch(e){roleError=e;}
  if(!entries.length && roleError)throw roleError;
  for(const entry of entries)try{if(roleError && entry.status!=='removing')throw roleError;await applyEntry(guild,store,entry,channels);}catch(e){errors.push(e);}
  if(errors.length)throw errors[0];
 });
}
export async function handleBlacklist(i,guildId,store) {
 const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 if(!i.inGuild() || i.guildId!==guildId)return reply('Dit command hoort bij La Noche.');
 await i.deferReply({flags:MessageFlags.Ephemeral});
 const respond=content=>i.editReply({content,allowedMentions:{parse:[]}});
 try {
  const actor=await i.guild.members.fetch({user:i.user.id,force:true});
  if(!actor.permissions.has(P.Administrator))throw new UserError('Je hebt beheerdersrechten nodig om dit command te gebruiken.');
  const user=i.options.getUser('persoon',true);const action=i.options.getSubcommand();
  if(!['toevoegen','verwijderen'].includes(action))throw new UserError('Kies toevoegen of verwijderen.');
  if(user.bot || user.id===i.user.id || user.id===i.guild.ownerId)throw new UserError('Kies een ander lid; jezelf, bots en de servereigenaar kun je niet blacklisten.');
  return await exclusive(i.guildId,async()=>{
   await i.guild.roles.fetch();
   let entry=read(store,i.guildId,user.id);
   if(action==='verwijderen' && !entry)return respond('Dit lid staat niet op de blacklist.');
   const member=await i.guild.members.fetch({user:user.id,force:true}).catch(e=>{if(e.code===10007 && action==='verwijderen')return null;throw e;});
   if(member && i.user.id!==i.guild.ownerId && actor.roles.highest.comparePositionTo(member.roles.highest)<=0)throw new UserError('Je kunt alleen leden onder jouw hoogste rol aanpassen.');
   const channels=await channelsFor(i.guild);
   if(action==='toevoegen') {
    if(entry?.status==='removing')throw new UserError('Het verwijderen van deze blacklist is nog bezig. Rond dat eerst af.');
    checkRoles(i.guild,member);
    if(member.voice?.channelId && !member.voice.channel.permissionsFor(i.guild.members.me)?.has(P.MoveMembers))throw new UserError('Ik mis Leden verplaatsen om dit lid uit het spraakkanaal te halen.');
    if(channels.some(c=>!c.permissionsFor(i.guild.members.me)?.has([P.ViewChannel,P.ManageRoles])))throw new UserError('Ik moet alle kanalen kunnen bekijken en daar kanaalrechten kunnen beheren. Controleer mijn rechten voordat je de blacklist toepast.');
    await syncBlacklistRole(i.guild,channels);
    entry??={user:user.id,channels:{},status:'pending',actor:i.user.id,event:{id:i.id??randomUUID(),user:user.id,actor:i.user.id,action,time:Date.now()}};
   }else {
    if(entry.status!=='removing')entry.event={id:i.id??randomUUID(),user:user.id,actor:i.user.id,action,time:Date.now()};
    entry.status='removing';entry.actor=i.user.id;save(store,i.guildId,entry);
   }
   await applyEntry(i.guild,store,entry,channels);
   await flushBlacklistLogs(i.guild,store).catch(e=>console.error('Blacklistlog plaatsen mislukt',e.code??e.name));
   return respond(`Perm Blacklist op <@${user.id}> ${action==='toevoegen'?'Toegevoegd':'Verwijderd'}`);
  });
 }catch(e){if(e instanceof UserError)return respond(e.message);throw e;}
}

export function blacklistLogPayload(event) {
 const added=event.action==='toevoegen';
 return {embeds:[new EmbedBuilder().setColor(added?0xed4245:0x57f287)
  .setTitle('Perm Blacklist • '+(added?'Toegevoegd':'Verwijderd'))
  .setDescription(`**Persoon:** <@${event.user}>\n**Door:** <@${event.actor}>`)
  .setTimestamp(event.time)],allowedMentions:{parse:[]}};
}
const logRuns=new Map();
export function flushBlacklistLogs(guild,store) {
 if(logRuns.has(guild.id))return logRuns.get(guild.id);
 const run=(async()=>{
  const pending=store.pendingBlacklistLogs(guild.id);if(!pending.length)return;
  const channel=await guild.channels.fetch(blacklistLogChannel);
  if(!channel?.send)throw new UserError('Het blacklistlogkanaal ontbreekt.');
  for(const event of pending) {
   const payload=blacklistLogPayload(event);
   payload.nonce=createHash('sha256').update(`blacklist-log:${event.id}`).digest('hex').slice(0,24);payload.enforceNonce=true;
   const message=await channel.send(payload);
   store.markBlacklistLogged(event.id,message.id);
  }
 })();logRuns.set(guild.id,run);
 return run.finally(()=>logRuns.delete(guild.id));
}

const noticeText='Als je dit kanaal ziet betekent het dat je een Permanent Blacklist hebt ontvangen';
export function blacklistNoticePayload() {
 return {embeds:[new EmbedBuilder().setColor(0xed4245).setTitle(noticeText)],allowedMentions:{parse:[]}};
}
const noticeRuns=new Map();
export function syncBlacklistNotice(guild,store) {
 if(noticeRuns.has(guild.id))return noticeRuns.get(guild.id);
 const run=(async()=>{
  const channel=await guild.channels.fetch(blacklistNoticeChannel);
  if(!channel?.send)throw new UserError('Het blacklistmeldingskanaal ontbreekt.');
  const metaKey=`blacklist-notice:${guild.id}`;const saved=store.getMeta(metaKey);
  let message;
  if(saved)try{message=await channel.messages.fetch(saved);}catch(e){if(e.code!==10008)throw e;}
  if(message && message.author.id!==guild.client.user.id)message=null;
  if(!message) {
   let before;
   for(;;) {
    const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
    message=[...page.values()].find(m=>m.author.id===guild.client.user.id && m.embeds.some(e=>e.title===noticeText));
    if(message || page.size<100)break;
    before=page.last().id;
   }
  }
  const payload=blacklistNoticePayload();
  if(message) {
   const embed=message.embeds[0];
   if(message.embeds.length!==1 || embed?.title!==noticeText || embed?.color!==0xed4245 || embed?.image || embed?.thumbnail || embed?.description)await message.edit({...payload,attachments:[]});
  }else message=await channel.send(payload);
  store.setMeta(metaKey,message.id);
 })();noticeRuns.set(guild.id,run);
 return run.finally(()=>noticeRuns.delete(guild.id));
}
