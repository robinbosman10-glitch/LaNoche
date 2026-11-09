(()=>{
 'use strict';
 window.lnTools=window.lnTools||{};
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const statusName={draft:'Concept',open:'Open voor inzendingen',closed:'Gesloten',archived:'Gearchiveerd'};
 const typeName={short:'Kort antwoord',long:'Lang antwoord',choice:'Eén keuze',multi:'Meerdere keuzes',boolean:'Ja / nee'};
 const date=t=>new Date(t).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const newQuestion=()=>({id:'q_'+crypto.randomUUID().replaceAll('-','').slice(0,12),label:'',type:'short',required:true,options:[]});
 let host=null,identity=null,epoch=0,data=null,view='list',editor=null,dirty=false,active=null,responseValues={},submissionRequest=null,results=null,busy=false,message='',error=false;
 const $=q=>host?.querySelector(q);
 function notice(value,isError=false){message=value;error=isError;for(const n of host?.querySelectorAll('.forms-notice,.forms-inline-notice')||[]){n.textContent=value;n.classList.toggle('forms-error',isError);}}
 function button(label,action,extra=''){return `<button type="button" class="button ${action==='save'?'accent':''}" data-forms-action="${action}" ${extra}>${label}</button>`;}
 function working(value){busy=value;host?.querySelectorAll('button,input,select,textarea').forEach(e=>{if(value){e.dataset.formsWasDisabled=e.disabled?'yes':'no';e.disabled=true;}else if('formsWasDisabled' in e.dataset){e.disabled=e.dataset.formsWasDisabled==='yes';delete e.dataset.formsWasDisabled;}});}
 async function api(path,method='GET',body){
  const requestEpoch=epoch;
  const r=await fetch('/api/forms'+path,{method,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000),...(method==='GET'?{}:{headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify(body)})});
  const result=await r.json();if(requestEpoch!==epoch)throw new Error('Verzoek geannuleerd.');if(r.status===401){window.lnRequireLogin?.();throw new Error('Je sessie is verlopen. Log opnieuw in.');}if(!r.ok)throw new Error(result.error||'Deze actie is niet gelukt.');return result;
 }
 function frame(content){
  if(!host)return;host.innerHTML=`<div class="forms-workspace"><div class="forms-top"><div><span class="forms-kicker">LA NOCHE / FORMULIEREN</span><h2>${view==='edit'?'Formulierbouwer':view==='results'?'Antwoorden':view==='fill'?'Formulier invullen':'Van vraag naar antwoord.'}</h2><p>${identity.admin?'Maak je eigen formulieren. Jij bepaalt wie mag invullen; alleen jij ziet de antwoorden.':'Hier staan de formulieren die voor jouw account beschikbaar zijn.'}</p></div><div class="forms-actions">${view!=='list'?button('← Overzicht','list'):button('Vernieuwen','reload')}${identity.admin&&view!=='edit'?button('＋ Nieuw formulier','new'):''}</div></div><p class="forms-notice ${error?'forms-error':''}" role="status" aria-live="polite">${escape(message)}</p>${content}</div>`;
  host.onclick=click;host.oninput=input;host.onchange=change;host.onsubmit=submit;
 }
 function render(){
  if(!host)return;
  if(view==='edit'&&editor&&identity.admin)return renderEditor();
  if(view==='fill'&&active)return renderFill();
  if(view==='results'&&results&&identity.admin)return renderResults();
  view='list';
  if(!data){frame('<div class="forms-empty">Formulieren laden…</div>');return;}
  const forms=data.forms||[];
  frame(`<div class="forms-summary"><b>${forms.filter(f=>f.status==='open').length}</b> open ${identity.admin?`<span>·</span> <b>${forms.reduce((n,f)=>n+(f.responseCount||0),0)}</b> inzendingen`:''}<span>·</span> Maximaal één inzending per account per formulier</div><div class="forms-cards">${forms.map(f=>`<article class="forms-card"><span class="forms-badge forms-${escape(f.status)}">${statusName[f.status]}</span><h3>${escape(f.schema.title)}</h3><p>${escape(f.schema.description||'Geen aanvullende beschrijving.')}</p><div class="forms-meta">${f.schema.fields.length} vragen ${identity.admin?'· '+(f.responseCount||0)+' antwoorden':''}${f.submitted?' · Ingevuld op '+date(f.submitted.time):''}</div><div class="forms-actions">${identity.admin?button('Bewerken','edit',`data-id="${f.id}"`)+button('Antwoorden','results',`data-id="${f.id}"`):''}${f.status==='open'||f.submitted?button(f.submitted?'Inzending bevestigd':'Open formulier','fill',`data-id="${f.id}"`):''}</div></article>`).join('')||`<div class="forms-empty"><h3>${identity.admin?'Bouw je eerste formulier':'Er staan geen formulieren klaar'}</h3><p>${identity.admin?'Voeg vragen toe, kies de doelgroep en open het formulier wanneer je klaar bent.':'Nieuwe formulieren voor jouw account verschijnen hier.'}</p></div>`}</div>`);
 }
 function renderEditor(){
  const s=editor.schema;
  frame(`<form class="forms-editor-form"><div class="forms-editor-layout"><div class="forms-editor-main"><section class="forms-card"><h3>01 / Instellingen</h3><label class="forms-label">Titel<input data-form-prop="title" value="${escape(s.title)}" maxlength="120" required></label><label class="forms-label">Beschrijving<textarea data-form-prop="description" rows="3" maxlength="2000">${escape(s.description)}</textarea></label><div class="forms-two"><label class="forms-label">Status<select data-form-prop="status">${Object.entries(statusName).map(([k,v])=>`<option value="${k}" ${editor.status===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="forms-label">Wie mag invullen?<select data-form-prop="audience"><option value="all" ${s.audience.mode==='all'?'selected':''}>Alle toegelaten accounts</option><option value="selected" ${s.audience.mode==='selected'?'selected':''}>Alleen geselecteerde accounts</option></select></label></div><p class="forms-help">Open: beschikbaar voor de doelgroep. Concept, gesloten en gearchiveerd: geen nieuwe inzendingen. Antwoorden blijven bewaard.</p><div class="forms-audience" ${s.audience.mode!=='selected'?'hidden':''}>${(data?.accounts||[]).map(u=>`<label><input type="checkbox" data-audience-id="${escape(u.user)}" ${s.audience.users.includes(u.user)?'checked':''}><span>${escape(u.label)}<small>${escape(u.user)}</small></span></label>`).join('')}</div></section><section class="forms-card"><div class="forms-section-head"><h3>02 / Vragen</h3><span>${s.fields.length} / 20</span></div><div class="forms-questions">${s.fields.map((f,i)=>`<div class="forms-question" data-question="${f.id}"><div class="forms-section-head"><strong>Vraag ${i+1}</strong><div class="forms-actions">${button('↑','up',`data-q="${f.id}" aria-label="Vraag omhoog"`)}${button('↓','down',`data-q="${f.id}" aria-label="Vraag omlaag"`)}${button('Verwijderen','remove-question',`data-q="${f.id}"`)}</div></div><label class="forms-label">Vraag<input data-question-prop="label" value="${escape(f.label)}" maxlength="200" required></label><div class="forms-two"><label class="forms-label">Antwoordtype<select data-question-prop="type">${Object.entries(typeName).map(([k,v])=>`<option value="${k}" ${f.type===k?'selected':''}>${v}</option>`).join('')}</select></label><label class="forms-check"><input data-question-prop="required" type="checkbox" ${f.required?'checked':''}> Verplicht</label></div>${['choice','multi'].includes(f.type)?`<label class="forms-label">Opties — één per regel<textarea data-question-prop="options" rows="4" maxlength="2200" placeholder="Optie 1&#10;Optie 2">${escape(f.options.join('\n'))}</textarea><small>2 tot 20 unieke opties, maximaal 100 tekens per optie.</small></label>`:''}</div>`).join('')}</div>${button('＋ Vraag toevoegen','add-question')}</section></div><aside class="forms-preview"><div class="forms-section-head"><h3>Live voorbeeld</h3><span class="forms-badge">VOORBEELD</span></div><div class="forms-preview-body"></div></aside></div><div class="forms-savebar"><div><b>${dirty?'Niet-opgeslagen wijzigingen':editor.id?'Alles opgeslagen':'Nieuw formulier'}</b><p>Inzendingen zijn alleen zichtbaar voor jou. Opslaan als Open maakt het formulier beschikbaar.</p><p class="forms-inline-notice ${error?'forms-error':''}" role="status">${escape(message)}</p></div><button type="submit" class="button accent">${editor.id?'Wijzigingen opslaan':'Formulier opslaan'}</button></div></form>`);
  preview();
 }
 function fieldsHtml(schema,values={},previewMode=false){
  return schema.fields.map(f=>{
   const value=values[f.id],attrs=`data-answer-id="${f.id}" aria-label="${escape(f.label)}" ${f.required?'required':''}`;let control;
   if(f.type==='short')control=`<input ${attrs} maxlength="300" value="${escape(value||'')}">`;
   if(f.type==='long')control=`<textarea ${attrs} rows="4" maxlength="4000">${escape(value||'')}</textarea>`;
   if(f.type==='choice')control=`<select ${attrs}><option value="">Kies een optie</option>${f.options.map(o=>`<option value="${escape(o)}" ${value===o?'selected':''}>${escape(o)}</option>`).join('')}</select>`;
   if(f.type==='boolean')control=`<select ${attrs}><option value="">Kies Ja of Nee</option><option value="yes" ${value===true?'selected':''}>Ja</option><option value="no" ${value===false?'selected':''}>Nee</option></select>`;
   if(f.type==='multi')control=`<div class="forms-multi">${f.options.map(o=>`<label><input type="checkbox" data-answer-id="${f.id}" value="${escape(o)}" ${(value||[]).includes(o)?'checked':''}>${escape(o)}</label>`).join('')}</div>`;
   return `<div class="forms-answer"><div class="forms-label"><span>${escape(f.label||'Je vraag komt hier')}${f.required?' <em>*</em>':''}</span>${control}</div></div>`;
  }).join('');
 }
 function preview(){const p=$('.forms-preview-body');if(!p)return;p.innerHTML=`<h3>${escape(editor.schema.title||'Titel van je formulier')}</h3><p>${escape(editor.schema.description)}</p>${fieldsHtml(editor.schema,{},true)}<span class="forms-help">Dit voorbeeld verstuurt geen antwoorden.</span>`;p.querySelectorAll('input,textarea,select').forEach(e=>e.disabled=true);}
 function renderFill(){
  const f=active;
  if(f.submitted){frame(`<div class="forms-confirmation"><span>✓</span><h3>Je inzending is ontvangen</h3><p>${escape(f.schema.title)}</p><p>Ingevuld op ${date(f.submitted.time)}. Je kunt dit formulier één keer invullen.</p>${button('Terug naar formulieren','list')}</div>`);return;}
  frame(`<form class="forms-fill-form forms-card"><span class="forms-badge">${statusName[f.status]}</span><h3>${escape(f.schema.title)}</h3><p class="forms-description">${escape(f.schema.description)}</p>${fieldsHtml(f.schema,responseValues)}<div class="forms-submit-note">Alleen Website Development kan je antwoorden bekijken. Je kunt één keer inzenden.</div><p class="forms-inline-notice ${error?'forms-error':''}" role="status">${escape(message)}</p><button type="submit" class="button accent" ${f.status!=='open'?'disabled':''}>Antwoorden versturen</button></form>`);
 }
 function renderResults(){
  const r=results;
  frame(`<div class="forms-results-head"><div><h3>${escape(r.form.schema.title)}</h3><p>${r.total} inzendingen · originele vragen blijven bij elk antwoord bewaard</p></div>${button('Download CSV','export',`data-id="${r.form.id}"`)}</div><div class="forms-results">${r.rows.map(row=>`<details class="forms-card"><summary><span><b>${escape(row.username)}</b><small>${escape(row.user)}</small></span><span>${date(row.time)}<small>Versie ${row.revision}</small></span></summary><div class="forms-response-body"><h4>${escape(row.snapshot.title)}</h4>${row.snapshot.fields.map(f=>{const v=row.answers[f.id],answer=Array.isArray(v)?v.join(', '):typeof v==='boolean'?(v?'Ja':'Nee'):v;return `<div><b>${escape(f.label)}</b><p>${escape(answer??'Niet ingevuld')}</p></div>`;}).join('')}</div></details>`).join('')||'<div class="forms-empty">Er zijn nog geen antwoorden.</div>'}</div><div class="forms-pagination">${button('Vorige','results-page',`data-page="${r.page-1}" ${r.page<=1?'disabled':''}`)}<span>Pagina ${r.page} / ${r.pages}</span>${button('Volgende','results-page',`data-page="${r.page+1}" ${r.page>=r.pages?'disabled':''}`)}</div>`);
 }
 async function loadList(){const token=epoch;working(true);notice('Formulieren ophalen…');try{const r=await api('');if(token!==epoch)return;data=r;notice('');render();}catch(e){if(token===epoch)notice(e.message,true);}finally{if(token===epoch)working(false);}}
 function newEditor(){return {id:null,requestId:crypto.randomUUID(),revision:0,status:'draft',schema:{title:'',description:'',audience:{mode:'all',users:[]},fields:[newQuestion()]}};}
 async function click(e){
  const b=e.target.closest('[data-forms-action]');if(!b||busy)return;const action=b.dataset.formsAction,id=b.dataset.id;
  if(['list','new','edit','fill','results','reload'].includes(action)&&dirty&&view==='edit'&&action!=='edit'&&!confirm('Je formulier heeft niet-opgeslagen wijzigingen. Deze invoer verlaten?'))return;
  if(action==='list'){view='list';dirty=false;notice('');render();return;}
  if(action==='reload'){await loadList();return;}
  if(action==='new'){editor=newEditor();dirty=false;view='edit';notice('');render();return;}
  if(action==='add-question'){if(editor.schema.fields.length>=20){notice('Maximaal 20 vragen per formulier.',true);return;}editor.schema.fields.push(newQuestion());dirty=true;renderEditor();return;}
  if(['remove-question','up','down'].includes(action)){
   const fields=editor.schema.fields,i=fields.findIndex(f=>f.id===b.dataset.q);if(i<0)return;
   if(action==='remove-question'){if(fields.length===1){notice('Bewaar minimaal één vraag.',true);return;}fields.splice(i,1);}else{const j=i+(action==='up'?-1:1);if(j<0||j>=fields.length)return;[fields[i],fields[j]]=[fields[j],fields[i]];}
   dirty=true;renderEditor();return;
  }
  if(action==='export'){const a=document.createElement('a');a.href='/api/forms/'+id+'/export';a.download='la-noche-antwoorden.csv';a.click();return;}
  const token=epoch;working(true);notice('Laden…');
  try{
   if(action==='results'||action==='results-page'){const r=await api('/'+(id||results.form.id)+'/responses?page='+(b.dataset.page||1));if(token!==epoch)return;results=r;view='results';}
   else if(action==='edit'||action==='fill'){
    const {form}=await api('/'+id);if(token!==epoch)return;
    if(action==='edit'){editor=structuredClone(form);dirty=false;view='edit';}
    else{if(!active||active.id!==form.id||active.revision!==form.revision){responseValues={};submissionRequest=crypto.randomUUID();}active=form;view='fill';}
   }
   notice('');render();
  }catch(err){if(token===epoch)notice(err.message,true);}finally{if(token===epoch)working(false);}
 }
 function updateEditor(e){
  const el=e.target;if(el.closest('.forms-preview'))return;
  const prop=el.dataset.formProp;
  if(prop){if(prop==='status')editor.status=el.value;else if(prop==='audience'){editor.schema.audience.mode=el.value;if(el.value==='all')editor.schema.audience.users=[];}else editor.schema[prop]=el.value;}
  if(el.dataset.audienceId)editor.schema.audience.users=[...host.querySelectorAll('[data-audience-id]:checked')].map(c=>c.dataset.audienceId);
  const qprop=el.dataset.questionProp;if(qprop){const q=editor.schema.fields.find(f=>f.id===el.closest('[data-question]').dataset.question);if(qprop==='required')q.required=el.checked;else if(qprop==='options')q.options=el.value.split('\n').map(x=>x.trim()).filter(Boolean);else q[qprop]=el.value;}
  if(prop||qprop||el.dataset.audienceId){dirty=true;notice('');const hint=$('.forms-savebar b');if(hint)hint.textContent='Niet-opgeslagen wijzigingen';preview();}
 }
 function input(e){if(view==='edit')updateEditor(e);if(view==='fill'){const id=e.target.dataset.answerId;if(!id)return;const f=active.schema.fields.find(f=>f.id===id);if(f.type==='multi')responseValues[id]=[...host.querySelectorAll('[data-answer-id="'+id+'"]:checked')].map(c=>c.value);else if(f.type==='boolean')responseValues[id]=e.target.value===''?null:e.target.value==='yes';else responseValues[id]=e.target.value;}}
 function change(e){if(view==='edit'){updateEditor(e);if(e.target.dataset.formProp==='audience'||e.target.dataset.questionProp==='type'){if(e.target.dataset.questionProp==='type'){const q=editor.schema.fields.find(f=>f.id===e.target.closest('[data-question]').dataset.question);if(!['choice','multi'].includes(q.type))q.options=[];}renderEditor();}}else input(e);}
 async function submit(e){
  if(!e.target.matches('.forms-editor-form,.forms-fill-form'))return;e.preventDefault();if(busy)return;
  const token=epoch;working(true);notice('Opslaan…');
  try{
   if(view==='edit'&&identity.admin){
    const create=!editor.id,r=await api(create?'':'/'+editor.id,create?'POST':'PUT',{...(create?{requestId:editor.requestId}:{revision:editor.revision}),schema:editor.schema,status:editor.status});
    if(token!==epoch)return;editor=structuredClone(r.form);dirty=false;if(data){const i=data.forms.findIndex(f=>f.id===editor.id);if(i>=0)data.forms[i]={...r.form,responseCount:data.forms[i].responseCount||0};else data.forms.unshift(r.form);}notice('Opgeslagen. '+(editor.status==='open'?'De doelgroep kan dit formulier nu invullen.':'Status: '+statusName[editor.status]+'.'));renderEditor();
   }else if(view==='fill'){
    const r=await api('/'+active.id+'/submit','POST',{revision:active.revision,requestId:submissionRequest,answers:responseValues});if(token!==epoch)return;active.submitted=r.submission;const listForm=data?.forms.find(f=>f.id===active.id);if(listForm)listForm.submitted=r.submission;notice('');renderFill();
   }
  }catch(err){if(token===epoch)notice(err.name==='TimeoutError'?'Nog geen bevestiging ontvangen. Je invoer blijft staan; probeer opnieuw om dezelfde inzending te bevestigen.':err.message,true);}finally{if(token===epoch)working(false);}
 }
 window.lnTools.forms={
  open(element,who){if(identity&&identity.id!==who.id)this.clear();host=element;identity=who;++epoch;render();if(!data)loadList();},
  close(){++epoch;busy=false;if(host){host.onclick=null;host.oninput=null;host.onchange=null;host.onsubmit=null;}host=null;},
  clear(){this.close();identity=null;data=null;view='list';editor=null;dirty=false;active=null;responseValues={};submissionRequest=null;results=null;message='';error=false;}
 };
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
})();
