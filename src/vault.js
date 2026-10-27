import {ActionRowBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,PermissionFlagsBits as P,escapeMarkdown} from 'discord.js';
import {DateTime} from 'luxon';
import {createHash} from 'node:crypto';
import {branded} from './embeds.js';
import {parseAmount} from './money-store.js';
import {UserError} from './logic.js';
const leadRole='1553521476378824796';
const active=new Set();
export function vaultPayload({action,kind,date,amount,reason,actor}) {
  const added=action==='add';
  const payload=branded(added?'🟢 TOEGEVOEGD AAN KLUIS':'🔴 VERWIJDERD UIT KLUIS',
    `📅 **${date}** · **${added?'+':'−'} $ ${amount.toLocaleString('nl-NL')}** · ${kind==='zwart'?'⚫ Zwart geld':'⚪ Wit geld'}\n📝 **Waarvoor:** ${escapeMarkdown(reason)}\n👤 **Door:** <@${actor}>`,[],'ticket-banner.gif','ticket-logo.gif');
  payload.embeds[0].setAuthor(null).setTimestamp(null).setFooter({text:'LA NOCHE • Kluisregistratie'});
  return payload;
}
export function vaultInput(fields) {
  const date=fields.getTextInputValue('datum').trim();
  const parsed=DateTime.fromFormat(date,'dd/MM/yyyy',{zone:'Europe/Amsterdam'});
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !parsed.isValid || parsed.toFormat('dd/MM/yyyy')!==date)throw new UserError('Vul een geldige datum in als DD/MM/YYYY, bijvoorbeeld 27/10/2026.');
  const amount=parseAmount(fields.getTextInputValue('bedrag'));
  const reason=fields.getTextInputValue('waarvoor').trim();
  if(!reason || reason.length>500)throw new UserError('Vul waarvoor het geld is in (maximaal 500 tekens).');
  return {date,amount,reason};
}
export async function handleVault(i,guildId,store) {
  const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!i.inGuild() || i.guildId!==guildId)return reply('Dit command hoort bij La Noche.');
  const modal=i.isModalSubmit();
  if(modal)await i.deferReply({flags:MessageFlags.Ephemeral});
  const respond=content=>modal?i.editReply({content,allowedMentions:{parse:[]}}):reply(content);
  const member=await i.guild.members.fetch({user:i.user.id,force:true});
  if(!member.roles.cache.has(leadRole))return respond('Alleen leden met de leidingrol kunnen kluisboekingen registreren.');
  const [,modalAction,modalKind,nonce]=(i.customId||'').split(':');
  const action=modal?modalAction:i.options.getString('actie',true);
  const kind=modal?modalKind:i.options.getString('geldsoort',true);
  if(!['add','remove'].includes(action) || !['zwart','wit'].includes(kind))return respond('Kies toegevoegd/verwijderd en zwart/wit via /kluis.');
  if(!modal) {
    const form=new ModalBuilder().setCustomId(`ln-vault:${action}:${kind}:${i.id}`).setTitle(`${action==='add'?'Toevoegen':'Verwijderen'} • ${kind} geld`);
    for(const [id,label,style,max,placeholder] of [
      ['datum','Datum (DD/MM/YYYY)',TextInputStyle.Short,10,'27/10/2026'],
      ['bedrag','Bedrag',TextInputStyle.Short,40,'Bijvoorbeeld 1000000 of 1 miljoen'],
      ['waarvoor','Waarvoor / wat?',TextInputStyle.Paragraph,500,'Beschrijf de storting of uitgave']
    ]) {
      const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(max).setPlaceholder(placeholder);
      if(id==='datum')input.setValue(DateTime.now().setZone('Europe/Amsterdam').toFormat('dd/MM/yyyy'));
      form.addComponents(new ActionRowBuilder().addComponents(input));
    }
    return i.showModal(form);
  }
  if(!nonce)return respond('Gebruik /kluis opnieuw om een formulier te openen.');
  const key=`vault:${i.guildId}:${i.user.id}:${nonce}`;
  if(active.has(key))return respond('Deze registratie wordt al verwerkt.');
  active.add(key);
  try {
    const saved=store.getMeta(key);
    if(saved)return respond(`Deze registratie is al geplaatst.\n${saved}`);
    const input=vaultInput(i.fields);
    const channel=await i.guild.channels.fetch(i.channelId);
    const send=channel?.isThread()?P.SendMessagesInThreads:P.SendMessages;
    if(!channel?.send || !channel.permissionsFor(i.guild.members.me)?.has([P.ViewChannel,send,P.EmbedLinks,P.AttachFiles]))throw new UserError('Ik mis rechten om de kluis-embed in dit kanaal te plaatsen.');
    const payload=vaultPayload({...input,action,kind,actor:i.user.id});
    payload.nonce=createHash('sha256').update(key).digest('hex').slice(0,24);payload.enforceNonce=true;
    const message=await channel.send(payload);
    store.setMeta(key,message.url);
    return respond(`Kluisregistratie geplaatst.\n${message.url}`);
  } catch(e) {
    if(e instanceof UserError)return respond(e.message);
    throw e;
  } finally {active.delete(key);}
}
