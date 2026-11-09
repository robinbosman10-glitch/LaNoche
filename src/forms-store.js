import {randomUUID,createHash} from 'node:crypto';
import {LOGSITE_OWNER} from './logsite-auth-store.js';
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export class FormError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const fail=(message,status)=>{throw new FormError(message,status);};
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max,label,required=true)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())fail(label+' is ongeldig.');return v.trim();};
const keys=(v,allowed)=>{if(!obj(v)||Object.keys(v).some(k=>!allowed.includes(k)))fail('Onbekende of ongeldige velden.');};
export function normalizeFormSchema(input){
 keys(input,['title','description','audience','fields']);
 const title=text(input.title,120,'Titel'),description=text(input.description??'',2000,'Beschrijving',false);
 const audience=input.audience;keys(audience,['mode','users']);
 if(!['all','selected'].includes(audience.mode)||!Array.isArray(audience.users)||audience.users.length>500||audience.users.some(id=>typeof id!=='string'||!/^\d{17,20}$/.test(id)||BigInt(id)>18446744073709551615n))fail('Kies een geldige doelgroep.');
 const users=[...new Set(audience.users)];if(audience.mode==='all'&&users.length)fail('Bij alle accounts hoort geen aparte selectie.');if(audience.mode==='selected'&&!users.length)fail('Selecteer minimaal één account.');
 if(!Array.isArray(input.fields)||input.fields.length<1||input.fields.length>20)fail('Gebruik 1 tot 20 vragen.');
 const ids=new Set();const fields=input.fields.map((f,index)=>{
  keys(f,['id','label','type','required','options']);
  if(typeof f.id!=='string'||!/^q_[a-z\d]{6,32}$/.test(f.id)||ids.has(f.id))fail('Ongeldige vraag-ID.');ids.add(f.id);
  if(!['short','long','choice','multi','boolean'].includes(f.type)||typeof f.required!=='boolean')fail('Ongeldig vraagtype.');
  const label=text(f.label,200,'Vraag '+(index+1));let options=[];
  if(['choice','multi'].includes(f.type)){
   if(!Array.isArray(f.options)||f.options.length<2||f.options.length>20)fail('Een keuzevraag heeft 2 tot 20 opties.');
   options=f.options.map(o=>text(o,100,'Keuzeoptie'));if(new Set(options).size!==options.length)fail('Keuzeopties moeten uniek zijn.');
  }else if(f.options!==undefined&&(!Array.isArray(f.options)||f.options.length))fail('Dit vraagtype heeft geen keuzeopties.');
  return {id:f.id,label,type:f.type,required:f.required,options};
 });
 return {title,description,audience:{mode:audience.mode,users},fields};
}
export function normalizeFormAnswers(schema,input){
 if(!obj(input)||Object.keys(input).some(k=>!schema.fields.some(f=>f.id===k)))fail('De antwoorden bevatten een onbekende vraag.');
 const answers={};
 for(const field of schema.fields){
  const value=input[field.id];let answer;
  if(value===undefined||value===null||value===''){
   if(field.required)fail('Vul de verplichte vraag in: '+field.label);answer=field.type==='multi'?[]:null;
  }else if(field.type==='boolean'){
   if(typeof value!=='boolean')fail('Kies Ja of Nee bij: '+field.label);answer=value;
  }else if(field.type==='multi'){
   if(!Array.isArray(value)||value.length>field.options.length||value.some(v=>!field.options.includes(v))||new Set(value).size!==value.length)fail('Ongeldige keuzes bij: '+field.label);
   if(field.required&&!value.length)fail('Kies minimaal één optie bij: '+field.label);answer=[...value];
  }else if(field.type==='choice'){
   if(typeof value!=='string'||!field.options.includes(value))fail('Kies een geldige optie bij: '+field.label);answer=value;
  }else{
   answer=text(value,field.type==='short'?300:4000,field.label,field.required);
  }
  answers[field.id]=answer;
 }
 return answers;
}
export function formAudienceAllows(form,user){return user===LOGSITE_OWNER||form.schema.audience.mode==='all'||form.schema.audience.users.includes(user);}
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function formsStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS site_forms(guild TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,schema_json TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,PRIMARY KEY(guild,id));
 CREATE TABLE IF NOT EXISTS site_form_submissions(guild TEXT NOT NULL,id TEXT NOT NULL,form TEXT NOT NULL,user TEXT NOT NULL,username TEXT NOT NULL,time INTEGER NOT NULL,revision INTEGER NOT NULL,snapshot_json TEXT NOT NULL,answers_json TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(guild,id),UNIQUE(guild,form,user),UNIQUE(guild,request_id));
 CREATE INDEX IF NOT EXISTS site_form_submission_time ON site_form_submissions(guild,form,time DESC);`);
 const decode=r=>r?{id:r.id,revision:r.revision,schema:JSON.parse(r.schema_json),status:r.status,created:r.created,updated:r.updated,responseCount:r.response_count??undefined}:null;
 const get=(guild,id)=>decode(db.prepare('SELECT * FROM site_forms WHERE guild=? AND id=?').get(guild,id));
 const audit=(guild,actor,action,id,detail)=>{
  const logid='forms:'+randomUUID(),time=Date.now(),e={id:logid,cat:'system',action,time,person:actor,actor,channel:'Formulieren',detail:`Formulier-ID: ${id}\n${detail}`,source:'Website'};
  db.prepare('INSERT INTO web_logs VALUES(?,?,?,?,?,?,?,?,?)').run(logid,guild,e.cat,e.action,time,actor,e.channel,e.detail,JSON.stringify(e));
 };
 const response=r=>({id:r.id,user:r.user,username:r.username,time:r.time,revision:r.revision,snapshot:JSON.parse(r.snapshot_json),answers:JSON.parse(r.answers_json)});
 return {
  siteForm:get,
  listSiteForms(guild){return db.prepare('SELECT f.*,(SELECT COUNT(*) FROM site_form_submissions s WHERE s.guild=f.guild AND s.form=f.id) response_count FROM site_forms f WHERE guild=? ORDER BY updated DESC,id').all(guild).map(decode);},
  saveSiteForm(guild,actor,{id,revision,schema,status,create=false}){
   if(actor!==LOGSITE_OWNER)fail('Alleen Website Development kan formulieren beheren.',403);
   if(!uuid.test(id)||!Number.isSafeInteger(revision)||revision<0||!['draft','open','closed','archived'].includes(status))fail('Ongeldig formulier.');
   schema=normalizeFormSchema(schema);
   db.exec('BEGIN IMMEDIATE');try{
    const old=get(guild,id);
    if(create&&old){if(old.revision===1&&old.status===status&&JSON.stringify(old.schema)===JSON.stringify(schema)){db.exec('COMMIT');return {...old,changed:false};}fail('Dit aanmaakverzoek is al gebruikt.',409);}
    if(create&&revision!==0)fail('Een nieuw formulier begint bij versie 0.');
    if(!create&&!old)fail('Formulier niet gevonden.',404);
    if(old&&old.revision!==revision)fail('Het formulier is intussen gewijzigd. Herlaad de actuele versie.',409);
    const now=Date.now(),next=revision+1;
    db.prepare('INSERT INTO site_forms VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild,id) DO UPDATE SET revision=excluded.revision,schema_json=excluded.schema_json,status=excluded.status,updated=excluded.updated').run(guild,id,next,JSON.stringify(schema),status,old?.created||now,now);
    audit(guild,actor,create?'Formulier aangemaakt':'Formulier gewijzigd',id,`Status: ${status} · Versie: ${next}`);
    db.exec('COMMIT');return {...get(guild,id),changed:true};
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  ownSiteSubmission(guild,form,user){const r=db.prepare('SELECT id,time,revision FROM site_form_submissions WHERE guild=? AND form=? AND user=?').get(guild,form,user);return r||null;},
  submitSiteForm(guild,user,username,{id,revision,requestId,answers}){
   if(!uuid.test(id)||!uuid.test(requestId)||!Number.isSafeInteger(revision)||revision<1)fail('Ongeldig inzendverzoek.');
   db.exec('BEGIN IMMEDIATE');try{
    const form=get(guild,id);if(!form||!formAudienceAllows(form,user))fail('Dit formulier is niet beschikbaar.',404);
    // Retries can confirm the original request even if the owner subsequently closes/edits the form.
    const prior=db.prepare('SELECT * FROM site_form_submissions WHERE guild=? AND request_id=?').get(guild,requestId);
    if(prior){
     if(prior.form!==id||prior.user!==user)fail('Dit inzendverzoek is al gebruikt.',409);
     const normalized=normalizeFormAnswers(JSON.parse(prior.snapshot_json),answers);
     if(prior.fingerprint!==hash({revision,answers:normalized}))fail('Dit inzendverzoek is al gebruikt.',409);
     db.exec('COMMIT');return {id:prior.id,time:prior.time,revision:prior.revision,duplicate:true};
    }
    if(form.status!=='open')fail('Dit formulier is niet meer open.',409);
    if(form.revision!==revision)fail('De vragen zijn intussen gewijzigd. Open het formulier opnieuw voordat je inzendt.',409);
    if(db.prepare('SELECT 1 FROM site_form_submissions WHERE guild=? AND form=? AND user=?').get(guild,id,user))fail('Je hebt dit formulier al ingevuld.',409);
    const normalized=normalizeFormAnswers(form.schema,answers),submission=randomUUID(),time=Date.now();
    const snapshot={title:form.schema.title,description:form.schema.description,fields:form.schema.fields};
    db.prepare('INSERT INTO site_form_submissions VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(guild,submission,id,user,String(username).slice(0,100),time,revision,JSON.stringify(snapshot),JSON.stringify(normalized),requestId,hash({revision,answers:normalized}));
    audit(guild,user,'Formulier ingevuld',id,`Versie: ${revision}. Antwoorden zijn alleen zichtbaar voor Website Development.`);
    db.exec('COMMIT');return {id:submission,time,revision,duplicate:false};
   }catch(e){db.exec('ROLLBACK');throw e;}
  },
  siteFormResponses(guild,actor,id,page=1){
   if(actor!==LOGSITE_OWNER)fail('Alleen Website Development kan antwoorden bekijken.',403);
   if(!get(guild,id))fail('Formulier niet gevonden.',404);
   const total=db.prepare('SELECT COUNT(*) n FROM site_form_submissions WHERE guild=? AND form=?').get(guild,id).n,pages=Math.max(1,Math.ceil(total/30));page=Math.max(1,Math.min(pages,Math.floor(Number(page)||1)));
   const rows=db.prepare('SELECT * FROM site_form_submissions WHERE guild=? AND form=? ORDER BY time DESC,id LIMIT 30 OFFSET ?').all(guild,id,(page-1)*30).map(response);
   return {rows,total,page,pages};
  },
  *exportSiteFormResponses(guild,actor,id){
   if(actor!==LOGSITE_OWNER)fail('Alleen Website Development kan antwoorden exporteren.',403);
   if(!get(guild,id))fail('Formulier niet gevonden.',404);
   for(const r of db.prepare('SELECT * FROM site_form_submissions WHERE guild=? AND form=? ORDER BY time,id').iterate(guild,id))yield response(r);
  }
 };
}
