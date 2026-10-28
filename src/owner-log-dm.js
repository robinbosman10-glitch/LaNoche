import {createHash} from 'node:crypto';
import {EmbedBuilder} from 'discord.js';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
import {logsiteOrigin} from './logsite-auth.js';

const labels={messages:'Berichten',channels:'Kanalen',roles:'Rollen',voice:'Voice',members:'Leden',moderation:'Moderatie',server:'Server',tickets:'Tickets',absence:'Afwezigheid',money:'Potjes',vault:'Kluis',warehouses:'Loodsen',blacklist:'Blacklist',ranks:'Rangen',warns:'Waarschuwingen',commands:'Botcommands',system:'Systeem',siteactivity:'Siteactiviteit'};
const short=(value,max)=>{const text=String(value??'');return text.length>max?text.slice(0,max-1)+'…':text;};
const person=(value,guild)=>{
 if(!value)return 'Automatisch';
 const id=String(value),member=guild?.members?.cache?.get(id);
 return short(member?.displayName||guild?.client?.users?.cache?.get(id)?.globalName||guild?.client?.users?.cache?.get(id)?.username||id,100);
};

export function ownerLogDmPayload(entry,guild,{env=process.env}={}){
 const event=entry.payload,category=labels[event.cat]||'Gebeurtenis';
 const route=event.cat==='siteactivity'?'siteactiviteit':labels[event.cat]?'logs/'+event.cat:'overzicht';
 const iconURL=guild?.iconURL?.({extension:'png',size:64});
 const embed=new EmbedBuilder().setColor(0xff7900)
  .setAuthor({name:'LA NOCHE • '+category,...(iconURL?{iconURL}:{})})
  .setTitle(short(event.action||'Nieuwe gebeurtenis',180))
  .setURL(logsiteOrigin(env)+'/#/'+route)
  .setTimestamp(event.time)
  .setFooter({text:'La Noche Logs'});
 if(event.detail)embed.setDescription(short(event.detail,600));
 const fields=[];
 if(event.actor||event.user||event.person)fields.push({name:event.actor?'Uitvoerder':'Persoon',value:person(event.actor||event.user||event.person,guild),inline:true});
 if(event.channel&&event.channel!=='—'){
  const channel=guild?.channels?.cache?.get(event.channelId||event.channel);
  fields.push({name:'Locatie',value:short(channel?.name||event.channel,100),inline:true});
 }
 if(fields.length)embed.addFields(fields);
 return {embeds:[embed],allowedMentions:{parse:[]},nonce:createHash('sha256').update(guild.id+':'+entry.source+':'+entry.event).digest('hex').slice(0,24),enforceNonce:true};
}

export function createOwnerLogDm(client,guildId,store,{env=process.env,now=Date.now,onError=()=>{},onSent=()=>{}}={}){
 store.enableOwnerLogDm(guildId,now());
 const cooldownKey='owner-log-dm-cooldown:'+guildId;
 let busy=false,stopped=false,timer;
 const run=async()=>{
  if(busy||stopped||!client.isReady())return;
  busy=true;
  let sent=0;
  try{
   // Import source events even when nobody has the website open.
   store.syncWebLogs(guildId);
   if(Number(store.getMeta(cooldownKey)||0)>now())return;
   const entries=store.pendingOwnerLogDms(guildId,now(),5);
   if(!entries.length)return;
   let recipient;
   for(const entry of entries){
    if(stopped)break;
    try{
     recipient??=await client.users.fetch(LOGSITE_OWNER);
     if(recipient.id!==LOGSITE_OWNER||recipient.bot)throw Object.assign(new Error('invalid_recipient'),{code:'invalid_recipient'});
     const message=await recipient.send(ownerLogDmPayload(entry,client.guilds.cache.get(guildId)||{id:guildId},{env}));
     if(stopped)break;
     store.markOwnerLogDmSent(entry.id,message.id,now());
     store.setMeta(cooldownKey,'0');
     sent++;
    }catch(error){
     if(stopped)break;
     const delay=Number(error?.code)===50007?300000:Math.min(300000,5000*2**Math.min(entry.attempts||0,6));
     const retryAt=now()+delay;
     store.retryOwnerLogDm(entry.id,retryAt);
     store.setMeta(cooldownKey,String(retryAt));
     onError(error);
     break;
    }
   }
  }catch(error){if(!stopped)onError(error);}
  finally{busy=false;if(sent)onSent(sent);}
 };
 return {run,start(){if(timer||stopped)return;void run();timer=setInterval(()=>void run(),3000);timer.unref();},stop(){stopped=true;clearInterval(timer);}};
}
