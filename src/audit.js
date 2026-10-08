import {escapeMarkdown} from 'discord.js';
import {branded,field} from './embeds.js';
import {settings} from './settings.js';
const users=id=>id?`<@${id}>\n\`${id}\``:'Automatisch systeem';
const dates=ms=>`<t:${Math.floor(ms/1000)}:F>`;
const kinds={sollicitaties:'📝 Sollicitaties',witwas:'💸 WitWas','drugs-inkoop':'📦 Drugs inkoop','drugs-verkoop':'🌿 Drugs verkoop'};
export function queueTicketAudit(store,ticket,action,actor,channelName) {
 store.queueAudit({id:`ticket:${ticket.channel}:${action}`,guild:ticket.guild,type:'ticket',action,time:Date.now(),user:ticket.user,actor,claimed:ticket.claimed,kind:ticket.kind,channel:ticket.channel,channelName});
}
export function queueAbsenceAudit(store,r,status=r.status) {
 store.queueAudit({id:`absence:${r.id}:${status}`,guild:r.guild,type:'absence',action:status,time:Date.now(),user:r.user,actor:r.reviewer||null,start:r.start,end:r.end,reason:r.reason,request:r.id,channel:r.channel,message:r.message});
}
export function auditPayload(e) {
 let title,description,fields,color;
 if(e.type==='ticket') {
  const deleted=e.action==='deleted';
  title=deleted?'🗑️ TICKET VERWIJDERD':'🔒 TICKET GESLOTEN';color=deleted?0xe74c3c:0xff7900;
  description=deleted?'**Het ticketkanaal is definitief verwijderd.**':'**Het ticket is gesloten. Het gesprek blijft in het ticketkanaal bewaard.**';
  fields=[field('Categorie',kinds[e.kind]||e.kind),field('Ticket van',users(e.user)),field(deleted?'Verwijderd door':'Gesloten door',users(e.actor)),field('Behandelaar',e.claimed?users(e.claimed):'Niet geclaimd'),field('Ticket',`${escapeMarkdown(e.channelName||'ticket')}\nID: \`${e.channel}\`${deleted?'':`\n<#${e.channel}>`}`,false),field('Tijdstip',dates(e.time),false)];
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
 payload.embeds[0].setColor(color).setTimestamp(e.time).setFooter({text:'LA NOCHE • Logboek'});
 return payload;
}
const busy=new Set();
export async function flushAudit(guild,store) {
 if(busy.has(guild.id))return;
 busy.add(guild.id);
 try {
  const channels=new Map();
  for(const event of store.pendingAudit(guild.id)) {
   try {
    const id=event.type==='ticket'?settings.channels.ticketLogs:settings.channels.absenceLogs;
    if(!channels.has(id))channels.set(id,await guild.channels.fetch(id));
    const channel=channels.get(id);
    if(!channel?.send)throw new Error('Logkanaal ontbreekt');
    await channel.send(auditPayload(event));
    store.markAuditSent(event.id);
   } catch(error) {console.error(`Logbericht versturen mislukt (${error.code??error.name}); wordt opnieuw geprobeerd.`);}
  }
 } finally {busy.delete(guild.id);}
}
