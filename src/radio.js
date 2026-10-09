import {branded,field} from './embeds.js';
export const radioChannel='1557478436484808776';
const title='📡 PORTO FREQUENTIE';
export function radioPayload(){
 const payload=branded(title,'**Eén familie. Eén verbinding.**\n\nBlijf in contact met La Noche. Stel je porto in op de onderstaande frequentie.',[
  field('📻 FREQUENTIE','**943**',false),
  field('🎙️ COMMUNICATIE','Houd de porto duidelijk en overzichtelijk. Laat elkaar uitpraten en geef belangrijke meldingen voorrang.',false)
 ],'ticket-banner.gif','ticket-logo.gif');
 payload.content='';
 return payload;
}
const busy=new Set();
export async function syncRadio(guild,store){
 if(busy.has(guild.id))return;busy.add(guild.id);
 try{
  const channel=await guild.channels.fetch(radioChannel);
  if(!channel?.send)throw new Error('Portokanaal ontbreekt');
  const key=`radio:${guild.id}:${radioChannel}`;
  const saved=store.getMeta(key);let message;
  if(saved){try{message=await channel.messages.fetch(saved);}catch(error){if(error.code!==10008)throw error;}}
  // Recover an already sent post if the process stopped before its ID was saved.
  if(!message){let before;do{
   const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
   message=[...page.values()].find(m=>m.author?.id===guild.client.user.id && m.embeds.some(e=>e.title===title));
   if(message||page.size<100)break;
   const next=page.last().id;if(next===before)break;before=next;
  }while(true);}
  const payload=radioPayload();
  if(message)await message.edit({...payload,attachments:[]});
  else message=await channel.send(payload);
  store.setMeta(key,message.id);
 }finally{busy.delete(guild.id);}
}
