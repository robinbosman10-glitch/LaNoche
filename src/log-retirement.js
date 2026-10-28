import {webOnlyLogs,retiredLogChannels,retiredOperationalChannels} from './log-destination.js';
import {classifyLog} from './logsite-store.js';
const targetGuild='1311580149094809650';
export const retirementKey=guild=>`discord-log-retirement:2026-10-28:${guild}`;
export const operationalRetirementKey=guild=>`discord-operational-retirement:2026-10-28:${guild}`;
async function downloadAttachment(url){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(parsed.hostname))throw new Error('Onbekende bijlagehost; kanaal blijft behouden.');
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok||Number(r.headers.get('content-length'))>25*1024*1024)throw new Error('Bijlage kon niet veilig worden bewaard; kanaal blijft behouden.');
 const parts=[];let size=0;for await(const part of r.body){size+=part.length;if(size>25*1024*1024)throw new Error('Bijlage te groot; kanaal blijft behouden.');parts.push(part);}return Buffer.concat(parts);
}
export function createLogRetirement(guild,store,{download=downloadAttachment,operational=false}={}){
 let busy=false;const targets=operational?retiredOperationalChannels:retiredLogChannels,key=operational?operationalRetirementKey:retirementKey;
 return async()=>{
  if(busy||!webOnlyLogs()||guild.id!==targetGuild||(operational?(process.env.RETIRE_OPERATIONAL_CHANNELS!=='2026-10-28'||process.env.VAULT_MANAGEMENT!=='web'||process.env.POT_MANAGEMENT!=='web'||process.env.OPERATIONAL_CHANNELS!=='web'):process.env.RETIRE_LOG_CHANNELS!=='2026-10-28'))return;
  busy=true;const state=JSON.parse(store.getMeta(key(guild.id))||'{"channels":{}}');
  const save=()=>store.setMeta(key(guild.id),JSON.stringify(state));
  try{
   if(operational)store.backupOperationalDatabase();else store.backupLogDatabase();
   // Process at most one page per channel each run. Every message and file is persisted before deletion.
   for(const [id,cat] of targets){
    const item=state.channels[id]??={count:0,before:null,status:'archiving'};if(['deleted','missing'].includes(item.status))continue;
    try{
     let channel;try{channel=await guild.channels.fetch(id);}catch(e){if(e.code!==10003)throw e;}
     if(!channel){item.status='missing';save();continue;}
     if(!channel.messages||!channel.isTextBased()||channel.isThread())throw new Error('Geen gewoon tekstkanaal; niet verwijderd.');
     item.name=channel.name;
     const page=await channel.messages.fetch({limit:25,...(item.before?{before:item.before}:{})});
     for(const m of page.values()){
      if(store.archivedDiscordMessage(m.id))continue;
      const attachments=[];
      for(const a of m.attachments.values()){
       if(!store.archivedAttachment(guild.id,a.id))store.archiveAttachment(guild.id,a.id,a.name,await download(a.url));
       attachments.push({id:a.id,name:a.name});
      }
      const embeds=m.embeds.map(e=>e.toJSON());const time=m.embeds[0]?.timestamp?Date.parse(m.embeds[0].timestamp):m.createdTimestamp;
      const payload={id:m.id,author:m.author?.id,time:m.createdTimestamp,content:m.content,embeds,attachments,components:m.components.map(c=>c.toJSON())};
      if(!store.hasStructuredDiscordLog(guild.id,id,m.id,time)){
       const detail=[m.content,...embeds.flatMap(e=>[e.description,...(e.fields||[]).map(f=>`${f.name}: ${f.value}`)])].filter(Boolean).join('\n');
       store.recordWebLog(guild.id,{id:`discord-archive:${m.id}`,cat:cat==='system'?classifyLog({title:embeds[0]?.title}):cat,time:Number.isFinite(time)?time:m.createdTimestamp,action:embeds[0]?.title||'Gearchiveerd logbericht',channelName:channel.name,detail,source:'Archief verwijderd Discord-logkanaal',attachments});
      }
      store.archiveDiscordMessage(guild.id,id,m.id,payload);item.count++;
     }
     if(page.size===25){item.before=page.last().id;item.status='archiving';delete item.error;save();continue;}
     // Catch messages added while older pages were being copied. Never delete an unarchived head.
     const head=await channel.messages.fetch({limit:25});
     if([...head.values()].some(m=>!store.archivedDiscordMessage(m.id))){item.before=null;save();continue;}
     const threads=await channel.threads?.fetchActive();if(threads?.threads.size)throw new Error('Kanaal bevat threads; handmatige archivering nodig.');
     const archivedThreads=await channel.threads?.fetchArchived({});if(archivedThreads?.threads.size)throw new Error('Kanaal bevat gearchiveerde threads; niet verwijderd.');
     const privateThreads=await channel.threads?.fetchArchived({type:'private'});if(privateThreads?.threads.size)throw new Error('Kanaal bevat privéthreads; niet verwijderd.');
     item.status='archived';delete item.error;save();
     await channel.delete('Op verzoek van eigenaar: logs uitsluitend via website; historie en bijlagen gearchiveerd.');
     item.status='deleted';item.deletedAt=Date.now();save();
     store.recordWebLog(guild.id,{id:`log-retired:${id}`,cat:'system',action:'Discord-logkanaal gearchiveerd en verwijderd',time:Date.now(),channelName:item.name,detail:`${item.count} berichten bewaard. Nieuwe logs uitsluitend op de website.`});
    }catch(e){item.error=`${e.code||''} ${e.message||'Archiveren mislukt'}`.slice(0,300);save();}
   }
   state.done=[...targets.keys()].every(id=>['deleted','missing'].includes(state.channels[id]?.status));save();
  }finally{busy=false;}
 };
}
