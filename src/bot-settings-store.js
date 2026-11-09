import {randomUUID} from 'node:crypto';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
export function botSettingsStore(db){
 db.exec('CREATE TABLE IF NOT EXISTS bot_settings(guild TEXT PRIMARY KEY,revision INTEGER NOT NULL,values_json TEXT NOT NULL)');
 const read=guild=>{const r=db.prepare('SELECT revision,values_json FROM bot_settings WHERE guild=?').get(guild);return r?{revision:r.revision,values:JSON.parse(r.values_json)}:{revision:0,values:{}};};
 return {
  botSettings:read,
  saveBotSettings(guild,actor,revision,values,changed){
   if(actor!==LOGSITE_OWNER)throw new Error('owner_only');
   db.exec('BEGIN IMMEDIATE');try{
    const current=read(guild);if(current.revision!==revision)throw new Error('revision_conflict');
    const next=revision+1;
    db.prepare('INSERT INTO bot_settings VALUES(?,?,?) ON CONFLICT(guild) DO UPDATE SET revision=excluded.revision,values_json=excluded.values_json').run(guild,next,JSON.stringify(values));
    const id='bot-settings:'+randomUUID(),time=Date.now();
    const event={id,cat:'system',action:'Botinstellingen gewijzigd',time,person:actor,actor,channel:'Website Development',detail:'Gewijzigd: '+changed.join(', '),source:'Website Development'};
    db.prepare('INSERT INTO web_logs VALUES(?,?,?,?,?,?,?,?,?)').run(id,guild,event.cat,event.action,time,actor,event.channel,event.detail,JSON.stringify(event));
    db.exec('COMMIT');return {revision:next,values};
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
}
