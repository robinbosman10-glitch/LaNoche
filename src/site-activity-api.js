import {LOGSITE_OWNER,sameSecret} from './logsite-auth-store.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
export function createSiteActivityApi(store,guildId){
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost');if(!['/api/site-activity','/api/site-visit'].includes(url.pathname))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const user=currentLogsiteUser(req,store,guildId);if(!user)return send(401,{error:'Log eerst in met Discord.'});
  if(!store.logsiteAllowed(guildId,user.user))return send(403,{error:'Geen toegang tot deze website.'});
  if(url.pathname==='/api/site-activity'){
   if(user.user!==LOGSITE_OWNER)return send(403,{error:'Alleen Development kan siteactiviteit bekijken.'});
   if(req.method!=='GET')return send(405,{error:'Alleen lezen toegestaan.'});
   store.noteSiteSeen(guildId,user.user,user.username,user.avatar,'siteactivity');
   return send(200,store.querySiteActivity(guildId,{kind:url.searchParams.get('kind')||'all',page:Number(url.searchParams.get('page')||1)}));
  }
  if(req.method!=='POST')return send(405,{error:'POST vereist.'});
  if(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],user.csrf))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024)return send(413,{error:'Verzoek te groot.'});}
  try{JSON.parse(raw);}catch{return send(400,{error:'Ongeldige invoer.'});}
  const changed=store.recordSiteVisit(guildId,user.user,user.username,user.avatar);
  return send(200,{ok:true,changed});
 };
}
