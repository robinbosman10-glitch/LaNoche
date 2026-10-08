import { randomUUID } from 'node:crypto';
import { settings } from './settings.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { branded, field } from './embeds.js';
import { UserError } from './logic.js';
export const ticketTypes = [
  ['sollicitaties', 'Sollicitaties', '📝', 'Zet jouw eerste stap naar de familie.'],
  ['witwas', 'WitWas', '💸', 'Bespreek je witwasaanvraag met ons team.'],
  ['drugs-inkoop', 'Drugs inkoop', '📦', 'Bied jouw voorraad aan bij La Noche.'],
  ['drugs-verkoop', 'Drugs verkoop', '🌿', 'Informeer naar aanbod en beschikbaarheid.'],
];
const locks = new Set();
async function locked(key, fn) {
  if (locks.has(key)) throw new UserError('Deze actie wordt al verwerkt. Probeer het zo opnieuw.');
  locks.add(key); try { return await fn(); } finally { locks.delete(key); }
}
export function panelPayload() {
  const payload = branded('DE NACHT BEGINT HIER.', '**Welkom bij La Noche.**\nLoyaliteit in de familie. Duidelijke afspraken in zaken.\nKies jouw onderwerp en spreek ons team in een privéticket.', [
    field('📝  SOLLICITATIES', 'Jouw plek in de familie. Laat zien wie je bent.', false),
    field('💸  WITWAS', 'Jouw aanvraag, discreet besproken. Maak afspraken met ons team.', false),
    field('📦  DRUGS INKOOP & VERKOOP', 'Voorraad aanbieden of op zoek naar aanbod? Bespreek de mogelijkheden met ons team. Kies hieronder **Drugs inkoop** of **Drugs verkoop**.', false),
    field('☾  DIRECT CONTACT', 'Selecteer hieronder je onderwerp.\n**Privékanaal · Persoonlijke behandeling · Maximaal twee open tickets**', false),
  ], 'ticket-banner.gif', 'ticket-logo.gif');
  const card = payload.embeds[0];
  card.setAuthor(null).setTimestamp(null)
    .setFooter({text:'LA NOCHE  •  Alle aanvragen gaan over roleplay binnen de server.'});
  payload.components = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ln-ticket:open').setPlaceholder('☾  OPEN EEN TICKET — kies jouw onderwerp').addOptions(ticketTypes.map(([value,label,emoji,description])=>({value,label,emoji,description}))))];
  return payload;
}
export function controls(ticket) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ln-ticket:claim').setLabel(ticket.claimed ? 'Geclaimd' : 'Claimen').setEmoji('🙋').setStyle(ButtonStyle.Success).setDisabled(Boolean(ticket.claimed || ticket.closed)),
    new ButtonBuilder().setCustomId('ln-ticket:unclaim').setLabel('Unclaimen').setStyle(ButtonStyle.Secondary).setDisabled(!ticket.claimed || Boolean(ticket.closed)),
    new ButtonBuilder().setCustomId('ln-ticket:close').setLabel('Sluiten').setEmoji('🔒').setStyle(ButtonStyle.Danger).setDisabled(Boolean(ticket.closed)))];
}
function ticketPayload(ticket) {
  const type = ticketTypes.find(t=>t[0]===ticket.kind);
  const payload = branded(`${type[2]} ${type[1].toUpperCase()} • PRIVÉTICKET`, `<@${ticket.user}> — welkom bij **La Noche**.\n\n${ticket.kind==='sollicitaties' ? 'Vertel wie je bent, hoe actief je bent en welke roleplay-ervaring je hebt. Waarom pas jij bij onze familie?' : 'Beschrijf je aanvraag en vermeld de relevante hoeveelheden en afspraken binnen de roleplay.'}\n\nEen teamlid neemt je ticket in behandeling. Je hoeft niemand te blijven taggen.`, [field('Status',ticket.closed ? '🔒 Gesloten' : ticket.claimed ? '🟠 In behandeling' : '🟢 Wacht op een teamlid'),field('Behandelaar',ticket.claimed ? `<@${ticket.claimed}>` : 'Nog niet geclaimd'),field('Ticket van',`<@${ticket.user}>`)], 'ticket-banner.gif', 'ticket-logo.gif');
  payload.components = controls(ticket);
  return payload;
}
export async function publishTicketPanel(i, store) {
  return locked(`${i.guildId}:panel`, async()=>{
    if (!i.channel?.send || i.channel.isThread()) throw new UserError('Plaats het paneel in een gewoon tekstkanaal.');
    const old = store.ticketPanel(i.guildId,i.channelId);
    const payload=panelPayload();
    let message;
    if (old) {
      try { message=await i.channel.messages.fetch(old.message); } catch(e) { if(e.code!==10008) throw e; }
    }
    if(message) await message.edit({...payload,attachments:[]});
    else message=await i.channel.send(payload);
    store.setTicketPanel(i.guildId,i.channelId,message.id,null,null);
    await i.editReply({content:`Het La Noche-ticketpaneel staat klaar.\n${message.url}\nElke ticketsoort gebruikt de eigen categorie en behandelrol. Beheerders hebben toegang tot alle tickets.`});
  });
}
async function openTicket(i,store) {
  return locked(`${i.guildId}:open:${i.user.id}`,async()=>{
    const panel=store.ticketPanel(i.guildId,i.channelId);
    if (!panel || panel.message!==i.message.id) throw new UserError('Dit paneel is niet meer actief. Gebruik het nieuwste ticketpaneel.');
    const kind=i.values?.[0];
    if (!ticketTypes.some(t=>t[0]===kind)) throw new UserError('Onbekende ticketcategorie.');
    const route=settings.tickets[kind];
    if (!route) throw new UserError('Deze ticketsoort is nog niet ingesteld.');
    const active=[];
    for (const previous of store.openTickets(i.guildId,i.user.id)) {
      let channel;
      try { channel=await i.guild.channels.fetch(previous.channel); } catch(e) { if(e.code!==10003) throw e; }
      if(channel) active.push(previous);
      else store.updateTicket(previous.channel,{closed:1});
    }
    if(active.length>=2) return i.editReply({content:`Je hebt al twee open tickets: ${active.map(t=>`<#${t.channel}>`).join(' en ')}. Sluit eerst een ticket.`});
    const me=await i.guild.members.fetchMe();
    if(!me.permissions.has(P.ManageChannels)) throw new UserError('Ik mis de toestemming Kanalen beheren.');
    const role=await i.guild.roles.fetch(route.support);
    if(!role || role.id===i.guildId || role.managed) throw new UserError('De behandelrol ontbreekt of is ongeldig. Laat het beheer de ticketinstellingen controleren.');
    if(route.parent && (await i.guild.channels.fetch(route.parent))?.type!==ChannelType.GuildCategory) throw new UserError('De ingestelde ticketcategorie ontbreekt of is ongeldig. Laat het beheer de ticketinstellingen controleren.');
    const allow=[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.AttachFiles,P.EmbedLinks];
    const overwrites=[{id:i.guildId,deny:[P.ViewChannel]}, {id:me.id,allow:[...allow,P.ManageChannels,P.ManageMessages,P.MentionEveryone]}, {id:i.user.id,allow}];
    if(route.support) overwrites.push({id:route.support,allow});
    const name=i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,30)||'lid';
    const channel=await i.guild.channels.create({name:`${kind}-${name}`,type:ChannelType.GuildText,parent:route.parent||undefined,permissionOverwrites:overwrites,topic:`La Noche | ${kind} | ${i.user.id}`,reason:`Ticket geopend door ${i.user.id}`});
    const ticket={guild:i.guildId,channel:channel.id,user:i.user.id,kind,support:route.support,claimed:null,closed:0,message:null};
    let message;
    try {
      const payload=ticketPayload(ticket);
      payload.content=`<@&${route.support}>`;
      payload.allowedMentions={parse:[],roles:[route.support]};
      message=await channel.send(payload);
      ticket.message=message.id;
      store.addTicket(ticket);
      // Pinning is cosmetic; a missing pin permission must not discard a working ticket.

    } catch(e) {
      await channel.delete('Onvolledig ticket opruimen').catch(()=>{});
      throw e;
    }
    // Content-only edit preserves the animated attachments, embed and controls.
    let mentionCleared=false;
    for(let attempt=0;attempt<2;attempt++) {
      try { await message.edit({content:'',allowedMentions:{parse:[]}}); mentionCleared=true; break; }
      catch { /* Retry once without sending another mention. */ }
    }
    if(!mentionCleared) console.error('Ticket geopend, maar roltag verwijderen mislukt.');
    await message.pin().catch(()=>{});
    await i.editReply({content:`Je privéticket is geopend: <#${channel.id}>.`});
  });
}
export function mayManage(ticket,member) { return member.permissions.has(P.Administrator) || Boolean(ticket.support && member.roles.cache.has(ticket.support)); }
export async function handleTicketInteraction(i,guildId,store) {
  if(!i.inGuild() || i.guildId!==guildId) return i.reply({content:'Dit paneel hoort bij de La Noche-server.',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
    const action=i.customId.split(':')[1];
    if(action==='open') return await openTicket(i,store);
    return await locked(`${i.guildId}:ticket:${i.channelId}`,async()=>{
      const ticket=store.ticket(i.channelId);
      if(!ticket || ticket.guild!==i.guildId) throw new UserError('Dit kanaal is geen geregistreerd ticket.');
      const member=await i.guild.members.fetch({user:i.user.id,force:true});
      if(!mayManage(ticket,member)) throw new UserError('Alleen beheerders en de ingestelde behandelrol kunnen tickets beheren.');
      if(action==='delete-request') {
        if(!ticket.closed) throw new UserError('Sluit het ticket eerst voordat je deze knop gebruikt.');
        return sendDeleteConfirmation(i.channelId,i.user.id,payload=>i.editReply(payload));
      }
      if(action==='delete-confirm') {
        const key=i.customId.split(':')[2];
        const request=deleteRequests.get(key);
        if(!request || request.channel!==i.channelId || request.user!==i.user.id || request.message!==i.message.id || request.expires<Date.now()) throw new UserError('Deze bevestiging is verlopen of niet voor jou. Gebruik opnieuw het verwijdercommando.');
        deleteRequests.delete(key);
        await i.channel.delete(`Ticket verwijderd door ${i.user.id}`);
        store.updateTicket(ticket.channel,{closed:1});
        return i.editReply({content:'Het ticketkanaal is definitief verwijderd.'}).catch(()=>{});
      }
      if(ticket.closed) throw new UserError('Dit ticket is al gesloten.');
      if(action!=='confirm-close' && i.message.id!==ticket.message) throw new UserError('Gebruik de knoppen op het oorspronkelijke ticketbericht.');
      if(action==='close') return i.editReply({content:'Dit ticket sluiten? Het gesprek blijft bewaard; de aanvrager kan daarna niet meer reageren.',components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ln-ticket:confirm-close').setLabel('Ja, ticket sluiten').setStyle(ButtonStyle.Danger))]});
      if(action==='claim') {
        if(ticket.claimed) throw new UserError(`Dit ticket is al geclaimd door <@${ticket.claimed}>.`);
        ticket.claimed=i.user.id;
      } else if(action==='unclaim') {
        if(!ticket.claimed) throw new UserError('Dit ticket is nog niet geclaimd.');
        if(ticket.claimed!==i.user.id && !member.permissions.has(P.Administrator)) throw new UserError('Alleen de behandelaar of een beheerder kan deze claim vrijgeven.');
        ticket.claimed=null;
      } else if(action==='confirm-close') {
        await i.channel.permissionOverwrites.edit(ticket.user,{SendMessages:false,AddReactions:false,CreatePublicThreads:false,CreatePrivateThreads:false,SendMessagesInThreads:false});
        ticket.closed=1;
      } else throw new UserError('Onbekende ticketactie.');
      store.updateTicket(ticket.channel,ticket);
      const message=await i.channel.messages.fetch(ticket.message);
      await message.edit({...ticketPayload(ticket),attachments:[]});
      if(ticket.closed) {
        await i.channel.setName(`gesloten-${i.channel.name}`.slice(0,100)).catch(()=>{});
        await i.channel.send({content:`🔒 Ticket gesloten door <@${i.user.id}>. Het gesprek blijft bewaard.`,allowedMentions:{parse:[]},components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ln-ticket:delete-request').setLabel('Ticket verwijderen').setStyle(ButtonStyle.Danger).setEmoji('🗑️'))]});
      }
      await i.editReply({content:ticket.closed?'Ticket gesloten en bewaard.':ticket.claimed?'Je hebt het ticket geclaimd.':'De claim is vrijgegeven.',components:[]});
    });
  } catch(e) { if(e instanceof UserError) return i.editReply({content:e.message,allowedMentions:{parse:[]}}); throw e; }
}

const deleteRequests = new Map();
export async function handleTicketMessage(message,guildId,store) {
  if(message.guildId!==guildId || message.author.bot || message.webhookId || message.content?.trim()!=='$delete') return;
  const ticket=store.ticket(message.channelId);
  if(!ticket || ticket.guild!==guildId) return;
  const member=await message.guild.members.fetch({user:message.author.id,force:true});
  await message.delete().catch(()=>{});
  if(!mayManage(ticket,member)) return;
  return sendDeleteConfirmation(message.channelId,message.author.id,payload=>message.channel.send(payload));
}
async function sendDeleteConfirmation(channelId,userId,send) {
  for(const [key,value] of deleteRequests) if(value.expires<Date.now()) deleteRequests.delete(key);
  const key=randomUUID();
  const confirmation=await send({content:`<@${userId}> — dit ticketkanaal definitief verwijderen? De berichten gaan verloren. Deze bevestiging is 60 seconden geldig.`,allowedMentions:{parse:[]},components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ln-ticket:delete-confirm:${key}`).setLabel('Ticket definitief verwijderen').setStyle(ButtonStyle.Danger).setEmoji('🗑️'))]});
  deleteRequests.set(key,{channel:channelId,user:userId,message:confirmation.id,expires:Date.now()+60000});
}
