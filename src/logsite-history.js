import {webOnlyLogs,retiredLogChannels,retiredOperationalChannels} from './log-destination.js';
// Recover old rank/warn announcements that predate structured logging.
// Only the bot's own recognized embeds are saved; ordinary chat is discarded.
const titles=new Map([
 ['✦ WELKOM BIJ DE FAMILIE',['ranks','Lid aangenomen']],
 ['◈ DIENSTVERBAND BEËINDIGD',['ranks','Lid ontslagen']],
 ['✦ EEN NIEUWE RANG. EEN NIEUW HOOFDSTUK.',['ranks','Lid gepromoveerd']],
 ['◈ RANGWIJZIGING',['ranks','Lid gedegradeerd']],
 ['⚠️ OFFICIËLE WAARSCHUWING',['warns','Waarschuwing gegeven']]
]);
export function createLogHistory(guild,store){
 const key=`web-history:${guild.id}`;const saved=store.getMeta(key);let state=saved?JSON.parse(saved):{cutoff:Date.now(),channels:null,index:0,before:null,imported:0,errors:[]};let busy=false;
 const save=()=>store.setMeta(key,JSON.stringify(state));save();
 return async()=>{
  if(busy)return;
  if(state.done){if(!state.errors.length||Date.now()<(state.retryAt||0))return;state.channels=[...new Set(state.errors)];state.errors=[];state.index=0;state.before=null;state.done=false;}
  busy=true;
  try{
   if(!state.channels){await guild.channels.fetch();state.channels=[...guild.channels.cache.values()].filter(c=>c.isTextBased()&&c.messages&&c.permissionsFor(guild.members.me)?.has(['ViewChannel','ReadMessageHistory'])).map(c=>c.id);save();}
   for(let step=0;step<2&&state.index<state.channels.length;step++){
    const id=state.channels[state.index];if((webOnlyLogs()&&retiredLogChannels.has(id))||(process.env.OPERATIONAL_CHANNELS==='web'&&retiredOperationalChannels.has(id))){state.index++;state.before=null;save();continue;}const channel=await guild.channels.fetch(id).catch(()=>null);
    if(!channel?.messages){state.errors.push(id);state.index++;state.before=null;save();continue;}
    try{
     const messages=await channel.messages.fetch({limit:100,...(state.before?{before:state.before}:{})});
     for(const m of messages.values()){
      if(m.author?.id!==guild.client.user.id||m.createdTimestamp>=state.cutoff)continue;
      for(const e of m.embeds){const type=titles.get(e.title);if(!type)continue;
       const fields=e.fields||[];const user=fields.find(f=>/LID/i.test(f.name))?.value.match(/<@!?(\d+)>/)?.[1];const actor=fields.find(f=>/UITGEVOERD/i.test(f.name))?.value.match(/<@!?(\d+)>/)?.[1];
       store.recordWebLog(guild.id,{id:`historical:${m.id}`,cat:type[0],action:type[1],time:m.createdTimestamp,user,actor,channel:id,detail:[e.description,...fields.map(f=>`${f.name}: ${f.value}`)].filter(Boolean).join('\n'),url:m.url,source:'Bestaand Discord-logbericht'});state.imported++;
      }
     }
     if(messages.size<100){state.index++;state.before=null;}else state.before=messages.last().id;
    }catch{state.errors.push(id);state.index++;state.before=null;}
    save();
   }
   if(state.index>=state.channels.length){state.done=true;state.retryAt=Date.now()+300000;save();}
  }finally{busy=false;}
 };
}
