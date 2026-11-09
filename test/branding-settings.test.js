import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection} from 'discord.js';
import {settings} from '../src/settings.js';
import {branded} from '../src/embeds.js';
import {auditPayload} from '../src/audit.js';
import {vaultOverviewPayload} from '../src/vault.js';
import {updateMemberlist} from '../src/memberlist.js';
import {syncApplicationLinks} from '../src/applications.js';
const defaults={author:'LA NOCHE  •  OFFICIEEL',footer:'LA NOCHE  •  Loyaliteit. Respect. Familie.',color:'#ff7900',logoUrl:'',bannerUrl:''};
const custom={...defaults,author:'Eigen afzender',footer:'Eigen voettekst',color:'#123456',logoUrl:'https://cdn.discordapp.com/attachments/123/456/logo.gif',bannerUrl:'https://cdn.discordapp.com/attachments/123/456/banner.gif'};
async function withBrand(brand,fn){const saved=settings.branding;settings.branding={...brand};try{return await fn();}finally{settings.branding=saved;}}
function noDanglingAttachments(payload){
 const names=new Set((payload.files||[]).map(f=>f.name));
 for(const embed of payload.embeds){const data=embed.toJSON?embed.toJSON():embed;for(const url of [data.author?.icon_url,data.thumbnail?.url,data.image?.url])if(url?.startsWith('attachment://'))assert(names.has(url.slice(13)),`missing ${url}`);}
}
test('branding defaults preserve existing attachments and names',()=>withBrand(defaults,()=>{
 for(const [banner,logo] of [['banner.png','logo.png'],['ticket-banner.gif','ticket-logo.gif']]){
  const payload=branded('Titel','Tekst',[],banner,logo),embed=payload.embeds[0].toJSON();
  assert.deepEqual(payload.files.map(f=>f.name),[logo,banner]);assert.equal(embed.author.name,defaults.author);assert.equal(embed.footer.text,defaults.footer);assert.equal(embed.color,0xff7900);noDanglingAttachments(payload);
 }
}));
test('custom and mixed media have no unused uploads or dangling references',()=>withBrand(custom,()=>{
 const payload=branded('Titel','Tekst'),embed=payload.embeds[0].toJSON();
 assert.equal(payload.files.length,0);assert.equal(embed.author.icon_url,custom.logoUrl);assert.equal(embed.thumbnail.url,custom.logoUrl);assert.equal(embed.image.url,custom.bannerUrl);assert.equal(embed.author.name,custom.author);assert.equal(embed.footer.text,custom.footer);assert.equal(embed.color,0x123456);
 settings.branding.bannerUrl='';const partial=branded('Titel','Tekst');assert.deepEqual(partial.files.map(f=>f.name),['banner.png']);noDanglingAttachments(partial);
}));
test('semantic ticket and vault authors use the selected logo',()=>withBrand(custom,()=>{
 const ticket=auditPayload({type:'ticket',action:'closed',kind:'witwas',channel:'c',user:'u',actor:'a',time:1});
 const vault=vaultOverviewPayload({vaultBalances:()=>[]},'g');
 for(const payload of [ticket,vault]){assert.equal(payload.embeds[0].toJSON().author.icon_url,custom.logoUrl);assert.equal(payload.files.length,0);noDanglingAttachments(payload);}
 assert.equal(ticket.embeds[0].toJSON().author.name,'LA NOCHE  /  TICKETARCHIEF');assert.equal(vault.embeds[0].toJSON().author.name,'LA NOCHE • KLUISBEHEER');
}));
test('application migration uses selected media without loose attachments',()=>withBrand(custom,async()=>{
 let edited;
 const message={id:'m',author:{id:'bot'},embeds:[{title:'✦ SOLLICITATIES ZIJN GEOPEND'}],components:[],edit:async p=>{edited=p;}};
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>({messages:{fetch:async()=>new Collection([['m',message]])}})}};
 const result=await syncApplicationLinks(guild,{panel:()=>null});assert.equal(result.failed,0);assert.equal(result.updated,1);assert.equal(edited.files.length,0);assert.equal(edited.embeds[0].author.icon_url,custom.logoUrl);assert.equal(edited.embeds[0].image.url,custom.bannerUrl);noDanglingAttachments(edited);
}));
test('existing memberlist attachments cannot override custom branding',()=>withBrand(custom,async()=>{
 let edited;
 const old={attachments:new Collection([['logo',{name:'logo.png',url:'https://cdn.discordapp.com/old/logo.png'}],['banner',{name:'banner.png',url:'https://cdn.discordapp.com/old/banner.png'}]]),edit:async p=>{edited=p;}};
 const channel={id:settings.channels.ledenlijst,isThread:()=>false,permissionsFor:()=>({has:()=>true}),send:async()=>{throw Error('should edit');},messages:{fetch:async()=>old}};
 const guild={id:'g',channels:{fetch:async()=>channel},members:{cache:new Collection(),fetch:async()=>{},me:{}},roles:{cache:new Collection(settings.memberlistRanks.map(id=>[id,{}])),fetch:async()=>{}}};
 await updateMemberlist(guild,{list:()=>({channel:channel.id,messages:['m']}),setList:()=>{}});
 assert.equal(edited.embeds[0].toJSON().author.name,custom.author);assert.equal(edited.embeds[0].toJSON().thumbnail.url,custom.logoUrl);assert.deepEqual(edited.attachments,[]);assert.equal(edited.files.length,0);noDanglingAttachments(edited);
}));
