import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
import {currentLogsiteUser} from './logsite-auth.js';

export const permissionColumns=[
 {key:'view',label:'Bekijken',flag:P.ViewChannel},
 {key:'send',label:'Berichten',flag:P.SendMessages},
 {key:'history',label:'Geschiedenis',flag:P.ReadMessageHistory},
 {key:'connect',label:'Verbinden',flag:P.Connect},
 {key:'speak',label:'Spreken',flag:P.Speak},
 {key:'manage',label:'Kanaal beheren',flag:P.ManageChannels},
 {key:'moderate',label:'Berichten beheren',flag:P.ManageMessages}
];
const supported=new Set([ChannelType.GuildText,ChannelType.GuildAnnouncement,ChannelType.GuildVoice,ChannelType.GuildStageVoice,ChannelType.GuildCategory]);
const voiceTypes=new Set([ChannelType.GuildVoice,ChannelType.GuildStageVoice]);
const bits=v=>BigInt(v?.bitfield??v??0);
const has=(v,flag)=>(bits(v)&flag)===flag;
const roleNames=roles=>roles.map(r=>r.name||r.id).join(', ');
const snowflake=s=>typeof s==='string'&&/^\d{17,20}$/.test(s)&&BigInt(s)<=18446744073709551615n;

// permissionsFor is the Discord.js overwrite result. Implicit action restrictions and
// timeout masking are separate in Discord's permission model and are applied below.
export function explainChannelPermissions(channel,target,mode,now=Date.now()){
 const guild=channel.guild,everyone=guild.roles.everyone||guild.roles.cache.get(guild.id);
 const roles=mode==='role'?[everyone,target].filter((r,n,a)=>r&&a.findIndex(x=>x?.id===r.id)===n):[...target.roles.cache.values()];
 if(everyone&&!roles.some(r=>r.id===guild.id))roles.unshift(everyone);
 const base=roles.reduce((v,r)=>v|bits(r.permissions),0n),owner=mode==='member'&&target.id===guild.ownerId,admin=has(base,P.Administrator);
 const timedOut=mode==='member'&&!owner&&!admin&&(target.communicationDisabledUntilTimestamp||0)>now;
 const raw=channel.permissionsFor(target),overwrites=channel.permissionOverwrites.cache;
 if(!raw)throw new Error('Permissions unavailable');
 const everyoneOverwrite=overwrites.get(guild.id),roleOverwrites=roles.filter(r=>r.id!==guild.id).map(r=>({role:r,overwrite:overwrites.get(r.id)})).filter(x=>x.overwrite),memberOverwrite=mode==='member'?overwrites.get(target.id):null;
 const rawHas=flag=>owner||admin||has(raw,flag),view=rawHas(P.ViewChannel),connect=rawHas(P.Connect),voice=voiceTypes.has(channel.type),category=channel.type===ChannelType.GuildCategory;
 const permissions={};
 for(const col of permissionColumns){
  const applicable=category?['view','manage'].includes(col.key):voice||!['connect','speak'].includes(col.key);
  const steps=[];let value=has(base,col.flag);
  const grantRoles=roles.filter(r=>has(r.permissions,col.flag));
  steps.push({label:'Serverrollen',allowed:value,detail:value?'Toegekend door '+roleNames(grantRoles)+'.':'Geen serverrol kent dit recht toe.'});
  if(owner||admin){steps.push({label:owner?'Servereigenaar':'Administrator',allowed:true,detail:'Kanaalweigeringen worden door Discord overgeslagen.'});}
  else{
   const addOverwrite=(label,ow)=>{
    if(!ow)return;
    if(has(ow.deny,col.flag)){value=false;steps.push({label,allowed:false,detail:'Dit recht wordt geweigerd.'});}
    if(has(ow.allow,col.flag)){value=true;steps.push({label,allowed:true,detail:'Dit recht wordt toegestaan.'});}
   };
   addOverwrite('Kanaal: @everyone',everyoneOverwrite);
   const denies=roleOverwrites.filter(x=>has(x.overwrite.deny,col.flag)),allows=roleOverwrites.filter(x=>has(x.overwrite.allow,col.flag));
   if(denies.length){value=false;steps.push({label:'Kanaal: rollen',allowed:false,detail:'Geweigerd door '+roleNames(denies.map(x=>x.role))+'.'});}
   if(allows.length){value=true;steps.push({label:'Kanaal: rollen',allowed:true,detail:'Toegestaan door '+roleNames(allows.map(x=>x.role))+(denies.length?'. Een toestemming van een andere rol gaat vóór rolweigeringen; ranghoogte verandert dit niet.':'.')});}
   addOverwrite('Kanaal: persoonlijk',memberOverwrite);
  }
  let allowed=rawHas(col.flag),restriction=null;
  if(!view&&col.key!=='view'){allowed=false;restriction='Zonder Kanaal bekijken is deze kanaalactie niet beschikbaar.';}
  if(voice&&!connect&&col.key!=='view'){allowed=false;restriction='Zonder Verbinden zijn de acties in dit voicekanaal niet beschikbaar.';}
  if(timedOut&&!['view','history'].includes(col.key)){allowed=false;restriction='Actieve time-out: alleen kanaal bekijken en berichtgeschiedenis blijven beschikbaar.';}
  if(!applicable){allowed=null;restriction='Niet van toepassing op dit kanaaltype.';}
  if(restriction)steps.push({label:applicable?'Effectieve beperking':'Kanaaltype',allowed,detail:restriction});
  permissions[col.key]={allowed,configured:rawHas(col.flag),steps};
 }
 return {id:channel.id,name:channel.name,type:channel.type,typeLabel:category?'Categorie':channel.type===ChannelType.GuildVoice?'Voice':channel.type===ChannelType.GuildStageVoice?'Stage':channel.type===ChannelType.GuildAnnouncement?'Aankondigingen':'Tekst',parentId:channel.parentId||null,parentName:channel.parent?.name||guild.channels.cache.get(channel.parentId)?.name||'Zonder categorie',position:channel.rawPosition??channel.position??0,synced:category?null:channel.permissionsLocked===true,permissions,notes:[...(owner?['Servereigenaar: kanaalweigeringen hebben geen effect.']:admin?['Administrator: kanaalweigeringen hebben geen effect.']:[]),...(timedOut?['Actieve time-out tot '+new Date(target.communicationDisabledUntilTimestamp).toISOString()+'.']:[]),...(category?['Een categorie is een sjabloon. Bekijk het onderliggende kanaal voor daadwerkelijke toegang.']:channel.permissionsLocked?['Kanaalrechten zijn gelijk aan de categorie.']:['Dit kanaal heeft eigen rechten. Categorierechten worden niet als extra laag opgeteld.']),...(channel.type===ChannelType.GuildStageVoice?['Spreken toont de toestemming; op een podium kan een lid daarnaast als toehoorder zijn onderdrukt.']:[])]};
}

export function createPermissionsMapApi(store,getClient,guildId){
 let busy=0;
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/permissions-map'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const session=currentLogsiteUser(req,store,guildId);
  if(!session)return send(401,{error:'Log eerst in met Discord.'});
  if(session.user!==LOGSITE_OWNER)return send(403,{error:'Alleen Website Development kan de rechtenkaart bekijken.'});
  if(req.method!=='GET')return send(405,{error:'De rechtenkaart is alleen-lezen.'});
  if(!['/api/permissions-map','/api/permissions-map/options'].includes(url.pathname))return send(404,{error:'Onbekende route.'});
  const client=getClient(),guild=client?.guilds.cache.get(guildId);
  if(!client?.isReady()||!guild)return send(503,{error:'Discord is tijdelijk niet verbonden.'});
  if(busy>=2)return send(429,{error:'Er loopt al een controle. Probeer het zo opnieuw.'});
  busy++;
  try{
   if(url.pathname.endsWith('/options')){
    const currentRoles=await guild.roles.fetch();
    const q=(url.searchParams.get('q')||'').trim().slice(0,80);let members;
    if(snowflake(q)){const m=await guild.members.fetch({user:q,force:true});members=m?[m]:[];}
    else if(q&&guild.members.search)members=[...(await guild.members.search({query:q,limit:25})).values()];
    else members=[...guild.members.cache.values()].filter(m=>!q||(m.displayName||'').toLowerCase().includes(q.toLowerCase())).slice(0,50);
    return send(200,{roles:[...currentRoles.values()].sort((a,b)=>(b.position||0)-(a.position||0)).map(r=>({id:r.id,name:r.name})),members:members.map(m=>({id:m.id,name:m.displayName||m.user.username,bot:!!m.user.bot})),limited:true});
   }
   const mode=url.searchParams.get('mode'),id=url.searchParams.get('id');
   if(!['member','role'].includes(mode)||!snowflake(id))return send(400,{error:'Kies een geldig lid of een geldige rol.'});
   const [currentRoles,currentChannels]=await Promise.all([guild.roles.fetch(),guild.channels.fetch()]);
   const target=mode==='member'?await guild.members.fetch({user:id,force:true}):currentRoles.get(id);
   if(!target||target.guild?.id!==guildId)return send(404,{error:'Dit lid of deze rol bestaat niet meer in deze server.'});
   const channels=[...currentChannels.values()].filter(c=>supported.has(c.type)).map(c=>explainChannelPermissions(c,target,mode));
   const bypassView=(mode==='member'&&target.id===guild.ownerId)||has(target.permissions,P.Administrator)||has(guild.roles.everyone.permissions,P.Administrator);
   for(const category of channels.filter(c=>c.type===ChannelType.GuildCategory)){
    // Forum/media are not matrix rows, but their visibility still reveals the category.
    const visibleChildren=[...currentChannels.values()].filter(c=>c.parentId===category.id&&!c.isThread?.()&&(bypassView||has(c.permissionsFor(target),P.ViewChannel)));
    category.permissions.view.allowed=visibleChildren.length>0;
    category.permissions.view.steps.push({label:'Zichtbare onderliggende kanalen',allowed:visibleChildren.length>0,detail:visibleChildren.length?`Deze categorie bevat ${visibleChildren.length} zichtbare kanalen (inclusief forum- en mediakanalen).`:'Geen zichtbaar onderliggend kanaal in de opgehaalde Discord-kanalen. Een categorie is zichtbaar wanneer een onderliggend kanaal zichtbaar is.'});
   }
   const categoryPosition=id=>channels.find(c=>c.id===id)?.position??-1;
   channels.sort((a,b)=>{
    const ag=a.type===ChannelType.GuildCategory?a.id:a.parentId,bg=b.type===ChannelType.GuildCategory?b.id:b.parentId;
    return categoryPosition(ag)-categoryPosition(bg)||(ag||'').localeCompare(bg||'')||(a.type===ChannelType.GuildCategory?-1:b.type===ChannelType.GuildCategory?1:a.position-b.position);
   });
   return send(200,{generatedAt:Date.now(),subject:{id:target.id,mode,name:mode==='member'?target.displayName||target.user.username:target.name,roles:mode==='member'?[...target.roles.cache.values()].map(r=>({id:r.id,name:r.name})):[],timeoutUntil:mode==='member'?target.communicationDisabledUntilTimestamp||null:null},columns:permissionColumns.map(({flag,...c})=>c),channels,limitations:[mode==='role'?'Rolsimulatie: alleen deze rol en @everyone. Andere rollen en persoonlijke uitzonderingen van een echt lid tellen niet mee.':'Alle rollen en persoonlijke kanaaluitzonderingen van dit lid zijn meegenomen.','Momentopname van Discord. Threads, forum-/mediakanalen en commandrechten vallen buiten deze kaart.','De kaart toont de kanalen die de bot van Discord ontvangt. Verborgen of niet-ondersteunde kanaaltypen zijn niet opgenomen.','Geen rechten worden gewijzigd. Bij voice/stage zijn aanvullende actuele kanaaltoestanden mogelijk, zoals servermute of een vol kanaal.']});
  }catch(e){
   if([10007,10011].includes(e.code))return send(404,{error:'Dit lid of deze rol bestaat niet meer in de server.'});
   console.error('Rechtenkaart ophalen mislukt',e.code??e.name);return send(503,{error:'Discord-rechten konden niet worden opgehaald. Probeer het opnieuw.'});
  }finally{busy--;}
 };
}
