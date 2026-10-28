const eventKinds=['login','login_denied','logout','visit'];
export function siteActivityStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS site_activity_events(id INTEGER PRIMARY KEY AUTOINCREMENT,guild TEXT NOT NULL,user TEXT NOT NULL,name TEXT NOT NULL,avatar TEXT NOT NULL,kind TEXT NOT NULL,time INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS site_activity_time ON site_activity_events(guild,time DESC,id DESC);
 CREATE TABLE IF NOT EXISTS site_activity_presence(guild TEXT NOT NULL,user TEXT NOT NULL,name TEXT NOT NULL,avatar TEXT NOT NULL,lastSeen INTEGER NOT NULL,lastVisit INTEGER,lastLogin INTEGER,page TEXT,PRIMARY KEY(guild,user));`);
 db.prepare('INSERT OR IGNORE INTO meta VALUES(?,?)').run('site-activity-start',String(Date.now()));
 const seen=(guild,user,name,avatar='',page=null,time=Date.now())=>{
  const old=db.prepare('SELECT * FROM site_activity_presence WHERE guild=? AND user=?').get(guild,user);
  if(old&&time-old.lastSeen<15000&&(!page||old.page===page)&&old.name===name&&old.avatar===avatar)return;
  db.prepare(`INSERT INTO site_activity_presence(guild,user,name,avatar,lastSeen,page) VALUES(?,?,?,?,?,?) ON CONFLICT(guild,user) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,lastSeen=excluded.lastSeen,page=COALESCE(excluded.page,site_activity_presence.page)`).run(guild,user,String(name).slice(0,100),avatar,time,page);
 };
 const event=(guild,user,name,avatar,kind,time=Date.now())=>{
  if(!eventKinds.includes(kind))throw new Error('invalid_activity_kind');
  db.prepare('INSERT INTO site_activity_events(guild,user,name,avatar,kind,time) VALUES(?,?,?,?,?,?)').run(guild,user,String(name).slice(0,100),avatar||'',kind,time);
  if(['login','visit'].includes(kind)){
   seen(guild,user,name,avatar||'',null,time);
   db.prepare(`UPDATE site_activity_presence SET ${kind==='login'?'lastLogin':'lastVisit'}=? WHERE guild=? AND user=?`).run(time,guild,user);
  }
 };
 return {
  recordSiteEvent:event,noteSiteSeen:seen,
  recordSiteVisit(guild,user,name,avatar){
   const last=db.prepare('SELECT lastVisit FROM site_activity_presence WHERE guild=? AND user=?').get(guild,user)?.lastVisit;
   if(last&&Date.now()-last<60000)return false;
   event(guild,user,name,avatar,'visit');return true;
  },
  querySiteActivity(guild,{kind='all',page=1}={}){
   const args=[guild],clauses=['guild=?'];
   if(kind==='login'){clauses.push("kind IN ('login','login_denied','logout')");}else if(kind==='visit'){clauses.push("kind='visit'");}
   const where=clauses.join(' AND '),total=db.prepare('SELECT COUNT(*) n FROM site_activity_events WHERE '+where).get(...args).n,pages=Math.max(1,Math.ceil(total/50));
   page=Math.max(1,Math.min(pages,Number.isSafeInteger(page)?page:1));
   return {events:db.prepare('SELECT id,user,name,avatar,kind,time FROM site_activity_events WHERE '+where+' ORDER BY time DESC,id DESC LIMIT 50 OFFSET ?').all(...args,(page-1)*50),total,page,pages,presence:db.prepare('SELECT user,name,avatar,lastSeen,lastVisit,lastLogin,page FROM site_activity_presence WHERE guild=? ORDER BY lastSeen DESC LIMIT 100').all(guild),since:Number(db.prepare('SELECT value FROM meta WHERE key=?').get('site-activity-start').value),serverTime:Date.now()};
  }
 };
}
