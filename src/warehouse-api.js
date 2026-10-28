import {DateTime} from 'luxon';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {sameSecret} from './logsite-auth-store.js';
import {warehouseName} from './warehouse-store.js';
import {leadRole} from './vault.js';
import {UserError} from './logic.js';
export function createWarehouseApi(store,getClient,guildId){
 let busy=0;
 return async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;if(!['/api/warehouses','/api/warehouses/preview','/api/warehouses/book'].includes(path))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  const session=currentLogsiteUser(req,store,guildId);if(!session)return send(401,{error:'Log eerst in met Discord.'});
  if(!store.logsiteAllowed(guildId,session.user)||!store.logsitePages(guildId,session.user).includes('warehousestock'))return send(403,{error:'Geen toegang tot Loodsen.'});
  const client=getClient(),guild=client?.guilds.cache.get(guildId);if(!guild||!client.isReady())return send(503,{error:'De bot maakt verbinding. Probeer zo opnieuw.'});
  store.useDefaultWarehouse(guildId);
  if(path==='/api/warehouses'){
   if(req.method!=='GET')return send(405,{error:'Alleen lezen toegestaan.'});
   const rows=store.warehouseBalances(guildId).filter(r=>r.amount>0),locations=[];
   for(const r of rows){let location=locations.find(l=>l.name===r.location);if(!location){location={name:r.location,items:[],totalUnits:0};locations.push(location);}location.items.push({item:r.item,amount:r.amount});location.totalUnits+=r.amount;}
   store.noteSiteSeen(guildId,session.user,session.username,session.avatar,'warehousestock');
   return send(200,{locations,totalItems:rows.length,totalUnits:rows.reduce((n,r)=>n+r.amount,0),permissions:{manage:!!guild.members.cache.get(session.user)?.roles.cache.has(leadRole)},updatedAt:Date.now()});
  }
  if(req.method!=='POST')return send(405,{error:'POST vereist.'});
  if(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],session.csrf))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
  if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
  if(busy>=3)return send(429,{error:'Te veel verzoeken. Probeer zo opnieuw.'});busy++;
  try{
   let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>4096)return send(413,{error:'Verzoek te groot.'});}const input=JSON.parse(raw);
   const member=await guild.members.fetch({user:session.user,force:true});
   if(!currentLogsiteUser(req,store,guildId)||!store.logsiteAllowed(guildId,session.user)||!store.logsitePages(guildId,session.user).includes('warehousestock'))return send(401,{error:'Je toegang is verlopen.'});
   if(!member.roles.cache.has(leadRole))return send(403,{error:'Alleen de leidingrol kan loodsenvoorraad beheren.'});
   const location='loods',item=warehouseName(input.item);
   if(!['add','remove'].includes(input.action))return send(400,{error:'Kies toevoegen of verwijderen.'});
   if(typeof input.amount!=='string'||!/^\d+$/.test(input.amount.trim()))throw new UserError('Vul een positief heel aantal in.');
   const amount=Number(input.amount.trim());if(!Number.isSafeInteger(amount)||amount<=0||amount>1e12)throw new UserError('Vul een positief heel aantal in (maximaal 1 biljoen).');
   const date=typeof input.date==='string'?input.date.trim():'',parsed=DateTime.fromFormat(date,'dd/MM/yyyy',{zone:'Europe/Amsterdam'});
   if(!/^\d{2}\/\d{2}\/\d{4}$/.test(date)||!parsed.isValid||parsed.toFormat('dd/MM/yyyy')!==date)throw new UserError('Vul een geldige datum in.');
   const entry={location,item,amount,date,action:input.action,actor:session.user},id=`web-warehouse:${guildId}:${session.user}:${input.requestId}`;
   if(path==='/api/warehouses/book'){
    if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))throw new UserError('Open het formulier opnieuw.');
    const old=store.warehouseBooking(id);if(old){if(['item','amount','date','action'].some(k=>old[k]!==entry[k]))return send(409,{error:'Deze boeking hoort bij andere invoer. Open een nieuw formulier.'});return send(200,{ok:true,changed:false});}
   }
   const rows=store.warehouseBalances(guildId),before=rows.find(r=>r.location===location&&r.item===item)?.amount||0,delta=entry.action==='add'?amount:-amount,after=before+delta;
   if(after<0)throw new UserError('Onvoldoende voorraad van dit product in deze loods. Er is niets gewijzigd.');
   if(!Number.isSafeInteger(after)||after>1e12)throw new UserError('Deze boeking overschrijdt de maximale voorraad.');
   if(!before&&after>0&&rows.filter(r=>r.amount>0).length>=200)throw new UserError('Maximaal 200 actieve voorraadregels.');
   if(path==='/api/warehouses/preview')return send(200,{...entry,before,delta,after});
   const changed=store.bookWarehouse(id,guildId,{...entry,time:Date.now()});store.syncWebLogs(guildId);
   return send(200,{ok:true,changed});
  }catch(e){if(e instanceof UserError)return send(400,{error:e.message});if(e instanceof SyntaxError)return send(400,{error:'Ongeldig formulier.'});if(e.code===10007)return send(403,{error:'Je bent geen lid van de server.'});return send(503,{error:'Geen bevestiging ontvangen. Probeer dezelfde boeking opnieuw.'});}
  finally{busy--;}
 };
}
