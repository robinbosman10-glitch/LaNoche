(()=>{
 'use strict';
 window.lnTools=window.lnTools||{};
 let host=null,identity=null,data=null,options=null,controller=null,serial=0,mode='member',selected='',search='',filter='all',detail=null,error='',busy=false;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const $=s=>host?.querySelector(s);
 function clear(){close();identity=null;data=null;options=null;selected='';search='';filter='all';detail=null;error='';}
 function close(){controller?.abort();controller=null;++serial;busy=false;host=null;}
 async function get(path){
  controller?.abort();controller=new AbortController();const current=controller;const mine=++serial;busy=true;error='';status();
  const timeout=setTimeout(()=>current.abort(),15000);
  try{const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:current.signal});const result=await r.json();if(mine!==serial||!host)return null;if(r.status===401){clear();window.lnRequireLogin?.();return null;}if(!r.ok)throw Error(result.error||'Ophalen mislukt.');return result;}
  catch(e){if(mine===serial&&host){error=e.name==='AbortError'?'Discord reageert niet op tijd. Probeer opnieuw.':e.message;status();}return null;}
  finally{clearTimeout(timeout);if(mine===serial){busy=false;status();}}
 }
 function status(){if(!host)return;const e=$('.pm-status');if(e){e.textContent=busy?'Discord-rechten ophalen…':error||'Alleen-lezen · er worden geen rechten gewijzigd';e.classList.toggle('pm-error',!!error);}host.querySelectorAll('[data-pm-load],[data-pm-search]').forEach(b=>b.disabled=busy);}
 function selectOptions(){
  const list=mode==='role'?(options?.roles||[]):(options?.members||[]);
  const select=$('[data-pm-target]');if(!select)return;
  select.innerHTML='<option value="">Kies '+(mode==='role'?'een rol':'een lid')+'</option>'+list.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}${x.bot?' · bot':''}</option>`).join('');
  if(selected&&!list.some(x=>x.id===selected))select.innerHTML+=`<option value="${esc(selected)}" selected>${esc(selected)}</option>`;
  $('.pm-member-search').hidden=mode!=='member';$('.pm-search-note').textContent=mode==='member'?'Zoek op Discord-gebruikersnaam of plak een Discord-ID. De keuzelijst toont maximaal 50 geladen leden.':'Deze simulatie gebruikt de gekozen rol en @everyone. Kies een lid voor de combinatie van alle rollen.';
 }
 async function loadOptions(q=''){const result=await get('/api/permissions-map/options?q='+encodeURIComponent(q));if(result&&host){options=result;selectOptions();}}
 async function loadMap(){
  selected=$('[data-pm-target]').value;
  const direct=$('[data-pm-member-search]').value.trim();if(mode==='member'&&/^\d{17,20}$/.test(direct))selected=direct;
  if(!selected){error='Kies eerst een lid of rol.';status();return;}
  const result=await get('/api/permissions-map?mode='+mode+'&id='+encodeURIComponent(selected));if(result&&host){data=result;detail=null;renderResults();}
 }
 function renderResults(){
  if(!host)return;const root=$('.pm-results');if(!data){root.innerHTML='<div class="pm-empty"><span>◈</span><h2>Wie kan waar bij?</h2><p>Kies een lid of rol en klik op Rechten bekijken. Je ziet per kanaal zowel de toegang als de reden.</p></div>';return;}
  const channels=data.channels.filter(c=>!search||[c.name,c.parentName].join(' ').toLowerCase().includes(search.toLowerCase())).filter(c=>filter==='all'||(filter==='allowed'?c.permissions.view.allowed:!c.permissions.view.allowed));
  const visible=data.channels.filter(c=>c.type!==4&&c.permissions.view.allowed).length,blocked=data.channels.filter(c=>c.type!==4&&!c.permissions.view.allowed).length;
  root.innerHTML=`<div class="pm-subject"><div><span class="pm-eyebrow">${data.subject.mode==='role'?'ROLSIMULATIE':'LIDCONTROLE'}</span><h2>${esc(data.subject.name)}</h2><p>${esc(data.subject.id)} · opgehaald ${new Date(data.generatedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</p></div><div class="pm-summary"><span><b>${visible}</b>zichtbaar</span><span><b>${blocked}</b>afgeschermd</span></div></div><div class="pm-notes">${data.limitations.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="pm-map-toolbar"><label>Zoek kanaal<input data-pm-filter-search value="${esc(search)}" placeholder="Kanaal of categorie"></label><label>Toegang<select data-pm-filter><option value="all" ${filter==='all'?'selected':''}>Alle kanalen</option><option value="allowed" ${filter==='allowed'?'selected':''}>Alleen zichtbaar</option><option value="denied" ${filter==='denied'?'selected':''}>Alleen afgeschermd</option></select></label><span>✓ Toegestaan &nbsp; × Geblokkeerd &nbsp; — Niet van toepassing</span></div><div class="pm-table-scroll"><table class="pm-table"><thead><tr><th>Kanaal</th>${data.columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${channels.map(c=>`<tr class="${c.type===4?'pm-category':''}"><td><button data-pm-detail="${esc(c.id)}" data-pm-column="view"><span>${c.type===4?'▤':c.type===2||c.type===13?'◖':'#'} ${esc(c.name)}</span><small>${esc(c.typeLabel)}${c.type!==4?' · '+esc(c.parentName):''}</small></button></td>${data.columns.map(col=>{const v=c.permissions[col.key].allowed;return `<td><button class="pm-cell ${v===null?'pm-na':v?'pm-yes':'pm-no'}" data-pm-detail="${esc(c.id)}" data-pm-column="${col.key}" aria-label="${esc(c.name)}: ${esc(col.label)}, ${v===null?'niet van toepassing':v?'toegestaan':'geblokkeerd'}. Bekijk uitleg">${v===null?'—':v?'✓':'×'}</button></td>`;}).join('')}</tr>`).join('')||'<tr><td colspan="8" class="pm-no-results">Geen kanalen binnen deze selectie.</td></tr>'}</tbody></table></div><section class="pm-explanation" aria-live="polite"></section>`;
  renderDetail();
 }
 function renderDetail(){
  const root=$('.pm-explanation');if(!root)return;if(!detail){root.innerHTML='<p class="pm-click-hint">Klik op een vakje om te zien waarom dit recht is toegestaan of geblokkeerd.</p>';return;}
  const c=data.channels.find(c=>c.id===detail.id),column=data.columns.find(x=>x.key===detail.key);if(!c||!column)return;
  const p=c.permissions[detail.key];root.innerHTML=`<div class="pm-explain-head"><div><span class="pm-eyebrow">WAAROM DEZE UITKOMST?</span><h3>${esc(c.name)} · ${esc(column.label)}</h3></div><span class="pm-result ${p.allowed?'pm-yes':p.allowed===null?'pm-na':'pm-no'}">${p.allowed===null?'Niet van toepassing':p.allowed?'Toegestaan':'Geblokkeerd'}</span></div><p class="pm-raw">Ingestelde permissiebit: <b>${p.configured?'aan':'uit'}</b>. De uiteindelijke actie houdt ook rekening met kanaaltoegang en time-outs.</p><ol class="pm-steps">${p.steps.map(s=>`<li><span class="${s.allowed===null?'pm-na':s.allowed?'pm-yes':'pm-no'}">${s.allowed===null?'—':s.allowed?'✓':'×'}</span><div><b>${esc(s.label)}</b><p>${esc(s.detail)}</p></div></li>`).join('')}</ol><div class="pm-notes">${c.notes.map(n=>`<p>${esc(n)}</p>`).join('')}</div>`;
 }
 function open(node,user){
  close();host=node;identity=user;if(!identity?.admin){host.innerHTML='<p>Alleen Website Development heeft toegang.</p>';return;}
  host.innerHTML=`<div class="pm-intro"><div><span class="pm-eyebrow">WEBSITE DEVELOPMENT</span><h2>De rechten achter ieder kanaal.</h2><p>Bekijk toegang, uitzonderingen en rolcombinaties rechtstreeks uit Discord. Elke uitkomst is aanklikbaar.</p></div><span class="pm-readonly">Alleen-lezen</span></div><div class="pm-controls"><label>Controleren als<select data-pm-mode><option value="member" ${mode==='member'?'selected':''}>Een specifiek lid</option><option value="role" ${mode==='role'?'selected':''}>Eén rol + @everyone</option></select></label><div class="pm-member-search"><label>Zoek lid / Discord-ID<input data-pm-member-search maxlength="80" placeholder="Gebruikersnaam of Discord-ID"></label><button type="button" class="button" data-pm-search>Zoeken</button></div><label>Lid of rol<select data-pm-target><option>Laden…</option></select></label><button type="button" class="button accent" data-pm-load>Rechten bekijken</button><p class="pm-search-note"></p></div><p class="pm-status" role="status"></p><div class="pm-results"></div>`;
  host.onclick=e=>{if(e.target.closest('[data-pm-load]'))void loadMap();if(e.target.closest('[data-pm-search]'))void loadOptions($('[data-pm-member-search]').value.trim());const b=e.target.closest('[data-pm-detail]');if(b){detail={id:b.dataset.pmDetail,key:b.dataset.pmColumn};renderDetail();$('.pm-explanation')?.scrollIntoView({block:'nearest'});}};
  host.onchange=e=>{if(e.target.matches('[data-pm-mode]')){mode=e.target.value;selected='';selectOptions();}if(e.target.matches('[data-pm-target]')){selected=e.target.value;$('[data-pm-member-search]').value='';}if(e.target.matches('[data-pm-filter]')){filter=e.target.value;renderResults();}};
  host.oninput=e=>{if(e.target.matches('[data-pm-filter-search]')){const pos=e.target.selectionStart;search=e.target.value;renderResults();const input=$('[data-pm-filter-search]');input.focus();input.setSelectionRange(pos,pos);}};
  host.onkeydown=e=>{if(e.key==='Enter'&&e.target.matches('[data-pm-member-search]')){e.preventDefault();void loadOptions(e.target.value.trim());}};
  selectOptions();renderResults();status();if(!options)void loadOptions();
 }
 window.lnTools.permissions={open,close,clear};
})();
