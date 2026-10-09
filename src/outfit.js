import {AttachmentBuilder,EmbedBuilder} from 'discord.js';
import {fileURLToPath} from 'node:url';
export const outfitChannel='1557782249804529685';
const title='🧥 GANG OUTFIT';
export function outfitPayload(){
 // Use the approved artwork itself: Discord's light theme cannot recolor it.
 const file=new AttachmentBuilder(fileURLToPath(new URL('../assets/gang-outfit.png',import.meta.url)),{name:'gang-outfit.png',description:'La Noche gangoutfit: jas 1111, variant 4, shirt 146. Broek en schoenen naar keuze, volledig zwart.'});
 return {content:'',embeds:[new EmbedBuilder().setColor(0xff7900).setImage('attachment://gang-outfit.png')],files:[file],allowedMentions:{parse:[]}};
}
const busy=new Set();
export async function syncOutfit(guild,store){
 if(busy.has(guild.id))return;busy.add(guild.id);
 try{
  const channel=await guild.channels.fetch(outfitChannel);
  if(!channel?.send)throw new Error('Gangoutfitkanaal ontbreekt');
  const key=`outfit:${guild.id}:${outfitChannel}`;
  const saved=store.getMeta(key);let message;
  if(saved){try{message=await channel.messages.fetch(saved);}catch(error){if(error.code!==10008)throw error;}}
  // Recover an already sent post if the process stopped before its ID was saved.
  if(!message){let before;do{
   const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
   message=[...page.values()].find(m=>m.author?.id===guild.client.user.id && (m.embeds.some(e=>e.title===title) || [...(m.attachments?.values()||[])].some(a=>a.name==='gang-outfit.png')));
   if(message||page.size<100)break;
   const next=page.last().id;if(next===before)break;before=next;
  }while(true);}
  const payload=outfitPayload();
  if(message)await message.edit({...payload,attachments:[]});
  else message=await channel.send(payload);
  store.setMeta(key,message.id);
 }finally{busy.delete(guild.id);}
}
