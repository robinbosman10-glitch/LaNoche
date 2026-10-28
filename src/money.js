import {webOnlyLogs,deliverLogsToWebsite} from './log-destination.js';
import {createHash} from 'node:crypto';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,StringSelectMenuBuilder,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags,PermissionFlagsBits as P} from 'discord.js';
import {branded,field} from './embeds.js';
import {UserError} from './logic.js';
import {parseAmount,pots,shares} from './money-store.js';
export const moneyChannel='1563644518991925318';
export const moneyLogChannel='1564621640271265792';
export const moneyResetRole='1399490155194220614';
export const moneyRole='1553521476378824796';
const title='💰 LA NOCHE • POTJES';
const names={gang:'🏦 Gang pot',drugs:'🌿 Drugs pot',wapens:'🔫 Wapen pot'};
const format=n=>'$ '+n.toLocaleString('nl-NL');
const row=component=>new ActionRowBuilder().addComponents(component);
const syncs=new Map();
export function moneyPayload(store,guild) {
  const balances=store.moneyBalances(guild);
  const balance=(kind,pot)=>balances.find(b=>b.kind===kind && b.pot===pot)?.amount??0;
  const fields=['zwart','wit'].map(kind=>field(kind==='zwart'?'⚫ ZWART GELD':'⚪ WIT GELD',
    pots.map(pot=>`${names[pot]}\n**${format(balance(kind,pot))}**`).join('\n\n')+
    `\n\n**TOTAAL ${kind.toUpperCase()}**\n**${format(pots.reduce((n,p)=>n+balance(kind,p),0))}**`,true));
  fields.push(field('📊 VERDELING BIJ TOEVOEGEN',
    `**Zwart** · Gang ${shares.zwart[0]}% · Drugs ${shares.zwart[1]}% · Wapens ${shares.zwart[2]}%\n**Wit** · Gang ${shares.wit[0]}% · Drugs ${shares.wit[1]}% · Wapens ${shares.wit[2]}%`,false));
  const payload=branded(title,'Alle saldo’s op één plek. Beheer de potjes via de knop hieronder of **/geld**.',fields,'ticket-banner.gif','ticket-logo.gif');
  payload.embeds[0].setFooter({text:'LA NOCHE • Automatisch bijgewerkt'});
  payload.components=[row(new ButtonBuilder().setCustomId('ln-money:start').setLabel('Geld beheren').setEmoji('💰').setStyle(ButtonStyle.Primary))];
  return payload;
}
export function syncMoney(guild,store) {
  const previous=syncs.get(guild.id)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    const channel=await guild.channels.fetch(moneyChannel);
    if(!channel?.send) throw new UserError('Het potjeskanaal ontbreekt.');
    const key=`money-panel:${guild.id}`;
    let message;const id=store.getMeta(key);
    if(id) {try{message=await channel.messages.fetch(id);}catch(e){if(e.code!==10008)throw e;}}
    if(!message) {
      // Recover a bot-owned panel if sending succeeded before its ID was saved.
      let before;
      for(;;) {
        const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
        message=[...page.values()].find(m=>m.author.id===guild.client.user.id && m.embeds.some(e=>e.title===title));
        if(message || page.size<100)break;
        before=page.last().id;
      }
    }
    const payload=moneyPayload(store,guild.id);
    if(message) {
      const logo=message.attachments?.find(a=>a.name==='ticket-logo.gif');
      const banner=message.attachments?.find(a=>a.name==='ticket-banner.gif');
      if(logo && banner) {delete payload.files;payload.embeds[0].setAuthor({name:'LA NOCHE • OFFICIEEL',iconURL:logo.url}).setThumbnail(logo.url).setImage(banner.url);}
      else payload.attachments=[];
      await message.edit(payload);
    } else message=await channel.send(payload);
    store.setMeta(key,message.id);
  });
  syncs.set(guild.id,next);
  return next.finally(()=>{if(syncs.get(guild.id)===next)syncs.delete(guild.id);});
}
function selection() {
  return {content:'**Welke geldsoort wil je beheren?**',components:[row(new StringSelectMenuBuilder().setCustomId('ln-money:kind').setPlaceholder('Kies zwart of wit geld').addOptions({label:'Zwart geld',value:'zwart',emoji:'⚫'},{label:'Wit geld',value:'wit',emoji:'⚪'}))]};
}
function amountModal(i,kind,action,pot='all') {
  return i.showModal(new ModalBuilder().setCustomId(`ln-money:amount:${kind}:${action}:${pot}:${i.id}`).setTitle(`${action==='add'?'Toevoegen':'Verwijderen'} • ${kind} geld`)
    .addComponents(row(new TextInputBuilder().setCustomId('bedrag').setLabel('Bedrag').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setPlaceholder('Bijvoorbeeld 1000000 of 1 miljoen'))));
}
async function handleMoneyReset(i,guildId,store) {
  const respond=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!i.inGuild() || i.guildId!==guildId)return respond('Dit command hoort bij La Noche.');
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const member=await i.guild.members.fetch({user:i.user.id,force:true});
  if(!member.roles.cache.has(moneyResetRole))return i.editReply({content:'Alleen de aangewezen resetrol kan potjes resetten.'});
  if(i.commandName==='geldreset')return i.editReply({content:'**Welke geldsoort wil je resetten?**',components:[row(new StringSelectMenuBuilder().setCustomId('ln-money:reset-kind').setPlaceholder('Kies zwart of wit geld').addOptions({label:'Zwart geld',value:'zwart',emoji:'⚫'},{label:'Wit geld',value:'wit',emoji:'⚪'}))]});
  if(i.customId==='ln-money:reset-kind') {
    const selected=i.values?.[0];
    if(!['zwart','wit'].includes(selected))return i.editReply({content:'Kies zwart of wit geld via /geldreset.'});
    return i.editReply({content:`**${selected==='zwart'?'⚫ Zwart':'⚪ Wit'} geld resetten** — kies een potje.\n**Eén potje:** alleen de gekozen geldsoort.\n**Alles:** alle potjes, zwart én wit. Percentages blijven hetzelfde.`,components:[row(new StringSelectMenuBuilder().setCustomId(`ln-money:reset-select:${selected}`).setPlaceholder('Kies een potje of Alles').addOptions(...pots.map(p=>({label:names[p],value:p})),{label:'Alles',description:'Alle potjes resetten: zwart én wit geld',value:'all',emoji:'🔄'}))]});
  }
  const pot=i.values?.[0];
  const kind=i.customId?.split(':')[2];
  if(!['ln-money:reset-select:zwart','ln-money:reset-select:wit'].includes(i.customId) || (pot!=='all' && !pots.includes(pot)))return i.editReply({content:'Kies geldsoort en potje via /geldreset.'});
  const changed=store.resetMoney({guild:i.guildId,actor:i.user.id,id:`money-reset:${i.guildId}:${i.id}`,pot,kind});
  void flushMoneyLogs(i.guild,store).catch(e=>console.error('Resetlog plaatsen mislukt',e.code??e.name));
  let synced=true;
  try{await syncMoney(i.guild,store);}catch(e){synced=false;console.error('Potjes na reset bijwerken mislukt',e.code??e.name);}
  return i.editReply({content:`${changed?`${pot==='all'?'Alle potjes':names[pot]}: ${pot==='all'?'zwart en wit geld staan':`${kind} geld staat`} op 0. De percentages zijn behouden.`:'Deze reset was al verwerkt.'}${synced?'':' De reset is opgeslagen; het overzicht wordt automatisch opnieuw bijgewerkt.'}`,allowedMentions:{parse:[]}});
}
export async function handleMoney(i,guildId,store) {
  if(i.commandName==='geldreset' || i.customId?.startsWith('ln-money:reset'))return handleMoneyReset(i,guildId,store);
  const respond=content=>i.reply({content,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!i.inGuild() || i.guildId!==guildId) return respond('Dit paneel hoort bij La Noche.');
  // Recheck the actual role on every action, including modal submission.
  const member=await i.guild.members.fetch({user:i.user.id,force:true});
  if(!member.roles.cache.has(moneyRole)) return respond('Alleen leden met de leidingrol kunnen geld beheren.');
  try {
    const [,step,kind,action,pot,nonce]=(i.customId||'ln-money:start').split(':');
    if(step==='start') return i.reply({...selection(),flags:MessageFlags.Ephemeral});
    if(step==='kind') {
      const selected=i.values[0];if(!shares[selected])throw new UserError('Kies zwart of wit geld.');
      return i.update({content:`**${selected==='zwart'?'⚫ Zwart':'⚪ Wit'} geld** — wat wil je doen?`,components:[new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ln-money:action:${selected}:add`).setLabel('Toevoegen').setEmoji('➕').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ln-money:action:${selected}:remove`).setLabel('Verwijderen').setEmoji('➖').setStyle(ButtonStyle.Danger))]});
    }
    if(!shares[kind] || !['add','remove'].includes(action))throw new UserError('Ongeldige geldactie. Gebruik /geld opnieuw.');
    if(step==='action') {
      if(action==='add')return amountModal(i,kind,action);
      return i.update({content:`**${kind} geld verwijderen** — kies het potje.`,components:[row(new StringSelectMenuBuilder().setCustomId(`ln-money:pot:${kind}:remove`).setPlaceholder('Uit welk potje?').addOptions(pots.map(p=>({label:names[p],value:p}))))]});
    }
    if(step==='pot' && action==='remove' && pots.includes(i.values?.[0])) return amountModal(i,kind,action,i.values[0]);
    if(step!=='amount' || !nonce || (action==='remove' && !pots.includes(pot)) || (action==='add' && pot!=='all'))throw new UserError('Ongeldig formulier. Gebruik /geld opnieuw.');
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const amount=parseAmount(i.fields.getTextInputValue('bedrag'));
    const changed=store.changeMoney({id:`${i.guildId}:${i.user.id}:${nonce}`,guild:i.guildId,actor:i.user.id,kind,action,amount,pot:action==='remove'?pot:undefined});
    void flushMoneyLogs(i.guild,store).catch(e=>console.error('Geldlog plaatsen mislukt',e.code??e.name));
    let synced=true;
    try {await syncMoney(i.guild,store);}catch(e){synced=false;console.error('Potjes bijwerken mislukt',e.code??e.name);}
    return i.editReply({content:`${changed?`${format(amount)} ${kind} geld ${action==='add'?'toegevoegd en verdeeld':`verwijderd uit ${names[pot]}`}.`:'Deze boeking was al verwerkt; er is niets dubbel geboekt.'}\n${synced?`Het overzicht staat in <#${moneyChannel}>.`:'De boeking is opgeslagen. Het overzicht wordt automatisch opnieuw bijgewerkt; voer deze boeking niet opnieuw in.'}`,allowedMentions:{parse:[]}});
  } catch(e) {
    if(!(e instanceof UserError))throw e;
    if(i.deferred)return i.editReply({content:e.message});
    return respond(e.message);
  }
}


export function moneyLogPayload(t) {
  const opening=t.action==='opening';
  const reset=t.action==='reset';
  const added=t.action==='add';
  const deltas=JSON.parse(t.deltas);
  const payload=branded('💰 LA NOCHE • GELDLOG',
    reset?`🔄 **${t.pot?names[t.pot].toUpperCase():'ALLE POTJES'} OP NUL GEZET**`:opening?'🏁 **BEGINSTAND OVERGENOMEN**':added?'🟢 **GELD TOEGEVOEGD**':'🔴 **GELD VERWIJDERD**',[
      field('💵 BEDRAG',format(t.amount)),
      field('💱 GELDSOORT',t.kind==='zwart'?'⚫ Zwart geld':'⚪ Wit geld'),
      field('👤 UITGEVOERD DOOR',reset && t.actor==='reset'?'Eenmalige reset op verzoek van beheer':opening?'Beginstand uit bestaand overzicht':`<@${t.actor}>`),
      field('📊 BOEKING PER POTJE',pots.map((p,i)=>`${names[p]}: **${deltas[i]<0?'−':'+'}${format(Math.abs(deltas[i]))}**`).join('\n'),false),
      field('🕒 DATUM & TIJD',`<t:${Math.floor(t.time/1000)}:F>`,false)
    ],'ticket-banner.gif','ticket-logo.gif');
  payload.embeds[0].setColor(opening?0xff7900:added?0x2ecc71:0xed4245).setTimestamp(t.time).setFooter({text:`LA NOCHE • Boeking ${t.id}`});
  payload.nonce=createHash('sha256').update(t.id).digest('hex').slice(0,24);
  payload.enforceNonce=true;
  return payload;
}
const logRuns=new Map();
export function flushMoneyLogs(guild,store) {
 if(webOnlyLogs())return deliverLogsToWebsite(guild,store);
  if(logRuns.has(guild.id))return logRuns.get(guild.id);
  const run=(async()=>{
    const resetKey=`money-log-reset-2026-10-27-1:${guild.id}`;
    const reset=store.getMeta(resetKey);
    if(reset && reset!=='done') {
      const channel=await guild.channels.fetch(moneyLogChannel);
      if(!channel?.messages)throw new UserError('Het geldlogkanaal ontbreekt.');
      let before;
      for(;;) {
        const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
        if(!page.size)break;
        const next=page.last().id;
        for(const message of page.values()) {
          if(message.author.id!==guild.client.user.id || message.createdTimestamp>Number(reset) ||
            !message.embeds.some(e=>e.title==='💰 LA NOCHE • GELDLOG'))continue;
          try {await message.delete();}catch(e){if(e.code!==10008)throw e;}
        }
        if(page.size<100 || next===before)break;
        before=next;
      }
      store.setMeta(resetKey,'done');
    }
    const pending=store.pendingMoneyLogs(guild.id);
    if(!pending.length)return;
    const channel=await guild.channels.fetch(moneyLogChannel);
    if(!channel?.send)throw new UserError('Het geldlogkanaal ontbreekt.');
    for(const t of pending) {
      const message=await channel.send(moneyLogPayload(t));
      store.markMoneyLogged(t.id,message.id);
    }
  })();
  logRuns.set(guild.id,run);
  return run.finally(()=>{logRuns.delete(guild.id);});
}
