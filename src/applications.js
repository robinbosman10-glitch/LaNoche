import {branded} from './embeds.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { settings } from './settings.js';
export const applicationFields=[
 {name:'Dit vragen wij van jullie;',value:[
  '🔞 **Minimaal 16 jaar**',
  '🎙️ **Actief in de call**',
  '🎮 **Actief ingame**',
  '💰 **Bereid om te werken voor je geld**',
  '🤝 **Betrouwbaar en loyaal**',
  '🧠 **Volwassen en serieus gedrag**',
  '👊 **Respect voor iedereen binnen de familie**',
  '🔥 **Bereid om jezelf te bewijzen**'
 ].map(line=>'• '+line).join('\n'),inline:false},
 {name:'Interesse?',value:'**Denk je dat je dit kunt? Maak dan zeker een ticket aan!**\nKlik hieronder op **Open een sollicitatieticket** en kies **Sollicitaties**.',inline:false}
];
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
          const hasLink=message.components.some(row=>row.components.some(c=>c.url===ticketChannelUrl));
          const target=message.embeds.find(e=>e.title==='✦ SOLLICITATIES ZIJN GEOPEND');
          const attached=[...(message.attachments?.values()||[])];
          const mediaReady=attached.length===2 && ['ticket-logo.gif','ticket-banner.gif'].every(name=>attached.some(a=>a.name===name)) && target.thumbnail?.url?.includes('/ticket-logo.gif') && target.image?.url?.includes('/ticket-banner.gif') && target.author?.iconURL?.includes('/ticket-logo.gif');
          const embeds=message.embeds.map(embed=>{
            const data=embed.toJSON?embed.toJSON():{...embed};
            if(data.title!=='✦ SOLLICITATIES ZIJN GEOPEND')return data;
            data.fields=[...applicationFields,...(data.fields||[]).filter(f=>!['Wat we zoeken','Dit vragen wij van jullie;','Interesse?'].includes(f.name))];
            return data;
          });
          const changed=message.embeds.some((e,n)=>JSON.stringify(e.fields||[])!==JSON.stringify(embeds[n].fields||[]));
          if(hasLink && !changed && mediaReady)continue;
          try {
            // Replace old loose attachments and point all embed images at the two GIFs.
            const media=branded(target.title,target.description||' ',[],'ticket-banner.gif','ticket-logo.gif');
            for(const data of embeds){
              if(data.title!==target.title)continue;
              data.thumbnail={url:'attachment://ticket-logo.gif'};
              data.image={url:'attachment://ticket-banner.gif'};
              data.author={name:data.author?.name||'LA NOCHE • OFFICIEEL',icon_url:'attachment://ticket-logo.gif'};
            }
            const payload={embeds,attachments:[],files:media.files,allowedMentions:{parse:[]}};
            if(!hasLink){
              const rows=message.components.map(row=>row.toJSON());
              if(rows.length>=5){result.failed++;continue;}
              payload.components=[...rows,applicationTicketLink()];
            }
            await message.edit(payload);
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
