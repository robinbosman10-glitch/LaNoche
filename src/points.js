import {createHash,randomUUID} from 'node:crypto';
import {EmbedBuilder,MessageFlags,PermissionFlagsBits as P} from 'discord.js';
import {settings} from './settings.js';
import {branded} from './embeds.js';
import {getMembers} from './member-cache.js';
import {blacklistRole} from './blacklist.js';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
import {UserError} from './logic.js';

export const pointsChannel='1570202824699158738';
export const pointsResetRole='1399490155194220614';
const busy=new Set();
const signatures=new WeakMap();
const format=value=>Number(value||0).toLocaleString('nl-NL');
const marker=index=>`LA NOCHE • Puntenlijst • Pagina ${index+1} • Automatisch bijgewerkt`;
const pendingKey=guild=>`points-list-pending:${guild}`;
const messageUrl=(guild,ids)=>`https://discord.com/channels/${guild}/${pointsChannel}/${ids[0]}`;

// Gang roles determine membership only; the display is one list without rank sections.
// Personal participation totals do not add up to the gang total.
export function pointsDescriptions(members,ranks,summary){
 const points=new Map(summary.members.map(member=>[member.id,member.points]));
 const listed=[...members.values()].filter(member=>!member.user?.bot&&!member.roles.cache.has(blacklistRole)&&ranks.some(id=>member.roles.cache.has(id)));
 listed.sort((a,b)=>(points.get(b.id)||0)-(points.get(a.id)||0)||a.displayName.localeCompare(b.displayName,'nl')||a.id.localeCompare(b.id));
 const blocks=listed.length?listed.map(member=>`<@${member.id}> **[${format(points.get(member.id))}]**`):['*Nog geen gangleden gevonden.*'];
 const intro=`**GANGTOTAAL · ${format(summary.points)} punten**\nIedere aanwezige krijgt de volledige scenariopunten. Het gangtotaal telt elk scenario één keer.${summary.resetAt?`\nHuidige periode sinds <t:${Math.floor(summary.resetAt/1000)}:d>.`:''}`;
 const pages=[];let page=intro;
 for(const block of blocks){
  if(page.length+block.length+2>3500){pages.push(page);page='';}
  page+=(page?'\n\n':'')+block;
 }
 if(page)pages.push(page);
 return pages;
}

function pagePayload(description,index,count){
 const title=`✦ LA NOCHE • ᴘᴜɴᴛᴇɴʟɪᴊsᴛ${count>1?` ${index+1}/${count}`:''}`;
 const payload=index===0?branded(title,description,[],'ticket-banner.gif','ticket-logo.gif'):{embeds:[new EmbedBuilder().setColor(0xff7900).setTitle(title).setDescription(description).setTimestamp()],allowedMentions:{parse:[]}};
 payload.embeds[0].setFooter({text:marker(index)});
 return payload;
}
function retainAttachments(payload,message){
 const logo=message.attachments?.find(a=>a.name==='ticket-logo.gif');
 const banner=message.attachments?.find(a=>a.name==='ticket-banner.gif');
 if((logo||settings.branding?.logoUrl)&&(banner||settings.branding?.bannerUrl)){
  delete payload.files;
  payload.embeds[0].setAuthor({name:settings.branding?.author||'LA NOCHE  •  OFFICIEEL',iconURL:settings.branding?.logoUrl||logo.url})
   .setThumbnail(settings.branding?.logoUrl||logo.url).setImage(settings.branding?.bannerUrl||banner.url);
 }else payload.attachments=[];
}
function definiteRejection(error){return [400,401,403,404,429].includes(Number(error.status));}

export async function updatePointsList(guild,store){
 if(busy.has(guild.id))return;
 busy.add(guild.id);
 try{
  const channel=await guild.channels.fetch(pointsChannel);
  const send=channel?.isThread()?P.SendMessagesInThreads:P.SendMessages;
  const botMember=guild.members.me||await guild.members.fetchMe();
  if(channel?.guildId!==guild.id||!channel?.send||!channel.permissionsFor(botMember)?.has([P.ViewChannel,send,P.EmbedLinks,P.AttachFiles,P.ReadMessageHistory]))throw new UserError('Ik mis rechten in het puntenlijst-kanaal (bekijken, versturen, embeds, bestanden of berichtgeschiedenis).');
  const members=await getMembers(guild);
  const ranks=settings.memberlistRanks||settings.ranks;
  const saved=store.pointsList(guild.id);
  const ids=saved?.channel===pointsChannel?[...saved.messages]:[];
  const pendingRaw=store.getMeta(pendingKey(guild.id));
  if(pendingRaw){
   const pending=JSON.parse(pendingRaw);
   if(pending.channel!==pointsChannel)throw new UserError('De puntenlijst bevat een onzekere plaatsing in een ander kanaal.');
   const history=await channel.messages.fetch({limit:100});
   const found=history.find(message=>message.author?.id===guild.client.user.id&&message.createdTimestamp>=pending.time-10000&&message.embeds?.some(embed=>embed.footer?.text===marker(pending.index)));
   if(!found)throw new UserError('Discord heeft de vorige plaatsing van de puntenlijst nog niet bevestigd. Ik probeer die plaatsing terug te vinden voordat ik een nieuw bericht stuur.');
   ids[pending.index]=found.id;
   store.savePointsList(guild.id,pointsChannel,ids);
   store.setMeta(pendingKey(guild.id),'');
  }
  let created=0,updated=0;
  const summary=store.scenarioPoints(guild.id);
  const pages=pointsDescriptions(members,ranks,summary);
  let cached=signatures.get(store);if(!cached){cached=new Map();signatures.set(store,cached);}
  for(let index=0;index<pages.length;index++){
   const payload=pagePayload(pages[index],index,pages.length);
   const signature=createHash('sha256').update(JSON.stringify({description:pages[index],index,count:pages.length,branding:settings.branding})).digest('hex');
   let message;
   if(ids[index]){
    try{message=await channel.messages.fetch(ids[index]);}
    catch(error){if(error.code!==10008)throw error;}
   }
   if(message){
    if(cached.get(message.id)===signature)continue;
    if(index===0)retainAttachments(payload,message);
    await message.edit(payload);updated++;
   }else{
    const pending={index,channel:pointsChannel,time:Date.now(),nonce:randomUUID().replaceAll('-','').slice(0,24)};
    // Persist the send attempt first. A lost API response is reconciled from the
    // bot's own message history, never followed by a blind duplicate send.
    store.setMeta(pendingKey(guild.id),JSON.stringify(pending));
    try{message=await channel.send({...payload,nonce:pending.nonce,enforceNonce:true});}
    catch(error){if(definiteRejection(error))store.setMeta(pendingKey(guild.id),'');throw error;}
    ids[index]=message.id;created++;
    store.savePointsList(guild.id,pointsChannel,ids);
    store.setMeta(pendingKey(guild.id),'');
   }
   cached.set(message.id,signature);
  }
  for(const id of ids.slice(pages.length)){
   try{await channel.messages.delete(id);}catch(error){if(error.code!==10008)throw error;}
   cached.delete(id);
  }
  store.savePointsList(guild.id,pointsChannel,ids.slice(0,pages.length));
  return {created,updated,pages:pages.length,url:messageUrl(guild.id,ids)};
 }finally{busy.delete(guild.id);}
}

export function createPointsRuntime(client,guildId,store,{onReset=()=>{},onError=()=>{}}={}){
 async function handle(interaction){
  if(!interaction.isChatInputCommand?.()||interaction.commandName!=='puntenreset')return false;
  if(!interaction.inGuild?.()||interaction.guildId!==guildId){await interaction.reply({content:'Dit commando is alleen beschikbaar in de La Noche-server.',flags:MessageFlags.Ephemeral});return true;}
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  let result;
  try{
   const guild=client.guilds.cache.get(guildId)||interaction.guild;
   const member=await guild.members.fetch({user:interaction.user.id,force:true});
   if(interaction.user.id!==LOGSITE_OWNER&&!member.roles.cache.has(pointsResetRole)){
    await interaction.editReply({content:'Alleen Website Development en de hoogste leidingrol kunnen alle punten resetten.',allowedMentions:{parse:[]}});return true;
   }
   result=store.resetScenarioPoints(guildId,interaction.user.id,interaction.id);
   let scheduled=true;
   try{await onReset();}catch(error){scheduled=false;onError(error);}
   const embed=new EmbedBuilder().setColor(0xff7900).setTitle(result.duplicate?'PUNTENRESET AL VERWERKT':'PUNTEN GERESET')
    .setDescription(result.duplicate?'Deze reset was al verwerkt. Er is niet opnieuw gereset.':'Het gangtotaal en alle persoonlijke punten staan op **0**.\nScenario’s en clips blijven bewaard in het archief.')
    .setFooter({text:scheduled?'La Noche • De overzichten worden automatisch bijgewerkt':'La Noche • Reset opgeslagen; het overzicht wordt opnieuw geprobeerd'}).setTimestamp();
   await interaction.editReply({embeds:[embed],allowedMentions:{parse:[]}});
  }catch(error){onError(error);await interaction.editReply({content:result?'De puntenreset is al opgeslagen. De bevestiging kon niet volledig worden verstuurd. Het archief is behouden; voer geen nieuwe reset uit om deze melding op te lossen.':'De puntenreset kon niet worden afgerond. Probeer het opnieuw of neem contact op met Website Development.',allowedMentions:{parse:[]}});}
  return true;
 }
 return {handle};
}
