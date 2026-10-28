import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
export const LOGSITE_OWNER='424086753327054849';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const randomToken=()=>randomBytes(32).toString('hex');
export function sameSecret(a,b){return typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function logsiteAuthStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS logsite_access(guild TEXT NOT NULL,user TEXT NOT NULL,added_by TEXT NOT NULL,added_at INTEGER NOT NULL,PRIMARY KEY(guild,user));
 CREATE TABLE IF NOT EXISTS logsite_oauth_pending(state_hash TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS logsite_oauth_sessions(hash TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,username TEXT NOT NULL,avatar TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);`);
 return {
  logsiteAllowed(guild,user){return user===LOGSITE_OWNER||!!db.prepare('SELECT 1 FROM logsite_access WHERE guild=? AND user=?').get(guild,user);},
  logsiteUsers(guild){return db.prepare('SELECT user,added_by,added_at FROM logsite_access WHERE guild=? ORDER BY added_at DESC').all(guild);},
  changeLogsiteAccess(guild,actor,user,add){
   if(actor!==LOGSITE_OWNER)throw new Error('owner_only');
   if(!/^\d{17,20}$/.test(user)||BigInt(user)>18446744073709551615n)throw new Error('invalid_id');
   if(user===LOGSITE_OWNER)throw new Error('owner_immutable');
   db.exec('BEGIN IMMEDIATE');try{
    const result=add?db.prepare('INSERT OR IGNORE INTO logsite_access VALUES(?,?,?,?)').run(guild,user,actor,Date.now()):db.prepare('DELETE FROM logsite_access WHERE guild=? AND user=?').run(guild,user);
    if(!add)db.prepare('DELETE FROM logsite_oauth_sessions WHERE guild=? AND user=?').run(guild,user);
    db.exec('COMMIT');return result.changes>0;
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  beginLogsiteOAuth(){
   db.prepare('DELETE FROM logsite_oauth_pending WHERE expires<?').run(Date.now());
   if(db.prepare('SELECT COUNT(*) n FROM logsite_oauth_pending').get().n>=1000)throw new Error('busy');
   const state=randomToken(),binding=randomToken(),verifier=randomToken();
   db.prepare('INSERT INTO logsite_oauth_pending VALUES(?,?,?,?)').run(hash(state),hash(binding),verifier,Date.now()+600000);return {state,binding,verifier};
  },
  consumeLogsiteOAuth(state,binding){
   if(!/^[a-f0-9]{64}$/.test(state||'')||!/^[a-f0-9]{64}$/.test(binding||''))return null;
   return db.prepare('DELETE FROM logsite_oauth_pending WHERE state_hash=? AND binding_hash=? AND expires>? RETURNING verifier').get(hash(state),hash(binding),Date.now());
  },
  loginLogsite(guild,user,username,avatar=''){
   if(!/^\d{17,20}$/.test(user))throw new Error('invalid_identity');
   db.prepare('DELETE FROM logsite_oauth_sessions WHERE expires<?').run(Date.now());
   const token=randomToken();db.prepare('INSERT INTO logsite_oauth_sessions VALUES(?,?,?,?,?,?,?)').run(hash(token),guild,user,String(username).slice(0,100),avatar,randomToken(),Date.now()+12*3600000);return token;
  },
  logsiteSession(token){if(!/^[a-f0-9]{64}$/.test(token||''))return null;return db.prepare('SELECT guild,user,username,avatar,csrf,expires FROM logsite_oauth_sessions WHERE hash=? AND expires>?').get(hash(token),Date.now());},
  logoutLogsite(token){if(/^[a-f0-9]{64}$/.test(token||''))db.prepare('DELETE FROM logsite_oauth_sessions WHERE hash=?').run(hash(token));}
 };
}
