import {logsitePages} from './logsite-pages.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {LOGSITE_OWNER,sameSecret} from './logsite-auth-store.js';
export const sessionCookie='__Host-ln-session';
const stateCookie='__Host-ln-oauth';
export function logsiteOrigin(env=process.env){
 const u=new URL(env.LOGSITE_BASE_URL||'https://la-noche-logs.nl');
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('LOGSITE_BASE_URL moet een HTTPS-origin zijn.');return u.origin;
}
export function cookieValue(req,name){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';}
const cookie=(name,value,max)=>`${name}=${value}; Path=/; Max-Age=${max}; HttpOnly; Secure; SameSite=Lax`;
export function currentLogsiteUser(req,store,guildId){const session=store.logsiteSession(cookieValue(req,sessionCookie));return session?.guild===guildId?session:null;}
export function discordAvatar(user){
 if(/^a_[a-f0-9]+$|^[a-f0-9]+$/.test(user.avatar||''))return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_')?'gif':'png'}?size=128`;
 const index=user.discriminator&&user.discriminator!=='0'?Number(user.discriminator)%5:Number((BigInt(user.id)>>22n)%6n);
 return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}
export function createLogsiteAuth(store,getClient,guildId,{env=process.env,fetcher=fetch}={}){
 const origin=logsiteOrigin(env),callback=origin+'/auth/discord/callback';
 const assets=new Map([['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]].map(([path,[file,type]])=>[path,{type,content:readFileSync(new URL('../web/'+file,import.meta.url))}]));
 for(const name of ['inner-circle-scene','inner-circle-marble'])assets.set('/brand/'+name+'.webp',{type:'image/webp',content:readFileSync(new URL('../assets/'+name+'.webp',import.meta.url))});
 assets.set('/brand/logo.gif',{type:'image/gif',content:readFileSync(new URL('../assets/ticket-logo.gif',import.meta.url))});
 let authWindow=0,authCount=0;
 return async(req,res)=>{
  const url=new URL(req.url,origin),path=url.pathname;
  if(!assets.has(path)&&!['/auth/discord','/auth/discord/callback','/api/me','/api/logout','/api/access'].includes(path))return false;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));return true;};
  const redirect=location=>{res.writeHead(303,{Location:location});res.end();return true;};
  const clientId=env.DISCORD_OAUTH_CLIENT_ID||getClient()?.application?.id;
  const secret=env.DISCORD_OAUTH_CLIENT_SECRET;
  const configured=!!(/^\d{17,20}$/.test(clientId||'')&&secret);
  if(assets.has(path)){
   if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Methode niet toegestaan.'});
   const a=assets.get(path);res.writeHead(200,{'Content-Type':a.type});res.end(req.method==='HEAD'?undefined:a.content);return true;
  }
  if(path==='/auth/discord'){
   if(req.method!=='GET')return send(405,{error:'Methode niet toegestaan.'});
   if(req.headers.host!==new URL(origin).host)return redirect(origin+'/auth/discord');
   if(!configured)return redirect('/?auth=unconfigured');
   if(Date.now()-authWindow>60000){authWindow=Date.now();authCount=0;}if(++authCount>60)return send(429,{error:'Te veel inlogpogingen. Probeer over een minuut opnieuw.'});
   const pending=store.beginLogsiteOAuth();res.setHeader('Set-Cookie',cookie(stateCookie,pending.binding,600));
   const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:callback,scope:'identify',state:pending.state,code_challenge:createHash('sha256').update(pending.verifier).digest('base64url'),code_challenge_method:'S256',prompt:'consent'});
   return redirect('https://discord.com/oauth2/authorize?'+params);
  }
  if(path==='/auth/discord/callback'){
   if(req.method!=='GET')return send(405,{error:'Methode niet toegestaan.'});
   res.setHeader('Set-Cookie',cookie(stateCookie,'',0));
   const pending=store.consumeLogsiteOAuth(url.searchParams.get('state'),cookieValue(req,stateCookie));
   if(!configured||!pending||(url.searchParams.has('iss')&&url.searchParams.get('iss')!=='https://discord.com'))return redirect('/?auth=invalid');
   if(url.searchParams.has('error')||!url.searchParams.get('code'))return redirect('/?auth=cancelled');
   try{
    const response=await fetcher('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:callback,code_verifier:pending.verifier}),signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('oauth');const grant=await response.json();
    if(!grant.access_token||grant.token_type?.toLowerCase()!=='bearer'||!grant.scope?.split(' ').includes('identify'))throw new Error('scope');
    const identity=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+grant.access_token},signal:AbortSignal.timeout(12000)});
    if(!identity.ok)throw new Error('identity');const user=await identity.json();
    if(!/^\d{17,20}$/.test(user.id||'')||user.bot)throw new Error('identity');
    // OAuth tokens remain server-side and are never persisted or returned.
    const previous=cookieValue(req,sessionCookie);store.logoutLogsite(previous);
    const token=store.loginLogsite(guildId,user.id,user.global_name||user.username||user.id,discordAvatar(user));
    res.setHeader('Set-Cookie',[cookie(stateCookie,'',0),cookie(sessionCookie,token,12*3600)]);
    return redirect(store.logsiteAllowed(guildId,user.id)?'/':'/?auth=denied');
   }catch{return redirect('/?auth=failed');}
  }
  const user=currentLogsiteUser(req,store,guildId);
  if(path==='/api/me'){
   if(req.method!=='GET')return send(405,{error:'Methode niet toegestaan.'});
   const guild=getClient()?.guilds.cache.get(guildId);
   return send(200,{guild:{name:guild?.name||'La Noche',icon:guild?.iconURL({extension:guild.icon?.startsWith('a_')?'gif':'png',size:128})||'/brand/logo.gif'},configured,loginUrl:origin+'/auth/discord',user:user?{id:user.user,name:user.username,avatar:user.avatar,admin:user.user===LOGSITE_OWNER,allowed:store.logsiteAllowed(guildId,user.user),csrf:user.csrf,pages:store.logsitePages(guildId,user.user)}:null});
  }
  if(!user)return send(401,{error:'Log eerst in met Discord.'});
  if(req.method!=='GET'&&(req.headers.origin!==origin||!sameSecret(req.headers['x-csrf-token'],user.csrf)))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
  if(path==='/api/logout'){
   if(req.method!=='POST')return send(405,{error:'Methode niet toegestaan.'});store.logoutLogsite(cookieValue(req,sessionCookie));res.setHeader('Set-Cookie',cookie(sessionCookie,'',0));return send(200,{ok:true});
  }
  if(user.user!==LOGSITE_OWNER)return send(403,{error:'Alleen de vaste beheerder kan accounts beheren.'});
  if(path==='/api/access'&&req.method==='GET')return send(200,{owner:LOGSITE_OWNER,users:store.logsiteUsers(guildId),pages:logsitePages});
  if(path==='/api/access'&&['POST','DELETE','PATCH'].includes(req.method)){
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
   try{
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)return send(413,{error:'Verzoek te groot.'});}
    const input=JSON.parse(raw);const id=typeof input.id==='string'?input.id.trim():'';const add=req.method==='POST';
    const settings=('label' in input||'pages' in input)?{label:input.label,pages:input.pages}:undefined;
    const changed=req.method==='PATCH'?store.updateLogsiteAccount(guildId,user.user,id,input.label,input.pages):store.changeLogsiteAccess(guildId,user.user,id,add,settings);
    if(changed)store.recordWebLog(guildId,{id:'access:'+Date.now()+':'+id,cat:'system',time:Date.now(),action:req.method==='PATCH'?'Website-paginatoegang aangepast':add?'Website-toegang toegevoegd':'Website-toegang ingetrokken',actor:user.user,user:id,detail:'Beheer van de Discord-ID-toegangslijst.'});
    return send(200,{ok:true,changed});
   }catch(e){return send(400,{error:e.message==='owner_immutable'?'Het vaste beheerdersaccount kan niet worden gewijzigd.':e.message==='invalid_settings'?'Gebruik een naam van maximaal 80 tekens en geldige pagina’s.':e.message==='account_missing'?'Dit account bestaat niet meer.':'Vul een geldig Discord-ID in als tekst (17–20 cijfers).'});}
  }
  return send(405,{error:'Methode niet toegestaan.'});
 };
}
