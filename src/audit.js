import {transcriptBase,transcriptLink} from './transcript-web.js';
import {captureTranscript} from './transcripts.js';
import {AttachmentBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle,escapeMarkdown} from 'discord.js';
import {branded,field} from './embeds.js';
import {settings} from './settings.js';
const users=id=>id?`<@${id}>\n\`${id}\``:'Automatisch systeem';
const dates=ms=>`<t:${Math.floor(ms/1000)}:F>`;
const kinds={sollicitaties:'📝 Sollicitaties',witwas:'💸 WitWas','drugs-inkoop':'📦 Drugs inkoop','drugs-verkoop':'🌿 Drugs verkoop'};
export function queueTicketAudit(store,ticket,action,actor,channelName,transcript) {
 store.queueAudit({id:`ticket:${ticket.channel}:${action}`,guild:ticket.guild,type:'ticket',action,time:Date.now(),user:ticket.user,actor,claimed:ticket.claimed,kind:ticket.kind,channel:ticket.channel,channelName,transcript});
}
export function queueAbsenceAudit(store,r,status=r.status) {
 store.queueAudit({id:`absence:${r.id}:${status}`,guild:r.guild,type:'absence',action:status,time:Date.now(),user:r.user,actor:r.reviewer||null,start:r.start,end:r.end,reason:r.reason,request:r.id,channel:r.channel,message:r.message});
}
export function auditPayload(e) {
 let title,description,fields,color;
 if(e.type==='ticket') {
  const deleted=e.action==='deleted';
  title='☾ LA NOCHE • TICKETDOSSIER';color=deleted?0xed4245:0xff7900;
  description=`**${kinds[e.kind]||e.kind}**\n${deleted?'🔴  **VERWIJDERD** · Dossier afgerond':'🟠  **GESLOTEN** · Afhandeling afgerond'}\n\n${deleted?'Het ticket is afgehandeld en het kanaal is verwijderd.':'Het ticket is afgesloten. Bekijk hieronder de afhandeling en het transcript.'}`;
  const history=[];
  if(e.closed)history.push(`🔒 **Gesloten** door <@${e.closed.actor}>\n${dates(e.closed.time)}`);
  else if(!deleted)history.push(`🔒 **Gesloten** door <@${e.actor}>\n${dates(e.time)}`);
  if(deleted)history.push(`🗑️ **Verwijderd** door <@${e.actor}>\n${dates(e.time)}`);
  fields=[field('👤  AANVRAGER',`<@${e.user}>`,true),field('🛡️  BEHANDELAAR',e.claimed?`<@${e.claimed}>`:'Niet geclaimd',true),field('📋  AFHANDELING',history.join('\n\n'),false),field('🎫  TICKET',`${escapeMarkdown(e.channelName||'ticket')}`,false)];

 } else {
  const states={pending:['📨 AFWEZIGHEID AANGEVRAAGD','De aanvraag wacht op beoordeling.',0xff7900],approved:['✅ AFWEZIGHEID GOEDGEKEURD','De afwezigheidsrol is toegekend.',0x2ecc71],denied:['❌ AFWEZIGHEID AFGEKEURD','De aanvraag is afgekeurd. Er is geen rol toegekend.',0xe74c3c],expired:['⌛ AFWEZIGHEID AFGELOPEN','De periode is verstreken. Een eventueel toegekende afwezigheidsrol is verwijderd.',0x747f8d]};
  [title,description,color]=states[e.action];
  fields=[field('Lid',users(e.user)),field('Status',title.slice(title.indexOf(' ')+1)),field('Vanaf',dates(e.start)),field('Tot en met',dates(e.end)),field('Reden',escapeMarkdown(e.reason),false)];
  if(e.actor)fields.push(field(e.action==='denied'?'Afgekeurd door':'Goedgekeurd door',users(e.actor),false));
  if(e.action==='expired')fields.push(field('Beëindigd door','Automatisch systeem',false));
  if(e.message)fields.push(field('Aanvraag',`[Bekijk de aanvraag](https://discord.com/channels/${e.guild}/${e.channel}/${e.message})`,false));
  fields.push(field('Tijdstip',dates(e.time),false));
 }
 const payload=branded(title,description,fields,'ticket-banner.gif','ticket-logo.gif');
 payload.embeds[0].setColor(color).setTimestamp(e.time).setFooter({text:e.type==='ticket'?`LA NOCHE • Dossier ${e.channel}`:'LA NOCHE • Logboek'});
 if(e.type==='ticket')payload.embeds[0].setAuthor({name:'LA NOCHE  /  TICKETARCHIEF',iconURL:'attachment://ticket-logo.gif'});
 return payload;
}
const busy=new Set();
const upgrading=new Set();
export async function flushAudit(guild,store) {
 if(busy.has(guild.id)||upgrading.has(guild.id))return;
 busy.add(guild.id);
 try {
  const channels=new Map();
  for(const event of store.pendingAudit(guild.id)) {
   try {
    const id=event.type==='ticket'?settings.channels.ticketLogs:settings.channels.absenceLogs;
    if(!channels.has(id))channels.set(id,await guild.channels.fetch(id));
    const channel=channels.get(id);
    if(!channel?.send)throw new Error('Logkanaal ontbreekt');
    if(event.type==='ticket') {
      const closed=store.auditEvent(`ticket:${event.channel}:closed`);
      const payload=auditPayload({...event,closed:event.action==='deleted'?closed:null});
      const transcript=event.transcript||closed?.transcript;
      if(transcript)payload.files.push(new AttachmentBuilder(Buffer.from(transcript.html),{name:transcript.name}));
      const link=transcript?transcriptLink(store,guild.id,event.channel):null;
      const button=new ButtonBuilder().setLabel('Transcript bekijken').setEmoji('📄');
      if(link)button.setStyle(ButtonStyle.Link).setURL(link);
      else button.setStyle(ButtonStyle.Secondary).setCustomId(`ln-transcript:${event.channel}`);
      payload.components=transcript?[new ActionRowBuilder().addComponents(button)]:[];
      const saved=store.ticketLog(guild.id,event.channel);
      let message;
      if(saved?.channel===id) {
        try{message=await channel.messages.fetch(saved.message);}catch(error){if(error.code!==10008)throw error;}
      }
      if(message)await message.edit({...payload,attachments:[]});
      else {message=await channel.send(payload);store.setTicketLog(guild.id,event.channel,id,message.id);}

    } else await channel.send(auditPayload(event));
    store.markAuditSent(event.id);
   } catch(error) {console.error(`Logbericht versturen mislukt (${error.code??error.name}); wordt opnieuw geprobeerd.`);}
  }
 } finally {busy.delete(guild.id);}
}

export async function handleTranscript(i,store) {
 await i.deferReply({flags:64});
 const id=i.customId.split(':')[1];
 const saved=store.ticketLog(i.guildId,id);
 if(!saved || saved.channel!==i.channelId || saved.message!==i.message.id)return i.editReply({content:'Dit transcript is niet beschikbaar.'});
 const member=await i.guild.members.fetch({user:i.user.id,force:true});
 if(!i.channel.permissionsFor(member)?.has(1024n))return i.editReply({content:'Je hebt geen toegang tot dit logkanaal.'});
 const event=store.auditEvent(`ticket:${id}:deleted`)||store.auditEvent(`ticket:${id}:closed`);
 if(!event?.transcript)return i.editReply({content:'Van dit ticket is geen transcript beschikbaar.'});
 const link=transcriptLink(store,i.guildId,id);
 if(link)return i.editReply({content:'📄 Open het tickettranscript:',components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Transcript openen').setURL(link))]});
 return i.editReply({content:'📄 Download het La Noche-transcript en open het in je browser.',files:[new AttachmentBuilder(Buffer.from(event.transcript.html),{name:event.transcript.name})]});
}
export async function upgradeTicketLogs(guild,store) {
 if(upgrading.has(guild.id))return;
 upgrading.add(guild.id);
 try {
 const key=`ticketLogUpgrade:${guild.id}:v3:${transcriptBase()||'download'}`;
 if(store.auditMigrationDone(key))return;
 const channel=await guild.channels.fetch(settings.channels.ticketLogs);
 const tickets=new Map(store.tickets(guild.id).map(t=>[t.channel,t]));
 const groups=new Map();let before;
 do {
  const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});if(!page.size)break;
  for(const message of page.values()) {
   if(message.author?.id!==guild.client.user.id)continue;
   const embed=message.embeds.find(e=>['🗑️ TICKET VERWIJDERD','🔒 TICKET GESLOTEN','☾ LA NOCHE • TICKETDOSSIER'].includes(e.title));if(!embed)continue;
   const text=[embed.footer?.text,...(embed.fields||[]).map(f=>f.value)].join(' ');
   const id=[...tickets.keys()].find(id=>text.includes(id));if(!id)continue;
   if(!groups.has(id))groups.set(id,[]);groups.get(id).push(message);
  }
  const next=page.last().id;if(next===before||page.size<100)break;before=next;
 }while(true);
 for(const [id,messages] of groups) {
  const event=store.auditEvent(`ticket:${id}:deleted`)||store.auditEvent(`ticket:${id}:closed`);if(!event)continue;
  if(!event.transcript) {
   let source;try{source=await guild.channels.fetch(id);}catch(error){if(error.code!==10003)throw error;}
   if(source)event.transcript=await captureTranscript(source,tickets.get(id));
  }
  store.setTicketLog(guild.id,id,channel.id,messages[0].id);
  store.replaceAudit(event);
  for(const duplicate of messages.slice(1))await duplicate.delete();
 }
 store.finishAuditMigration(key);
 } finally {upgrading.delete(guild.id);}
}
