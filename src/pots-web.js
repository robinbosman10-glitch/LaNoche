import {allocation,parseAmount,pots,shares} from './money-store.js';
import {moneyRole,moneyResetRole,flushMoneyLogs,syncMoney} from './money.js';
import {sameSecret} from './logsite-auth-store.js';
import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {UserError} from './logic.js';
export function potPermissions(member){return {manage:!!member?.roles.cache.has(moneyRole),reset:!!member?.roles.cache.has(moneyResetRole)};}
export async function handlePotsWrite(req,send,store,guild,session,path){
 if(req.method!=='POST')return send(405,{error:'POST vereist.'});
 if(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],session.csrf))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
 if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2048)return send(413,{error:'Verzoek te groot.'});}
  const input=JSON.parse(raw);
  const member=await guild.members.fetch({user:session.user,force:true});
  // Recheck access after awaiting Discord; never authorize from client-supplied roles.
  if(!currentLogsiteUser(req,store,guild.id)||!store.logsiteAllowed(guild.id,session.user)||!store.logsitePages(guild.id,session.user).includes('pots'))return send(401,{error:'Je toegang is verlopen.'});
  const perms=potPermissions(member),reset=input.action==='reset';
  if(!['add','remove','reset'].includes(input.action))return send(400,{error:'Kies toevoegen, opnemen of resetten.'});
  if(!(reset?perms.reset:perms.manage))return send(403,{error:reset?'Alleen de aangewezen resetrol kan potjes resetten.':'Alleen de leidingrol kan geld beheren.'});
  const all=reset&&input.pot==='all';
  if(!all&&!['wit','zwart'].includes(input.kind))return send(400,{error:'Kies wit of zwart geld.'});
  if(input.action!=='add'&&!all&&!pots.includes(input.pot))return send(400,{error:'Kies een geldig potje.'});
  const amount=reset?0:parseAmount(typeof input.amount==='string'?input.amount:'');
  const id=`web-money:${guild.id}:${session.user}:${input.requestId}`;
  if(path==='/api/pots/book'){
   if(!/^[a-f0-9-]{36}$/.test(input.requestId||''))return send(400,{error:'Ongeldige boeking. Open het formulier opnieuw.'});
   const old=store.moneyTransaction(id)||store.moneyTransaction(id+':wit')||store.moneyTransaction(id+':zwart');
   if(old){
    const expectedPot=input.action==='add'||all?null:input.pot;
    if(old.action!==input.action||old.pot!==expectedPot||(!all&&old.kind!==input.kind)||(!reset&&old.amount!==amount))return send(409,{error:'Deze boeking is al gebruikt voor andere invoer. Open een nieuw formulier.'});
    return send(200,{ok:true,changed:false});
   }
  }
  const balances=store.moneyBalances(guild.id),current=(kind,pot)=>balances.find(b=>b.kind===kind&&b.pot===pot)?.amount??0;
  const kinds=all?['wit','zwart']:[input.kind];
  const changes=kinds.flatMap(kind=>pots.map((pot,i)=>{
   const before=current(kind,pot),delta=reset?((all||pot===input.pot)?-before:0):input.action==='add'?allocation(amount,kind)[i]:pot===input.pot?-amount:0;
   if(before+delta<0)throw new UserError('Onvoldoende saldo in dit potje. Er is niets gewijzigd.');
   if(!Number.isSafeInteger(before+delta)||before+delta>1e12)throw new UserError('Deze boeking overschrijdt het maximale saldo.');
   return {kind,pot,before,delta,after:before+delta,share:shares[kind][i]};
  }));
  if(path==='/api/pots/preview')return send(200,{changes,action:input.action});
  // The existing ledger handles duplicate requests and commits balance changes atomically.
  const changed=reset?store.resetMoney({id,guild:guild.id,actor:session.user,pot:input.pot,kind:all?'all':input.kind}):store.changeMoney({id,guild:guild.id,actor:session.user,kind:input.kind,action:input.action,amount,pot:input.action==='remove'?input.pot:undefined});
  void flushMoneyLogs(guild,store).catch(e=>console.error('Website geldlog',e.code||e.name));
  void syncMoney(guild,store).catch(e=>console.error('Website potjespaneel',e.code||e.name));
  return send(200,{ok:true,changed});
 }catch(e){if(e instanceof UserError)return send(400,{error:e.message});if(e instanceof SyntaxError)return send(400,{error:'Ongeldig formulier.'});if(e.code===10007)return send(403,{error:'Je bent geen lid van de server.'});return send(503,{error:'De boeking kon niet worden bevestigd. Probeer dezelfde boeking opnieuw.'});}
}
