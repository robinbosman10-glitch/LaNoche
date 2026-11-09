import {settings} from './settings.js';

const f=(key,label,group,type,maxLength,help)=>({key,label,group,type,...(maxLength?{maxLength}:{}),...(help?{help}:{})});
export const botSettingFields=[
 f('branding.author','Naam boven de embed','Vormgeving','text',100),
 f('branding.footer','Voettekst','Vormgeving','text',200),
 f('branding.color','Accentkleur','Vormgeving','color'),
 f('branding.logoUrl','Logo (GIF mogelijk)','Vormgeving','image',1500,'Discord-CDN-link. Laat leeg voor het bestaande logo.'),
 f('branding.bannerUrl','Banner (GIF mogelijk)','Vormgeving','image',1500,'Discord-CDN-link. Laat leeg voor de bestaande banner.'),
 f('ticketPanel.title','Titel','Ticketpaneel','text',150),
 f('ticketPanel.description','Introductie','Ticketpaneel','textarea',1000),
 f('ticketPanel.applications','Sollicitaties','Ticketpaneel','textarea',500),
 f('ticketPanel.laundering','Witwas','Ticketpaneel','textarea',500),
 f('ticketPanel.trade','Drugs inkoop en verkoop','Ticketpaneel','textarea',500),
 ...Object.entries({sollistatus:'Sollicitatiestatus',ledenlijst:'Live ledenlijst',aangenomen:'Aangenomen',afwezig:'Afwezigheid',ontslaan:'Ontslag',promotie:'Promotie'}).map(([key,label])=>f('channels.'+key,label,'Kanalen','channel',null,key==='ledenlijst'?'De live lijst verschijnt bij de volgende update in dit kanaal; de oude berichten blijven staan.':'Nieuwe berichten gaan naar dit kanaal. Bestaande berichten blijven staan.')),
 f('absenceReviewerRole','Coördinator afwezigheid','Behandelrollen','role',null,'Deze rol beoordeelt ook aanvragen die al openstaan.'),
 ...Object.entries({sollicitaties:'Sollicitaties','drugs-inkoop':'Drugs inkoop','drugs-verkoop':'Drugs verkoop',witwas:'Witwas'}).flatMap(([key,label])=>[
  f(`tickets.${key}.parent`,label+' — categorie','Ticketcategorieën','category',null,'Geldt voor nieuw geopende tickets.'),
  f(`tickets.${key}.support`,label+' — behandelrol','Ticketcategorieën','role',null,'Bestaande tickets houden hun oorspronkelijke behandelrol.')
 ])
];
const get=key=>key.split('.').reduce((obj,k)=>obj[k],settings);
export const defaultBotValues=Object.freeze(Object.fromEntries(botSettingFields.map(f=>[f.key,get(f.key)])));
export function normalizeBotValues(values){
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==botSettingFields.length||Object.keys(values).some(k=>!Object.hasOwn(defaultBotValues,k)))throw new Error('Onbekende of ontbrekende instellingen. Herlaad de pagina.');
 const clean={};
 for(const f of botSettingFields){
  let v=values[f.key];if(typeof v!=='string')throw new Error(f.label+': ongeldige invoer.');v=v.trim();
  if(f.type!=='image'&&!v)throw new Error(f.label+' mag niet leeg zijn.');
  if(f.maxLength&&v.length>f.maxLength)throw new Error(f.label+' is te lang.');
  if(['role','channel','category'].includes(f.type)&&(!/^\d{17,20}$/.test(v)||BigInt(v)>18446744073709551615n))throw new Error(f.label+': kies een geldig Discord-ID.');
  if(f.type==='color'&&!/^#[a-f\d]{6}$/i.test(v))throw new Error('Kies een geldige kleur.');
  if(f.type==='image'&&v){
   let u;try{u=new URL(v);}catch{throw new Error(f.label+': gebruik een HTTPS-link van Discord.');}
   if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname)||u.port||u.username||u.password||u.hash||!/^\/(attachments|icons|avatars|banners)\//.test(u.pathname)||! /\.(gif|png|webp|jpe?g)$/i.test(u.pathname))throw new Error(f.label+': gebruik een afbeeldingslink van de Discord-CDN.');
  }
  clean[f.key]=v;
 }
 return clean;
}
export function applyBotValues(values){
 const clean=normalizeBotValues(values);
 for(const [key,value]of Object.entries(clean)){const parts=key.split('.');let parent=settings;for(const p of parts.slice(0,-1))parent=parent[p];parent[parts.at(-1)]=value;}
}
export function loadBotSettings(store,guild){
 const saved=store.botSettings(guild);const values=normalizeBotValues({...defaultBotValues,...saved.values});applyBotValues(values);return {revision:saved.revision,values};
}
