import {currentLogsiteUser,logsiteOrigin} from './logsite-auth.js';
import {LOGSITE_OWNER,sameSecret} from './logsite-auth-store.js';
import {FormError,formAudienceAllows,normalizeFormSchema} from './forms-store.js';
const validId=id=>/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(id);
const allowedKeys=(body,keys)=>body&&typeof body==='object'&&!Array.isArray(body)&&Object.keys(body).every(k=>keys.includes(k));
export function formsCsvCell(value){let v=String(value??'');if(/^[\s]*[=+@\-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';}
export function createFormsApi(store,getClient,guildId){
 return async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  if(path!=='/api/forms'&&!path.startsWith('/api/forms/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));return true;};
  let session=currentLogsiteUser(req,store,guildId);
  if(!session)return send(401,{error:'Log eerst in met Discord.'});
  if(!store.logsiteAllowed(guildId,session.user))return send(403,{error:'Je account heeft geen toegang tot dit portaal.'});
  const owner=session.user===LOGSITE_OWNER;
  const match=path.match(/^\/api\/forms\/([^/]+)(?:\/(submit|responses|export))?$/),id=match?.[1],action=match?.[2];
  if(path!=='/api/forms'&&(!match||!validId(id)))return send(404,{error:'Formulier niet gevonden.'});
  if((['responses','export'].includes(action)||(['POST','PUT'].includes(req.method)&&action!=='submit'))&&!owner)return send(403,{error:'Alleen Website Development kan formulieren en antwoorden beheren.'});
  const visible=form=>form&&formAudienceAllows(form,session.user)&&(owner||['open','closed'].includes(form.status));
  const publicForm=form=>({id:form.id,revision:form.revision,status:form.status,created:form.created,updated:form.updated,schema:owner?form.schema:{title:form.schema.title,description:form.schema.description,fields:form.schema.fields},...(owner?{responseCount:form.responseCount}:{}),submitted:store.ownSiteSubmission(guildId,form.id,session.user)});
  try{
   if(req.method==='GET'){
    if(path==='/api/forms')return send(200,{admin:owner,forms:store.listSiteForms(guildId).filter(visible).map(publicForm),...(owner?{accounts:[{user:LOGSITE_OWNER,label:'Jij — Website Development'},...store.logsiteUsers(guildId).map(u=>({user:u.user,label:u.label||u.user}))]}:{})});
    const form=store.siteForm(guildId,id);if(!visible(form))return send(404,{error:'Dit formulier is niet beschikbaar.'});
    if(action==='responses')return send(200,{form:publicForm(form),...store.siteFormResponses(guildId,session.user,id,url.searchParams.get('page'))});
    if(action==='export'){
     res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="la-noche-formulier-'+id+'.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
     // One row per answer retains the exact original question even after schema edits.
     res.write('\ufeffInzending;Discord-ID;Naam;Datum;Formulier;Versie;Vraag;Antwoord\r\n');
     for(const row of store.exportSiteFormResponses(guildId,session.user,id))for(const f of row.snapshot.fields){const a=row.answers[f.id],answer=Array.isArray(a)?a.join(' | '):typeof a==='boolean'?(a?'Ja':'Nee'):a;res.write([row.id,row.user,row.username,new Date(row.time).toISOString(),row.snapshot.title,row.revision,f.label,answer].map(formsCsvCell).join(';')+'\r\n');}
     res.end();return true;
    }
    if(action)return send(405,{error:'Gebruik POST om dit formulier in te zenden.'});
    return send(200,{form:publicForm(form)});
   }
   if(!((path==='/api/forms'&&req.method==='POST')||(id&&!action&&req.method==='PUT')||(action==='submit'&&req.method==='POST')))return send(405,{error:'Methode niet toegestaan.'});
   if(req.headers.origin!==logsiteOrigin()||!sameSecret(req.headers['x-csrf-token'],session.csrf))return send(403,{error:'Ongeldig beveiligingstoken. Herlaad de pagina.'});
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON vereist.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>100000)return send(413,{error:'Het formulier is te groot.'});}
   session=currentLogsiteUser(req,store,guildId);if(!session)return send(401,{error:'Je sessie is verlopen. Log opnieuw in.'});if(!store.logsiteAllowed(guildId,session.user))return send(403,{error:'Je account heeft geen toegang meer.'});
   let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'Ongeldige invoer.'});}
   if(action==='submit'){
    if(!allowedKeys(body,['revision','requestId','answers']))return send(400,{error:'Ongeldig inzendverzoek.'});
    const result=store.submitSiteForm(guildId,session.user,session.username,{id,...body});return send(200,{ok:true,submission:result});
   }
   const create=path==='/api/forms';
   if(!allowedKeys(body,create?['requestId','schema','status']:['revision','schema','status']))return send(400,{error:'Ongeldige formulierinstellingen.'});
   const schema=normalizeFormSchema(body.schema);
   if(schema.audience.mode==='selected'&&schema.audience.users.some(user=>!store.logsiteAllowed(guildId,user)))return send(400,{error:'De doelgroep bevat een account zonder portaaltoegang. Pas de selectie aan.'});
   if(create&&store.listSiteForms(guildId).length>=200&&!store.siteForm(guildId,body.requestId))return send(409,{error:'Er kunnen maximaal 200 formulieren worden bewaard.'});
   const result=store.saveSiteForm(guildId,session.user,{id:create?body.requestId:id,revision:create?0:body.revision,schema,status:body.status??'draft',create});
   return send(200,{ok:true,form:publicForm(result)});
  }catch(e){
   if(e instanceof FormError)return send(e.status,{error:e.message});
   console.error('Formulieren verwerken mislukt',e.code??e.name);return send(503,{error:'Formulieren zijn tijdelijk niet beschikbaar. Je invoer blijft bewaard op deze pagina.'});
  }
 };
}
