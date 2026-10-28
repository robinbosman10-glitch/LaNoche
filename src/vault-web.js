import {vaultInput,flushVaultPosts,flushVaultLogs,leadRole} from './vault.js';
import {sameSecret} from './logsite-auth-store.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {UserError} from './logic.js';
export async function handleVaultWrite(req,send,store,guild,session,path){
 if(req.method!=='POST')return send(405,{error:'POST vereist.'});
 if(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],session.csrf))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>4096)return send(413,{error:'Verzoek te groot.'});}const input=JSON.parse(raw);
  const member=await guild.members.fetch({user:session.user,force:true});
  if(!currentLogsiteUser(req,store,guild.id)||!store.logsiteAllowed(guild.id,session.user)||!store.logsitePages(guild.id,session.user).includes('safe'))return send(401,{error:'Je toegang is verlopen.'});
  if(!member.roles.cache.has(leadRole))return send(403,{error:'Alleen de leidingrol kan de kluis beheren.'});
  if(!['add','remove'].includes(input.action)||!['wit','zwart','wapen','munitie','voorraad'].includes(input.kind))return send(400,{error:'Kies een geldige actie en soort.'});
  const fields={datum:input.date,bedrag:input.amount,waarvoor:input.reason,voorwerp:input.item};
  if(Object.values(fields).some(v=>v!==undefined&&typeof v!=='string'))return send(400,{error:'Ongeldige invoer.'});
  const parsed=vaultInput({getTextInputValue:k=>fields[k]||''},input.kind),entry={...parsed,item:parsed.item||'',kind:input.kind,action:input.action,actor:session.user};
  const id=`web-vault:${guild.id}:${session.user}:${input.requestId}`;
  if(path==='/api/vault/book'){
   if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))return send(400,{error:'Open het formulier opnieuw.'});
   const old=store.vaultBooking(id);
   if(old){if(['item','kind','action','date','amount','reason'].some(k=>old[k]!==entry[k]))return send(409,{error:'Deze boeking hoort bij andere invoer. Open een nieuw formulier.'});return send(200,{ok:true,changed:false});}
  }
  const before=store.vaultBalances(guild.id).find(b=>b.kind===entry.kind&&b.item===entry.item)?.amount||0,delta=entry.action==='add'?entry.amount:-entry.amount,after=before+delta;
  if(after<0)throw new UserError('Onvoldoende geld of voorraad van deze soort. Er is niets gewijzigd.');
  if(!Number.isSafeInteger(after)||after>1e12)throw new UserError('Deze boeking overschrijdt de maximale kluisinhoud.');
  if(!before&&after>0&&store.vaultBalances(guild.id).filter(b=>b.amount>0).length>=40)throw new UserError('Maximaal 40 verschillende voorwerpen in de kluis.');
  if(path==='/api/vault/preview')return send(200,{...entry,before,delta,after});
  const changed=store.bookVault(id,guild.id,{...entry,time:Date.now()});
  void flushVaultPosts(guild,store).then(()=>flushVaultLogs(guild,store)).catch(e=>console.error('Website kluislog',e.code||e.name));
  return send(200,{ok:true,changed});
 }catch(e){if(e instanceof UserError)return send(400,{error:e.message});if(e instanceof SyntaxError)return send(400,{error:'Ongeldig formulier.'});if(e.code===10007)return send(403,{error:'Je bent geen lid van de server.'});return send(503,{error:'Geen bevestiging ontvangen. Probeer dezelfde boeking opnieuw.'});}
}
