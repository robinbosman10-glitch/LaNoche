import { getMembers } from './member-cache.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { settings } from './settings.js';
import { branded } from './embeds.js';
import { UserError } from './logic.js';
const busy = new Set();
export function listDescriptions(members, ranks) {
  const blocks = [];
  for (const id of [...ranks].reverse()) {
    const names = [...members.values()].filter(m=>!m.user.bot && m.roles.cache.has(id)).sort((a,b)=>a.displayName.localeCompare(b.displayName,'nl')).map(m=>`<@${m.id}>`);
    if (!names.length) blocks.push(`### <@&${id}>\n*Geen Leden op de rang!*`);
    else for (let n=0;n<names.length;n+=60) blocks.push(`### <@&${id}>${n ? ' (vervolg)' : ` • ${names.length}`}\n${names.slice(n,n+60).join('\n')}`);
  }
  const pages = []; let page = '';
  for (const block of blocks) {
    if ((page+'\n\n'+block).length > 3400) { pages.push(page); page=''; }
    page += (page?'\n\n':'')+block;
  }
  if (page) pages.push(page);
  return pages;
}
export async function updateMemberlist(guild, store, requestedChannel) {
  if (busy.has(guild.id)) throw new UserError('De ledenlijst wordt al bijgewerkt.');
  busy.add(guild.id);
  try {
    let saved = store.list(guild.id);
    if (!saved && !requestedChannel) return;
    const channelId = settings.channels.ledenlijst;
    if (saved?.channel !== channelId) saved = null;
    const channel = await guild.channels.fetch(channelId);
    const send = channel?.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
    if (!channel?.send || !channel.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel,send,PermissionFlagsBits.EmbedLinks,PermissionFlagsBits.AttachFiles,PermissionFlagsBits.ReadMessageHistory])) throw new UserError('Ik mis rechten in het ledenlijst-kanaal (inclusief berichtgeschiedenis lezen).');
    const members = await getMembers(guild);
    await guild.roles.fetch();
    if (settings.ranks.some(id=>!guild.roles.cache.has(id))) throw new UserError('Eén of meer ingestelde gangrangen bestaan niet in deze server.');
    const pages = listDescriptions(members,settings.ranks);
    const ids = [...(saved?.messages || [])];
    for (let index=0;index<pages.length;index++) {
      const title = `✦ LA NOCHE • LEDENLIJST ${pages.length>1 ? `${index+1}/${pages.length}` : ''}`;
      const payload = index===0 ? branded(title,pages[index]) : {embeds:[new EmbedBuilder().setColor(0xff7900).setTitle(title).setDescription(pages[index]).setFooter({text:'La Noche • Automatisch bijgewerkt'}).setTimestamp()],allowedMentions:{parse:[]}};
      let message;
      if(ids[index]) {
        try { message = await channel.messages.fetch(ids[index]); }
        catch(error) { if(error.code!==10008) throw error; }
      }
      if(message) {
        if(index===0) {
          // Preserve uploaded attachments instead of re-uploading the banner every five minutes.
          const old = message.attachments;
          const logo = old.find(a=>a.name==='logo.png');
          const banner = old.find(a=>a.name==='banner.png');
          if(logo && banner) { delete payload.files; payload.embeds[0].setAuthor({name:'LA NOCHE • OFFICIEEL',iconURL:logo.url}).setThumbnail(logo.url).setImage(banner.url); }
          else payload.attachments=[];
        }
        await message.edit(payload);
      } else { message = await channel.send(payload); ids[index]=message.id; store.setList(guild.id,channel.id,ids); }
    }
    for(const id of ids.slice(pages.length)) {
      try { await channel.messages.delete(id); } catch(error) { if(error.code!==10008) throw error; }
    }
    store.setList(guild.id,channel.id,ids.slice(0,pages.length));
    return `https://discord.com/channels/${guild.id}/${channel.id}/${ids[0]}`;
  } finally { busy.delete(guild.id); }
}
