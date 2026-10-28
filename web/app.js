const $=s=>document.querySelector(s);
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',message:'M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z',voice:'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8',roles:'m3 12 9-9h8v8l-9 10-8-9Z M16 7h.01',shield:'m12 3 9 4v6c0 5-9 9-9 9s-9-4-9-9V7l9-4Z M8 12l3 3 5-6',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-4',channel:'M9 3 7 21 M17 3l-2 18 M3 9h18 M2 15h18',settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',pause:'M8 5v14 M16 5v14',play:'m8 4 12 8-12 8Z',search:'M10 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14 M15 15l6 6',calendar:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16',refresh:'M20 7a9 9 0 1 0 1 8 M20 2v6h-6',chart:'M4 20V10 M12 20V4 M20 20v-7',ticket:'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z M15 5v14',money:'M3 5h18v14H3z M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M6 12h.01 M18 12h.01',vault:'M4 3h16v18H4z M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 6v3 M12 15v3 M6 12h3 M15 12h3',ban:'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20 M5 5l14 14',bot:'M5 7h14v13H5z M12 3v4 M9 12h.01 M15 12h.01 M9 17h6 M2 11v5 M22 11v5',arrow:'M5 12h14 M14 7l5 5-5 5'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.grid}"/></svg>`;
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
const cats={
messages:{label:'Berichten',icon:'message',group:'Discord',desc:'Verstuurde, aangepaste en verwijderde berichten.',actions:['Bericht verstuurd','Bericht aangepast','Bericht verwijderd']},
channels:{label:'Kanalen & threads',icon:'channel',group:'Discord',desc:'Nieuwe kanalen, threads, instellingen en kanaalrechten.',actions:['Kanaal aangemaakt','Kanaal aangepast','Thread geopend','Kanaalrechten aangepast','Kanaal verwijderd']},
roles:{label:'Rollen & rechten',icon:'roles',group:'Discord',desc:'Alle rolwijzigingen en toekenningen op één plek.',actions:['Rol toegekend','Rol verwijderd','Rol aangemaakt','Rolrechten aangepast']},
voice:{label:'Voice',icon:'voice',group:'Discord',desc:'Voice-sessies, verplaatsingen, microfoons en streams.',actions:['Voice binnengekomen','Voice verlaten','Voice verplaatst','Stream gestart','Microfoon uitgezet']},
members:{label:'Leden',icon:'users',group:'Discord',desc:'Toetredingen, vertrek en profielwijzigingen.',actions:['Lid toegetreden','Lid vertrokken','Bijnaam aangepast']},
moderation:{label:'Bans, kicks & time-outs',icon:'shield',group:'Discord',desc:'Moderatiebesluiten, uitvoerders en redenen.',actions:['Time-out gegeven','Lid gekickt','Ban toegevoegd','Ban opgeheven']},
server:{label:'Server & integraties',icon:'settings',group:'Discord',desc:'Serverinstellingen, uitnodigingen, webhooks en integraties.',actions:['Server aangepast','Uitnodiging aangemaakt','Webhook aangepast','Integratie toegevoegd']},
tickets:{label:'Tickets & transcripts',icon:'ticket',group:'La Noche',desc:'Van openen en claimen tot sluiten en transcript.',actions:['Ticket geopend','Ticket geclaimd','Ticket gesloten','Transcript opgeslagen']},
absence:{label:'Afwezigheid',icon:'calendar',group:'La Noche',desc:'Aanvragen, beoordelingen en automatische afloop.',actions:['Afwezigheid aangevraagd','Afwezigheid goedgekeurd','Afwezigheid afgekeurd','Afwezigheid afgelopen']},
money:{label:'Potjes',icon:'money',group:'La Noche',desc:'Geld toegevoegd, opgenomen en gereset per potje.',actions:['Geld toegevoegd','Geld opgenomen','Potje gereset']},
vault:{label:'Kluis',icon:'vault',group:'La Noche',desc:'Geld, wapens, munitie en voorraadmutaties.',actions:['Kluisgeld toegevoegd','Voorraad opgenomen','Wapen toegevoegd','Munitie toegevoegd']},
blacklist:{label:'Perm Blacklist',icon:'ban',group:'La Noche',desc:'Permanente blacklists en wijzigingen in toegang.',actions:['Perm Blacklist toegevoegd','Perm Blacklist verwijderd']},
ranks:{label:'Gangleden & rangen',icon:'roles',group:'La Noche',desc:'Aannames, promoties, degradaties en ontslagen.',actions:['Lid aangenomen','Lid gepromoveerd','Lid gedegradeerd','Lid ontslagen']},
warns:{label:'Waarschuwingen',icon:'shield',group:'La Noche',desc:'Waarschuwingen, redenen en waarschuwingsrollen.',actions:['Waarschuwing gegeven','Waarschuwingsrol toegekend']},
commands:{label:'Botcommands',icon:'bot',group:'Systeem',desc:'Commandgebruik, uitvoerders en verwerkingsstatus.',actions:['Command uitgevoerd','Command geweigerd']},
system:{label:'Bot & fouten',icon:'settings',group:'Systeem',desc:'Verbindingen, opstartmomenten en foutmeldingen.',actions:['Bot online','Verbinding hersteld','Log opnieuw verstuurd','Botmelding']}
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let connection=null,active='all',actionFilter='all',page=1,paused=false,interval=10000,timer,request,serial=0,data=null,lastFocus=null,lastSuccess=null;
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
let theme=read('ln-theme','system');interval=read('ln-interval',10000);if(![5000,10000,30000].includes(interval))interval=10000;
function applyTheme(){document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):theme;}
applyTheme();matchMedia('(prefers-color-scheme: light)').addEventListener('change',applyTheme);
$('#themeToggle').onclick=()=>{theme=document.documentElement.dataset.theme==='light'?'dark':'light';localStorage.setItem('ln-theme',JSON.stringify(theme));applyTheme();};
let identity=null,roster=null,vault=null,potsData=null;
try{sessionStorage.removeItem('ln-connection');}catch{}
if(location.hash.startsWith('#connect='))history.replaceState(null,'',location.pathname);
function logoImage(img,url){img.src=url;img.onerror=()=>{img.onerror=null;img.src='/brand/logo.gif';};}
async function loadIdentity(){
 try{
  const r=await fetch('/api/me',{cache:'no-store',credentials:'same-origin'});if(!r.ok)throw new Error();const me=await r.json();identity=me.user;
  document.querySelectorAll('.server-logo').forEach(img=>logoImage(img,me.guild.icon));$('#serverName').textContent=me.guild.name;
  $('#loginButton').href=me.loginUrl;
  const allowed=!!identity?.allowed;connection=allowed?{origin:location.origin}:null;
  $('#authGate').hidden=allowed;$('#dashboard').hidden=!allowed;$('#gateLogout').hidden=!identity;$('#loginButton').hidden=!!identity;
  const authError=new URLSearchParams(location.search).get('auth');
  const errors={invalid:'De inlogpoging is verlopen. Probeer opnieuw.',cancelled:'Discord-login geannuleerd.',failed:'Inloggen is niet gelukt. Probeer opnieuw.',unconfigured:'Discord-login wordt nog ingesteld door de beheerder.'};
  $('#authMessage').textContent=identity&&!allowed?`Je bent ingelogd als ${identity.name} (${identity.id}), maar dit Discord-ID heeft geen toegang. Vraag de beheerder om je ID toe te voegen.`:!me.configured?'Discord-login is nog niet geconfigureerd. De beheerder moet de OAuth-instellingen afronden.':errors[authError]||'Log in met Discord om het logdashboard te openen.';
  if(identity){$('#profileName').textContent=identity.name;$('#profileRole').textContent=identity.admin?'Beheerder':'Logtoegang';document.querySelectorAll('.profile-avatar').forEach(img=>{img.src=identity.avatar;});}
  $('#accountsButton').hidden=!identity?.admin;
  if(!allowed){data=null;roster=null;vault=null;$('#vaultContents').replaceChildren();$('#memberGroups').replaceChildren();closeDetail();render();clearTimeout(timer);}else route();
 }catch{$('#authGate').hidden=false;$('#dashboard').hidden=true;$('#authMessage').textContent='De website is tijdelijk niet bereikbaar. Herlaad de pagina om opnieuw te proberen.';connection=null;data=null;clearTimeout(timer);}
}
async function logout(){
 if(identity){await fetch('/api/logout',{method:'POST',headers:{'X-CSRF-Token':identity.csrf},credentials:'same-origin'});}
 location.assign('/');
}
$('#gateLogout').onclick=logout;
function status(message,online=false){$('#feedstate').textContent=message;$('.sample-label').textContent=online?'VERBONDEN':'NIET LIVE';document.documentElement.dataset.online=online?'yes':'no';}
function bounds(){const p=$('#period').value;if(p==='hour')return Date.now()-3600000;if(p==='all')return 0;const now=new Date();now.setHours(0,0,0,0);return now.getTime();}
function query(pageOverride=page){return new URLSearchParams({cat:active,action:actionFilter,q:$('#search').value.trim(),from:String(bounds()),period:$('#period').value,page:String(pageOverride)});}
function nav(){const counts=Object.fromEntries((data?.counts||[]).map(c=>[c.cat,c.n]));let html=`<a class="navitem ${active==='all'?'active':''}" href="#/overzicht" title="Overzicht">${icon('grid')}<span class="navtext">Overzicht</span><span class="navcount">${data?Object.values(counts).reduce((a,b)=>a+b,0):'—'}</span></a>`;html+=`<div class="navgroup">Organisatie</div><a class="navitem ${active==='roster'?'active':''}" href="#/ledenlijst" title="Live ledenlijst">${icon('users')}<span class="navtext">Live ledenlijst</span></a>`;html+=`<a class="navitem ${active==='safe'?'active':''}" href="#/kluis" title="Kluisoverzicht">${icon('vault')}<span class="navtext">Kluisoverzicht</span></a>`;html+=`<a class="navitem ${active==='pots'?'active':''}" href="#/potjes" title="Potjesoverzicht">${icon('money')}<span class="navtext">Potjesoverzicht</span></a>`;for(const group of ['Discord','La Noche','Systeem']){html+=`<div class="navgroup">${group}</div>`;for(const [key,c] of Object.entries(cats).filter(([,c])=>c.group===group))html+=`<a class="navitem ${active===key?'active':''}" href="#/logs/${key}" title="${esc(c.label)}">${icon(c.icon)}<span class="navtext">${esc(c.label)}</span><span class="navcount">${data?counts[key]||0:'—'}</span></a>`;}$('#nav').innerHTML=html;}
const fmtTime=t=>new Date(t).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function render(){
 nav();const s=data?.stats;$('#stats').innerHTML=[['Logmomenten',s?.total,'In deze categorie en periode','chart'],['Uitvoerders / leden',s?.people,'Unieke geregistreerde personen','users'],['Afgelopen uur',s?.recent||0,'Binnen deze selectie','message'],['Soorten acties',s?.types,'Geregistreerde gebeurtenissen','grid']].map(([label,n,note,ic])=>`<article class="stat"><div class="stat-top">${label}${icon(ic)}</div><div class="stat-main"><div class="stat-value">${data?Number(n||0).toLocaleString('nl-NL'):'—'}</div></div><div class="stat-note">${note}</div></article>`).join('');
 const buckets=Array(24).fill(0);for(const h of data?.hours||[])buckets[Number(new Intl.DateTimeFormat('nl-NL',{timeZone:'Europe/Amsterdam',hour:'2-digit',hourCycle:'h23'}).format(h.time))]+=h.n;const max=Math.max(...buckets,1);$('#chart').innerHTML=buckets.map((n,i)=>`<div class="bar" style="height:${n?n/max*100:0}%"><span class="bartip">${i}:00 · ${n} logs</span></div>`).join('');
 $('#distribution').innerHTML=(data?.actions||[]).slice(0,4).map(a=>`<div class="distrow"><span title="${esc(a.action)}">${esc(a.action)}</span><div class="disttrack"><div class="distfill" style="width:${s?.total?a.n/s.total*100:0}%"></div></div><b>${a.n}</b></div>`).join('')||'<p class="detailhint" style="padding:20px">Nog geen gegevens in deze selectie.</p>';
 $('#tabs').innerHTML=[{action:'all',n:s?.total||0},...(data?.actions||[])].map(a=>`<button class="tab ${a.action===actionFilter?'active':''}" data-filter="${esc(a.action)}">${a.action==='all'?'Alle gebeurtenissen':esc(a.action)}<small>${a.n}</small></button>`).join('');
 $('#count').textContent=data?.total??'—';$('#rows').innerHTML=(data?.logs||[]).map((l,i)=>`<tr tabindex="0" data-index="${i}" aria-label="Logdetails: ${esc(l.action)}"><td><div class="eventcell"><span class="eventicon ${esc(l.cat)}">${icon(cats[l.cat]?.icon)}</span><div><b>${esc(l.action)}</b><small>${esc(cats[l.cat]?.label||l.cat)}</small></div></div></td><td><div class="membercell"><span class="avatar">${esc(l.person.slice(0,2).toUpperCase())}</span>${esc(l.person)}</div></td><td><span class="channel">${esc(l.channel)}</span></td><td class="timestamp">${fmtTime(l.time)}<small>Europe/Amsterdam</small></td><td class="arrow">›</td></tr>`).join('');
 $('#empty').hidden=!!data?.logs?.length;$('#empty h3').textContent=connection?'Geen logs gevonden':'Nog niet verbonden';$('#empty p').textContent=connection?'Pas de periode of zoekterm aan.':'Log eerst in met Discord.';
 $('#range').textContent=data?.total?`${(data.page-1)*50+1}–${Math.min(data.page*50,data.total)} van ${data.total} gebeurtenissen`:'0 gebeurtenissen';$('#page').textContent=`${data?.page||1} / ${data?.pages||1}`;$('#prev').disabled=!data||data.page<=1;$('#next').disabled=!data||data.page>=data.pages;$('#export').disabled=!data?.total;
}
function banner(){
 const b=$('#connectionBanner');b.hidden=false;
 if(!connection){b.innerHTML='<b>Log eerst in met Discord.</b>';return;}
 if(!data){b.innerHTML='<b>Verbinding controleren</b><p>De site haalt de opgeslagen logs bij je bot op.</p>';return;}
 const c=data.coverage;const warnings=[];if(!c.auditLog)warnings.push('Auditlogboek bekijken ontbreekt: beheeracties worden onvolledig ontvangen.');if(!c.messageContent)warnings.push('Message Content Intent staat uit: berichtinhoud kan ontbreken.');if(data.importing)warnings.push('Bestaande registraties worden nog ingelezen.');if(c.archive&&!c.archive.done)warnings.push('Oude rang- en waarschuwingsberichten worden op de achtergrond ingelezen.');if(c.archive?.errors?.length)warnings.push(c.archive.errors.length+' kanalen konden niet worden ingelezen.');
 b.innerHTML=`<b>${warnings.length?'Controleer logdekking':'Verbonden met '+esc(data.guild.name)}</b><p>${esc(warnings.join(' ')||c.history)} <span>Laatste synchronisatie: ${fmtTime(lastSuccess)}.</span></p>`;
}
async function refresh(){
 if(active==='pots')return refreshPots();
 if(active==='safe')return refreshVault();
 if(active==='roster')return refreshMembers();
 clearTimeout(timer);request?.abort();const my=++serial;
 if(!connection){status('Log in met Discord');banner();render();return;}
 request=new AbortController();const timeout=setTimeout(()=>request?.abort(),15000);
 try{
  const r=await fetch(`${connection.origin}/api/logsite?${query()}`,{signal:request.signal,cache:'no-store',credentials:'same-origin'});const result=await r.json();if(my!==serial)return;if(r.status===401||r.status===403){connection=null;data=null;await loadIdentity();return;}
  if(!r.ok)throw new Error(result.error||'Verbinding mislukt.');data=result;page=data.page;lastSuccess=Date.now();status(paused?'Automatische updates gepauzeerd':'Live · iedere '+interval/1000+' seconden',!paused);banner();render();
 }catch(e){if(my!==serial)return;status('Verbinding onderbroken');$('#connectionBanner').hidden=false;$('#connectionBanner').innerHTML=`<b>Logs niet bijgewerkt</b><p>${esc(e.name==='AbortError'?'De bot reageert niet op tijd. Controleer of de Railway-deploy online is.':e.message==='Failed to fetch'?'De bot is niet bereikbaar. Probeer opnieuw of log opnieuw in.':e.message)} ${data?'De laatst ontvangen gegevens blijven zichtbaar.':''}</p>`;}
 finally{clearTimeout(timeout);if(my===serial&&!paused&&connection)timer=setTimeout(refresh,interval);}
}
function route(){
 const m=location.hash.match(/^#\/logs\/(\w+)$/);active=location.hash==='#/potjes'?'pots':location.hash==='#/kluis'?'safe':location.hash==='#/ledenlijst'?'roster':m&&cats[m[1]]?m[1]:'all';actionFilter='all';page=1;data=null;$('#search').value='';
 const potsPage=active==='pots';$('#potsPanel').hidden=!potsPage;
 const vaultPage=active==='safe';$('#vaultPanel').hidden=!vaultPage;
 const rosterPage=active==='roster';$('#memberPanel').hidden=!rosterPage;if(rosterPage&&!roster)$('#memberStatus').textContent='Leden laden…';
 for(const sel of ['#stats','.insights','.logpanel','#connectionBanner'])$(sel).hidden=rosterPage||vaultPage||potsPage;
 $('#export').hidden=rosterPage||vaultPage||potsPage;
 $('.pagehead h1').innerHTML=(potsPage?'De potjes':vaultPage?'De kluis':rosterPage?'De familie':active==='all'?'Alles in beeld':esc(cats[active].label))+'<span>.</span>';
 $('.pagehead p').textContent=potsPage?'Elk potje in beeld. Saldo, verdeling en totaal.':vaultPage?'Geld en voorraad. Altijd het actuele totaal.':rosterPage?'Alle gangleden, per hoogste rang. Rechtstreeks uit Discord.':active==='all'?'Elke geregistreerde actie. Eén overzicht.':cats[active].desc;
 $('.breadcrumb strong').textContent=potsPage?'Potjesoverzicht':vaultPage?'Kluisoverzicht':rosterPage?'Ledenlijst':active==='all'?'Overzicht':cats[active].label;render();refresh();
}
function renderMembers(){
 const q=$('#memberSearch').value.trim().toLowerCase();let shown=0;
 $('#memberGroups').innerHTML=(roster?.groups||[]).map(g=>{
  const members=g.members.filter(m=>[m.name,m.username,m.id,g.name].some(v=>v.toLowerCase().includes(q)));shown+=members.length;if(q&&!members.length)return '';
  return `<section class="panel rank-panel"><div class="rank-heading"><h2>${esc(g.name)}</h2><span class="countpill">${members.length}</span></div><div class="member-grid">${members.map(m=>`<article class="roster-member"><img src="${esc(m.avatar)}" alt="" loading="lazy"><div><b>${esc(m.name)}</b><small>@${esc(m.username)}</small><small>${esc(m.id)}</small>${m.absent?'<small class="absent">Goedgekeurd afwezig</small>':''}</div></article>`).join('')||'<p class="hint">Nog geen leden op deze rang.</p>'}</div></section>`;
 }).join('')||'<p class="hint">Geen leden gevonden.</p>';
 if(roster)$('#memberStatus').textContent=`${shown} van ${roster.total} leden · Bijgewerkt ${fmtTime(roster.updatedAt)}`;
}
async function refreshMembers(){
 clearTimeout(timer);request?.abort();const my=++serial;if(!connection)return;
 request=new AbortController();const timeout=setTimeout(()=>request?.abort(),15000);
 try{
  const r=await fetch('/api/members',{credentials:'same-origin',cache:'no-store',signal:request.signal});const result=await r.json();if(my!==serial)return;
  if(r.status===401||r.status===403){roster=null;$('#memberGroups').replaceChildren();await loadIdentity();return;}
  if(!r.ok)throw new Error(result.error||'Ledenlijst tijdelijk niet beschikbaar.');roster=result;renderMembers();status(paused?'Gepauzeerd':'Live · iedere '+interval/1000+' seconden',!paused);
 }catch(e){if(my===serial){$('#memberStatus').textContent='Niet bijgewerkt — '+(roster?'laatste ontvangen lijst wordt getoond. ':'')+(e.name==='AbortError'?'Probeer zo opnieuw.':e.message);status('Verbinding onderbroken');}}
 finally{clearTimeout(timeout);if(my===serial&&!paused&&connection)timer=setTimeout(refresh,interval);}
}
$('#memberSearch').oninput=renderMembers;

function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3000);}
function openDetail(i){const l=data?.logs[i];if(!l)return;lastFocus=document.activeElement;const link=u=>{try{return new URL(u).protocol==='https:'?u:null;}catch{return null;}};$('#detail').innerHTML=`<h2 class="detailtitle">${esc(l.action)}</h2><span class="detailbadge">${esc(cats[l.cat]?.label)}</span><div class="detailrows">${[['Uitvoerder / lid',l.person],['Uitvoerder-ID',l.actor||'Niet vastgesteld'],['Betrokken lid-ID',l.user||'Niet vastgesteld'],['Kanaal / doel',l.channel],['Tijdstip',fmtTime(l.time)],['Bron',l.source],['Log-ID',l.id]].map(([k,v])=>`<div class="detailrow"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div><div class="detailbody">${esc(l.detail).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}</div>${link(l.transcript)?`<a class="button accent" href="${esc(l.transcript)}" target="_blank" rel="noopener noreferrer">Transcript openen ↗</a>`:''}${link(l.url)?`<a class="button" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Discord-bericht openen ↗</a>`:''}${(l.attachments||[]).filter(a=>link(a.url)).map(a=>`<a class="button" href="${esc(a.url)}">Bijlage downloaden: ${esc(a.name)}</a>`).join('')}<button class="button" id="copy">Log kopiëren</button>`;$('#drawer').hidden=false;$('#overlay').hidden=false;$('.close').focus();$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(`${l.id}\n${l.action}\n${fmtTime(l.time)}\n${l.detail}`);toast('Log gekopieerd');}catch{toast('Kopiëren is niet toegestaan in deze browser.');}};}
function closeDetail(){$('#drawer').hidden=true;$('#overlay').hidden=true;lastFocus?.focus();}
$('#rows').onclick=e=>{const r=e.target.closest('[data-index]');if(r)openDetail(Number(r.dataset.index));};$('#rows').onkeydown=e=>{if(e.key==='Enter'){const r=e.target.closest('[data-index]');if(r)openDetail(Number(r.dataset.index));}};$('.close').onclick=closeDetail;$('#overlay').onclick=closeDetail;
let searchTimer;$('#search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;refresh();},300);};$('#period').onchange=()=>{page=1;refresh();};$('#tabs').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){actionFilter=b.dataset.filter;page=1;refresh();}};$('#prev').onclick=()=>{page--;refresh();};$('#next').onclick=()=>{page++;refresh();};$('#clear').onclick=()=>{page=1;actionFilter='all';$('#search').value='';$('#period').value='all';refresh();};$('#refresh').onclick=refresh;
$('#pause').onclick=()=>{paused=!paused;$('#pauseLabel').textContent=paused?'Gepauzeerd':'Live updates';$('#pause').querySelector('[data-icon]').innerHTML=icon(paused?'play':'pause');if(paused){clearTimeout(timer);status('Automatische updates gepauzeerd');}else refresh();};
$('#settings').onclick=()=>{$('#theme').value=theme;$('#interval').value=String(interval);$('#preferences').showModal();};$('#closeprefs').onclick=()=>$('#preferences').close();$('#saveprefs').onclick=()=>{theme=$('#theme').value;interval=Number($('#interval').value);localStorage.setItem('ln-theme',JSON.stringify(theme));localStorage.setItem('ln-interval',JSON.stringify(interval));applyTheme();$('#preferences').close();refresh();};$('#disconnect').onclick=logout;
$('#export').textContent='Exporteer deze pagina';$('#export').onclick=()=>{const cell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';const csv=['ID;Categorie;Actie;Uitvoerder;Lid;Kanaal;Tijd;Details',...data.logs.map(l=>[l.id,l.cat,l.action,l.actor,l.user,l.channel,new Date(l.time).toISOString(),l.detail].map(cell).join(';'))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='la-noche-logs-pagina-'+page+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(`${data.logs.length} logs van deze pagina geëxporteerd`);};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();(active==='roster'?$('#memberSearch'):$('#search')).focus();}if(e.key==='Escape')closeDetail();if(e.key==='Tab'&&!$('#drawer').hidden){const items=$('#drawer').querySelectorAll('button,a');if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items[items.length-1].focus();}else if(!e.shiftKey&&document.activeElement===items[items.length-1]){e.preventDefault();items[0].focus();}}});
window.addEventListener('hashchange',route);$('#date').textContent=new Date().toLocaleDateString('nl-NL');$('#year').textContent=new Date().getFullYear();loadIdentity();

async function loadAccounts(){
 const r=await fetch('/api/access',{credentials:'same-origin',cache:'no-store'});const result=await r.json();if(!r.ok)throw new Error(result.error);
 $('#accountList').innerHTML=`<div class="account-row"><div><b>Vaste beheerder</b><small>${esc(result.owner)}</small></div><span class="detailbadge">Beheerder · vast</span></div>`+result.users.map(u=>`<div class="account-row"><div><b>Logtoegang</b><small>${esc(u.user)}</small></div><button class="button" data-remove="${esc(u.user)}">Verwijderen</button></div>`).join('');
}
$('#accountsButton').onclick=async()=>{$('#accountsDialog').showModal();$('#accountMessage').textContent='Laden…';try{await loadAccounts();$('#accountMessage').textContent='';}catch(e){$('#accountMessage').textContent=e.message;}};
$('#closeAccounts').onclick=()=>$('#accountsDialog').close();
async function changeAccount(id,add){
 const r=await fetch('/api/access',{method:add?'POST':'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify({id})});const result=await r.json();if(!r.ok)throw new Error(result.error);await loadAccounts();$('#accountMessage').textContent=result.changed?(add?'Toegang toegevoegd.':'Toegang ingetrokken. Open sessies van dit account zijn beëindigd.'):'Deze toegang was al zo ingesteld.';
}
$('#addAccount').onsubmit=async e=>{e.preventDefault();const b=$('#addAccount button');b.disabled=true;try{await changeAccount($('#accountId').value.trim(),true);$('#accountId').value='';}catch(e){$('#accountMessage').textContent=e.message;}finally{b.disabled=false;}};
$('#accountList').onclick=async e=>{const b=e.target.closest('[data-remove]');if(!b)return;b.disabled=true;try{await changeAccount(b.dataset.remove,false);}catch(e){$('#accountMessage').textContent=e.message;b.disabled=false;}};

const vaultNumber=n=>Number(n||0).toLocaleString('nl-NL');
function renderVault(){
 if(!vault)return;
 const money=k=>vault.balances.find(b=>b.kind===k)?.amount||0;
 const total=money('wit')+money('zwart');
 const groupNames={wapen:'Wapens',munitie:'Munitie',voorraad:'Overige voorraad'};
 $('#vaultContents').innerHTML=`<div class="vault-money">${[['wit','Wit geld','Beschikbaar wit saldo'],['zwart','Zwart geld','Beschikbaar zwart saldo']].map(([k,label,note])=>`<article class="vault-balance ${k}"><div class="vault-card-top"><span class="vault-label"><i></i>${label}</span>${icon('money')}</div><div class="vault-amount"><span>$</span> ${vaultNumber(money(k))}</div><p>${note}</p></article>`).join('')}</div><div class="vault-total"><span>Totaal geld in de kluis</span><strong>$ ${vaultNumber(total)}</strong><span class="vault-total-note">Wit + zwart</span></div><div class="vault-section-heading"><div><h2>Wat ligt er in de kluis?</h2><p>De huidige voorraad, per soort.</p></div><span class="detailbadge">${vault.balances.filter(b=>groupNames[b.kind]&&b.amount>0).length} soorten op voorraad</span></div><div class="vault-inventory">${Object.entries(groupNames).map(([kind,label],index)=>{const rows=vault.balances.filter(b=>b.kind===kind&&b.amount>0);return `<article class="panel vault-stock"><div class="vault-stock-head"><span class="vault-section-no">0${index+1}</span><h3>${label}</h3><span>${rows.length} ${rows.length===1?'soort':'soorten'}</span></div><div class="vault-stock-labels"><span>VOORWERP</span><span>AANTAL</span></div>${rows.map(b=>`<div class="vault-stock-row"><b>${esc(b.item)}</b><strong>${vaultNumber(b.amount)}<small>stuks</small></strong></div>`).join('')||'<p class="vault-empty">Niets op voorraad</p>'}</article>`;}).join('')}</div><section class="panel vault-recent"><div class="panelhead"><div><h2>Laatste wijzigingen</h2><p>De laatste 8 geregistreerde kluisboekingen.</p></div><a class="vault-link" href="#/logs/vault">Volledig logboek ↗</a></div>${vault.recent.map(e=>`<article class="vault-booking"><span class="vault-direction ${e.action==='add'?'in':'out'}">${e.action==='add'?'↓':'↑'}</span><div class="vault-booking-info"><b>${esc(e.kind==='wit'?'Wit geld':e.kind==='zwart'?'Zwart geld':e.item)}</b><p>${esc(e.reason)}</p><small>${esc(e.date)} · ${esc(e.person||e.actor||'Onbekend')}</small></div><div class="vault-change ${e.action==='add'?'in':'out'}"><strong>${e.action==='add'?'+':'−'} ${['wit','zwart'].includes(e.kind)?'$ ':''}${vaultNumber(e.amount)}</strong><small>${e.action==='add'?'Toegevoegd':'Verwijderd'}</small></div></article>`).join('')||'<p class="vault-empty">Nog geen kluisboekingen geregistreerd.</p>'}</section><p class="vault-footnote">Boekingen doe je met /kluis in Discord. Dit overzicht toont de opgeslagen kluisinhoud.</p>`;
 $('#vaultStatus').textContent=`Bijgewerkt ${fmtTime(vault.updatedAt)} · automatisch elke ${interval/1000} seconden`;
}
async function refreshVault(){
 clearTimeout(timer);request?.abort();const my=++serial;if(!connection)return;
 request=new AbortController();const timeout=setTimeout(()=>request?.abort(),15000);
 try{
  const r=await fetch('/api/vault',{credentials:'same-origin',cache:'no-store',signal:request.signal});const result=await r.json();if(my!==serial)return;
  if(r.status===401||r.status===403){vault=null;$('#vaultContents').replaceChildren();await loadIdentity();return;}
  if(!r.ok)throw new Error(result.error||'Kluis tijdelijk niet beschikbaar.');vault=result;renderVault();status(paused?'Gepauzeerd':'Live · iedere '+interval/1000+' seconden',!paused);
 }catch(e){if(my===serial){$('#vaultStatus').textContent='Niet bijgewerkt — '+(vault?'laatste ontvangen stand: '+fmtTime(vault.updatedAt)+'. ':'')+'Automatisch opnieuw proberen…';status('Verbinding onderbroken');}}
 finally{clearTimeout(timeout);if(my===serial&&!paused&&connection)timer=setTimeout(refresh,interval);}
}

function renderPots(){
 if(!potsData)return;
 $('#potManage').hidden=!potsData.permissions?.manage;$('#potReset').hidden=!potsData.permissions?.reset;
 const names={gang:'Gang',drugs:'Drugs',wapens:'Wapens'},notes={gang:'Het gezamenlijke gangpotje',drugs:'Budget voor drugs',wapens:'Budget voor wapens'};
 const sum=kind=>potsData.pots.reduce((n,p)=>n+p.balances[kind],0);
 $('#potsContents').innerHTML=`<div class="vault-money">${[['wit','Wit geld'],['zwart','Zwart geld']].map(([kind,label])=>`<article class="vault-balance ${kind}"><div class="vault-card-top"><span class="vault-label"><i></i>${label}</span>${icon('money')}</div><div class="vault-amount"><span>$</span> ${vaultNumber(sum(kind))}</div><p>Alle potjes samen · ${label.toLowerCase()}</p></article>`).join('')}</div><div class="vault-total"><span>Totaal over alle potjes</span><strong>$ ${vaultNumber(sum('wit')+sum('zwart'))}</strong><span class="vault-total-note">Wit + zwart</span></div><div class="vault-section-heading"><div><h2>Een eigen plek voor elk budget</h2><p>Wit en zwart geld blijven apart zichtbaar.</p></div><span class="detailbadge">${potsData.pots.length} potjes</span></div><div class="pots-grid">${potsData.pots.map((p,i)=>`<article class="panel pot-card pot-${esc(p.id)}"><div class="pot-heading"><span class="pot-symbol">${icon(p.id==='gang'?'users':p.id==='drugs'?'grid':'shield')}</span><span class="vault-section-no">0${i+1}</span></div><h3>${esc(names[p.id]||p.id)}</h3><p>${esc(notes[p.id]||'')}</p><div class="pot-saldo"><span>Wit geld <small>${p.shares.wit}% bij toevoegen</small></span><strong>$ ${vaultNumber(p.balances.wit)}</strong></div><div class="pot-saldo"><span>Zwart geld <small>${p.shares.zwart}% bij toevoegen</small></span><strong>$ ${vaultNumber(p.balances.zwart)}</strong></div><div class="pot-total"><span>Totaal in dit potje</span><b>$ ${vaultNumber(p.balances.wit+p.balances.zwart)}</b></div></article>`).join('')}</div><section class="panel pots-allocation"><div class="panelhead"><div><h2>Zo wordt een storting verdeeld</h2><p>De percentages die de bot gebruikt bij geld toevoegen.</p></div>${icon('chart')}</div><div class="pots-splits">${[['wit','Wit geld'],['zwart','Zwart geld']].map(([kind,label])=>`<div class="pots-split"><h3>${label}</h3><div class="pots-bar" aria-label="${label}: ${potsData.pots.map(p=>(names[p.id]||p.id)+' '+p.shares[kind]+'%').join(', ')}">${potsData.pots.filter(p=>p.shares[kind]>0).map(p=>`<span class="pot-color-${esc(p.id)}" style="flex:${p.shares[kind]}">${p.shares[kind]}%</span>`).join('')}</div><div class="pots-legend">${potsData.pots.map(p=>`<span><i class="pot-color-${esc(p.id)}"></i>${esc(names[p.id]||p.id)} <b>${p.shares[kind]}%</b></span>`).join('')}</div></div>`).join('')}</div><div class="pots-explainer">Toevoegen verdeelt het bedrag automatisch. Bij opnemen kies je één potje en één geldsoort.</div></section><p class="vault-footnote">Beheer de potjes via deze pagina. Alle boekingen en resets worden automatisch gelogd.</p>`;
 $('#potsStatus').textContent=`Bijgewerkt ${fmtTime(potsData.updatedAt)} · automatisch elke ${interval/1000} seconden`;
}
async function refreshPots(){
 clearTimeout(timer);request?.abort();const my=++serial;if(!connection)return;
 request=new AbortController();const timeout=setTimeout(()=>request?.abort(),15000);
 try{
  const r=await fetch('/api/pots',{credentials:'same-origin',cache:'no-store',signal:request.signal});const result=await r.json();if(my!==serial)return;
  if(r.status===401||r.status===403){potsData=null;$('#potsContents').replaceChildren();await loadIdentity();return;}
  if(!r.ok)throw new Error(result.error||'Potjes tijdelijk niet beschikbaar.');potsData=result;renderPots();status(paused?'Gepauzeerd':'Live · iedere '+interval/1000+' seconden',!paused);
 }catch(e){if(my===serial){$('#potsStatus').textContent='Niet bijgewerkt — '+(potsData?'laatste ontvangen stand: '+fmtTime(potsData.updatedAt)+'. ':'')+'Automatisch opnieuw proberen…';status('Verbinding onderbroken');}}
 finally{clearTimeout(timeout);if(my===serial&&!paused&&connection)timer=setTimeout(refresh,interval);}
}

let potMode='manage',pendingPot=null,potBusy=false;
function updatePotForm(){
 const reset=potMode==='reset';$('#potActionLabel').hidden=reset;$('#potAmountLabel').hidden=reset;$('#potAmount').required=!reset;$('#potAll').hidden=!reset;
 $('#potTargetLabel').hidden=!reset&&$('#potAction').value==='add';
 $('#potKind').disabled=reset&&$('#potTarget').value==='all';
 $('#potFormHint').textContent=reset?($('#potTarget').value==='all'?'Alles zet alle potjes op nul, zowel wit als zwart. Percentages blijven behouden.':'Alleen de gekozen geldsoort in dit potje wordt op nul gezet. Percentages blijven behouden.'):$('#potAction').value==='add'?'Het bedrag wordt automatisch verdeeld volgens de vaste percentages.':'Het bedrag gaat alleen van het gekozen potje en de gekozen geldsoort af.';
}
function openPot(mode){
 potMode=mode;pendingPot=null;$('#potForm').reset();$('#potDialogTitle').textContent=mode==='reset'?'Potjes resetten':'Geld beheren';$('#potForm').hidden=false;$('#potPreview').hidden=true;$('#potConfirmActions').hidden=true;$('#potMessage').textContent='';updatePotForm();$('#potDialog').showModal();
}
$('#potManage').onclick=()=>openPot('manage');$('#potReset').onclick=()=>openPot('reset');
$('#potClose').onclick=()=>{if(!potBusy)$('#potDialog').close();};$('#potDialog').addEventListener('cancel',e=>{if(potBusy)e.preventDefault();});
$('#potAction').onchange=updatePotForm;$('#potTarget').onchange=updatePotForm;
async function potPost(path,body){
 const r=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':identity.csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const result=await r.json();if(!r.ok)throw new Error(result.error||'Boeking niet gelukt.');return result;
}
$('#potForm').onsubmit=async e=>{
 e.preventDefault();if(potBusy)return;potBusy=true;$('#potPreviewButton').disabled=true;$('#potMessage').textContent='Berekening ophalen…';
 try{
  const input={kind:$('#potKind').value,action:potMode==='reset'?'reset':$('#potAction').value,pot:$('#potTarget').value,amount:$('#potAmount').value.trim(),requestId:crypto.randomUUID()};
  const result=await potPost('/api/pots/preview',input);pendingPot=input;
  const names={gang:'Gang',drugs:'Drugs',wapens:'Wapens'};
  $('#potPreview').innerHTML=`<h3>${potMode==='reset'?'Controleer de reset':'Controleer de berekening'}</h3><p class="hint">${input.action==='add'?'De bot verdeelt het bedrag automatisch, inclusief afronding.':'Hieronder zie je de gevolgen voor de gekozen potjes.'}</p><div class="tablewrap"><table class="pot-preview-table"><thead><tr><th>Potje</th><th>Wijziging</th><th>Nieuw saldo</th></tr></thead><tbody>${result.changes.map(c=>`<tr><td>${esc(names[c.pot])}<small>${c.kind==='wit'?'Wit':'Zwart'}${input.action==='add'?' · '+c.share+'%':''}</small></td><td>${c.delta<0?'−':c.delta>0?'+':''}$ ${vaultNumber(Math.abs(c.delta))}</td><td>$ ${vaultNumber(c.after)}</td></tr>`).join('')}</tbody></table></div><p class="hint">${potMode==='reset'?'Een reset zet de geselecteerde bedragen op nul.':'Het saldo wordt bij bevestigen opnieuw gecontroleerd.'}</p>`;
  $('#potForm').hidden=true;$('#potPreview').hidden=false;$('#potConfirmActions').hidden=false;$('#potConfirm').textContent=potMode==='reset'?'Reset bevestigen':'Boeking bevestigen';$('#potMessage').textContent='';
 }catch(e){$('#potMessage').textContent=e.name==='TimeoutError'?'De berekening duurde te lang. Probeer opnieuw.':e.message;}finally{potBusy=false;$('#potPreviewButton').disabled=false;}
};
$('#potBack').onclick=()=>{if(potBusy)return;pendingPot=null;$('#potForm').hidden=false;$('#potPreview').hidden=true;$('#potConfirmActions').hidden=true;$('#potMessage').textContent='';};
$('#potConfirm').onclick=async()=>{
 if(potBusy||!pendingPot)return;potBusy=true;$('#potConfirm').disabled=true;$('#potBack').disabled=true;$('#potMessage').textContent='Boeking verwerken…';
 try{const result=await potPost('/api/pots/book',pendingPot);pendingPot=null;$('#potDialog').close();toast(result.changed?'Opgeslagen. De potjes zijn bijgewerkt.':'Deze boeking was al opgeslagen.');await refresh();}
 catch(e){$('#potMessage').textContent=e.name==='TimeoutError'||e.message==='Failed to fetch'?'Geen bevestiging ontvangen. Klik opnieuw op bevestigen; dezelfde boeking wordt niet dubbel verwerkt.':e.message;}
 finally{potBusy=false;$('#potConfirm').disabled=false;$('#potBack').disabled=false;}
};
