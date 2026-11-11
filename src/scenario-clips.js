import {createWriteStream} from 'node:fs';
import {mkdir,open,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export const MAX_SCENARIO_CLIP_BYTES=100*1024*1024;
export class ScenarioClipError extends Error {
 constructor(message,status=400){super(message);this.name='ScenarioClipError';this.status=status;}
}
const fail=message=>{throw new ScenarioClipError(message);};
const defaultDirectory=()=>process.env.DATA_DIR||'./data';
const keyPattern=/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.(?:mp4|mov|webm|ogv)$/;

export function scenarioClipPath(key,{directory=defaultDirectory()}={}){
 if(typeof key!=='string'||!keyPattern.test(key))fail('Ongeldig clipbestand.');
 return join(resolve(directory),'scenario-clips',key);
}

export async function removeScenarioClip(clip,{directory=defaultDirectory()}={}){
 if(clip?.type!=='file')return;
 try{await unlink(scenarioClipPath(clip.key,{directory}));}catch(error){if(error.code!=='ENOENT')throw error;}
}

function attachmentUrl(value){
 let u;try{u=new URL(value);}catch{fail('Het clipbestand heeft geen geldige downloadlink.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))fail('Alleen een rechtstreeks geüpload Discord-clipbestand is toegestaan.');
 const match=/^\/(?:attachments|ephemeral-attachments)\/\d{17,20}\/\d{17,20}\/([^/]+)$/.exec(u.pathname);
 if(!match)fail('Ongeldige Discord-bijlage.');
 let filename;try{filename=decodeURIComponent(match[1]);}catch{fail('Ongeldige Discord-bijlage.');}
 if(!filename||/[\x00-\x1f\x7f/\\]/.test(filename)||filename==='.'||filename==='..')fail('Ongeldige Discord-bijlage.');
 return u;
}

export function normalizeScenarioClipLink(value){
 if(typeof value!=='string'||value.trim().length>2000)fail('Gebruik een geldige HTTPS-link naar je clip.');
 let u;try{u=new URL(value.trim());}catch{fail('Gebruik een geldige HTTPS-link naar je clip.');}
 const host=u.hostname.replace(/^\[|\]$/g,'');
 if(u.protocol!=='https:'||u.username||u.password||u.port||isIP(host)||!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host)||host.endsWith('.')||!host.split('.').every(part=>/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(part)))fail('Gebruik een openbare HTTPS-link naar je clip.');
 return {type:'link',url:u.href};
}

function cleanFilename(value,extension){
 const raw=String(value||'clip').normalize('NFKC').replace(/[\x00-\x1f\x7f/\\"<>:|?*]/g,'_').replace(/^[.\s]+|[.\s]+$/g,'');
 const base=(raw.replace(/\.[a-z\d]{1,8}$/i,'')||'clip').slice(0,150);
 return base+'.'+extension;
}

function detectVideo(header,size){
 if(header.length>=16&&header.toString('ascii',4,8)==='ftyp'){
  const boxSize=header.readUInt32BE(0),brand=header.toString('ascii',8,12);
  if(boxSize<16||boxSize>size||boxSize>65536)fail('Het clipbestand is beschadigd.');
  if(brand==='qt  ')return {mime:'video/quicktime',extension:'mov'};
  if(/^(?:isom|iso[2-9]|mp4[12]|avc[1-4]|M4V |M4VH|M4VP|dash|MSNV|3gp[4-9]|3ge[67]|F4V )$/.test(brand))return {mime:'video/mp4',extension:'mp4'};
 }
 if(header.length>=8&&header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))&&header.includes(Buffer.from('webm')))return {mime:'video/webm',extension:'webm'};
 if(header.length>=28&&header.toString('ascii',0,4)==='OggS'&&header.includes(Buffer.from('\x80theora','binary')))return {mime:'video/ogg',extension:'ogv'};
 fail('Gebruik een geldig MP4-, MOV-, WebM- of Ogg-videobestand.');
}

function checkMime(value,detected){
 const mime=typeof value==='string'?value.split(';')[0].trim().toLowerCase():'';
 if(!mime||['application/octet-stream','binary/octet-stream'].includes(mime))return;
 const allowed={
  'video/mp4':['video/mp4','video/x-m4v','video/3gpp'],
  'video/quicktime':['video/quicktime','video/mp4'],
  'video/webm':['video/webm'],
  'video/ogg':['video/ogg','application/ogg'],
 };
 if(!allowed[detected].includes(mime))fail('Het bestandstype komt niet overeen met een ondersteunde videoclip.');
}

export async function archiveScenarioClip(attachment,{directory=defaultDirectory(),fetcher=fetch,maxBytes=MAX_SCENARIO_CLIP_BYTES,signal}={}){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_SCENARIO_CLIP_BYTES)throw new TypeError('invalid_clip_limit');
 const url=attachmentUrl(attachment?.url);
 const expected=attachment?.size;
 if(expected!==undefined&&(!Number.isSafeInteger(expected)||expected<=0))fail('Het clipbestand is leeg of ongeldig.');
 if(expected>maxBytes)fail('De clip is te groot. Upload maximaal 100 MB of gebruik een clip-link.');
 const abort=signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000);
 let temporary,response;
 try{
  response=await fetcher(url.href,{redirect:'error',signal:abort,headers:{Accept:'video/*, application/octet-stream','Accept-Encoding':'identity'}});
  if(!response?.ok||response.status!==200||response.redirected||response.url&&response.url!==url.href)fail('De clip kon niet veilig worden gedownload. Upload het bestand opnieuw.');
  const length=response.headers?.get('content-length');
  let declared;
  if(length!==null&&length!==undefined){
   if(!/^\d+$/.test(length))fail('De clipdownload heeft een ongeldige bestandsgrootte.');
   declared=Number(length);
   if(!Number.isSafeInteger(declared)||declared<=0)fail('Het clipbestand is leeg of ongeldig.');
   if(declared>maxBytes)fail('De clip is te groot. Upload maximaal 100 MB of gebruik een clip-link.');
   if(expected!==undefined&&declared!==expected)fail('De clip is onvolledig. Upload het bestand opnieuw.');
  }
  if(!response.body)fail('Het clipbestand is leeg.');
  const clipsDirectory=join(resolve(directory),'scenario-clips');
  await mkdir(clipsDirectory,{recursive:true,mode:0o700});
  const id=randomUUID();temporary=join(clipsDirectory,id+'.part');
  let size=0,prefixLength=0;const prefixes=[];
  const guard=new Transform({transform(chunk,encoding,callback){
   const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding);size+=bytes.length;
   if(size>maxBytes)return callback(new ScenarioClipError('De clip is te groot. Upload maximaal 100 MB of gebruik een clip-link.'));
   if(prefixLength<65536){const prefix=bytes.subarray(0,65536-prefixLength);prefixes.push(Buffer.from(prefix));prefixLength+=prefix.length;}
   callback(null,bytes);
  }});
  const source=typeof response.body.getReader==='function'?Readable.fromWeb(response.body):Readable.from(response.body);
  await pipeline(source,guard,createWriteStream(temporary,{flags:'wx',mode:0o600}),{signal:abort});
  if(!size||expected!==undefined&&size!==expected||declared!==undefined&&size!==declared)fail('De clip is onvolledig. Upload het bestand opnieuw.');
  const detected=detectVideo(Buffer.concat(prefixes),size);
  checkMime(attachment.contentType??attachment.content_type,detected.mime);
  checkMime(response.headers?.get('content-type'),detected.mime);
  const handle=await open(temporary,'r');try{await handle.sync();}finally{await handle.close();}
  const key=id+'.'+detected.extension;
  await rename(temporary,scenarioClipPath(key,{directory}));temporary=null;
  return {type:'file',key,filename:cleanFilename(attachment.name??attachment.filename,detected.extension),mime:detected.mime,size};
 }catch(error){
  if(response?.body?.cancel)await response.body.cancel().catch(()=>{});
  else response?.body?.destroy?.();
  if(temporary)await unlink(temporary).catch(()=>{});
  if(error instanceof ScenarioClipError)throw error;
  if(error?.name==='AbortError'||error?.name==='TimeoutError')throw new ScenarioClipError('De clipdownload duurde te lang of is afgebroken. Probeer opnieuw.');
  throw new ScenarioClipError('De clip kon niet worden opgeslagen. Probeer opnieuw.',503);
 }
}
