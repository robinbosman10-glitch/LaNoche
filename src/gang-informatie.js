import {branded,field} from './embeds.js';
export const gangInformationChannel='1553516798169849916';
const title='🟠 GANG INFORMATIE';
// Pas de tekst hieronder aan om het bestaande informatiebericht bij de volgende start bij te werken.
export const familySuffix='𝓭𝓮 𝓵𝓪 𝓝𝓸𝓬𝓱𝓮';
export function gangInformationPayload(){
 const payload=branded(title,'**Eén familie. Eén naam.**\n\nAls lid van La Noche draag je de familienaam achter je eigen naam. Zo zijn we herkenbaar als één familie.',[
  field('✍️ ACHTER JE NAAM',`Kopieer deze toevoeging:\n\n${familySuffix}`,false),
  field('📍 WAAR PAS JE DIT AAN?','Zet de toevoeging achter je naam in **de La Noche Discord én de OW Discord**.',false),
  field('👤 VOORBEELD',`JouwNaam ${familySuffix}`,false)
 ],'ticket-banner.gif','ticket-logo.gif');
 payload.content='';
 payload.embeds[0].setFooter({text:'LA NOCHE • Loyaliteit. Respect. Familie.'});
 return payload;
}
const busy=new Set();
export async function syncGangInformation(guild,store){
 if(busy.has(guild.id))return;busy.add(guild.id);
 try{
  const channel=await guild.channels.fetch(gangInformationChannel);
  if(!channel?.send)throw new Error('Ganginformatiekanaal ontbreekt');
  const key=`gang-information:${guild.id}:${gangInformationChannel}`;
  const saved=store.getMeta(key);let message;
  if(saved){try{message=await channel.messages.fetch(saved);}catch(error){if(error.code!==10008)throw error;}}
  // Recover an already sent post if the process stopped before its ID was saved.
  if(!message){let before;do{
   const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
   message=[...page.values()].find(m=>m.author?.id===guild.client.user.id && m.embeds.some(e=>e.title===title));
   if(message||page.size<100)break;
   const next=page.last().id;if(next===before)break;before=next;
  }while(true);}
  const payload=gangInformationPayload();
  if(message)await message.edit({...payload,attachments:[]});
  else message=await channel.send(payload);
  store.setMeta(key,message.id);
 }finally{busy.delete(guild.id);}
}
