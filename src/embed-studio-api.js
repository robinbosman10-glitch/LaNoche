import {createHash} from 'node:crypto';
import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {LOGSITE_OWNER,sameSecret} from './logsite-auth-store.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {settings} from './settings.js';
const idPattern=/^\d{17,20}$/;
const uuidPattern=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const invalid=message=>{throw Object.assign(new Error(message),{status:400});};
const text=(value,label,max,required=false)=>{if(typeof value!=='string')invalid(label+': ongeldige tekst.');const v=value.trim();if(v.length>max||(required&&!v))invalid(label+': '+(required&&!v?'vul dit veld in.':`maximaal ${max} tekens.`));return v;};
export function studioUrl(value,image=false){
 if(!value)return '';if(typeof value!=='string'||value.length>1500)invalid('Ongeldige URL.');let u;try{u=new URL(value);}catch{invalid('Gebruik een volledige HTTPS-link.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)invalid('Gebruik een HTTPS-link zonder gebruikersgegevens.');
 if(image){const own=u.origin===logsiteOrigin()&&['/brand/logo.gif','/brand/banner.gif'].includes(u.pathname);if(!own&&!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))invalid('Afbeeldingen: gebruik een Discord-CDN-link of de standaard La Noche-afbeelding.');if(!/\.(gif|png|jpe?g|webp)$/i.test(u.pathname))invalid('Afbeelding moet GIF, PNG, JPG of WebP zijn.');}
 return u.href;
}
export function normalizeStudioDesign(input){
 if(!input||typeof input!=='object'||Array.isArray(input))invalid('Ongeldig ontwerp.');
 const keys=['title','description','color','author','footer','logo','banner','fields','buttons'];if(Object.keys(input).some(k=>!keys.includes(k)))invalid('Onbekend ontwerpveld.');
 const d={title:text(input.title??'','Titel',256),description:text(input.description??'','Beschrijving',4096),color:input.color??'#ff7900',author:text(input.author??'','Auteur',256),footer:text(input.footer??'','Voettekst',2048),logo:studioUrl(input.logo??'',true),banner:studioUrl(input.banner??'',true),fields:[],buttons:[]};
 if(!/^#[a-f\d]{6}$/i.test(d.color))invalid('Kies een geldige kleur.');if(!d.title&&!d.description)invalid('Vul een titel of beschrijving in.');
 if(!Array.isArray(input.fields??[])||(input.fields??[]).length>25)invalid('Maximaal 25 embedvelden.');
 d.fields=(input.fields??[]).map(f=>{if(!f||Object.keys(f).some(k=>!['name','value','inline'].includes(k))||('inline'in f&&typeof f.inline!=='boolean'))invalid('Ongeldig embedveld.');return {name:text(f.name,'Veldnaam',256,true),value:text(f.value,'Veldinhoud',1024,true),inline:!!f.inline};});
 if(!Array.isArray(input.buttons??[])||(input.buttons??[]).length>5)invalid('Maximaal vijf linkknoppen.');
 d.buttons=(input.buttons??[]).map(b=>{if(!b||Object.keys(b).some(k=>!['label','url'].includes(k)))invalid('Ongeldige knop.');return {label:text(b.label,'Knoptekst',80,true),url:studioUrl(text(b.url,'Knoplink',1500,true))};});
 const count=d.title.length+d.description.length+d.author.length+d.footer.length+d.fields.reduce((n,f)=>n+f.name.length+f.value.length,0);if(count>6000)invalid('De embed bevat meer dan 6000 tekens.');return d;
}
export function studioPayload(design){
 const d=normalizeStudioDesign(design),embed={color:parseInt(d.color.slice(1),16)};
 for(const key of ['title','description'])if(d[key])embed[key]=d[key];
 if(d.author)embed.author={name:d.author,...(d.logo?{icon_url:d.logo}:{})};if(d.footer)embed.footer={text:d.footer};if(d.logo)embed.thumbnail={url:d.logo};if(d.banner)embed.image={url:d.banner};if(d.fields.length)embed.fields=d.fields;
 return {embeds:[embed],components:d.buttons.length?[{type:1,components:d.buttons.map(b=>({type:2,style:5,label:b.label,url:b.url}))}]:[],allowedMentions:{parse:[]}};
}
function editableLinks(message){
 const rows=(message.components||[]).map(r=>r.toJSON?r.toJSON():r);
 return rows.length<=1&&rows.every(r=>r.type===1&&Array.isArray(r.components)&&r.components.length<=5&&r.components.every(b=>b.type===2&&b.style===5&&b.url&&!b.custom_id));
}
function imported(message){
 const e=message.embeds[0],raw=e.toJSON?e.toJSON():e;
 return {title:raw.title||'',description:raw.description||'',color:'#'+Number(raw.color??0xff7900).toString(16).padStart(6,'0'),author:raw.author?.name||'',footer:raw.footer?.text||'',logo:raw.thumbnail?.url||raw.author?.icon_url||'',banner:raw.image?.url||'',fields:(raw.fields||[]).map(f=>({name:f.name,value:f.value,inline:!!f.inline})),buttons:editableLinks(message)?(message.components?.[0]?.components||[]).map(b=>({label:b.label||'Openen',url:b.url})):[]};
}
export function createEmbedStudioApi(store,getClient,guildId){
 const active=new Set();
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;if(!path.startsWith('/api/embed-studio'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const user=currentLogsiteUser(req,store,guildId);if(!user)return send(401,{error:'Log eerst in met Discord.'});if(user.user!==LOGSITE_OWNER)return send(403,{error:'Alleen Website Development kan de embedstudio gebruiken.'});
  if(!['GET','POST','DELETE'].includes(req.method))return send(405,{error:'Methode niet toegestaan.'});
  if(req.method!=='GET'&&(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],user.csrf)))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
  let body={};
  try{
   if(req.method!=='GET'){if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>45000)return send(413,{error:'Verzoek te groot.'});}try{body=JSON.parse(raw);}catch{invalid('Ongeldige JSON.');}if(!body||typeof body!=='object'||Array.isArray(body))invalid('Ongeldig verzoek.');}
   if(path==='/api/embed-studio/designs'&&req.method==='GET')return send(200,{designs:store.studioDesigns(guildId)});
   if(path==='/api/embed-studio/designs'&&req.method==='POST'){
    if(body.id&&!uuidPattern.test(body.id))invalid('Ongeldig ontwerp-ID.');if(!Number.isSafeInteger(body.revision)||body.revision<0)invalid('Ongeldige versie.');
    const design=normalizeStudioDesign(body.design),name=text(body.name,'Ontwerpnaam',80,true);return send(200,{design:store.studioSaveDesign(guildId,user.user,{id:body.id||null,name,revision:body.revision,design})});
   }
   if(path==='/api/embed-studio/designs'&&req.method==='DELETE'){if(!uuidPattern.test(body.id)||!Number.isSafeInteger(body.revision))invalid('Ongeldig ontwerp-ID of versie.');store.studioArchiveDesign(guildId,user.user,body.id,body.revision);return send(200,{ok:true});}
   if(path==='/api/embed-studio/preview'&&req.method==='POST')return send(200,{payload:studioPayload(body.design)});
   const client=getClient(),guild=client?.guilds.cache.get(guildId);if(!guild||!client.isReady())return send(503,{error:'De bot is tijdelijk niet verbonden.'});
   if(path==='/api/embed-studio/channels'&&req.method==='GET'){
    await guild.channels.fetch();const me=await guild.members.fetchMe();const channels=[...guild.channels.cache.values()].filter(c=>c.type===ChannelType.GuildText&&c.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory])).map(c=>({id:c.id,name:c.name})).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
    return send(200,{channels,defaults:{author:settings.branding.author,footer:settings.branding.footer,color:settings.branding.color,logo:settings.branding.logoUrl||logsiteOrigin()+'/brand/logo.gif',banner:settings.branding.bannerUrl||logsiteOrigin()+'/brand/banner.gif'}});
   }
   const channelId=req.method==='GET'?url.searchParams.get('channel'):body.channel;if(!idPattern.test(channelId||''))invalid('Kies een geldig tekstkanaal.');
   const channel=await guild.channels.fetch(channelId);if(!channel||channel.guild?.id!==guildId||channel.type!==ChannelType.GuildText)invalid('Kies een tekstkanaal in deze server.');const me=await guild.members.fetchMe();if(!channel.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]))return send(403,{error:'De bot mist de benodigde kanaalrechten.'});
   if(path==='/api/embed-studio/messages'&&req.method==='GET'){
    const messages=await channel.messages.fetch({limit:50});return send(200,{messages:[...messages.values()].filter(m=>m.author?.id===client.user.id&&m.embeds.length).map(m=>({id:m.id,title:m.embeds[0].title||'Embed zonder titel',time:m.createdTimestamp,url:m.url,design:imported(m),hasComponents:!!m.components?.length,protectedComponents:!editableLinks(m),multipleEmbeds:m.embeds.length>1}))});
   }
   if(path!=='/api/embed-studio/publish'||req.method!=='POST')return send(404,{error:'Niet gevonden.'});
   if(!uuidPattern.test(body.requestId||''))invalid('Ongeldig publicatieverzoek.');if(body.message&&!idPattern.test(body.message))invalid('Ongeldig bericht-ID.');
   const design=normalizeStudioDesign(body.design),payload=studioPayload(design),hash=createHash('sha256').update(JSON.stringify({channel:channelId,message:body.message||'',design})).digest('hex');
   const previous=store.studioSend(guildId,body.requestId);if(previous){if(previous.hash!==hash)return send(409,{error:'Dit verzoek-ID hoort bij een andere publicatie.'});if(previous.status==='done')return send(200,{...previous.result,replayed:true});return send(409,{error:previous.status==='pending'?'Deze publicatie wordt verwerkt of heeft nog geen bevestiging. Controleer het Discord-kanaal voordat je opnieuw publiceert.':previous.result.error||'Deze poging is mislukt. Controleer het kanaal voor een nieuwe poging.'});}
   const lock=channelId+':'+(body.message||'new');if(active.has(lock))return send(409,{error:'Er wordt al een bericht in dit kanaal verwerkt.'});
   active.add(lock);
   try{
    let message;
    if(body.message){message=await channel.messages.fetch(body.message);if(!message||message.author?.id!==client.user.id||message.webhookId)return send(403,{error:'Alleen berichten van deze bot kunnen worden bewerkt.'});if(!message.embeds.length)invalid('Dit botbericht heeft geen embed.');
     // Replace only the first visual embed; preserve text, files, other embeds and every functional button/menu.
     const rest=message.embeds.slice(1).map(e=>e.toJSON?e.toJSON():e);const size=e=>(e.title?.length||0)+(e.description?.length||0)+(e.author?.name?.length||0)+(e.footer?.text?.length||0)+(e.fields||[]).reduce((n,f)=>n+f.name.length+f.value.length,0);if([...payload.embeds,...rest].reduce((n,e)=>n+size(e),0)>6000)invalid('Deze wijziging overschrijdt samen met de overige embeds de limiet van 6000 tekens.');payload.embeds.push(...rest);if(!editableLinks(message)){if(design.buttons.length)invalid('Dit bericht bevat functionele knoppen of menu’s. Deze blijven behouden en kunnen hier niet worden aangepast.');delete payload.components;}
    }
    if(!store.studioBeginSend(guildId,user.user,body.requestId,hash))return send(409,{error:'Dit publicatieverzoek wordt al verwerkt.'});
    try{
     const posted=message?await message.edit(payload):await channel.send({...payload,nonce:createHash('sha256').update(body.requestId).digest('hex').slice(0,24),enforceNonce:true});
     const result={ok:true,message:posted.id,channel:channelId,url:`https://discord.com/channels/${guildId}/${channelId}/${posted.id}`,updated:!!message};store.studioFinishSend(guildId,user.user,body.requestId,result);return send(200,result);
    }catch(e){
     // Only definite Discord rejections can safely be labelled failed. Unknown network outcomes remain pending.
     if([50001,50013,50035,10003,10008].includes(e.code))store.studioFailSend(guildId,user.user,body.requestId,'Discord heeft het verzoek geweigerd. Controleer de rechten en invoer.');throw e;
    }
   }finally{active.delete(lock);}
  }catch(e){
   const errors={revision_conflict:[409,'Het ontwerp is intussen gewijzigd. Laad de actuele versie.'],not_found:[404,'Dit ontwerp bestaat niet meer.'],design_limit:[400,'Maximaal 100 actieve ontwerpen. Archiveer eerst een oud ontwerp.']};if(errors[e.message])return send(...[errors[e.message][0],{error:errors[e.message][1]}]);if(e.status)return send(e.status,{error:e.message});if([10003,10008].includes(e.code))return send(404,{error:'Het kanaal of bericht bestaat niet meer.'});if([50001,50013].includes(e.code))return send(403,{error:'Discord weigert toegang. Controleer de rechten van de bot.'});console.error('Embedstudio',e.code??e.name);return send(503,{error:'Geen bevestiging ontvangen. Controleer het kanaal voordat je nogmaals publiceert.'});
  }
 };
}
