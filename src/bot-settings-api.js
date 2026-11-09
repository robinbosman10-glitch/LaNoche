import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {LOGSITE_OWNER,sameSecret} from './logsite-auth-store.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {botSettingFields,defaultBotValues,normalizeBotValues,applyBotValues} from './bot-settings.js';
export function createBotSettingsApi(store,getClient,guildId){
 return async(req,res)=>{
  if(new URL(req.url,'http://localhost').pathname!=='/api/bot-settings')return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const user=currentLogsiteUser(req,store,guildId);
  if(!user)return send(401,{error:'Log eerst in met Discord.'});
  if(user.user!==LOGSITE_OWNER)return send(403,{error:'Alleen jouw Website Development-account heeft toegang tot Botinstellingen.'});
  if(!['GET','PUT'].includes(req.method))return send(405,{error:'Methode niet toegestaan.'});
  if(req.method==='PUT'&&(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],user.csrf)))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
  const client=getClient(),guild=client?.guilds.cache.get(guildId);
  if(!client?.isReady()||!guild)return send(503,{error:'De bot is tijdelijk niet verbonden. Probeer het zo opnieuw.'});
  try{
   if(req.method==='GET'){
    await Promise.all([guild.roles.fetch(),guild.channels.fetch()]);
    const named=items=>items.map(x=>({id:x.id,name:x.name})).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
    const saved=store.botSettings(guildId);
    return send(200,{revision:saved.revision,values:{...defaultBotValues,...saved.values},fields:botSettingFields,options:{roles:named([...guild.roles.cache.values()].filter(r=>r.id!==guildId&&!r.managed)),channels:named([...guild.channels.cache.values()].filter(c=>c.type===ChannelType.GuildText)),categories:named([...guild.channels.cache.values()].filter(c=>c.type===ChannelType.GuildCategory))}});
   }
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>20000)return send(413,{error:'Verzoek te groot.'});}
   let body,values;
   try{body=JSON.parse(raw);if(!Number.isSafeInteger(body?.revision)||body.revision<0||Object.keys(body).some(k=>!['revision','values'].includes(k)))throw new Error('Ongeldige versie of invoer.');values=normalizeBotValues(body.values);}catch(e){return send(400,{error:e instanceof SyntaxError?'Ongeldige invoer.':e.message});}
   const saved=store.botSettings(guildId),before={...defaultBotValues,...saved.values};
   if(body.revision!==saved.revision)return send(409,{error:'Instellingen zijn intussen gewijzigd. Herlaad de instellingen voordat je opslaat.'});
   const changed=botSettingFields.filter(f=>values[f.key]!==before[f.key]);
   if(!changed.length)return send(200,{ok:true,revision:saved.revision,values});
   const me=await guild.members.fetchMe();
   for(const f of changed){
    const id=values[f.key];
    if(f.type==='role'){
     const role=await guild.roles.fetch(id);
     if(!role||role.id===guildId||role.managed||role.guild?.id!==guildId)return send(400,{error:f.label+': kies een bestaande, gewone rol in deze server.'});
    }
    if(['channel','category'].includes(f.type)){
     const channel=await guild.channels.fetch(id);
     const expected=f.type==='category'?ChannelType.GuildCategory:ChannelType.GuildText;
     if(!channel||channel.guild?.id!==guildId||channel.type!==expected)return send(400,{error:f.label+': kies een '+(f.type==='category'?'categorie':'tekstkanaal')+' in deze server.'});
     const required=f.type==='category'?[P.ViewChannel,P.ManageChannels]:[P.ViewChannel,P.SendMessages,P.EmbedLinks,P.AttachFiles,P.ReadMessageHistory];
     if(!channel.permissionsFor(me)?.has(required))return send(400,{error:f.label+': de bot mist de benodigde kanaalrechten.'});
    }
   }
   // No awaits between the transactional revision check, commit and live application.
   const result=store.saveBotSettings(guildId,user.user,body.revision,values,changed.map(f=>f.label));
   applyBotValues(result.values);
   return send(200,{ok:true,...result});
  }catch(e){
   if(e.message==='revision_conflict')return send(409,{error:'Instellingen zijn intussen gewijzigd. Herlaad en probeer opnieuw.'});
   if([10003,10011].includes(e.code))return send(400,{error:'Het gekozen kanaal of de rol bestaat niet meer. Herlaad de instellingen.'});
   console.error('Botinstellingen verwerken mislukt',e.code??e.name);
   return send(503,{error:'Instellingen konden niet worden verwerkt. Herlaad om de opgeslagen versie te controleren.'});
  }
 };
}
