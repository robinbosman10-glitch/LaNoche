import {PermissionFlagsBits as P,OverwriteType,MessageFlags} from 'discord.js';
import {UserError} from './logic.js';
export const blacklistKeepRole='1553520983628062810';
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
function checkRoles(guild,member) {
 if(!guild.members.me.permissions.has(P.ManageRoles))throw new UserError('Ik mis de servertoestemming Rollen beheren.');
 if(member.id===guild.ownerId || !member.manageable)throw new UserError('Ik kan dit lid niet beheren. De servereigenaar kan niet worden geblacklist; mijn botrol moet boven de rollen van het lid staan.');
 const retained=[...member.roles.cache.values()].filter(r=>r.id===guild.id || r.id===blacklistKeepRole || r.managed);
 if(retained.some(r=>r.permissions.has(P.Administrator)))throw new UserError('Een rol die moet blijven heeft Administrator. Daarmee kan Discord kanaalblokkades omzeilen; pas die rol eerst aan.');
 const removable=[...member.roles.cache.values()].filter(r=>r.id!==guild.id && r.id!==blacklistKeepRole && !r.managed);
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
  store.setMeta(key(guild.id,entry.user),'null');return;
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
 }else save(store,guild.id,entry);
 const failed=[];
 for(const channel of channels) {
  if(viewState(channel.permissionOverwrites.cache.get(entry.user))===false)continue;
  try{await channel.permissionOverwrites.edit(entry.user,{ViewChannel:false},{type:OverwriteType.Member,reason});}catch{failed.push(channel.id);}
 }
 if(member?.voice?.channelId)await member.voice.disconnect(reason);
 if(failed.length)throw new UserError(`Blacklist opgeslagen, maar ${failed.length} kanaalblokkade(s) zijn nog niet gelukt. Controleer mijn kanaalrechten; de bot probeert dit automatisch opnieuw.`);
 entry.status='active';save(store,guild.id,entry);
}
export function syncBlacklist(guild,store) {
 if(runs.has(guild.id))return runs.get(guild.id);
 return exclusive(guild.id,async()=>{
  const entries=store.blacklistEntries(guild.id);if(!entries.length)return;
  await guild.roles.fetch();const channels=await channelsFor(guild);const errors=[];
  for(const entry of entries)try{await applyEntry(guild,store,entry,channels);}catch(e){errors.push(e);}
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
    entry??={user:user.id,channels:{},status:'pending',actor:i.user.id};
   }else {entry.status='removing';entry.actor=i.user.id;save(store,i.guildId,entry);}
   await applyEntry(i.guild,store,entry,channels);
   const managed=member && [...member.roles.cache.values()].some(r=>r.managed);
   return respond(action==='toevoegen'?`<@${user.id}> staat op de blacklist. Alle kanalen zijn geblokkeerd en verwijderbare rollen zijn afgenomen; rol <@&${blacklistKeepRole}> blijft behouden als het lid die had.${managed?' Door Discord beheerde rollen kunnen niet worden verwijderd.':''}`:`<@${user.id}> is van de blacklist gehaald. De kanaalblokkade is opgeheven. De afgenomen rollen blijven weg.`);
  });
 }catch(e){if(e instanceof UserError)return respond(e.message);throw e;}
}
