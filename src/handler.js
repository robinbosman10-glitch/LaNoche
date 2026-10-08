import { submitAbsenceRequest } from './absences.js';
import { applicationTicketLink } from './applications.js';
import { publishTicketPanel } from './tickets.js';
import { getMembers } from './member-cache.js';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits, escapeMarkdown } from 'discord.js';
import { definitions } from './commands.js';
import { settings } from './settings.js';
import { branded, field } from './embeds.js';
import { nextRank, removableRoles, UserError } from './logic.js';
import { updateMemberlist } from './memberlist.js';
const locks = new Set();
const stamp = ms => `<t:${Math.floor(ms / 1000)}:d>`;
async function withLock(key, action) {
  if (locks.has(key)) throw new UserError('Deze actie wordt al verwerkt. Probeer het zo opnieuw.');
  locks.add(key);
  try { return await action(); } finally { locks.delete(key); }
}
async function channelFor(guild, id) {
  const channel = await guild.channels.fetch(id);
  if (!channel?.isTextBased() || !channel.send) throw new UserError('Het ingestelde kanaal bestaat niet of is geen tekstkanaal.');
  const permissions = channel.permissionsFor(guild.members.me);
  const send = channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, send, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles])) {
    throw new UserError(`Ik mis Bekijk kanaal, Berichten versturen, Links insluiten of Bestanden bijvoegen in <#${id}>.`);
  }
  return channel;
}
async function targetFor(i) {
  const user = i.options.getUser('persoon', true);
  const member = await i.guild.members.fetch({user:user.id, force:true});
  const actor = await i.guild.members.fetch({user:i.user.id, force:true});
  if (user.bot) throw new UserError('Kies een lid, geen bot.');
  if (user.id === i.user.id) throw new UserError('Je kunt deze rolwijziging niet op jezelf uitvoeren.');
  if (!member.manageable || !i.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new UserError('Ik kan de rollen van dit lid niet beheren. Controleer Beheer rollen en de botrolpositie.');
  if (i.user.id !== i.guild.ownerId && actor.roles.highest.comparePositionTo(member.roles.highest) <= 0) throw new UserError('Je kunt alleen leden onder jouw hoogste rol aanpassen.');
  return member;
}
async function editableRoles(guild, ids) {
  await guild.roles.fetch();
  for (const id of ids) {
    const role = guild.roles.cache.get(id);
    if (!role || !role.editable || role.managed || id === guild.id) throw new UserError(`Rol ${id} ontbreekt of kan niet beheerd worden. Zet mijn botrol boven deze rol.`);
  }
}
async function announceAfterChange(i, channel, payload, text) {
  try {
    const message = await channel.send(payload);
    await i.editReply({content:`${text}\n${message.url}`});
  } catch {
    await i.editReply({content:`${text} De melding kon alleen niet worden geplaatst. Voer de rolwijziging niet opnieuw uit; controleer het meldingskanaal.`});
  }
}
async function roleAction(i, store) {
  const user = i.options.getUser('persoon', true);
  return withLock(`${i.guildId}:member:${user.id}`, async () => {
    const name = i.commandName;
    const member = await targetFor(i);
    const reason = i.options.getString('reden') || 'Geen aanvullende toelichting.';
    const audit = `${name} door ${i.user.id}: ${reason}`.slice(0, 500);
    const channel = await channelFor(i.guild, settings.channels[name] || i.channelId);
    const common = [field('Lid', `<@${member.id}>`), field('Uitgevoerd door', `<@${i.user.id}>`), field('Toelichting', escapeMarkdown(reason), false)];
    if (name === 'aangenomen') {
      if (settings.ranks.some(id=>!settings.joinRoles.includes(id) && member.roles.cache.has(id))) throw new UserError('Dit lid heeft al een hogere gangrang. Gebruik promotie of demote.');
      await editableRoles(i.guild, settings.joinRoles);
      if (settings.joinRoles.every(id => member.roles.cache.has(id))) throw new UserError('Dit lid heeft beide aangenomen-rollen al.');
      await member.roles.add(settings.joinRoles, audit);
      return announceAfterChange(i, channel, branded('✦ WELKOM BIJ DE FAMILIE', `<@${member.id}> is aangenomen bij **La Noche**.\nEen nieuw hoofdstuk begint. Welkom in de familie.`, [...common, field('Toegekende rollen', settings.joinRoles.map(id=>`<@&${id}>`).join('\n'),false)]), 'Het lid is aangenomen en heeft beide rollen ontvangen.');
    }
    if (name === 'ontslaan') {
      await i.guild.roles.fetch();
      if (!i.guild.roles.cache.has(settings.keepRole)) throw new UserError('De ingestelde uitzonderingsrol bestaat niet. Er is niets gewijzigd.');
      const remove = removableRoles([...member.roles.cache.values()], i.guildId, settings.keepRole);
      if (!remove.length) throw new UserError('Dit lid heeft geen verwijderbare rollen.');
      const managed = [...member.roles.cache.values()].filter(r=>r.managed);
      // Discord-managed roles and @everyone cannot be removed by bots.
      await member.roles.remove(remove.map(r=>r.id), audit);
      store.clearAbsent(i.guildId, member.id);
      const extra = managed.length ? '\nAutomatisch beheerde Discord-rollen blijven ook behouden.' : '';
      return announceAfterChange(i, channel, branded('◈ DIENSTVERBAND BEËINDIGD', `<@${member.id}> maakt geen deel meer uit van **La Noche**.\nDe bijbehorende rollen zijn ingetrokken.`, [...common, field('Rollen', `Alle verwijderbare rollen ingetrokken. De uitzonderingsrol wordt behouden als het lid deze had.${extra}`, false)]), `Het lid is ontslagen; ${remove.length} rollen verwijderd.${extra}`);
    }
    const change = nextRank(settings.ranks, [...member.roles.cache.keys()], name === 'promotie' ? 1 : -1);
    await editableRoles(i.guild, [change.from, change.to]);
    // One request replaces the rank while retaining unrelated roles.
    const roles = [...member.roles.cache.keys()].filter(id=>id!==i.guildId && id!==change.from);
    await member.roles.set([...new Set([...roles, change.to])], audit);
    const promoted = name === 'promotie';
    return announceAfterChange(i, channel, branded(promoted ? '✦ EEN NIEUWE RANG. EEN NIEUW HOOFDSTUK.' : '◈ RANGWIJZIGING', promoted ? `<@${member.id}> is **gepromoveerd**.\nInzet wordt gezien. Loyaliteit wordt beloond. Gefeliciteerd namens La Noche.` : `<@${member.id}> is één rang teruggezet.`, [...common, field('Vorige rang', `<@&${change.from}>`), field('Nieuwe rang', `<@&${change.to}>`)]), `Het lid is één rang ${promoted ? 'omhoog' : 'omlaag'} gezet.`);
  });
}
function absenceModal() {
  const modal = new ModalBuilder().setCustomId('lanoche:afwezig').setTitle('La Noche • Afwezig melden');
  for (const [id, label, style, max] of [['reden','Reden',TextInputStyle.Paragraph,700],['begin','Begindatum (DD-MM-YYYY)',TextInputStyle.Short,10],['eind','Einddatum (DD-MM-YYYY)',TextInputStyle.Short,10]]) {
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max)));
  }
  return modal;
}
async function inactivity(i, store) {
  const channel = await channelFor(i.guild, i.channelId);
  const members = await getMembers(i.guild);
  const rows = [...members.values()].filter(m=>!m.user.bot && (!settings.ranks.length || settings.ranks.some(id=>m.roles.cache.has(id))))
    .map(m=>({member:m,last:store.last(i.guildId,m.id),absence:store.absent(i.guildId,m.id)}))
    .sort((a,b)=>(a.last??0)-(b.last??0));
  const pages = [];
  for (let n=0;n<rows.length;n+=15) pages.push(rows.slice(n,n+15));
  if (!pages.length) pages.push([]);
  for (const [index, page] of pages.entries()) {
    const lines = page.map(({member,last,absence})=>{
      let status = 'Niet afwezig';
      if (absence?.end >= Date.now()) status = absence.start > Date.now() ? `Afwezig gepland ${stamp(absence.start)}–${stamp(absence.end)}` : `Afwezig t/m ${stamp(absence.end)}`;
      return `<@${member.id}>\n${last ? `Laatste gemeten bericht <t:${Math.floor(last/1000)}:R>` : 'Nog geen bericht gemeten'} • ${status}`;
    });
    const intro = `Meting vanaf ${stamp(store.since)} in kanalen die ik kan zien, alleen terwijl ik online ben.${settings.ranks.length ? '' : ' Tot de gangrangen zijn ingesteld worden alle menselijke serverleden getoond.'}`;
    await channel.send(branded(`◷ ACTIVITEIT & AFWEZIGHEID • ${index+1}/${pages.length}`,`${intro}\n\n${lines.join('\n\n') || 'Geen leden gevonden.'}`));
  }
  await i.editReply({content:`Het overzicht is geplaatst in <#${i.channelId}>.`});
}
async function applications(i, store) {
  return withLock(`${i.guildId}:applications`, async()=>{
    let saved = store.panel(i.guildId);
    if (saved?.channel !== settings.channels.sollistatus) saved = null;
    const channel = await channelFor(i.guild, settings.channels.sollistatus);
    const payload = branded('✦ SOLLICITATIES ZIJN GEOPEND', '**LA NOCHE ZOEKT VERSTERKING**\n\nBen jij loyaal, actief en klaar om samen iets op te bouwen? Laat zien wat je in huis hebt en zet de volgende stap bij La Noche.', [field('Wat we zoeken','◆ Actieve leden die afspraken nakomen\n◆ Respect en loyaliteit naar de familie\n◆ Goede communicatie en sterke roleplay',false),field('Interesse?','Klik hieronder op **Open een sollicitatieticket** en kies **Sollicitaties**. Vertel wie je bent, wat je ervaring is en waarom jij bij La Noche past.',false),field('Status','🟢 OPEN — nieuwe sollicitaties zijn welkom',false)]);
    payload.components = [applicationTicketLink()];
    payload.content = '<@&1553520983628062810>';
    payload.allowedMentions = { parse: [], roles: ['1553520983628062810'] };
    let message;
    if (saved) {
      try { message = await channel.messages.fetch(saved.message); }
      catch (error) { if (error.code !== 10008) throw error; }
    }
    if (message) await message.edit({...payload, attachments:[]});
    else { message = await channel.send(payload); store.setPanel(i.guildId,channel.id,message.id); }
    await i.editReply({content:`Het sollicitatiebericht is geplaatst/bijgewerkt.\n${message.url}`});
  });
}
export async function handleInteraction(i, guildId, store) {
  const modal = i.isModalSubmit?.() && i.customId === 'lanoche:afwezig';
  if (!i.isChatInputCommand() && !modal) return;
  const reply = content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if (!i.inGuild() || i.guildId!==guildId) return reply('Deze bot is alleen beschikbaar in de ingestelde La Noche-server.');
  const definition = modal ? definitions.find(c=>c.name==='afwezig') : definitions.find(c=>c.name===i.commandName);
  if (!definition) return reply('Onbekend command.');
  if (definition.adminOnly && !i.memberPermissions?.has(PermissionFlagsBits.Administrator)) return reply('Je hebt beheerdersrechten nodig om dit command te gebruiken.');
  if (!modal && i.commandName==='afwezig') return i.showModal(absenceModal());
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try {
    if (modal) return await submitAbsenceRequest(i,store);
    if (['aangenomen','ontslaan','promotie','demote'].includes(i.commandName)) return await roleAction(i,store);
    if (i.commandName==='discordinactief') return await inactivity(i,store);
    if (i.commandName==='ledenlijst') { const url = await updateMemberlist(i.guild,store,i.channelId); return await i.editReply({content:`De ledenlijst is bijgewerkt.\n${url}`}); }
    if (i.commandName==='ticket-panel') return await publishTicketPanel(i,store);
    if (i.commandName==='sollistatus') return await applications(i,store);
    const pending = i.commandName==='ledenlijst' ? 'De standaard gangrangen worden nog aangeleverd.' : i.commandName==='ticket-panel' ? 'Het ticketpaneel wordt later ingericht.' : 'De rollen en het kanaal voor rolaanvragen worden nog ingesteld.';
    return await i.editReply({content:pending});
  } catch (error) {
    if (error instanceof UserError) return i.editReply({content:error.message});
    throw error;
  }
}
