import { queueAbsenceAudit } from './audit.js';
import { getMembers } from './member-cache.js';
import {randomUUID} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,MessageFlags,PermissionFlagsBits as P,escapeMarkdown} from 'discord.js';
import {branded,field} from './embeds.js';
import {settings} from './settings.js';
import {absenceDates,UserError} from './logic.js';
export const absenceResetVersion='2026-10-08-reset-1';
const locks=new Set();
async function locked(guild,user,fn) {
  const key=`${guild}:${user}`;
  if(locks.has(key)) throw new UserError('Deze afwezigheid wordt al verwerkt. Probeer het zo opnieuw.');
  locks.add(key);try{return await fn();}finally{locks.delete(key);}
}
const date=ms=>`<t:${Math.floor(ms/1000)}:D>`;
export function absencePayload(r) {
  const statuses={pending:['🟠 Wacht op beoordeling',0xff7900],approving:['🟠 Goedkeuring wordt verwerkt',0xff7900],approved:['✅ Goedgekeurd',0x2ecc71],denied:['❌ Afgekeurd',0xe74c3c],expired:['☾ Afwezigheid afgelopen',0x747f8d],cancelled:['☾ Afwezigheid ingetrokken',0x747f8d]};
  const [status,color]=statuses[r.status];
  const fields=[field('Lid',`<@${r.user}>`),field('Status',status),field('Vanaf',date(r.start)),field('Tot en met',date(r.end)),field('Reden',escapeMarkdown(r.reason),false)];
  if(r.reviewer) fields.push(field('Beoordeeld door',`<@${r.reviewer}>`,false));
  const payload=branded('☾ AFWEZIGHEID • LA NOCHE','**Even afwezig. Nog steeds familie.**\n'+(r.status==='pending'?'Je aanvraag ligt bij de leiding. Na goedkeuring ontvang je automatisch de afwezigheidsrol.':r.status==='approved'?'Je afwezigheid is goedgekeurd. Je rol vervalt automatisch na de einddatum.':r.status==='denied'?'Deze aanvraag is afgekeurd. Er is geen afwezigheidsrol toegekend.':r.status==='expired'?'De periode is verstreken. Deze aanvraag is niet meer actief.':r.status==='cancelled'?'Deze afwezigheid is gereset. Je kunt een nieuwe aanvraag indienen.':'De aanvraag wordt verwerkt.'),fields,'ticket-banner.gif','ticket-logo.gif');
  payload.embeds[0].setColor(color).setFooter({text:'LA NOCHE • Einddatum telt volledig mee • Nederlandse tijd'});
  payload.components=[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ln-absence:approve:${r.id}`).setLabel('Goedgekeuren').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(r.status!=='pending'),
    new ButtonBuilder().setCustomId(`ln-absence:deny:${r.id}`).setLabel('Afgekeuren').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(r.status!=='pending'))];
  return payload;
}
export async function submitAbsenceRequest(i,store) {
  return locked(i.guildId,i.user.id,async()=>{
    if(store.absenceResetState(i.guildId,absenceResetVersion)==='pending') throw new UserError('De afwezigheden worden gereset. Probeer het zo opnieuw.');
    const dates=absenceDates(i.fields.getTextInputValue('begin').trim(),i.fields.getTextInputValue('eind').trim());
    if(store.activeAbsenceRequest(i.guildId,i.user.id) || store.absent(i.guildId,i.user.id)?.end>=Date.now()) throw new UserError('Je hebt al een openstaande of goedgekeurde afwezigheid.');
    const channel=await i.guild.channels.fetch(settings.channels.afwezig);
    if(!channel?.send) throw new UserError('Het afwezigheidskanaal ontbreekt.');
    const reviewRole=await i.guild.roles.fetch(settings.absenceReviewerRole);
    if(!reviewRole) throw new UserError('De rol voor afwezigheidsbeoordelaars ontbreekt.');
    const me=await i.guild.members.fetchMe();
    const permissions=channel.permissionsFor(me);
    if(!permissions?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.AttachFiles])) throw new UserError('Ik mis rechten om de afwezigheidsembed te plaatsen.');
    if(!reviewRole.mentionable && !permissions.has(P.MentionEveryone)) throw new UserError('Ik kan de beoordelaarsrol niet taggen. Maak deze vermeldbaar of geef mij de toestemming Iedereen vermelden.');
    const request={id:randomUUID(),guild:i.guildId,user:i.user.id,...dates,reason:i.fields.getTextInputValue('reden'),status:'pending',channel:channel.id};
    store.createAbsenceRequest(request);
    const payload=absencePayload(request);
    payload.content=`<@&${settings.absenceReviewerRole}>`;
    payload.allowedMentions={parse:[],roles:[settings.absenceReviewerRole]};
    let message;
    try {message=await channel.send(payload);}catch(error){store.deleteAbsenceRequest(request.id);throw error;}
    store.updateAbsenceRequest(request.id,{message:message.id,dirty:0});
    queueAbsenceAudit(store,store.absenceRequest(request.id));
    return i.editReply({content:`Je afwezigheidsaanvraag is ingediend en wacht op goedkeuring.\n${message.url}`});
  });
}
async function updateMessage(guild,store,r) {
  if(!r.message) return;
  const channel=await guild.channels.fetch(r.channel);
  const message=await channel.messages.fetch(r.message);
  await message.edit({...absencePayload(r),attachments:[],allowedMentions:{parse:[]}});
  store.updateAbsenceRequest(r.id,{dirty:0});
}
async function assignRole(guild,store,r) {
  const role=await guild.roles.fetch(settings.absenceRole);
  const me=await guild.members.fetchMe();
  const member=await guild.members.fetch({user:r.user,force:true});
  if(!role?.editable || !me.permissions.has(P.ManageRoles) || !member.manageable) throw new UserError('Ik kan de afwezigheidsrol niet geven. Geef mij Rollen beheren en zet mijn botrol boven de afwezigheidsrol en het lid.');
  await member.roles.add(settings.absenceRole,`Afwezigheid goedgekeurd door ${r.reviewer}`);
  store.setAbsent(r.guild,r.user,r.start,r.end);
  store.updateAbsenceRequest(r.id,{status:'approved',dirty:1});
  queueAbsenceAudit(store,store.absenceRequest(r.id));
}
async function expire(guild,store,r) {
  if(['approved','approving'].includes(r.status)) {
    let member;
    try {member=await guild.members.fetch({user:r.user,force:true});}catch(error){if(error.code!==10007)throw error;}
    if(member?.roles.cache.has(settings.absenceRole)) await member.roles.remove(settings.absenceRole,'Afwezigheidsperiode afgelopen');
    const absence=store.absent(r.guild,r.user);
    if(absence?.start===r.start && absence.end===r.end) store.clearAbsent(r.guild,r.user);
  }
  store.updateAbsenceRequest(r.id,{status:'expired',dirty:1});
  queueAbsenceAudit(store,store.absenceRequest(r.id));
}
export async function handleAbsenceInteraction(i,guildId,store) {
  if(!i.inGuild() || i.guildId!==guildId) return i.reply({content:'Deze aanvraag hoort bij de La Noche-server.',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
    const [,action,id]=i.customId.split(':');
    const initial=store.absenceRequest(id);
    if(!initial || initial.guild!==guildId || initial.channel!==i.channelId || initial.message!==i.message.id) throw new UserError('Deze afwezigheidsaanvraag is niet gevonden.');
    const actor=await i.guild.members.fetch({user:i.user.id,force:true});
    if(!actor.roles.cache.has(settings.absenceReviewerRole)) throw new UserError('Alleen leden met de coördinatorrol kunnen deze aanvraag beoordelen.');
    if(!['approve','deny'].includes(action)) throw new UserError('Onbekende actie.');
    return await locked(guildId,initial.user,async()=>{
      const r=store.absenceRequest(id);
      if(r.status!=='pending') throw new UserError('Deze aanvraag is al behandeld.');
      if(r.end<Date.now()) {await expire(i.guild,store,r);throw new UserError('Deze afwezigheidsperiode is al verstreken.');}
      if(action==='deny') {store.updateAbsenceRequest(id,{status:'denied',reviewer:i.user.id,dirty:1});queueAbsenceAudit(store,store.absenceRequest(id));}
      else {
        // Persist intent before Discord call; startup recovery completes interrupted approvals.
        store.updateAbsenceRequest(id,{status:'approving',reviewer:i.user.id,dirty:1});
        try {await assignRole(i.guild,store,store.absenceRequest(id));}
        catch(error){store.updateAbsenceRequest(id,{status:'pending',reviewer:null,dirty:1});throw error;}
      }
      let updated=true;
      try{await updateMessage(i.guild,store,store.absenceRequest(id));}catch{updated=false;}
      return i.editReply({content:(action==='approve'?'Goedgekeurd. De afwezigheidsrol is toegekend.':'Afgekeurd. Er is geen rol toegekend.')+(updated?'':' Het bijwerken van de embed wordt automatisch opnieuw geprobeerd.')});
    });
  }catch(error){if(error instanceof UserError)return i.editReply({content:error.message});throw error;}
}
export async function refreshAbsences(guild,store,now=Date.now()) {
  const result={failed:0};
  for(const item of store.absenceRequests(guild.id)) {
    if(locks.has(`${guild.id}:${item.user}`))continue;
    try {
      await locked(guild.id,item.user,async()=>{
        let r=store.absenceRequest(item.id);
        if(['pending','approving','approved'].includes(r.status) && r.end<now) await expire(guild,store,r);
        else if(r.status==='approving') await assignRole(guild,store,r);
        r=store.absenceRequest(item.id);
        if(r.dirty && r.message) {
          try{await updateMessage(guild,store,r);}catch(error){if([10003,10008].includes(error.code))store.updateAbsenceRequest(r.id,{dirty:0});else throw error;}
        }
      });
    }catch{result.failed++;}
  }
  return result;
}

export async function resetAbsencesOnce(guild,store) {
  store.beginAbsenceReset(guild.id,absenceResetVersion);
  if(store.absenceResetState(guild.id,absenceResetVersion)==='done')return {done:true,removed:0};
  const members=await getMembers(guild);
  let removed=0,failed=0;
  for(const member of members.values()) {
    if(!member.roles.cache.has(settings.absenceRole))continue;
    try {await member.roles.remove(settings.absenceRole,'Eenmalige reset van alle afwezigheden op verzoek van beheer');removed++;}
    catch(error){if(error.code!==10007)failed++;}
  }
  if(failed)throw new UserError(`Afwezigheidsreset: rol verwijderen mislukt bij ${failed} leden; wordt opnieuw geprobeerd.`);
  store.completeAbsenceReset(guild.id,absenceResetVersion);
  return {done:true,removed};
}
