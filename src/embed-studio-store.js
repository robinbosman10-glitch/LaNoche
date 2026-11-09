import {randomUUID} from 'node:crypto';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
export function embedStudioStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS embed_studio_designs(guild TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,updated INTEGER NOT NULL,archived INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,id));
 CREATE TABLE IF NOT EXISTS embed_studio_sends(guild TEXT NOT NULL,id TEXT NOT NULL,hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(guild,id));`);
 const own=actor=>{if(actor!==LOGSITE_OWNER)throw new Error('owner_only');};
 const audit=(guild,actor,action,detail)=>{const id='embed-studio:'+randomUUID(),time=Date.now(),e={id,cat:'system',action,time,person:actor,actor,channel:'Embedstudio',detail,source:'Website Development'};db.prepare('INSERT INTO web_logs VALUES(?,?,?,?,?,?,?,?,?)').run(id,guild,e.cat,action,time,actor,e.channel,detail,JSON.stringify(e));};
 const decode=r=>r?{id:r.id,name:r.name,revision:r.revision,design:JSON.parse(r.body),updated:r.updated,archived:!!r.archived}:null;
 return {
  studioDesigns(guild){return db.prepare('SELECT * FROM embed_studio_designs WHERE guild=? AND archived=0 ORDER BY updated DESC LIMIT 100').all(guild).map(decode);},
  studioSaveDesign(guild,actor,{id,name,revision,design}){own(actor);db.exec('BEGIN IMMEDIATE');try{
   let old=id?db.prepare('SELECT * FROM embed_studio_designs WHERE guild=? AND id=? AND archived=0').get(guild,id):null;
   if(id&&!old)throw new Error('not_found');if(old&&old.revision!==revision)throw new Error('revision_conflict');
   if(!id&&db.prepare('SELECT COUNT(*) n FROM embed_studio_designs WHERE guild=? AND archived=0').get(guild).n>=100)throw new Error('design_limit');
   const next={id:id||randomUUID(),name,revision:(old?.revision||0)+1,design,updated:Date.now(),archived:false};
   db.prepare('INSERT INTO embed_studio_designs VALUES(?,?,?,?,?,?,0) ON CONFLICT(guild,id) DO UPDATE SET name=excluded.name,revision=excluded.revision,body=excluded.body,updated=excluded.updated').run(guild,next.id,name,next.revision,JSON.stringify(design),next.updated);
   audit(guild,actor,'Embedontwerp opgeslagen',name);db.exec('COMMIT');return next;
  }catch(e){db.exec('ROLLBACK');throw e;}},
  studioArchiveDesign(guild,actor,id,revision){own(actor);db.exec('BEGIN IMMEDIATE');try{const old=db.prepare('SELECT * FROM embed_studio_designs WHERE guild=? AND id=? AND archived=0').get(guild,id);if(!old)throw new Error('not_found');if(old.revision!==revision)throw new Error('revision_conflict');db.prepare('UPDATE embed_studio_designs SET archived=1,revision=revision+1 WHERE guild=? AND id=?').run(guild,id);audit(guild,actor,'Embedontwerp gearchiveerd',old.name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  studioSend(guild,id){const r=db.prepare('SELECT * FROM embed_studio_sends WHERE guild=? AND id=?').get(guild,id);return r?{...r,result:JSON.parse(r.result)}:null;},
  studioBeginSend(guild,actor,id,hash){own(actor);return db.prepare("INSERT OR IGNORE INTO embed_studio_sends VALUES(?,?,?,'pending','{}',?)").run(guild,id,hash,Date.now()).changes>0;},
  studioFinishSend(guild,actor,id,result){own(actor);db.exec('BEGIN IMMEDIATE');try{const r=db.prepare("UPDATE embed_studio_sends SET status='done',result=? WHERE guild=? AND id=? AND status='pending'").run(JSON.stringify(result),guild,id);if(r.changes)audit(guild,actor,'Embed gepubliceerd',`${result.updated?'Bijgewerkt':'Geplaatst'}: ${result.url}`);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}},
  studioFailSend(guild,actor,id,error){own(actor);db.prepare("UPDATE embed_studio_sends SET status='failed',result=? WHERE guild=? AND id=? AND status='pending'").run(JSON.stringify({error}),guild,id);}
 };
}
