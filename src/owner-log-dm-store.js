// Queue only newly inserted events after this guild enables owner notifications.
// Triggers participate in the source transaction, so failed bookings cannot notify.
export function ownerLogDmStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS owner_log_dm_enabled(guild TEXT PRIMARY KEY,since INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS owner_log_dm_outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,source TEXT NOT NULL,event TEXT NOT NULL,
  event_time INTEGER NOT NULL,payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,message TEXT,delivered INTEGER,
  UNIQUE(guild,source,event));
 CREATE INDEX IF NOT EXISTS owner_log_dm_pending ON owner_log_dm_outbox(guild,delivered,next_attempt,id);
 CREATE TRIGGER IF NOT EXISTS owner_log_dm_web_log AFTER INSERT ON web_logs
 WHEN EXISTS(SELECT 1 FROM owner_log_dm_enabled WHERE guild=NEW.guild AND NEW.time>=since)
 BEGIN
  INSERT OR IGNORE INTO owner_log_dm_outbox(guild,source,event,event_time,payload)
  VALUES(NEW.guild,'weblog',NEW.id,NEW.time,NEW.payload);
 END;
 CREATE TRIGGER IF NOT EXISTS owner_log_dm_site_activity AFTER INSERT ON site_activity_events
 WHEN EXISTS(SELECT 1 FROM owner_log_dm_enabled WHERE guild=NEW.guild AND NEW.time>=since)
 BEGIN
  INSERT OR IGNORE INTO owner_log_dm_outbox(guild,source,event,event_time,payload)
  VALUES(NEW.guild,'activity',CAST(NEW.id AS TEXT),NEW.time,json_object(
   'id','site-activity:'||NEW.id,'cat','siteactivity',
   'action',CASE NEW.kind WHEN 'login' THEN 'Ingelogd' WHEN 'login_denied' THEN 'Inloggen geweigerd' WHEN 'logout' THEN 'Uitgelogd' WHEN 'visit' THEN 'Website bezocht' END,
   'time',NEW.time,'user',NEW.user,'person',NEW.name,'channel','Website','detail','','source','Website'));
 END;`);
 return {
  enableOwnerLogDm(guild,time=Date.now()){
   return db.prepare('INSERT OR IGNORE INTO owner_log_dm_enabled(guild,since) VALUES(?,?)').run(guild,time).changes>0;
  },
  pendingOwnerLogDms(guild,now=Date.now(),limit=10){
   limit=Math.max(1,Math.min(100,Number.isInteger(limit)?limit:10));
   return db.prepare('SELECT id,source,event,event_time AS eventTime,payload,attempts FROM owner_log_dm_outbox WHERE guild=? AND delivered IS NULL AND next_attempt<=? ORDER BY id LIMIT ?').all(guild,now,limit).map(row=>({...row,payload:JSON.parse(row.payload)}));
  },
  markOwnerLogDmSent(id,message,time=Date.now()){
   return db.prepare('UPDATE owner_log_dm_outbox SET message=?,delivered=? WHERE id=? AND delivered IS NULL').run(String(message),time,id).changes>0;
  },
  retryOwnerLogDm(id,nextAttempt){
   return db.prepare('UPDATE owner_log_dm_outbox SET attempts=attempts+1,next_attempt=? WHERE id=? AND delivered IS NULL').run(nextAttempt,id).changes>0;
  }
 };
}
