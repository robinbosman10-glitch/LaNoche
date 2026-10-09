import {branded,field} from './embeds.js';
export const rulesChannel='1374423843007103097';
const title='📜 LA NOCHE • REGELS';
// Alle regels staan samen in één embed. Pas de tekst hier aan.
export function rulesPayload(){
 const payload=branded(title,'Samen houden we La Noche respectvol, veilig en overzichtelijk. Lees de onderstaande regels goed door.',[
  
  field('🤝 DISCORD REGELS',[
   
   '**🤝 Respecteer elkaar.** Behandel alle leden met respect en vriendelijkheid. Geen beledigingen, discriminatie, pesten of ongewenst gedrag.',
   '**🛡️ Geen schadelijke inhoud.** Plaats geen virussen, malware of schadelijke links.',
   '**🚫 Geen spam.** Vermijd spammen, overmatige hoofdletters of herhaaldelijk dezelfde berichten sturen.',
   '**🔞 Geen NSFW-inhoud.** Geen expliciete of ongepaste inhoud, zoals naaktheid, seksuele inhoud of gewelddadige afbeeldingen.',
   '**📢 Geen reclame zonder toestemming.** Geen zelfpromotie of reclame zonder toestemming van de beheerders.'
  ].join('\n\n'),false),
  
  field('📌 KANAALSPECIFIEKE REGELS',[
  
   '**🎯 Houd het relevant.** Gebruik de juiste kanalen voor de bijpassende gesprekken en onderwerpen.',
   '**📌 Geen dubbele posts.** Plaats niet dezelfde boodschap in meerdere kanalen.'
  ].join('\n\n'),false),
  
  field('🎙️ VOICE CHAT REGELS',[
   
   '**🙊 Niet onderbreken.** Val anderen niet in de rede en wacht op je beurt om te spreken.',
   '**🔇 Geen storende achtergrondgeluiden.** Zorg voor een rustige omgeving zonder afleidende geluiden.',
   '**🎭 Geen stemvervorming zonder toestemming.** Gebruik geen voice changers zonder akkoord van de andere deelnemers.'
  ].join('\n\n'),false)
 ],'ticket-banner.gif','ticket-logo.gif');
 payload.content='';
 return payload;
}
const busy=new Set();
export async function syncRules(guild,store){
 if(busy.has(guild.id))return;busy.add(guild.id);
 try{
  const channel=await guild.channels.fetch(rulesChannel);
  if(!channel?.send)throw new Error('Regelkanaal ontbreekt');
  const key=`rules:${guild.id}:${rulesChannel}`;
  const saved=store.getMeta(key);let message;
  if(saved){try{message=await channel.messages.fetch(saved);}catch(error){if(error.code!==10008)throw error;}}
  // Recover an already sent post if the process stopped before its ID was saved.
  if(!message){let before;do{
   const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
   message=[...page.values()].find(m=>m.author?.id===guild.client.user.id && m.embeds.some(e=>[title,'Discord Regels'].includes(e.title)));
   if(message||page.size<100)break;
   const next=page.last().id;if(next===before)break;before=next;
  }while(true);}
  const payload=rulesPayload();
  if(message)await message.edit({...payload,attachments:[]});
  else message=await channel.send(payload);
  store.setMeta(key,message.id);
 }finally{busy.delete(guild.id);}
}
