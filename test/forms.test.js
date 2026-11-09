import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {formsStore,normalizeFormAnswers,normalizeFormSchema} from '../src/forms-store.js';
import {createFormsApi,formsCsvCell} from '../src/forms-api.js';
import {logsiteStore} from '../src/logsite-store.js';
import {logsiteAuthStore,LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {sessionCookie} from '../src/logsite-auth.js';
const G='1311580149094809650',U='111111111111111111',OTHER='222222222222222222';
const schema=(mode='all')=>({title:'Aanmelding',description:'Vertel iets.',audience:{mode,users:mode==='all'?[]:[U]},fields:[{id:'q_first01',label:'Waarom wil je meedoen?',type:'long',required:true,options:[]},{id:'q_first02',label:'Aanwezig?',type:'boolean',required:true,options:[]},{id:'q_first03',label:'Voorkeur',type:'choice',required:false,options:['A','B']}]});
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'ln-forms-')),file=join(dir,'test.sqlite'),db=new DatabaseSync(file),store={...logsiteStore(db),...logsiteAuthStore(db),...formsStore(db)};
 for(const id of [U,OTHER])store.changeLogsiteAccess(G,LOGSITE_OWNER,id,true);
 const sessions={};for(const id of [LOGSITE_OWNER,U,OTHER]){const token=store.loginLogsite(G,id,'Naam '+id);sessions[id]={cookie:sessionCookie+'='+token,'x-csrf-token':store.logsiteSession(token).csrf,'content-type':'application/json',origin:'https://la-noche-logs.nl'};}
 const api=createFormsApi(store,()=>null,G);
 const dispatch=async(path,method='GET',who=LOGSITE_OWNER,body,overrides={})=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);req.url='/api/forms'+path;req.method=method;req.headers={...(who?sessions[who]:{}),...overrides};const result={text:'',headers:{}};
  await api(req,{writeHead(status,headers){result.status=status;result.headers=headers;},write(s){result.text+=s;},end(s){result.text+=s||'';}});if(result.headers['Content-Type']?.includes('json'))result.body=JSON.parse(result.text);return result;
 };
 const create=async(s=schema(),status='open')=>{const r=await dispatch('','POST',LOGSITE_OWNER,{requestId:randomUUID(),schema:s,status});assert.equal(r.status,200,r.text);return r.body.form;};
 return {db,store,dispatch,create,file,close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}
const answers=()=>({q_first01:'Mijn antwoord',q_first02:false,q_first03:'A'});
test('owner-only builder and results; audience limits lists/direct URLs; no account labels or audience leak',async()=>{
 const f=setup();try{
  const form=await f.create(schema('selected')),draft=await f.create(schema(),'draft');
  assert.equal((await f.dispatch('','GET',null)).status,401);
  assert.equal((await f.dispatch('','POST',U,{requestId:randomUUID(),schema:schema(),status:'open'})).status,403);
  const list=await f.dispatch('','GET',U);assert.equal(list.body.forms.length,1);assert.equal(list.body.forms[0].id,form.id);assert.equal(list.body.accounts,undefined);assert.equal(list.body.forms[0].schema.audience,undefined);
  assert.equal((await f.dispatch('/'+form.id,'GET',OTHER)).status,404);assert.equal((await f.dispatch('/'+draft.id,'GET',U)).status,404);
  for(const suffix of ['/responses','/export'])assert.equal((await f.dispatch('/'+form.id+suffix,'GET',U)).status,403);
  assert.equal((await f.dispatch('/'+form.id,'PUT',U,{revision:1,schema:schema(),status:'open'})).status,403);
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',OTHER,{revision:1,requestId:randomUUID(),answers:answers()})).status,404);
 }finally{f.close();}
});
test('CSRF, origin, current website access, statuses and schema revision enforced before submission',async()=>{
 const f=setup();try{
  const form=await f.create();const body={revision:1,requestId:randomUUID(),answers:answers()};
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,body,{'x-csrf-token':'bad'})).status,403);
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,body,{origin:'https://other.test'})).status,403);
  const edited=await f.dispatch('/'+form.id,'PUT',LOGSITE_OWNER,{revision:1,schema:schema(),status:'open'});assert.equal(edited.body.form.revision,2);
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,body)).status,409);
  assert.equal((await f.dispatch('/'+form.id,'PUT',LOGSITE_OWNER,{revision:1,schema:schema(),status:'open'})).status,409);
  await f.dispatch('/'+form.id,'PUT',LOGSITE_OWNER,{revision:2,schema:schema(),status:'closed'});
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,{...body,revision:3})).status,409);
  f.store.changeLogsiteAccess(G,LOGSITE_OWNER,U,false);assert.equal((await f.dispatch('/'+form.id,'GET',U)).status,401);
 }finally{f.close();}
});
test('idempotent creation and submission, original question snapshot preserved, responses durable and answers excluded from logs',async()=>{
 const f=setup();try{
  const create={requestId:randomUUID(),schema:schema(),status:'open'};
  const first=await f.dispatch('','POST',LOGSITE_OWNER,create),again=await f.dispatch('','POST',LOGSITE_OWNER,create);assert.equal(first.body.form.id,again.body.form.id);assert.equal(f.store.listSiteForms(G).length,1);
  const form=first.body.form,body={revision:1,requestId:randomUUID(),answers:answers()};
  const one=await f.dispatch('/'+form.id+'/submit','POST',U,body),retry=await f.dispatch('/'+form.id+'/submit','POST',U,body);assert.equal(one.status,200);assert.equal(retry.body.submission.id,one.body.submission.id);assert.equal(retry.body.submission.duplicate,true);
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,{...body,requestId:randomUUID()})).status,409);
  const newer=schema();newer.fields[0].label='Andere vraag';await f.dispatch('/'+form.id,'PUT',LOGSITE_OWNER,{revision:1,schema:newer,status:'closed'});
  const rows=(await f.dispatch('/'+form.id+'/responses')).body.rows;assert.equal(rows.length,1);assert.equal(rows[0].snapshot.fields[0].label,'Waarom wil je meedoen?');assert.equal(rows[0].answers.q_first02,false);
  assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,body)).body.submission.duplicate,true);
  assert(!JSON.stringify(f.store.queryWebLogs(G)).includes('Mijn antwoord'));
  const second=new DatabaseSync(f.file);try{const reopened=formsStore(second);assert.equal(reopened.siteFormResponses(G,LOGSITE_OWNER,form.id).rows[0].answers.q_first01,'Mijn antwoord');}finally{second.close();}
 }finally{f.close();}
});
test('strict answer/schema validation and cross-user retry rejection avoid hidden question leakage',async()=>{
 const f=setup();try{
  const form=await f.create();
  for(const a of [{q_first02:false},{...answers(),extra:'x'},{...answers(),q_first02:'yes'},{...answers(),q_first03:'Outside'},{...answers(),q_first01:'x'.repeat(4001)}])assert.equal((await f.dispatch('/'+form.id+'/submit','POST',U,{revision:1,requestId:randomUUID(),answers:a})).status,400);
  const body={revision:1,requestId:randomUUID(),answers:answers()};await f.dispatch('/'+form.id+'/submit','POST',U,body);
  const other=await f.dispatch('/'+form.id+'/submit','POST',OTHER,{...body,answers:{}});assert.equal(other.status,409);assert(!other.text.includes('Waarom wil je meedoen'));
  const bad=schema();bad.fields[0].id='__proto__';assert.throws(()=>normalizeFormSchema(bad));
  const multi={...schema(),fields:[{id:'q_multixx',label:'Kies',type:'multi',required:true,options:['A','B']}]};assert.throws(()=>normalizeFormAnswers(multi,{q_multixx:[]}));assert.throws(()=>normalizeFormAnswers(multi,{q_multixx:['A','A']}));
  assert.deepEqual(normalizeFormAnswers(multi,{q_multixx:['A','B']}),{q_multixx:['A','B']});
 }finally{f.close();}
});
test('CSV export retains original questions and neutralizes spreadsheet formulas',async()=>{
 const f=setup();try{
  const form=await f.create();await f.dispatch('/'+form.id+'/submit','POST',U,{revision:1,requestId:randomUUID(),answers:{...answers(),q_first01:'=HYPERLINK("https://example.com")'}});
  const csv=await f.dispatch('/'+form.id+'/export');assert.equal(csv.status,200);assert(csv.headers['Content-Type'].startsWith('text/csv'));assert(csv.text.includes("'=HYPERLINK"));assert(csv.text.includes('Waarom wil je meedoen?'));
  assert.equal(formsCsvCell(' +1'), '"\' +1"');assert.equal(formsCsvCell('"quoted"'),'"""quoted"""');
 }finally{f.close();}
});

test('client preserves disabled preview controls and ignores stale responses after account/page changes',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const disabled={disabled:true,dataset:{}},enabled={disabled:false,dataset:{}};
 let resolveFetch;const window={lnTools:{},addEventListener(){},lnRequireLogin(){throw new Error('Stale request must not reset new session');}};
 const source=readFileSync(new URL('../web/forms.js',import.meta.url),'utf8').replace('window.lnTools.forms={','window.__probe={working,api,fieldsHtml,setHost:x=>host=x,setIdentity:x=>identity=x,invalidate:()=>++epoch}; window.lnTools.forms={');
 runInNewContext(source,{window,URL,AbortSignal,console,fetch:()=>new Promise(resolve=>{resolveFetch=resolve;})});
 window.__probe.setHost({querySelectorAll:()=>[disabled,enabled]});window.__probe.working(true);assert.equal(enabled.disabled,true);window.__probe.working(false);assert.equal(disabled.disabled,true);assert.equal(enabled.disabled,false);
 window.__probe.setIdentity({csrf:'test'});const pending=window.__probe.api('');window.__probe.invalidate();resolveFetch({status:401,ok:false,json:async()=>({error:'expired'})});await assert.rejects(pending,/geannuleerd/);
 const html=window.__probe.fieldsHtml({fields:[{id:'q_multixx',label:'Keuzes',type:'multi',required:true,options:['A','B']}]});assert(!html.includes('<label class="forms-label">'));assert(html.includes('data-answer-id="q_multixx"'));
});
