import {randomUUID} from 'node:crypto';
import {normalizeScenarioClipLink} from './scenario-clips.js';

export const SCENARIO_CHANNEL='1570195746676805702';
export const SCENARIO_DRAFT_TTL=24*60*60*1000;
export const scenarioIdPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class ScenarioError extends Error {constructor(message,status=400){super(message);this.name='ScenarioError';this.status=status;}}
const fail=(message,status)=>{throw new ScenarioError(message,status);};
const snowflake=value=>typeof value==='string'&&/^\d{17,20}$/.test(value)&&BigInt(value)<=18446744073709551615n;
const label=(value,max,field)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))fail(`Vul een geldige ${field} in (maximaal ${max} tekens).`);return value.trim();};
const whole=(value,max,field)=>{if(typeof value==='string'&&!/^\d+$/.test(value.trim()))fail(`${field} moet een positief heel getal zijn.`);const number=typeof value==='string'?Number(value.trim()):value;if(!Number.isSafeInteger(number)||number<1||number>max)fail(`${field} moet tussen 1 en ${max.toLocaleString('nl-NL')} liggen.`);return number;};
const validTime=value=>{if(!Number.isSafeInteger(value)||value<0)fail('Ongeldige registratietijd.');return value;};

export function normalizeScenarioInput(author,input){
 if(!snowflake(author)||!input||typeof input!=='object'||Array.isArray(input))fail('Ongeldige scenario-invoer.');
 const name=label(input.name,80,'naam'),kind=label(input.kind,120,'soort overval');
 const points=whole(input.points,1_000_000,'Punten'),times=whole(input.times,10_000,'Aantal keer');
 if(points*times>1_000_000_000)fail('Een scenario mag maximaal 1 miljard punten opleveren.');
 if(!Array.isArray(input.participants)||input.participants.length>26)fail('Selecteer maximaal 25 andere gangleden.');
 const participants=new Map();
 for(const person of input.participants){
  if(!person||!snowflake(person.id))fail('Een geselecteerde deelnemer is ongeldig.');
  const display=label(person.name,100,'deelnemersnaam');
  if(!participants.has(person.id))participants.set(person.id,{id:person.id,name:display});
 }
 if(!participants.has(author))participants.set(author,{id:author,name});
 if(participants.size>26)fail('Selecteer maximaal 25 andere gangleden.');
 return {name,kind,points,times,participants:[participants.get(author),...[...participants.values()].filter(p=>p.id!==author)]};
}

export function normalizeScenarioClip(clip){
 if(!clip||typeof clip!=='object'||Array.isArray(clip))fail('Voeg een clipbestand of een clip-link toe.');
 if(clip.type==='link'){
  try{return normalizeScenarioClipLink(clip.url);}catch(error){fail(error.message);}
 }
 if(clip.type!=='file'||typeof clip.key!=='string'||!new RegExp('^'+scenarioIdPattern.source.slice(1,-1)+'\\.(mp4|mov|webm|ogv)$').test(clip.key))fail('Ongeldig clipbestand.');
 const mimes={mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm',ogv:'video/ogg'},extension=clip.key.split('.').at(-1);
 if(clip.mime!==mimes[extension]||!Number.isSafeInteger(clip.size)||clip.size<12||clip.size>100*1024*1024)fail('Ongeldig clipbestand.');
 return {type:'file',key:clip.key,filename:label(clip.filename,180,'bestandsnaam'),mime:clip.mime,size:clip.size};
}

export function scenarioStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS scenario_drafts(guild TEXT NOT NULL,id TEXT NOT NULL,author TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(guild,id));
 CREATE INDEX IF NOT EXISTS scenario_draft_author ON scenario_drafts(guild,author,expires);
 CREATE TABLE IF NOT EXISTS scenarios(guild TEXT NOT NULL,id TEXT NOT NULL,author TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,points INTEGER NOT NULL,times INTEGER NOT NULL,total INTEGER NOT NULL,time INTEGER NOT NULL,participants TEXT NOT NULL,clip TEXT NOT NULL,search_text TEXT NOT NULL,publish_status TEXT NOT NULL DEFAULT 'pending',publish_message TEXT,publish_channel TEXT NOT NULL,publish_attempted INTEGER,publish_attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,id));
 CREATE INDEX IF NOT EXISTS scenarios_time ON scenarios(guild,time DESC,id DESC);
 CREATE INDEX IF NOT EXISTS scenarios_outbox ON scenarios(guild,publish_status,time);`);
 const decode=row=>row?{id:row.id,guild:row.guild,author:row.author,name:row.name,kind:row.kind,points:row.points,times:row.times,total:row.total,time:row.time,participants:JSON.parse(row.participants),clip:JSON.parse(row.clip),publish:{status:row.publish_status,message:row.publish_message,channel:row.publish_channel,attemptedAt:row.publish_attempted,attempts:row.publish_attempts}}:null;
 const get=(guild,id)=>scenarioIdPattern.test(id||'')?decode(db.prepare('SELECT * FROM scenarios WHERE guild=? AND id=?').get(guild,id)):null;
 const draft=(guild,id,author,{now=Date.now()}={})=>{
  if(!scenarioIdPattern.test(id||''))return null;
  const row=db.prepare('SELECT * FROM scenario_drafts WHERE guild=? AND id=? AND author=? AND expires>?').get(guild,id,author,now);
  return row?{id:row.id,guild:row.guild,author:row.author,...JSON.parse(row.payload),created:row.created,expires:row.expires}:null;
 };
 return {
  scenario:get,scenarioDraft:draft,
  createScenarioDraft(guild,author,input,{id=randomUUID(),now=Date.now()}={}){
   if(!snowflake(guild)||!scenarioIdPattern.test(id))fail('Ongeldig scenario.');validTime(now);
   const normalized=normalizeScenarioInput(author,input),payload=JSON.stringify(normalized);
   db.prepare('DELETE FROM scenario_drafts WHERE expires<=?').run(now);
   const old=db.prepare('SELECT * FROM scenario_drafts WHERE guild=? AND id=?').get(guild,id);
   if(old){if(old.author!==author||old.payload!==payload)fail('Dit scenarioverzoek is al gebruikt.',409);return draft(guild,id,author,{now});}
   if(get(guild,id))fail('Dit scenario is al geregistreerd.',409);
   if(db.prepare('SELECT COUNT(*) n FROM scenario_drafts WHERE guild=? AND author=?').get(guild,author).n>=10)fail('Je hebt al 10 onafgemaakte scenario’s. Rond een daarvan af of probeer het later opnieuw.',429);
   db.prepare('INSERT INTO scenario_drafts VALUES(?,?,?,?,?,?)').run(guild,id,author,payload,now,now+SCENARIO_DRAFT_TTL);
   return draft(guild,id,author,{now});
  },
  finalizeScenario(guild,id,author,{clip,now=Date.now()}={}){
   if(!snowflake(guild)||!snowflake(author)||!scenarioIdPattern.test(id||''))fail('Ongeldig scenario.');validTime(now);
   const normalizedClip=normalizeScenarioClip(clip);
   db.exec('BEGIN IMMEDIATE');
   try{
    const old=get(guild,id);
    if(old){if(old.author!==author)fail('Dit scenario hoort bij iemand anders.',403);if(JSON.stringify(old.clip)!==JSON.stringify(normalizedClip))fail('Dit scenario is al met een andere clip geregistreerd.',409);db.exec('COMMIT');return {...old,duplicate:true};}
    const pending=draft(guild,id,author,{now});if(!pending)fail('Dit scenario is verlopen of hoort bij iemand anders. Gebruik /scenario opnieuw.',404);
    const total=pending.points*pending.times;
    const current=db.prepare('SELECT COALESCE(SUM(total),0) n FROM scenarios WHERE guild=?').get(guild).n;
    if(!Number.isSafeInteger(current+total)||current+total>1_000_000_000_000)fail('Het maximale gangtotaal is bereikt. Neem contact op met Website Development.');
    const search=[id,pending.name,pending.kind,...pending.participants.flatMap(p=>[p.id,p.name])].join(' ').toLocaleLowerCase('nl-NL');
    db.prepare('INSERT INTO scenarios(guild,id,author,name,kind,points,times,total,time,participants,clip,search_text,publish_channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(guild,id,author,pending.name,pending.kind,pending.points,pending.times,total,now,JSON.stringify(pending.participants),JSON.stringify(normalizedClip),search,SCENARIO_CHANNEL);
    db.prepare('DELETE FROM scenario_drafts WHERE guild=? AND id=? AND author=?').run(guild,id,author);
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='web_logs'").get()){
     const event={id:'scenario:'+guild+':'+id,cat:'system',action:'Scenario geregistreerd',time:now,person:pending.name,actor:author,channel:'Scenario’s',detail:`Soort: ${pending.kind}\nGangpunten: ${pending.points} × ${pending.times} = ${total}\nAanwezig: ${pending.participants.length}\nScenario-ID: ${id}`,source:'Discord /scenario'};
     db.prepare('INSERT INTO web_logs VALUES(?,?,?,?,?,?,?,?,?)').run(event.id,guild,event.cat,event.action,now,event.person,event.channel,event.detail,JSON.stringify(event));
    }
    db.exec('COMMIT');return {...get(guild,id),duplicate:false};
   }catch(error){db.exec('ROLLBACK');throw error;}
  },
  listScenarios(guild,{q='',page=1,limit=20}={}){
   q=String(q).trim().slice(0,200).toLocaleLowerCase('nl-NL');limit=Math.max(1,Math.min(50,Number.isSafeInteger(limit)?limit:20));page=Math.max(1,Number.isSafeInteger(page)?page:1);
   const args=[guild],filter=q?' AND instr(search_text,?)>0':'';if(q)args.push(q);
   const total=db.prepare('SELECT COUNT(*) n FROM scenarios WHERE guild=?'+filter).get(...args).n,pages=Math.max(1,Math.ceil(total/limit));page=Math.min(page,pages);
   const items=db.prepare('SELECT * FROM scenarios WHERE guild=?'+filter+' ORDER BY time DESC,id DESC LIMIT ? OFFSET ?').all(...args,limit,(page-1)*limit).map(decode);
   const summary=db.prepare('SELECT COALESCE(SUM(total),0) points,COUNT(*) scenarios,COUNT(*) clips,COALESCE(MAX(time),0) updatedAt FROM scenarios WHERE guild=?').get(guild);
   return {items,total,page,pageSize:limit,pages,summary:{points:summary.points,scenarios:summary.scenarios,clips:summary.clips},updatedAt:summary.updatedAt};
  },
  pendingScenarioPublishes(guild,{limit=10}={}){return db.prepare("SELECT * FROM scenarios WHERE guild=? AND publish_status='pending' ORDER BY time,id LIMIT ?").all(guild,Math.max(1,Math.min(50,limit))).map(decode);},
  uncertainScenarioPublishes(guild,{limit=10}={}){return db.prepare("SELECT * FROM scenarios WHERE guild=? AND publish_status='uncertain' ORDER BY publish_attempted DESC,time DESC,id DESC LIMIT ?").all(guild,Math.max(1,Math.min(50,limit))).map(decode);},
  claimScenarioPublish(guild,id,now=Date.now()){
   validTime(now);const result=db.prepare("UPDATE scenarios SET publish_status='sending',publish_attempted=?,publish_attempts=publish_attempts+1 WHERE guild=? AND id=? AND publish_status='pending'").run(now,guild,id);
   return result.changes?get(guild,id):null;
  },
  markScenarioPublished(guild,id,message){if(!snowflake(message))fail('Ongeldig Discord-bericht.');return db.prepare("UPDATE scenarios SET publish_status='sent',publish_message=? WHERE guild=? AND id=? AND publish_status IN ('sending','uncertain')").run(message,guild,id).changes>0;},
  markScenarioPublishUncertain(guild,id){return db.prepare("UPDATE scenarios SET publish_status='uncertain' WHERE guild=? AND id=? AND publish_status='sending'").run(guild,id).changes>0;},
  releaseScenarioPublish(guild,id){return db.prepare("UPDATE scenarios SET publish_status='pending' WHERE guild=? AND id=? AND publish_status='sending'").run(guild,id).changes>0;},
  recoverScenarioPublishes(guild){return db.prepare("UPDATE scenarios SET publish_status='uncertain' WHERE guild=? AND publish_status='sending'").run(guild).changes;}
 };
}
