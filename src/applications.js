import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { settings } from './settings.js';
export const ticketChannelUrl='https://discord.com/channels/1311580149094809650/1553516379921973329';
export function applicationTicketLink() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open een sollicitatieticket').setEmoji('🎫').setURL(ticketChannelUrl));
}
export async function syncApplicationLinks(guild,store) {
  const saved=store.panel(guild.id);
  const channels=new Set([settings.channels.sollistatus,saved?.channel].filter(Boolean));
  const result={updated:0,failed:0};
  for(const id of channels) {
    try {
      const channel=await guild.channels.fetch(id);
      if(!channel?.messages) continue;
      let before;
      do {
        const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
        if(!page.size) break;
        for(const message of page.values()) {
          if(message.author?.id!==guild.client.user.id || !message.embeds.some(e=>e.title==='✦ SOLLICITATIES ZIJN GEOPEND')) continue;
          if(message.components.some(row=>row.components.some(c=>c.url===ticketChannelUrl))) continue;
          try {
            // Edit only components: preserve content, images, attachments and status.
            const rows=message.components.map(row=>row.toJSON());
            if(rows.length>=5) {result.failed++;continue;}
            await message.edit({components:[...rows,applicationTicketLink()],allowedMentions:{parse:[]}});
            result.updated++;
          } catch { result.failed++; }
        }
        const next=page.last().id;
        if(next===before || page.size<100) break;
        before=next;
      } while(true);
    } catch { result.failed++; }
  }
  return result;
}
