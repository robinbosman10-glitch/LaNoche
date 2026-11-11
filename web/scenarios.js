(()=>{
 'use strict';
 window.lnTools=window.lnTools||{};
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 const formatNumber=new Intl.NumberFormat('nl-NL');
 const formatDate=new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const number=value=>formatNumber.format(Number(value)||0);
 const date=value=>Number.isFinite(Number(value))?formatDate.format(new Date(Number(value))):'Datum onbekend';
 const shortId=id=>String(id).slice(0,8).toUpperCase();
 const publication={pending:'Wordt in Discord geplaatst',sending:'Wordt in Discord geplaatst',sent:'In Discord geplaatst',uncertain:'Discord-plaatsing controleren'};
 let host=null,identity=null,epoch=0,timer=null,searchTimer=null,listRequest=0,detailRequest=0,page=1,query='',data=null,detail=null,detailId=null,renderedDetailId=null,suspended=false,listLoading=false,detailLoading=false,lastListMarkup='',lastSuccess=null;
 const requests=new Set();
 const $=selector=>host?.querySelector(selector);
 const permitted=user=>!!user?.allowed&&(!!user.admin||user.pages?.includes('scenarios'));
 const visible=()=>!!host&&!document.hidden&&!suspended&&document.documentElement.dataset.accountEditor!=='open'&&!document.querySelector('dialog[open]');
 function activeId(){const match=location.hash.match(/^#\/scenarios\/([^/?#]+)$/);return match&&uuid.test(match[1])?match[1].toLowerCase():null;}
 function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
 function pauseVideo(){host?.querySelectorAll('video').forEach(video=>video.pause());}
 function removeVideo(){host?.querySelectorAll('video').forEach(video=>{video.pause();video.removeAttribute('src');video.load();});}
 function cancelRequests(){for(const request of requests)request.abort();requests.clear();listRequest++;detailRequest++;}
 function status(message,isError=false){const el=$('.scenarios-status');if(el){el.textContent=message;el.classList.toggle('scenarios-error',isError);}}
 function stop(){clearTimeout(timer);timer=null;clearTimeout(searchTimer);searchTimer=null;cancelRequests();listLoading=false;detailLoading=false;pauseVideo();}
 function close(){epoch++;stop();removeVideo();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('close',dialogClosed,true);if(host){host.onclick=null;host.oninput=null;host.onsubmit=null;host.replaceChildren();}host=null;identity=null;data=null;detail=null;detailId=null;renderedDetailId=null;lastListMarkup='';}
 function clear(){close();query='';page=1;lastSuccess=null;}
 function denied(){clear();window.lnRequireLogin?.();}
 async function api(path){
  const my=epoch,controller=new AbortController();requests.add(controller);
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
   const result=await response.json();
   if(my!==epoch||!host)throw Object.assign(new Error('Verzoek geannuleerd.'),{name:'AbortError'});
   if(response.status===401||response.status===403){denied();throw Object.assign(new Error('Je hebt geen toegang tot dit overzicht.'),{name:'AbortError'});}
   if(!response.ok)throw new Error(result.error||'Het overzicht kon niet worden opgehaald.');
   return result;
  }finally{clearTimeout(timeout);requests.delete(controller);}
 }
 function frame(){
  host.innerHTML=`<div class="scenarios-workspace"><section class="scenarios-hero"><div class="scenarios-hero-main"><div class="scenarios-kicker"><img src="/brand/logo.gif" alt="" width="28" height="28">LA NOCHE / GANGPUNTEN</div><h2>Samen opgebouwd.</h2><div class="scenarios-total"><strong data-scenario-total aria-live="polite">—</strong><span>punten voor de hele gang</span></div></div><div class="scenarios-hero-side"><div><strong data-scenario-count>—</strong><span>geregistreerde scenario’s</span></div><div><strong data-scenario-clips>—</strong><span>clips in het archief</span></div><p>Nieuw scenario? Gebruik <code>/scenario</code> in Discord.</p></div></section><div class="scenarios-sync"><span class="scenarios-status" role="status" aria-live="polite">Scenario’s laden…</span><button class="button" type="button" data-scenario-action="refresh">Vernieuwen</button></div><section class="scenarios-detail" hidden aria-label="Scenariodetails"></section><section class="scenarios-archive panel"><div class="scenarios-archive-head"><div><span class="scenarios-kicker">HET ARCHIEF</span><h3>Scenario’s & clips</h3></div><span class="scenarios-results"></span></div><form class="scenarios-search-form"><label class="scenarios-search"><span>Zoek in het archief</span><input type="search" maxlength="160" placeholder="Naam, aanwezige of soort overval…" aria-label="Zoek scenario’s" value="${escape(query)}"></label><button class="button" type="submit">Zoeken</button></form><div class="scenarios-list" aria-live="polite"><div class="scenarios-empty">Scenario’s laden…</div></div><div class="scenarios-pagination"><button type="button" class="button" data-scenario-action="previous" disabled>← Vorige</button><span class="scenarios-page">1 / 1</span><button type="button" class="button" data-scenario-action="next" disabled>Volgende →</button></div></section><p class="scenarios-note">Elk scenario telt één keer mee in het gangtotaal. Namen leggen vast wie erbij was.</p></div>`;
  host.onclick=click;host.oninput=input;host.onsubmit=submit;
 }
 function row(event){
  const participants=event.participants||[],shown=participants.slice(0,6);
  const badges=shown.map(member=>`<span class="scenarios-person">${escape(member.name)}</span>`).join('');
  const more=participants.length>shown.length?`<span class="scenarios-person">+${participants.length-shown.length} anderen</span>`:'';
  return `<article class="scenarios-event"><div class="scenarios-event-top"><div><div class="scenarios-event-meta"><time datetime="${escape(new Date(event.time).toISOString())}">${escape(date(event.time))}</time><span>#${escape(shortId(event.id))}</span></div><h4>${escape(event.kind)}</h4></div><div class="scenarios-score"><strong>+${number(event.total)}</strong><span>gangpunten</span></div></div><div class="scenarios-event-bottom"><div class="scenarios-attendees"><span class="scenarios-caption">Aanwezig</span><div>${badges}${more}</div></div><a class="button" href="#/scenarios/${escape(event.id)}">${event.clip?.type==='file'?'Bekijk clip':'Open scenario'} <span aria-hidden="true">↗</span></a></div></article>`;
 }
 function renderList(){
  if(!host||!data)return;
  $('[data-scenario-total]').textContent=number(data.summary?.points);
  $('[data-scenario-count]').textContent=number(data.summary?.scenarios);
  $('[data-scenario-clips]').textContent=number(data.summary?.clips);
  $('.scenarios-results').textContent=number(data.total)+' scenario'+(Number(data.total)===1?'':'’s')+(query?' gevonden':'');
  const rows=(data.items||[]).map(row).join('')||`<div class="scenarios-empty"><h4>${query?'Geen scenario’s gevonden':'Het eerste scenario begint hier'}</h4><p>${query?'Zoek op een andere naam of soort overval.':'Registreer een overval met /scenario in Discord. De gangpunten en clip verschijnen hier automatisch.'}</p></div>`;
  if(rows!==lastListMarkup){$('.scenarios-list').innerHTML=rows;lastListMarkup=rows;}
  $('.scenarios-page').textContent=number(data.page||1)+' / '+number(Math.max(1,data.pages||1));
  $('[data-scenario-action="previous"]').disabled=(data.page||1)<=1;
  $('[data-scenario-action="next"]').disabled=(data.page||1)>=Math.max(1,data.pages||1);
  if(detail){const updated=data.items?.find(event=>event.id===detail.id);if(updated){detail={...detail,publish:updated.publish};renderPublication();}}
 }
 function renderPublication(){const el=$('.scenarios-publication');if(el&&detail){el.textContent=publication[detail.publish?.status]||'Scenario opgeslagen';el.classList.toggle('scenarios-warning',detail.publish?.status==='uncertain');}}
 function renderDetail(){
  const container=$('.scenarios-detail');if(!container||!detail)return;
  if(renderedDetailId===detail.id){renderPublication();return;}
  removeVideo();renderedDetailId=detail.id;container.hidden=false;
  const isFile=detail.clip?.type==='file',external=safeLink(detail.clip?.url),clipPath='/api/scenarios/'+encodeURIComponent(detail.id)+'/clip';
  const media=isFile?`<div class="scenarios-player"><video controls playsinline preload="none" src="${clipPath}" aria-label="Clip van ${escape(detail.kind)}">Je browser kan deze clip niet afspelen.</video></div><div class="scenarios-clip-caption"><span>${escape(detail.clip.filename)} · ${number((detail.clip.size||0)/1048576)} MB</span><a href="${clipPath}" download="${escape(detail.clip.filename||'scenario-clip.mp4')}">Bestand downloaden ↓</a></div>`:`<div class="scenarios-external"><span class="scenarios-external-mark" aria-hidden="true">↗</span><h4>Clip op een externe website</h4><p>De clip opent in een nieuw tabblad. De beschikbaarheid hangt af van de oorspronkelijke videosite.</p>${external?`<a class="button accent" href="${escape(external)}" target="_blank" rel="noopener noreferrer">Bekijk clip ↗</a>`:'<span class="scenarios-error">Deze clip-link is niet beschikbaar.</span>'}</div>`;
  container.innerHTML=`<div class="scenarios-detail-head"><div><span class="scenarios-kicker">SCENARIO #${escape(shortId(detail.id))}</span><h3>${escape(detail.kind)}</h3><p>${escape(date(detail.time))}</p></div><a class="button" href="#/scenarios">Terug naar overzicht</a></div>${media}<div class="scenarios-detail-grid"><div><span class="scenarios-caption">Gangpunten</span><strong class="scenarios-detail-total">+${number(detail.total)}</strong><p>${number(detail.points)} punten × ${number(detail.times)} keer</p></div><div><span class="scenarios-caption">Ingediend door</span><strong>${escape(detail.name)}</strong><p class="scenarios-id">Discord-ID: ${escape(detail.author)}</p></div><div><span class="scenarios-caption">Aanwezig</span><div class="scenarios-persons">${(detail.participants||[]).map(person=>`<span class="scenarios-person" title="${escape(person.id)}">${escape(person.name)}</span>`).join('')||'Geen namen vastgelegd'}</div></div></div><p class="scenarios-publication" role="status"></p><p class="scenarios-video-error" role="status" hidden>De clip kan niet worden afgespeeld. Probeer het bestand te downloaden of ververs de pagina.</p>`;
  renderPublication();const video=container.querySelector('video');if(video)video.addEventListener('error',()=>{const el=$('.scenarios-video-error');if(el)el.hidden=false;});
 }
 async function loadDetail(){
  if(!host||!detailId||!visible()||detailLoading)return;
  const id=detailId,my=++detailRequest,opening=epoch;detailLoading=true;
  const container=$('.scenarios-detail');container.hidden=false;
  if(renderedDetailId!==id)container.innerHTML='<div class="scenarios-empty">Scenario laden…</div>';
  try{const result=await api('/api/scenarios/'+id);if(my!==detailRequest||opening!==epoch||id!==detailId)return;detail=result.scenario;renderDetail();}
  catch(error){if(my!==detailRequest||opening!==epoch||error.name==='AbortError'||!host)return;removeVideo();renderedDetailId=null;container.innerHTML=`<div class="scenarios-empty"><h3>Scenario niet beschikbaar</h3><p>${escape(error.message)}</p><a class="button" href="#/scenarios">Terug naar overzicht</a></div>`;}
  finally{if(my===detailRequest&&opening===epoch)detailLoading=false;}
 }
 function schedule(){clearTimeout(timer);timer=null;if(visible())timer=setTimeout(()=>loadList(),15000);}
 async function loadList(){
  clearTimeout(timer);timer=null;if(!visible())return;
  const my=++listRequest,opening=epoch;listLoading=true;
  try{
   const params=new URLSearchParams({q:query,page:String(page),limit:'20'});
   const result=await api('/api/scenarios?'+params);
   if(my!==listRequest||opening!==epoch||!host)return;
   data=result;page=result.page||1;lastSuccess=Date.now();renderList();status('Live bijgewerkt · '+new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(lastSuccess));
  }catch(error){if(my!==listRequest||opening!==epoch||error.name==='AbortError'||!host)return;status(error.message+(data?' Laatst ontvangen gegevens blijven zichtbaar.':''),true);if(!data)$('.scenarios-list').innerHTML='<div class="scenarios-empty">Het archief kon niet laden. Gebruik Vernieuwen om het opnieuw te proberen.</div>';}
  finally{if(my===listRequest&&opening===epoch){listLoading=false;schedule();}}
 }
 function route(){
  if(!host)return;const id=activeId();if(id===detailId)return;
  detailRequest++;detailLoading=false;removeVideo();detail=null;renderedDetailId=null;detailId=id;
  const container=$('.scenarios-detail');container.replaceChildren();container.hidden=!id;
  if(id)void loadDetail();
 }
 function click(event){
  const action=event.target.closest('[data-scenario-action]')?.dataset.scenarioAction;
  if(!action)return;
  if(action==='previous')page=Math.max(1,page-1);
  if(action==='next')page=Math.min(Math.max(1,data?.pages||1),page+1);
  if(action==='refresh'&&detailId)void loadDetail();
  void loadList();
 }
 function input(event){if(!event.target.matches('.scenarios-search input'))return;query=event.target.value.trim().slice(0,160);page=1;clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadList(),350);}
 function submit(event){if(!event.target.matches('.scenarios-search-form'))return;event.preventDefault();clearTimeout(searchTimer);query=$('.scenarios-search input').value.trim().slice(0,160);page=1;void loadList();}
 function dialogClosed(){resume();}
 function visibility(){if(document.hidden){stop();return;}resume();}
 function suspend(){suspended=true;stop();}
 function resume(){if(!host)return;suspended=false;if(!visible())return;if(!timer&&!listLoading)void loadList();if(detailId&&!detail&&!detailLoading)void loadDetail();}
 function open(target,user){clear();if(!permitted(user)){target.textContent='Je hebt geen toegang tot gangpunten en scenario’s.';return;}host=target;identity=user;suspended=false;frame();document.addEventListener('visibilitychange',visibility);document.addEventListener('close',dialogClosed,true);route();void loadList();}
 window.lnTools.scenarios={open,close,clear,route,suspend,resume};
})();
