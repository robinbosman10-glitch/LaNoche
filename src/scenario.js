import {createHash,randomUUID} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,FileUploadBuilder,LabelBuilder,MessageFlags,ModalBuilder,PermissionFlagsBits as P,TextInputBuilder,TextInputStyle,UserSelectMenuBuilder,escapeMarkdown} from 'discord.js';
import {settings} from './settings.js';
import {branded} from './embeds.js';
import {blacklistRole} from './blacklist.js';
import {logsiteOrigin} from './logsite-auth.js';
import {ScenarioError} from './scenario-store.js';
import {archiveScenarioClip,normalizeScenarioClipLink,removeScenarioClip,ScenarioClipError} from './scenario-clips.js';

export const scenarioChannel='1570195746676805702';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const snowflake=/^\d{17,20}$/;
const fail=message=>{throw new ScenarioError(message);};
const format=n=>Number(n).toLocaleString('nl-NL');
const siteLink=id=>`${logsiteOrigin()}/#/scenarios${id?'/'+id:''}`;
const hasGangRole=member=>member&&!member.user?.bot&&!member.roles.cache.has(blacklistRole)&&(settings.memberlistRanks||settings.ranks).some(id=>member.roles.cache.has(id));
const displayName=member=>String(member.displayName||member.user?.globalName||member.user?.username||member.id).slice(0,80);

function textField(id,label,max,value,placeholder){
 const input=new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(max);
 if(value)input.setValue(value);if(placeholder)input.setPlaceholder(placeholder);
 return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}
export function scenarioDataModal(name,id=randomUUID()){
 return new ModalBuilder().setCustomId('ln-scenario:data:'+id).setTitle('Scenario · Gegevens').addLabelComponents(
  textField('name','𝙉𝙖𝙖𝙢',80,name),
  new LabelBuilder().setLabel('𝙈𝙚𝙩 𝙬𝙞𝙚').setDescription('Selecteer de aanwezige gangleden. Jezelf tellen we automatisch mee.').setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId('participants').setPlaceholder('Zoek en selecteer gangleden…').setMinValues(0).setMaxValues(25).setRequired(false)),
  textField('kind','𝙒𝙖𝙩 𝙫𝙤𝙤𝙧 𝙤𝙫𝙚𝙧𝙫𝙖𝙡',120,undefined,'Bijvoorbeeld bankoverval'),
  textField('points','𝙋𝙪𝙣𝙩𝙚𝙣',7,undefined,'Bijvoorbeeld 10'),
  textField('times','𝙆𝙚𝙚𝙧 𝙝𝙤𝙚𝙫𝙚𝙚𝙡 𝙥𝙪𝙣𝙩𝙚𝙣',5,'1','Bijvoorbeeld 2')
 );
}
export function scenarioClipModal(id){
 return new ModalBuilder().setCustomId('ln-scenario:submit:'+id).setTitle('Scenario · Clip').addLabelComponents(
  new LabelBuilder().setLabel('𝘾𝙡𝙞𝙥𝙗𝙚𝙨𝙩𝙖𝙣𝙙').setDescription('Eén video: MP4, WebM, MOV of OGV; maximaal 100 MB. Of vul hieronder een link in.').setFileUploadComponent(new FileUploadBuilder().setCustomId('clip').setMinValues(0).setMaxValues(1).setRequired(false)),
  new LabelBuilder().setLabel('𝘾𝙡𝙞𝙥-𝙡𝙞𝙣𝙠').setDescription('Een HTTPS-link als je geen bestand uploadt.').setTextInputComponent(new TextInputBuilder().setCustomId('clip_url').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2000).setPlaceholder('https://medal.tv/…'))
 );
}
const clipButton=id=>new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ln-scenario:clip:'+id).setStyle(ButtonStyle.Primary).setLabel('Clip toevoegen'));
function integer(raw,label,max){if(typeof raw!=='string'||!/^\d+$/.test(raw.trim()))fail(`${label}: vul een positief heel getal in.`);const n=Number(raw.trim());if(!Number.isSafeInteger(n)||n<1||n>max)fail(`${label}: gebruik een getal tussen 1 en ${format(max)}.`);return n;}
export function scenarioInput(fields){
 const name=fields.getTextInputValue('name').trim(),kind=fields.getTextInputValue('kind').trim();
 if(!name||name.length>80||/[\r\n\t\u0000-\u001f]/.test(name))fail('Vul een geldige naam in (maximaal 80 tekens).');
 if(!kind||kind.length>120||/[\r\n\t\u0000-\u001f]/.test(kind))fail('Vul een soort overval in (maximaal 120 tekens).');
 const points=integer(fields.getTextInputValue('points'),'Punten',1000000),times=integer(fields.getTextInputValue('times'),'Aantal keer',10000);
 if(points*times>1000000000)fail('Een scenario kan maximaal 1 miljard gangpunten opleveren.');
 const selected=fields.getSelectedUsers('participants');
 const participantIds=selected?[...selected.keys()]:[];
 if(participantIds.length>25||participantIds.some(id=>!snowflake.test(id)))fail('Selecteer maximaal 25 geldige gangleden.');
 return {name,kind,points,times,participantIds:[...new Set(participantIds)]};
}

export function scenarioPayload(entry){
 const total=entry.points*entry.times;
 const companions=entry.participants.filter(p=>p.id!==entry.author);
 const archived=entry.pointsActive===false;
 const payload=branded('SCENARIO GEREGISTREERD',archived?'Archief · dit scenario hoort bij een eerdere puntenperiode.':'De punten tellen één keer voor de gang en persoonlijk voor iedere aanwezige.',[
  {name:'𝙉𝙖𝙖𝙢',value:`<@${entry.author}> · ${escapeMarkdown(entry.name)}`,inline:true},
  {name:'𝙈𝙚𝙩 𝙬𝙞𝙚',value:companions.length?companions.map(p=>`<@${p.id}>`).join(' '):'Solo',inline:true},
  {name:'𝙒𝙖𝙩 𝙫𝙤𝙤𝙧 𝙤𝙫𝙚𝙧𝙫𝙖𝙡',value:escapeMarkdown(entry.kind),inline:true},
  {name:'𝙋𝙪𝙣𝙩𝙚𝙣 × 𝙖𝙖𝙣𝙩𝙖𝙡 𝙠𝙚𝙚𝙧',value:`${format(entry.points)} × ${format(entry.times)}`,inline:true},
  {name:archived?'VORIGE PERIODE':'VOOR DE HELE GANG',value:archived?`**${format(total)} punten**\nNiet meegeteld na de laatste puntenreset.`:`**+${format(total)} punten**\n${entry.participants.length} aanwezige${entry.participants.length===1?'':'n'} · één keer bijgeschreven`,inline:false}
 ],'ticket-banner.gif','ticket-logo.gif');
 payload.embeds[0].setFooter({text:`LA NOCHE • Scenario ${entry.id}`}).setTimestamp(entry.time);
 payload.components=[new ActionRowBuilder().addComponents(
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Bekijk clip').setURL(entry.clip.type==='link'?entry.clip.url:siteLink(entry.id)),
  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Puntenoverzicht').setURL(siteLink())
 )];
 payload.nonce=createHash('sha256').update('scenario:'+entry.id).digest('hex').slice(0,24);
 payload.enforceNonce=true;
 return payload;
}

async function freshMember(guild,id,openingModal=false){
 try{
  // A modal must be the first reply within Discord's acknowledgement window.
  if(!openingModal)return await guild.members.fetch({user:id,force:true});
  let timer;
  try{return await Promise.race([guild.members.fetch({user:id,force:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ScenarioError('De ledencontrole duurt te lang. Probeer /scenario opnieuw.')),1800);})]);}
  finally{clearTimeout(timer);}
 }catch(e){if(e?.code===10007)fail('Dit account is geen lid meer van de server.');throw e;}
}
async function gangMember(guild,id,openingModal=false){const member=await freshMember(guild,id,openingModal);if(!hasGangRole(member))fail('Alleen gangleden zonder blacklist kunnen scenario’s registreren en als aanwezige worden geselecteerd.');return member;}
async function participants(guild,ids){
 const unique=[...new Set(ids)],result=new Array(unique.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(3,unique.length)},async()=>{while(next<unique.length){const at=next++,member=await gangMember(guild,unique[at]);result[at]={id:member.id,name:displayName(member)};}}));
 return result;
}
export function isScenarioInteraction(i){return (i.isChatInputCommand()&&i.commandName==='scenario')||((i.isButton()||i.isModalSubmit())&&i.customId?.startsWith('ln-scenario:'));}

export function createScenarioRuntime(client,guildId,store,{directory=process.env.DATA_DIR||'./data',archive=archiveScenarioClip,removeClip=removeScenarioClip,onSaved=()=>{},onError=()=>{},pollMs=15000,now=Date.now}={}){
 let timer,flushRun=null,started=false,lastReconcile=-Infinity;
 const inProgress=new Set();
 const respond=(i,content,components=[])=>i.deferred||i.replied?i.editReply({content,components,embeds:[],allowedMentions:{parse:[]}}):i.reply({content,components,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
 const findGuild=()=>client.guilds.cache.get(guildId);
 function savedReply(i,entry){
  if(entry.pointsActive===false)return respond(i,'Dit scenario staat al in het archief van vóór de laatste puntenreset. De clip blijft beschikbaar; deze punten worden niet opnieuw toegevoegd.',[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Scenario bekijken').setURL(siteLink(entry.id)))]);
  const state=entry.publish?.status;
  const suffix=state==='sent'?`Het scenario staat in <#${scenarioChannel}>.`:state==='uncertain'?'Het scenario is opgeslagen. De Discord-verzending wordt gecontroleerd; de punten tellen al één keer mee.':'Het scenario is opgeslagen. Het Discord-bericht staat klaar om te worden geplaatst.';
  return respond(i,`**+${format(entry.points*entry.times)} punten voor de gang.**\n${suffix}`,[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Scenario bekijken').setURL(siteLink(entry.id)))]);
 }
 async function handle(i){
  if(!i.inGuild()||i.guildId!==guildId)return respond(i,'Dit command hoort bij de La Noche-server.');
  const modal=i.isModalSubmit();
  if(modal)await i.deferReply({flags:MessageFlags.Ephemeral});
  let retryId=null,archiveFile=null,lock=null;
  try{
   const member=await gangMember(i.guild,i.user.id,!modal);
   if(i.isChatInputCommand())return await i.showModal(scenarioDataModal(displayName(member)));
   const parts=i.customId.split(':'),action=parts[1],id=parts[2];
   if(parts.length!==3||!uuid.test(id))fail('Open een nieuw formulier met /scenario.');
   if(action==='data'&&modal){
    const input=scenarioInput(i.fields);
    const present=await participants(i.guild,[i.user.id,...input.participantIds]);
    // Re-check the actor after any asynchronous attendee lookups.
    await gangMember(i.guild,i.user.id);
    const draft=store.createScenarioDraft(guildId,i.user.id,{name:input.name,kind:input.kind,points:input.points,times:input.times,participants:present},{id,now:now()});
    return await respond(i,`**${escapeMarkdown(draft.kind)}**\n${format(draft.points)} × ${format(draft.times)} = **${format(draft.points*draft.times)} punten voor de hele gang**.\nAanwezig: ${draft.participants.map(p=>`<@${p.id}>`).join(' ')}\n\nVoeg de clip toe om dit scenario op te slaan.`,[clipButton(id)]);
   }
   const existing=store.scenario(guildId,id);
   if(existing){if(existing.author!==i.user.id)fail('Dit formulier hoort bij een ander account.');return await savedReply(i,existing);}
   const draft=store.scenarioDraft(guildId,id,i.user.id,{now:now()});
   if(!draft)fail('Dit formulier is verlopen of hoort bij een ander account. Gebruik /scenario opnieuw.');
   retryId=id;
   if(action==='clip'&&i.isButton())return await i.showModal(scenarioClipModal(id));
   if(action!=='submit'||!modal)fail('Gebruik de knop Clip toevoegen bij jouw scenario.');
   if(inProgress.has(id))return await respond(i,'Dit scenario wordt al opgeslagen. Wacht even; de punten worden maar één keer toegevoegd.');
   if(inProgress.size>=3)fail('Er worden al drie clips verwerkt. Probeer je clip zo opnieuw.');
   lock=id;inProgress.add(lock);
   const files=i.fields.getUploadedFiles('clip'),uploads=files?[...files.values()]:[];
   const url=i.fields.getTextInputValue('clip_url').trim();
   if(uploads.length>1||(!uploads.length&&!url)||(uploads.length&&url))fail('Voeg één clipbestand óf één clip-link toe.');
   await participants(i.guild,draft.participants.map(p=>p.id));
   const clip=uploads.length?(archiveFile=await archive(uploads[0],{directory})):normalizeScenarioClipLink(url);
   await participants(i.guild,draft.participants.map(p=>p.id));
   await gangMember(i.guild,i.user.id);
   const entry=store.finalizeScenario(guildId,id,i.user.id,{clip,now:now()});
   archiveFile=null;
   try{await onSaved(entry);}catch(e){onError(e);}
   try{await flush();}catch(e){onError(e);}
   return await savedReply(i,store.scenario(guildId,id)||entry);
  }catch(e){
   if(archiveFile){try{const saved=lock&&store.scenario(guildId,lock);if(saved?.clip?.key!==archiveFile.key)await removeClip(archiveFile,{directory});}catch(cleanup){onError(cleanup);}}
   if(e instanceof ScenarioError||e instanceof ScenarioClipError)return respond(i,e.message,retryId?[clipButton(retryId)]:[]);
   onError(e);
   return respond(i,'Het scenario kon niet volledig worden verwerkt. Probeer dezelfde clip opnieuw; opgeslagen punten worden niet dubbel geteld.',retryId?[clipButton(retryId)]:[]);
  }finally{if(lock)inProgress.delete(lock);}
 }
 async function reconcile(channel,uncertain){
  if(!uncertain.length||now()-lastReconcile<300000)return;
  lastReconcile=now();
  const messages=await channel.messages.fetch({limit:100});
  for(const entry of uncertain){
   const found=[...messages.values()].find(m=>m.author?.id===client.user.id&&m.embeds?.some(e=>e.footer?.text===`LA NOCHE • Scenario ${entry.id}`));
   if(found)store.markScenarioPublished(guildId,entry.id,found.id);
  }
 }
 function flush(){
  if(flushRun)return flushRun;
  flushRun=(async()=>{
   if(!client.isReady())return;
   const guild=findGuild();if(!guild)return;
   const pending=store.pendingScenarioPublishes(guildId,{limit:20});
   const uncertain=store.uncertainScenarioPublishes(guildId,{limit:20});
   const due=pending.filter(e=>!e.publish.attemptedAt||now()-e.publish.attemptedAt>=Math.min(900000,15000*2**Math.min(6,e.publish.attempts-1)));
   const reconcileDue=uncertain.length&&now()-lastReconcile>=300000;
   if(!due.length&&!reconcileDue)return;
   const channel=await guild.channels.fetch(scenarioChannel);
   const bot=guild.members.me||await guild.members.fetchMe();
   const sendPermission=channel?.isThread?.()?P.SendMessagesInThreads:P.SendMessages;
   if(!channel?.send||channel.guildId!==guildId||!channel.permissionsFor(bot)?.has([P.ViewChannel,sendPermission,P.EmbedLinks,P.AttachFiles]))fail('Ik mis toegang of verzendrechten in het scenario-kanaal.');
   if(reconcileDue&&channel.permissionsFor(bot)?.has(P.ReadMessageHistory))try{await reconcile(channel,uncertain);}catch(error){onError(error);}
   for(const entry of due.slice(0,5)){
    // Validate embed/files before claiming; a claimed send must never be retried blindly.
    // Channel lookups or earlier sends may have allowed a points reset in the meantime.
    const payload=scenarioPayload(store.scenario(guildId,entry.id)||entry);payload.embeds.forEach(e=>e.toJSON());
    if(!store.claimScenarioPublish(guildId,entry.id,now()))continue;
    let message;
    try{
     message=await channel.send(payload);
     store.markScenarioPublished(guildId,entry.id,message.id);
    }catch(error){
     const definitive=!message&&[400,401,403,404,429].includes(error?.status);
     if(definitive)store.releaseScenarioPublish(guildId,entry.id);
     else store.markScenarioPublishUncertain(guildId,entry.id);
     onError(error);
    }
   }
  })().finally(()=>{flushRun=null;});
  return flushRun;
 }
 function start(){if(started)return;started=true;store.recoverScenarioPublishes(guildId);void flush().catch(onError);timer=setInterval(()=>{void flush().catch(onError);},pollMs);timer.unref?.();}
 function stop(){clearInterval(timer);timer=null;started=false;}
 return {handle,flush,start,stop};
}
