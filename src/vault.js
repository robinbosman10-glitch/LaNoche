import {normalizeItem} from './vault-store.js';
import {ActionRowBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,PermissionFlagsBits as P,escapeMarkdown} from 'discord.js';
import {DateTime} from 'luxon';
import {createHash} from 'node:crypto';
import {branded} from './embeds.js';
import {parseAmount} from './money-store.js';
import {UserError} from './logic.js';
export const vaultChannel='1561810060462661763';
export const vaultLogChannel='1564634188278267914';
export const vaultOverviewChannel='1564635987160600707';
const isMoney=kind=>['wit','zwart'].includes(kind);
const leadRole='1553521476378824796';
const active=new Set();
export function vaultPayload({action,kind,date,amount,reason,actor,item}) {
  const added=action==='add';
  const payload=branded(added?'🟢 TOEGEVOEGD AAN KLUIS':'🔴 VERWIJDERD UIT KLUIS',
    `📅 **${date}** · **${added?'+':'−'} ${isMoney(kind)?'$ ':''}${amount.toLocaleString('nl-NL')}** · ${isMoney(kind)?(kind==='zwart'?'⚫ Zwart geld':'⚪ Wit geld'):escapeMarkdown(item)}\n📝 **Waarvoor:** ${escapeMarkdown(reason)}\n👤 **Door:** <@${actor}>`,[],'ticket-banner.gif','ticket-logo.gif');
  payload.embeds[0].setAuthor(null).setTimestamp(null).setFooter({text:'LA NOCHE • Kluisregistratie'});
  return payload;
}
export function vaultInput(fields,kind='wit') {
  const date=fields.getTextInputValue('datum').trim();
  const parsed=DateTime.fromFormat(date,'dd/MM/yyyy',{zone:'Europe/Amsterdam'});
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(date) || !parsed.isValid || parsed.toFormat('dd/MM/yyyy')!==date)throw new UserError('Vul een geldige datum in als DD/MM/YYYY, bijvoorbeeld 27/10/2026.');
  let raw=fields.getTextInputValue('bedrag').trim();
  if(isMoney(kind) && /^\d+(?:[.,]\d{1,3})?\s*k$/i.test(raw))raw=String(Number(raw.replace(/\s*k$/i,'').replace(',','.'))*1000);
  if(isMoney(kind) && /^\d{1,3}(?:,\d{3})+$/.test(raw))raw=raw.replaceAll(',','');
  if(!isMoney(kind) && !/^\d+$/.test(raw))throw new UserError('Vul een positief heel aantal in.');
  const amount=parseAmount(raw);
  const reason=fields.getTextInputValue('waarvoor').trim();
  if(!reason || reason.length>500)throw new UserError('Vul waarvoor de boeking is in (maximaal 500 tekens).');
  return {date,amount,reason,...(isMoney(kind)?{}:{item:normalizeItem(fields.getTextInputValue('voorwerp'))})};
}
export async function handleVault(i,guildId,store) {
  const reply=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!i.inGuild() || i.guildId!==guildId)return reply('Dit command hoort bij La Noche.');
  if(i.channelId!==vaultChannel)return reply(`Gebruik /kluis alleen in <#${vaultChannel}>.`);
  const modal=i.isModalSubmit();
  if(modal)await i.deferReply({flags:MessageFlags.Ephemeral});
  const respond=content=>modal?i.editReply({content,allowedMentions:{parse:[]}}):reply(content);
  const member=await i.guild.members.fetch({user:i.user.id,force:true});
  if(!member.roles.cache.has(leadRole))return respond('Alleen leden met de leidingrol kunnen kluisboekingen registreren.');
  const [,modalAction,modalKind,nonce]=(i.customId||'').split(':');
  const action=modal?modalAction:i.options.getString('actie',true);
  const kind=modal?modalKind:i.options.getString('soort',true);
  if(!['add','remove'].includes(action) || !['zwart','wit','wapen','munitie','voorraad'].includes(kind))return respond('Kies een actie en soort via /kluis.');
  if(!modal) {
    const form=new ModalBuilder().setCustomId(`ln-vault:${action}:${kind}:${i.id}`).setTitle(`${action==='add'?'Toevoegen':'Verwijderen'} • ${kind}`);
    for(const [id,label,style,max,placeholder] of [
      ['datum','Datum (DD/MM/YYYY)',TextInputStyle.Short,10,'27/10/2026'],
      ['bedrag',isMoney(kind)?'Bedrag':'Aantal',TextInputStyle.Short,40,isMoney(kind)?'Bijvoorbeeld 350k of 1 miljoen':'Bijvoorbeeld 2'],
      ...(!isMoney(kind)?[['voorwerp','Welk voorwerp?',TextInputStyle.Short,30,'Bijvoorbeeld mes, pistol of 9mm kogel']]:[]),
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
    const input=vaultInput(i.fields,kind);
    store.initializeVault(i.guildId);
    store.bookVault(key,i.guildId,{...input,action,kind,actor:i.user.id,time:Date.now()});
    let posted=true,logged=true,synced=true;
    try {await flushVaultPosts(i.guild,store);}catch(e){posted=false;console.error('Kluisbericht plaatsen mislukt',e.code??e.name);}
    try {await syncVault(i.guild,store);}catch(e){synced=false;console.error('Kluisoverzicht bijwerken mislukt',e.code??e.name);}
    try {await flushVaultLogs(i.guild,store);}catch(e){logged=false;console.error('Kluislog plaatsen mislukt',e.code??e.name);}
    return respond(`Kluisboeking opgeslagen.${store.getMeta(key)?'\n'+store.getMeta(key):''}${posted&&logged&&synced?'':'\nNog niet geplaatste berichten en het overzicht worden automatisch opnieuw geprobeerd.'}`);
  } catch(e) {
    if(e instanceof UserError)return respond(e.message);
    throw e;
  } finally {active.delete(key);}
}


const logRuns=new Map();
export function flushVaultLogs(guild,store) {
  if(logRuns.has(guild.id))return logRuns.get(guild.id);
  const run=(async()=>{
    const pending=store.pendingVaultLogs(guild.id);
    if(!pending.length)return;
    const channel=await guild.channels.fetch(vaultLogChannel);
    if(!channel?.send)throw new UserError('Het kluislogkanaal ontbreekt.');
    for(const entry of pending) {
      const payload=vaultPayload(entry);
      payload.embeds[0].setTitle(entry.action==='add'?'📋 KLUISLOG • TOEGEVOEGD':'📋 KLUISLOG • VERWIJDERD')
        .setFooter({text:'LA NOCHE • Kluislog'}).setTimestamp(entry.time)
        .addFields({name:'Registratie',value:`[Bekijk het kluisbericht](${entry.url})`,inline:false});
      payload.nonce=createHash('sha256').update(`log:${entry.id}`).digest('hex').slice(0,24);payload.enforceNonce=true;
      const message=await channel.send(payload);
      store.markVaultLogged(entry.id,message.id);
    }
  })();
  logRuns.set(guild.id,run);
  return run.finally(()=>{logRuns.delete(guild.id);});
}

const postRuns=new Map();
export function flushVaultPosts(guild,store) {
 if(postRuns.has(guild.id))return postRuns.get(guild.id);
 const run=(async()=>{
  const pending=store.pendingVaultPosts(guild.id);
  if(!pending.length)return;
  const channel=await guild.channels.fetch(vaultChannel);
  const send=channel?.isThread()?P.SendMessagesInThreads:P.SendMessages;
  if(!channel?.send || !channel.permissionsFor(guild.members.me)?.has([P.ViewChannel,send,P.EmbedLinks,P.AttachFiles]))throw new UserError('Ik mis rechten voor het kluiskanaal.');
  for(const entry of pending) {
   const payload=vaultPayload(entry);
   payload.nonce=createHash('sha256').update(entry.id).digest('hex').slice(0,24);payload.enforceNonce=true;
   const message=await channel.send(payload);
   store.recordVault(entry.id,guild.id,{...entry,url:message.url});
  }
 })();
 postRuns.set(guild.id,run);
 return run.finally(()=>postRuns.delete(guild.id));
}
const overviewTitle='🏦 LA NOCHE • KLUIS';
export function vaultOverviewPayload(store,guild) {
 const balances=store.vaultBalances(guild);
 const fields=['wit','zwart'].map(kind=>({name:kind==='wit'?'⚪ WIT GELD':'⚫ ZWART GELD',value:`**$ ${(balances.find(b=>b.kind===kind)?.amount??0).toLocaleString('nl-NL')}**`,inline:true}));
 for(const [kind,title] of [['wapen','🔫 WAPENS'],['munitie','📦 MUNITIE'],['voorraad','🌿 OVERIGE VOORRAAD']]) {
  const lines=balances.filter(b=>b.kind===kind && b.amount>0).map(b=>`**${b.amount.toLocaleString('nl-NL')}×** ${escapeMarkdown(b.item)}`);
  let block='';let part=0;
  for(const line of lines) {
   if(block.length+line.length+1>1000){fields.push({name:title+(part++?' • vervolg':''),value:block,inline:false});block='';}
   block+=(block?'\n':'')+line;
  }
  fields.push({name:title+(part?' • vervolg':''),value:block||'Geen voorraad',inline:false});
 }
 const payload=branded(overviewTitle,`**De actuele inhoud van onze kluis**\nBoek toevoegen of verwijderen via **/kluis** in <#${vaultChannel}>.`,fields,'ticket-banner.gif','ticket-logo.gif');
 payload.embeds[0].setFooter({text:'LA NOCHE • Live kluisoverzicht'});
 return payload;
}
const overviewRuns=new Map();
export function syncVault(guild,store) {
 const previous=overviewRuns.get(guild.id)??Promise.resolve();
 const run=previous.catch(()=>{}).then(async()=>{
  store.initializeVault(guild.id);
  const channel=await guild.channels.fetch(vaultOverviewChannel);
  if(!channel?.send)throw new UserError('Het kluisoverzichtkanaal ontbreekt.');
  const key=`vault-panel:${guild.id}`;
  let message;const id=store.getMeta(key);
  if(id)try{message=await channel.messages.fetch(id);}catch(e){if(e.code!==10008)throw e;}
  if(!message) {
   let before;
   for(;;) {
    const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
    message=[...page.values()].find(m=>m.author.id===guild.client.user.id && m.embeds.some(e=>e.title===overviewTitle));
    if(message || page.size<100)break;
    before=page.last().id;
   }
  }
  const payload=vaultOverviewPayload(store,guild.id);
  if(message) {
   const logo=message.attachments?.find(a=>a.name==='ticket-logo.gif');
   const banner=message.attachments?.find(a=>a.name==='ticket-banner.gif');
   if(logo && banner){delete payload.files;payload.embeds[0].setAuthor({name:'LA NOCHE • OFFICIEEL',iconURL:logo.url}).setThumbnail(logo.url).setImage(banner.url);}
   else payload.attachments=[];
   await message.edit(payload);
  }else message=await channel.send(payload);
  store.setMeta(key,message.id);
 });
 overviewRuns.set(guild.id,run);
 return run.finally(()=>{if(overviewRuns.get(guild.id)===run)overviewRuns.delete(guild.id);});
}
