const alphabet='abcdefghijklmnopqrstuvwxyz';
const letters=[...'ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ'];
export function styledChannelName(label,emoji) {
 const text=label.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,'-');
 return `${emoji}┃${[...text].map(c=>alphabet.includes(c)?letters[alphabet.indexOf(c)]:c).join('')}`;
}
export const channelNames=new Map([
 ['1564621640271265792',styledChannelName('geld-logs','💰')],
 ['1564635987160600707',styledChannelName('kluis-overzicht','🏦')],
 ['1564634188278267914',styledChannelName('kluis-logs','📋')],
 ['1420469739725000744',styledChannelName('ticket-logs','🎫')],
 ['1557653747654729748',styledChannelName('afwezigheid-logs','📅')],
 ['1564776832690298920',null],
 ['1564654956185780234',styledChannelName('perm-blacklist-logs','⛔')]
]);
function preserveLabel(name) {
 const emoji=name.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u)?.[0]??'📋';
 const label=name.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu,'').replace(/^[\s┃│|》【】\-]+/u,'').trim();
 if(!label)throw new Error('Kanaalnaam bevat geen herkenbare tekst');
 return styledChannelName(label,emoji);
}
const runs=new Map();
export function syncChannelNames(guild,store) {
 if(runs.has(guild.id))return runs.get(guild.id);
 const run=(async()=>{
  const errors=[];
  for(const [id,name] of channelNames) {
   const key=`channel-style-2026-10-28:${guild.id}:${id}`;
   if(store.getMeta(key))continue;
   try {
    const channel=await guild.channels.fetch(id);
    if(!channel?.setName)throw new Error(`Kanaal ${id} ontbreekt`);
    const desired=name??preserveLabel(channel.name);
    if(channel.name!==desired)await channel.setName(desired,'Kanaalnaam opgemaakt op verzoek van beheer');
    store.setMeta(key,desired);
   }catch(error){errors.push(error);}
  }
  if(errors.length)throw errors[0];
 })();runs.set(guild.id,run);return run.finally(()=>runs.delete(guild.id));
}
