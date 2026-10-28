import {PermissionFlagsBits as P,GatewayIntentBits,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {DateTime} from 'luxon';
import {transcriptBase} from './transcript-web.js';
export const dashboardOrigin='https://la-noche-logs-preview.robinbosman10.chatgpt.site';
export async function handleLogsite(i,store,guildId){
 if(!i.guild||i.guildId!==guildId)return i.reply({content:'Dit command hoort bij La Noche.',flags:64});
 await i.deferReply({flags:64});
 const member=await i.guild.members.fetch({user:i.user.id,force:true});
 if(!member.permissions.has(P.Administrator))return i.editReply('Alleen Discord-beheerders kunnen alle serverlogs openen.');
 const origin=transcriptBase();
 if(!origin)return i.editReply('De bot heeft nog geen publiek HTTPS-domein. Maak in Railway bij Settings → Networking een domein aan en herstart de bot.');
 const token=store.createWebSession(i.guildId,i.user.id);
 const connection=Buffer.from(JSON.stringify({origin,token})).toString('base64url');
 const url=`${dashboardOrigin}/#connect=${connection}`;
 await i.editReply({content:'Open je live logdashboard. Deze persoonlijke toegang verloopt na 12 uur; gebruik /logsite voor een nieuwe link. Deel deze link niet. Een nieuwe link vervangt je vorige toegang.',components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('La Noche Logs openen').setURL(url))],allowedMentions:{parse:[]}});
}
export function createLogsiteApi(store,getClient,guildId){
 const checks=new Map();let busy=0;
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(url.pathname!=='/api/logsite')return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const origin=req.headers.origin;
  if(origin && origin!==dashboardOrigin)return send(403,{error:'Origin niet toegestaan.'});
  if(origin){res.setHeader('Access-Control-Allow-Origin',dashboardOrigin);res.setHeader('Vary','Origin');}
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET');res.setHeader('Access-Control-Allow-Headers','Authorization');res.writeHead(204);res.end();return true;}
  if(req.method!=='GET')return send(405,{error:'Alleen lezen toegestaan.'});
  const session=store.webSession(req.headers.authorization?.replace(/^Bearer /,''));
  if(!session||session.guild!==guildId)return send(401,{error:'Toegang verlopen. Open opnieuw via /logsite in Discord.'});
  const client=getClient(),guild=client?.guilds.cache.get(guildId);
  if(!guild||!client.isReady())return send(503,{error:'De bot maakt verbinding met Discord. Probeer het zo opnieuw.'});
  if(busy>=3)return send(429,{error:'Te veel verzoeken. Probeer het zo opnieuw.'});
  busy++;
  try{
   let permission=checks.get(session.user);
   if(!permission||Date.now()-permission.time>30000){
    const member=await guild.members.fetch({user:session.user,force:true}).catch(()=>null);
    permission={time:Date.now(),allowed:!!member?.permissions.has(P.Administrator)};checks.set(session.user,permission);
    if(checks.size>100)checks.delete(checks.keys().next().value);
   }
   if(!permission.allowed)return send(403,{error:'Je hebt geen beheerdersrechten meer in deze Discord-server.'});
   const importing=store.syncWebLogs(guildId);
   const number=(name,def,min,max)=>{const n=Number(url.searchParams.get(name)??def);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.floor(n))):def;};
   const result=store.queryWebLogs(guildId,{cat:url.searchParams.get('cat')||'all',action:url.searchParams.get('action')||'all',q:url.searchParams.get('q')||'',ids:[...guild.members.cache.values()].filter(m=>(m.displayName||'').toLowerCase().includes((url.searchParams.get('q')||'!').toLowerCase())).slice(0,100).map(m=>m.id),from:url.searchParams.get('period')==='today'?DateTime.now().setZone('Europe/Amsterdam').startOf('day').toMillis():number('from',0,0,Date.now()),to:number('to',Date.now(),0,Date.now()),page:number('page',1,1,1000000),limit:50});
   const names=value=>String(value).replace(/<@!?(\d+)>/g,(_,id)=>'@'+(guild.members.cache.get(id)?.displayName||id)).replace(/<@&(\d+)>/g,(_,id)=>'@'+(guild.roles.cache.get(id)?.name||id)).replace(/<#(\d+)>/g,(_,id)=>'#'+(guild.channels.cache.get(id)?.name||id));
   for(const l of result.logs){
    l.person=guild.members.cache.get(l.person)?.displayName||client.users.cache.get(l.person)?.username||l.person;
    l.channel=guild.channels.cache.get(l.channel)?.name||l.channel;l.detail=names(l.detail);
    if(l.cat==='tickets'&&l.channelId){const archive=store.auditEvent(`ticket:${l.channelId}:deleted`)||store.auditEvent(`ticket:${l.channelId}:closed`);if(archive?.transcript)l.transcript=l.channelId;}
    if(l.transcript)l.transcript=`${transcriptBase()}/t/${store.transcriptToken(guildId,l.transcript)}`;
   }
   return send(200,{...result,importing,serverTime:Date.now(),guild:{id:guild.id,name:guild.name},expires:session.expires,coverage:{auditLog:!!guild.members.me?.permissions.has(P.ViewAuditLog),messageContent:client.options.intents.has(GatewayIntentBits.MessageContent),since:store.since,archive:JSON.parse(store.getMeta(`web-history:${guildId}`)||'null'),history:'Bewaarde botregistraties en nieuwe Discord-gebeurtenissen. Niet eerder opgeslagen of gewiste berichten kunnen niet worden hersteld.'}});
  }catch{return send(503,{error:'Logs tijdelijk niet beschikbaar. Er zijn geen gegevens gewijzigd.'});}
  finally{busy--;}
 };
}
