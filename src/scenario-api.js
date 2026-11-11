import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {currentLogsiteUser} from './logsite-auth.js';
import {scenarioIdPattern} from './scenario-store.js';
import {scenarioClipPath} from './scenario-clips.js';

export function publicScenario(scenario){
 if(!scenario)return null;
 const clip=scenario.clip.type==='file'?{type:'file',filename:scenario.clip.filename,mime:scenario.clip.mime,size:scenario.clip.size,url:`/api/scenarios/${scenario.id}/clip`}:{type:'link',url:scenario.clip.url};
 return {id:scenario.id,guild:scenario.guild,author:scenario.author,name:scenario.name,participants:scenario.participants,kind:scenario.kind,points:scenario.points,times:scenario.times,total:scenario.total,pointsEpoch:scenario.pointsEpoch,pointsActive:scenario.pointsActive,time:scenario.time,clip,publish:scenario.publish};
}

export function scenarioByteRange(header,size){
 if(header===undefined)return null;
 if(typeof header!=='string')throw new Error('invalid_range');
 const match=/^bytes=(\d*)-(\d*)$/.exec(header.trim());
 if(!match||(!match[1]&&!match[2]))throw new Error('invalid_range');
 let start,end;
 if(!match[1]){
  const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw new Error('invalid_range');
  start=Math.max(0,size-suffix);end=size-1;
 }else{
  start=Number(match[1]);end=match[2]?Number(match[2]):size-1;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||start>=size)throw new Error('invalid_range');
  end=Math.min(end,size-1);
 }
 return {start,end};
}

export function createScenarioApi(store,getClient,guildId,{directory=process.env.DATA_DIR||'./data'}={}){
 let streams=0;
 return async(req,res)=>{
  let url;try{url=new URL(req.url,'http://localhost');}catch{return false;}
  const path=url.pathname;
  if(path!=='/api/scenarios'&&!path.startsWith('/api/scenarios/'))return false;
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
  const send=(status,data,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(req.method==='HEAD'?undefined:JSON.stringify(data));return true;};
  const access=()=>{
   const session=currentLogsiteUser(req,store,guildId);
   if(!session)return {status:401,error:'Log eerst in met Discord.'};
   if(!store.logsiteAllowed(guildId,session.user)||!store.logsitePages(guildId,session.user).includes('scenarios'))return {status:403,error:'Geen toegang tot Punten & scenario’s.'};
   return {session};
  };
  const auth=access();if(!auth.session)return send(auth.status,{error:auth.error});
  if(!['GET','HEAD'].includes(req.method))return send(405,{error:'Alleen lezen toegestaan.'},{Allow:'GET, HEAD'});
  if(path==='/api/scenarios'){
   if(req.method!=='GET')return send(405,{error:'Gebruik GET voor het overzicht.'},{Allow:'GET'});
   const q=url.searchParams.get('q')||'',pageText=url.searchParams.get('page')||'1',limitText=url.searchParams.get('limit')||'20';
   if(q.length>200||!/^\d{1,9}$/.test(pageText)||!/^\d{1,2}$/.test(limitText)||Number(pageText)<1||Number(limitText)<1||Number(limitText)>50)return send(400,{error:'Ongeldige zoekopdracht of pagina.'});
   const result=store.listScenarios(guildId,{q,page:Number(pageText),limit:Number(limitText)});
   store.noteSiteSeen?.(guildId,auth.session.user,auth.session.username,auth.session.avatar,'scenarios');
   return send(200,{...result,items:result.items.map(publicScenario)});
  }
  const match=/^\/api\/scenarios\/([^/]+)(\/clip)?$/.exec(path);
  if(!match||!scenarioIdPattern.test(match[1]))return send(404,{error:'Scenario niet gevonden.'});
  const scenario=store.scenario(guildId,match[1]);if(!scenario)return send(404,{error:'Scenario niet gevonden.'});
  if(!match[2])return send(200,{scenario:publicScenario(scenario)});
  if(scenario.clip.type!=='file')return send(404,{error:'Bij dit scenario hoort een externe clip-link.'});
  if(streams>=6)return send(429,{error:'Er worden momenteel veel clips bekeken. Probeer zo opnieuw.'},{'Retry-After':'5'});
  streams++;
  let handle;
  try{
   const file=scenarioClipPath(scenario.clip.key,{directory});
   handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
   const stat=await handle.stat();
   if(!stat.isFile()||stat.size!==scenario.clip.size||stat.size<1)return send(503,{error:'Het clipbestand is tijdelijk niet beschikbaar.'});
   const fresh=access();if(!fresh.session)return send(fresh.status,{error:fresh.error});
   let range;try{range=scenarioByteRange(req.headers.range,stat.size);}catch{return send(416,{error:'Ongeldig videobereik.'},{'Content-Range':`bytes */${stat.size}`});}
   const start=range?.start??0,end=range?.end??stat.size-1;
   const filename=encodeURIComponent(scenario.clip.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
   const mediaHeaders={...headers,'Content-Type':scenario.clip.mime,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Disposition':`inline; filename="la-noche-scenario.${scenario.clip.key.split('.').at(-1)}"; filename*=UTF-8''${filename}`,'Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; sandbox"};
   if(range)mediaHeaders['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
   res.writeHead(range?206:200,mediaHeaders);
   if(req.method==='HEAD'){res.end();return true;}
   await pipeline(handle.createReadStream({start,end,autoClose:false}),res);
   return true;
  }catch(error){
   if(res.headersSent){if(!res.destroyed)res.destroy();return true;}
   return send(error?.code==='ENOENT'?404:503,{error:'Het clipbestand is tijdelijk niet beschikbaar.'});
  }finally{await handle?.close().catch(()=>{});streams--;}
 };
}
