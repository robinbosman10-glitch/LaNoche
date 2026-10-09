import {branded,field} from './embeds.js';
export const outfitChannel='1557782249804529685';
const title='🧥 GANG OUTFIT';
export function outfitPayload(){
 const payload=branded(title,'**Eén familie. Eén uitstraling.**\n\nDit is de officiële outfit van La Noche. Hieronder vind je alle kledingnummers.',[
  field('🧥 JAS','**1111**'),field('🎨 VARIANT','**4**'),field('👕 SHIRT','**146**'),
  field('👖 BROEK & SCHOENEN','**Broek:** eigen keuze, volledig zwart.\n**Schoenen:** eigen keuze, volledig zwart.',false)
 ],'ticket-banner.gif','ticket-logo.gif');
 payload.content='';
 payload.embeds[0].setFooter({text:'LA NOCHE • Gangoutfit'});
 return payload;
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
