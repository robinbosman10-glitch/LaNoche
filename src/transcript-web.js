import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';

export function transcriptBase(env=process.env) {
 const value=env.TRANSCRIPT_BASE_URL || (env.RAILWAY_PUBLIC_DOMAIN?`https://${env.RAILWAY_PUBLIC_DOMAIN}`:'');
 if(!value)return null;
 const u=new URL(value);
 if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/')throw new Error('TRANSCRIPT_BASE_URL moet een HTTPS-origin zijn, bijvoorbeeld https://bot.up.railway.app');
 return u.origin;
}
export function transcriptLink(store,guild,ticket,base=transcriptBase()) {
 return base?`${base}/t/${store.transcriptToken(guild,ticket)}`:null;
}
const css=`html{scroll-behavior:smooth}body{background:#080808;color:#eee8e2}.hero{position:relative;background:radial-gradient(ellipse at 85% 0,#ff650032,transparent 65%),#101010;border-bottom:1px solid #ff790055;padding-top:40px;padding-bottom:40px}.brand{display:flex;align-items:center;gap:16px}.brand img{width:64px;height:64px;border-radius:50%;box-shadow:0 0 40px #ff790028}h1{letter-spacing:-2px}.hero .meta{font-size:13px}.chips span{border-radius:30px;font-size:12px;background:#ff79000a}.viewer-bar{position:sticky;top:0;z-index:2;background:#0b0b0bf2;border-bottom:1px solid #ffffff14;backdrop-filter:blur(18px);padding:16px 24px}.viewer-controls{max-width:940px;margin:auto;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.viewer-controls input{flex:1;min-width:180px;padding:13px 16px;border:1px solid #ffffff20;border-radius:10px;background:#171717;color:#fff;font:inherit}.viewer-controls input:focus{outline:2px solid #ff7900}.viewer-controls a{padding:12px 18px;border-radius:10px;background:#ff7900;color:#15100b;text-decoration:none;font-weight:750}.viewer-controls output{color:#a79e96;font-size:12px}article{background:#111;border:1px solid #ffffff0c;border-radius:16px;padding:22px;margin:14px 0;transition:border-color .2s}article:hover{border-color:#ff790045}article[hidden]{display:none}.avatar{background:linear-gradient(140deg,#ff790033,#ff790008);border:1px solid #ff790035}.body header b{color:#fff6ed}aside{background:#191512}.file{background:#201913;border:1px solid #ff790020}time,small{color:#93877d}.empty{text-align:center;padding:60px 20px;color:#a79e96}.archive-banner{display:block;max-width:543px;width:100%;margin:32px auto 0;border-radius:14px;opacity:.8}footer{color:#8d7a6a;font-size:12px;letter-spacing:2px}@media(max-width:600px){article{padding:16px;gap:10px}.avatar{width:32px;height:32px;border-radius:10px}time{margin-left:0;width:100%}.viewer-controls a{font-size:12px}.viewer-bar{padding:12px}.hero{padding-left:20px;padding-right:20px}h1{letter-spacing:-1px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{transition:none!important}.brand img,.archive-banner{display:none}}@media print{.viewer-bar,.archive-banner{display:none}article{break-inside:avoid}body{background:white;color:black}}`;
const script=`const input=document.querySelector('#search');const rows=[...document.querySelectorAll('main article')];const count=document.querySelector('#results');const empty=document.querySelector('#empty');function filter(){const q=input.value.toLocaleLowerCase('nl');let n=0;for(const row of rows){row.hidden=!row.textContent.toLocaleLowerCase('nl').includes(q);if(!row.hidden)n++;}count.textContent=n+' / '+rows.length+' berichten';empty.hidden=n!==0;}input.addEventListener('input',filter);filter();`;
export function renderViewer(html,token) {
 return html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i,'')
 .replace('</style>',`${css}</style>`)
 .replace('☾ LA NOCHE / ARCHIEF','<img src="/assets/logo.gif" alt="La Noche"> LA NOCHE / ARCHIEF')
 .replace('<main>',`<div class="viewer-bar"><div class="viewer-controls"><input id="search" type="search" aria-label="Zoek in het gesprek" placeholder="Zoek een bericht of naam…"><output id="results" aria-live="polite"></output><a href="/t/${token}/download">↓ Download</a></div></div><main><p class="empty" id="empty" hidden>Geen berichten gevonden.</p>`)
 .replace('<footer>','<img class="archive-banner" src="/assets/banner.gif" alt="La Noche"><footer>')
 .replace('</html>','<script src="/viewer.js" defer></script></html>');
}
export function createTranscriptServer(store) {
 const assets=new Map([['/assets/logo.gif',readFileSync(new URL('../assets/ticket-logo.gif',import.meta.url))],['/assets/banner.gif',readFileSync(new URL('../assets/ticket-banner.gif',import.meta.url))]]);
 return createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  const send=(status,type,body)=>{res.writeHead(status,{'Content-Type':type});res.end(req.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return send(405,'text/plain','Method not allowed');}
  try {
   const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/health')return send(200,'text/plain','ok');
   if(path==='/viewer.js')return send(200,'text/javascript; charset=utf-8',script);
   if(assets.has(path))return send(200,'image/gif',assets.get(path));
   const match=/^\/t\/([a-f0-9]{64})(\/download)?$/.exec(path);
   const record=match && store.transcriptByToken(match[1]);
   const closed=record && store.auditEvent(`ticket:${record.ticket}:closed`);
   const deleted=record && store.auditEvent(`ticket:${record.ticket}:deleted`);
   const event=deleted?.transcript?deleted:closed;
   if(!event?.transcript || event.guild!==record.guild)return send(404,'text/plain; charset=utf-8','Dit transcript is niet beschikbaar. Open de link vanuit het ticketlogboek.');
   if(match[2]){res.setHeader('Content-Disposition',`attachment; filename="la-noche-ticket-${record.ticket.replace(/[^0-9]/g,'')}.html"`);return send(200,'text/html; charset=utf-8',event.transcript.html);}
   return send(200,'text/html; charset=utf-8',renderViewer(event.transcript.html,match[1]));
  }catch{return send(500,'text/plain','Transcript tijdelijk niet beschikbaar.');}
 });
}
