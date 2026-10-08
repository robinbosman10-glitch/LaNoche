import {GatewayIntentBits} from 'discord.js';
import {UserError} from './logic.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=value=>/^https:\/\//i.test(value||'')?esc(value):'';
export async function captureTranscript(channel,ticket) {
 if(channel.client && !channel.client.options.intents.has(GatewayIntentBits.MessageContent))throw new UserError('Zet Message Content Intent aan in de Developer Portal en herstart de bot, zodat het volledige transcript kan worden opgeslagen.');
 const messages=[];let before;
 do {
  const page=await channel.messages.fetch({limit:100,...(before?{before}:{})});
  if(!page.size)break;
  messages.push(...page.values());const next=page.last().id;
  if(next===before || page.size<100)break;before=next;
 }while(true);
 messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp || (BigInt(a.id)<BigInt(b.id)?-1:1));
 const blocks=messages.map(m=>{
  const content=(m.content||'').replace(/<@!?(\d+)>/g,(_,id)=>'@'+(channel.guild.members.cache.get(id)?.displayName||id)).replace(/<@&(\d+)>/g,(_,id)=>'@'+(channel.guild.roles.cache.get(id)?.name||id));
  const embeds=(m.embeds||[]).map(e=>`<aside>${e.title?`<strong>${esc(e.title)}</strong>`:''}${e.description?`<p>${esc(e.description)}</p>`:''}${(e.fields||[]).map(f=>`<p><b>${esc(f.name)}</b><br>${esc(f.value)}</p>`).join('')}</aside>`).join('');
  const attachments=[...(m.attachments?.values()||[])].map(a=>`<a class="file" href="${url(a.url)}" rel="noreferrer">📎 ${esc(a.name||'Bijlage')}</a>`).join('');
  return `<article><div class="avatar">${esc((m.member?.displayName||m.author?.username||'?').slice(0,1))}</div><div class="body"><header><b>${esc(m.member?.displayName||m.author?.username||'Onbekend')}</b>${m.author?.bot?'<em>APP</em>':''}<time>${esc(new Date(m.createdTimestamp).toLocaleString('nl-NL',{timeZone:'Europe/Amsterdam'}))}</time></header><p>${esc(content)}</p>${embeds}${attachments}<small>${esc(m.id)}</small></div></article>`;
 });
 const html=`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'"><title>La Noche • Ticket ${esc(ticket.channel)}</title><style>*{box-sizing:border-box}body{margin:0;background:#090b0f;color:#e8e9ed;font:15px/1.6 system-ui,sans-serif}.hero{padding:56px max(24px,calc((100vw - 980px)/2));background:radial-gradient(ellipse at top right,#963b1666,transparent 70%),#12151c;border-bottom:2px solid #ff7900}.brand{color:#ff8b32;letter-spacing:5px;font-weight:900;font-size:14px}h1{font-size:clamp(30px,5vw,48px);line-height:1.1;margin:20px 0}h1 span{color:#ff8b32}.meta{color:#aeb4bf;overflow-wrap:anywhere}.chips{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.chips span{border:1px solid #ff790055;border-radius:9px;padding:8px 14px;background:#ff790010}main{max-width:980px;margin:30px auto;padding:0 20px}article{display:flex;gap:16px;padding:24px 0;border-bottom:1px solid #252a34}.avatar{width:42px;height:42px;flex-shrink:0;display:grid;place-items:center;border-radius:14px;background:#ff790020;color:#ff913b;font-weight:bold}.body{min-width:0;flex:1}header{display:flex;gap:10px;align-items:center;flex-wrap:wrap}time,small{color:#7e8898;font-size:12px}time{margin-left:auto}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0}em{font-size:10px;font-style:normal;background:#ff7900;color:#151515;padding:1px 6px;border-radius:4px}aside{background:#151923;border-left:3px solid #ff7900;padding:16px;border-radius:0 10px 10px 0;margin:12px 0}a{color:#ffae6d}.file{display:block;padding:10px 14px;background:#1c212b;border-radius:8px;margin:6px 0;text-decoration:none}footer{text-align:center;color:#778191;padding:40px}small{display:block;opacity:.6}</style><section class="hero"><div class="brand">☾ LA NOCHE / ARCHIEF</div><h1>Het gesprek.<br><span>Alles op één plek.</span></h1><div class="meta">${esc(channel.name)} • ${esc(ticket.kind)}<br>Ticket ${esc(ticket.channel)} · Aanvrager ${esc(ticket.user)}</div><div class="chips"><span>💬 ${messages.length} berichten</span><span>🔒 Tickettranscript</span><span>Europe/Amsterdam</span></div></section><main>${blocks.join('')||'<p>Geen berichten gevonden.</p>'}</main><footer>LA NOCHE • Loyaliteit. Respect. Familie.</footer></html>`;
 return {html,count:messages.length,name:`la-noche-ticket-${ticket.channel}.html`};
}
