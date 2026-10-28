import {createHash,randomBytes} from 'node:crypto';
export const logCategories=['messages','channels','roles','voice','members','moderation','server','tickets','absence','money','vault','blacklist','ranks','warns','commands','system'];
export function classifyLog(e) {
 if(logCategories.includes(e.cat))return e.cat;
 const t=(e.title||'').toLowerCase(),a=e.auditAction||(e.description||'').match(/\*\*Actie:\*\* (\w+)/)?.[1]||'';
 if(/^(Channel|Thread)/.test(a)||/kanaal|thread/.test(t))return 'channels';
 if(/Role/.test(a)||/rol/.test(t))return 'roles';
 if(/Message/.test(a)||/bericht/.test(t))return 'messages';
 if(/Member(Kick|Ban|Prune)/.test(a)||/verbannen|ban opgeheven|gekickt|time-out/.test(t))return 'moderation';
 if(/Member(Move|Disconnect)/.test(a)||/voice/.test(t))return 'voice';
 if(/Member/.test(a)||/lid (toegetreden|niet meer|aangepast)/.test(t))return 'members';
 if(/command/.test(t))return 'commands';
 return a||/serverwijziging/.test(t)?'server':'system';
}
const hash=t=>createHash('sha256').update(t).digest('hex');
const actionNames={closed:'Ticket gesloten',deleted:'Ticket verwijderd',pending:'Afwezigheid aangevraagd',approved:'Afwezigheid goedgekeurd',denied:'Afwezigheid afgekeurd',expired:'Afwezigheid afgelopen'};
export function logsiteStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS web_logs(id TEXT PRIMARY KEY,guild TEXT NOT NULL,cat TEXT NOT NULL,action TEXT NOT NULL,time INTEGER NOT NULL,person TEXT NOT NULL,channel TEXT NOT NULL,detail TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS web_logs_time ON web_logs(guild,time DESC,id);
 CREATE INDEX IF NOT EXISTS web_logs_cat ON web_logs(guild,cat,time DESC);
 CREATE TABLE IF NOT EXISTS web_sessions(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const put=(guild,e)=>{
  if(!e.id||!Number.isFinite(e.time))return;
  const row={id:e.id,cat:e.cat||'system',action:e.action||e.title||'Gebeurtenis',time:e.time,person:e.person||e.actor||e.user||'Onbekend',channel:e.channelName||e.channel||'—',detail:e.detail||e.description||'',source:e.source||'Botregistratie',actor:e.actor||null,user:e.user||null,channelId:e.channelId||e.channel||null,transcript:e.transcript||null,url:e.url||null};
  db.prepare('INSERT OR IGNORE INTO web_logs VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,guild,row.cat,row.action,row.time,String(row.person),String(row.channel),row.detail,JSON.stringify(row));
 };
 return {
 recordWebLog:put,
 createWebSession(guild,user){const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM web_sessions WHERE expires<? OR (guild=? AND user=?)').run(Date.now(),guild,user);db.prepare('INSERT INTO web_sessions VALUES(?,?,?,?)').run(hash(token),guild,user,Date.now()+12*3600000);return token;},
 webSession(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return db.prepare('SELECT guild,user,expires FROM web_sessions WHERE hash=? AND expires>?').get(hash(token),Date.now());},
 syncWebLogs(guild){
  let pending=false;
  for(const table of ['server_logs','audit_outbox','money_transactions','vault_bookings','blacklist_logs']){
   const key=`web-cursor:${guild}:${table}`;const cursor=Number(db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value||0);
   const rows=db.prepare(`SELECT rowid AS seq,* FROM ${table} WHERE guild=? AND rowid>? ORDER BY rowid LIMIT 500`).all(guild,cursor);
   db.exec('BEGIN IMMEDIATE');try{
    for(const r of rows){
     const e=r.payload?JSON.parse(r.payload):r;let v;
     if(table==='server_logs')v={...e,cat:classifyLog(e),action:e.title,person:e.person||e.actor||e.user||((e.description||'').match(/<@!?(\d+)>/)?.[1]),source:'Discord Gateway / Auditlog'};
     if(table==='audit_outbox')v={...e,cat:e.type==='ticket'?'tickets':'absence',action:actionNames[e.action]||e.action,detail:e.type==='ticket'?`Categorie: ${e.kind}\nAanvrager: ${e.user}\nBehandelaar: ${e.claimed||'Niet geclaimd'}\nUitvoerder: ${e.actor||'Automatisch'}`:`Reden: ${e.reason}\nVanaf: ${new Date(e.start).toISOString()}\nTot: ${new Date(e.end).toISOString()}\nBeoordelaar: ${e.actor||'Automatisch / nog niet beoordeeld'}`,transcript:e.transcript?e.channel:null};
     if(table==='money_transactions')v={id:r.id,cat:'money',time:r.time,actor:r.actor,action:({add:'Geld toegevoegd',remove:'Geld opgenomen',reset:'Potje gereset',opening:'Beginstand potjes'})[r.action]||r.action,channel:'potjes',detail:`Soort: ${r.kind}\nBedrag: ${r.amount}\nPotje: ${r.pot||'Alle / verdeling'}\nMutaties [gang, drugs, wapens]: ${r.deltas}`};
     if(table==='vault_bookings')v={...e,id:r.id,cat:'vault',action:e.action==='add'?'Kluis: toegevoegd':'Kluis: verwijderd',channel:'kluis',detail:`Soort: ${e.kind}\nVoorwerp: ${e.item||'Geld'}\nHoeveelheid: ${e.amount}\nBoekdatum: ${e.date||'—'}\nToelichting: ${e.reason||'—'}`,url:r.url};
     if(table==='blacklist_logs')v={...e,cat:'blacklist',action:e.action==='toevoegen'?'Perm Blacklist toegevoegd':'Perm Blacklist verwijderd',detail:`Lid: ${e.user}\nUitvoerder: ${e.actor}`,channel:'permanent-blacklist'};
     put(guild,{...v,id:`${table}:${r.id}`});
    }
    if(rows.length)db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,String(rows.at(-1).seq));
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   if(rows.length===500)pending=true;
  }
  return pending;
 },
 queryWebLogs(guild,{cat='all',action='all',q='',ids=[],from=0,to=Date.now(),page=1,limit=50}={}){
  const clauses=['guild=?','time>=?','time<=?'],args=[guild,from,to];
  const counts=db.prepare('SELECT cat,COUNT(*) n FROM web_logs WHERE guild=? AND time>=? AND time<=? GROUP BY cat').all(...args);
  if(cat!=='all'){clauses.push('cat=?');args.push(cat);}
  const base=clauses.join(' AND '),baseArgs=[...args];
  const actions=db.prepare(`SELECT action,COUNT(*) n FROM web_logs WHERE ${base} GROUP BY action ORDER BY n DESC`).all(...args);
  if(action!=='all'){clauses.push('action=?');args.push(action);}
  if(q){clauses.push("(instr(lower(person||' '||action||' '||channel||' '||detail||' '||id),lower(?))>0"+(ids.length?" OR person IN ("+ids.map(()=>"?").join(",")+")":"")+")");args.push(q.slice(0,200),...ids);}
  const where=clauses.join(' AND ');const total=db.prepare(`SELECT COUNT(*) n FROM web_logs WHERE ${where}`).get(...args).n;
  const pages=Math.max(1,Math.ceil(total/limit));page=Math.min(page,pages);
  const logs=db.prepare(`SELECT payload FROM web_logs WHERE ${where} ORDER BY time DESC,id DESC LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit).map(r=>JSON.parse(r.payload));
  const stats=db.prepare(`SELECT COUNT(*) total,COUNT(DISTINCT person) people,SUM(time>=?) recent,COUNT(DISTINCT action) types FROM web_logs WHERE ${base}`).get(Date.now()-3600000,...baseArgs);
  const hours=db.prepare(`SELECT CAST(time/3600000 AS INTEGER)*3600000 time,COUNT(*) n FROM web_logs WHERE ${base} GROUP BY CAST(time/3600000 AS INTEGER)`).all(...baseArgs);
  return {logs,total,page,pages,counts,actions,stats,hours};
 }
 };
}
