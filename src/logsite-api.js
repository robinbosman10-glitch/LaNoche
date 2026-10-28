import {handleVaultWrite} from './vault-web.js';
import {leadRole} from './vault.js';
import {logCategories} from './logsite-store.js';
import {handlePotsWrite,potPermissions} from './pots-web.js';
import {pots,shares} from './money-store.js';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
import {retirementKey,operationalRetirementKey} from './log-retirement.js';
import {getMembers} from './member-cache.js';
import {settings} from './settings.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {PermissionFlagsBits as P,GatewayIntentBits,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {DateTime} from 'luxon';
import {transcriptBase} from './transcript-web.js';
export const dashboardOrigin='https://la-noche-logs.nl';
export async function handleLogsite(i,store,guildId){
 if(!i.guild||i.guildId!==guildId)return i.reply({content:'Dit command hoort bij La Noche.',flags:64});
 if(!store.logsiteAllowed(guildId,i.user.id))return i.reply({content:'Je Discord-ID heeft geen toegang tot de logwebsite. Vraag de websitebeheerder om toegang.',flags:64});
 return i.reply({content:'Log met Discord in op de La Noche logwebsite.',flags:64,components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('La Noche Logs openen').setURL(logsiteOrigin()))],allowedMentions:{parse:[]}});
}
export function createLogsiteApi(store,getClient,guildId){
 let busy=0;
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!/^\/t\/[a-f0-9]{64}(\/download)?$/.test(url.pathname)&&!['/api/vault/preview','/api/vault/book','/api/operations-retirement','/api/pots/preview','/api/pots/book','/api/pots','/api/vault','/api/logsite','/api/members','/api/log-retirement','/api/log-attachment'].includes(url.pathname))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  if(req.method!=='GET'&&!['/api/vault/preview','/api/vault/book','/api/pots/preview','/api/pots/book'].includes(url.pathname))return send(405,{error:'Alleen lezen toegestaan.'});
  if(url.pathname.startsWith('/t/')&&req.headers.host!==new URL(logsiteOrigin()).host){res.writeHead(303,{Location:logsiteOrigin()+url.pathname,'Cache-Control':'no-store'});res.end();return true;}
  const session=currentLogsiteUser(req,store,guildId);
  if(!session)return send(401,{error:'Log eerst in met Discord.'});
  if(!store.logsiteAllowed(guildId,session.user))return send(403,{error:'Je Discord-ID heeft geen toegang tot deze website.'});
  const pages=store.logsitePages(guildId,session.user),can=page=>pages.includes(page);
  if(url.pathname.startsWith('/t/')){if(!can('tickets'))return send(403,{error:'Geen toegang tot tickets en transcripts.'});return false;}
  const required={'/api/vault/preview':'safe','/api/vault/book':'safe','/api/members':'roster','/api/vault':'safe','/api/pots':'pots','/api/pots/preview':'pots','/api/pots/book':'pots'}[url.pathname];
  if(required&&!can(required))return send(403,{error:'Je hebt geen toegang tot deze pagina.'});
  if(url.pathname==='/api/logsite'){
   const cat=url.searchParams.get('cat')||'all';if(!can(cat==='all'?'overview':cat))return send(403,{error:'Je hebt geen toegang tot deze logpagina.'});
  }
  if(['/api/log-retirement','/api/operations-retirement'].includes(url.pathname)){
   if(session.user!==LOGSITE_OWNER)return send(403,{error:'Alleen de beheerder.'});
   return send(200,JSON.parse(store.getMeta(url.pathname==='/api/operations-retirement'?operationalRetirementKey(guildId):retirementKey(guildId))||'{"channels":{},"done":false}'));
  }
  if(url.pathname==='/api/log-attachment'){
   if(session.user!==LOGSITE_OWNER&&!can(store.attachmentLogCategory(guildId,url.searchParams.get('id')||'')))return send(403,{error:'Geen toegang tot deze bijlage.'});
   const attachment=store.archivedAttachment(guildId,url.searchParams.get('id')||'');if(!attachment)return send(404,{error:'Bijlage ontbreekt.'});
   res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(attachment.name).replace(/'/g,'%27')}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(Buffer.from(attachment.body));return true;
  }
  const client=getClient(),guild=client?.guilds.cache.get(guildId);
  if(!guild||!client.isReady())return send(503,{error:'De bot maakt verbinding met Discord. Probeer het zo opnieuw.'});
  if(busy>=3)return send(429,{error:'Te veel verzoeken. Probeer het zo opnieuw.'});
  busy++;
  try{
   if(['/api/vault/preview','/api/vault/book'].includes(url.pathname))return await handleVaultWrite(req,send,store,guild,session,url.pathname);
   if(['/api/pots/preview','/api/pots/book'].includes(url.pathname))return await handlePotsWrite(req,send,store,guild,session,url.pathname);
   if(url.pathname==='/api/pots'){
    const balances=store.moneyBalances(guildId);
    return send(200,{permissions:potPermissions(guild.members.cache.get(session.user)),pots:pots.map((id,i)=>({id,balances:Object.fromEntries(['wit','zwart'].map(kind=>[kind,balances.find(b=>b.kind===kind&&b.pot===id)?.amount??0])),shares:Object.fromEntries(['wit','zwart'].map(kind=>[kind,shares[kind][i]]))})),updatedAt:Date.now()});
   }
   if(url.pathname==='/api/vault'){
    const balances=store.vaultBalances(guildId);
    const recent=store.recentVaultBookings(guildId).map(e=>({...e,person:guild.members.cache.get(e.actor)?.displayName||client.users.cache.get(e.actor)?.username||e.actor}));
    return send(200,{permissions:{manage:!!guild.members.cache.get(session.user)?.roles.cache.has(leadRole)},balances,recent,updatedAt:Date.now()});
   }
   if(url.pathname==='/api/members'){
    const members=await getMembers(guild);const ranks=[...settings.ranks].reverse();
    const groups=ranks.map(id=>({id,name:guild.roles.cache.get(id)?.name||id,members:[]}));
    for(const member of members.values()){
     if(member.user.bot)continue;const index=ranks.findIndex(id=>member.roles.cache.has(id));if(index<0)continue;
     groups[index].members.push({id:member.id,name:member.displayName,username:member.user.username,avatar:member.displayAvatarURL({size:64}),absent:member.roles.cache.has(settings.absenceRole)});
    }
    for(const group of groups)group.members.sort((a,b)=>a.name.localeCompare(b.name,'nl'));
    return send(200,{groups,total:groups.reduce((n,g)=>n+g.members.length,0),updatedAt:Date.now()});
   }
   const importing=store.syncWebLogs(guildId);
   const number=(name,def,min,max)=>{const n=Number(url.searchParams.get(name)??def);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):def;};
   const result=store.queryWebLogs(guildId,{allowedCats:logCategories.filter(can),cat:url.searchParams.get('cat')||'all',action:url.searchParams.get('action')||'all',q:url.searchParams.get('q')||'',ids:[...guild.members.cache.values()].filter(m=>(m.displayName||'').toLowerCase().includes((url.searchParams.get('q')||'!').toLowerCase())).slice(0,100).map(m=>m.id),from:url.searchParams.get('period')==='today'?DateTime.now().setZone('Europe/Amsterdam').startOf('day').toMillis():number('from',0,0,Date.now()),to:number('to',Date.now(),0,Date.now()),page:number('page',1,1,1000000),limit:50});
   const names=value=>String(value).replace(/<@!?(\d+)>/g,(_,id)=>'@'+(guild.members.cache.get(id)?.displayName||id)).replace(/<@&(\d+)>/g,(_,id)=>'@'+(guild.roles.cache.get(id)?.name||id)).replace(/<#(\d+)>/g,(_,id)=>'#'+(guild.channels.cache.get(id)?.name||id));
   for(const l of result.logs){
    l.person=guild.members.cache.get(l.person)?.displayName||client.users.cache.get(l.person)?.username||l.person;
    l.channel=guild.channels.cache.get(l.channel)?.name||l.channel;l.detail=names(l.detail);
    if(l.cat==='tickets'&&l.channelId){const archive=store.auditEvent(`ticket:${l.channelId}:deleted`)||store.auditEvent(`ticket:${l.channelId}:closed`);if(archive?.transcript)l.transcript=l.channelId;}
    l.attachments=(l.attachments||[]).map(a=>({name:a.name,url:logsiteOrigin()+'/api/log-attachment?id='+encodeURIComponent(a.id)}));
    if(l.transcript)l.transcript=`${logsiteOrigin()}/t/${store.transcriptToken(guildId,l.transcript)}`;
   }
   return send(200,{...result,importing,serverTime:Date.now(),guild:{id:guild.id,name:guild.name},expires:session.expires,coverage:{auditLog:!!guild.members.me?.permissions.has(P.ViewAuditLog),messageContent:client.options.intents.has(GatewayIntentBits.MessageContent),since:store.since,archive:JSON.parse(store.getMeta(`web-history:${guildId}`)||'null'),history:'Bewaarde botregistraties en nieuwe Discord-gebeurtenissen. Niet eerder opgeslagen of gewiste berichten kunnen niet worden hersteld.'}});
  }catch{return send(503,{error:'Logs tijdelijk niet beschikbaar. Er zijn geen gegevens gewijzigd.'});}
  finally{busy--;}
 };
}
