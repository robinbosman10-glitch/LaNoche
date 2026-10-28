import {createHash} from 'node:crypto';
export function logRetirementStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS discord_log_archive(guild TEXT NOT NULL,channel TEXT NOT NULL,message TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS discord_log_files(hash TEXT PRIMARY KEY,body BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS discord_log_attachments(guild TEXT NOT NULL,id TEXT PRIMARY KEY,name TEXT NOT NULL,hash TEXT NOT NULL);`);
 return {
  markWebsiteDelivery(guild){
   db.exec('BEGIN IMMEDIATE');try{
    for(const table of ['server_logs','blacklist_logs','vault_log_outbox'])db.prepare(`UPDATE ${table} SET message='website' WHERE guild=? AND message IS NULL`).run(guild);
    db.prepare('UPDATE audit_outbox SET sent=1 WHERE guild=? AND sent=0').run(guild);
    db.prepare("INSERT OR IGNORE INTO money_log_messages SELECT id,'website' FROM money_transactions WHERE guild=?").run(guild);
    db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  archivedDiscordMessage(id){return !!db.prepare('SELECT 1 FROM discord_log_archive WHERE message=?').get(id);},
  archiveDiscordMessage(guild,channel,id,payload){db.prepare('INSERT OR IGNORE INTO discord_log_archive VALUES(?,?,?,?)').run(guild,channel,id,JSON.stringify(payload));},
  archivedAttachment(guild,id){return db.prepare('SELECT a.name,f.body FROM discord_log_attachments a JOIN discord_log_files f ON f.hash=a.hash WHERE a.guild=? AND a.id=?').get(guild,id);},
  archiveAttachment(guild,id,name,body){
   const hash=createHash('sha256').update(body).digest('hex');db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT OR IGNORE INTO discord_log_files VALUES(?,?)').run(hash,body);
    db.prepare('INSERT OR IGNORE INTO discord_log_attachments VALUES(?,?,?,?)').run(guild,id,name,hash);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  hasStructuredDiscordLog(guild,channel,message,time){
   for(const table of ['server_logs','blacklist_logs','vault_log_outbox','ticket_log_messages'])if(db.prepare(`SELECT 1 FROM ${table} WHERE guild=? AND message=?`).get(guild,message))return true;
   if(db.prepare('SELECT 1 FROM money_log_messages l JOIN money_transactions t ON t.id=l.id WHERE t.guild=? AND l.message=?').get(guild,message))return true;
   return !!db.prepare("SELECT 1 FROM audit_outbox WHERE guild=? AND json_extract(payload,'$.time')=?").get(guild,time);
  }
 };
}
