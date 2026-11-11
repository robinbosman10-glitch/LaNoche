import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {archiveScenarioClip,normalizeScenarioClipLink,removeScenarioClip,scenarioClipPath,ScenarioClipError} from '../src/scenario-clips.js';

const attachmentUrl='https://cdn.discordapp.com/ephemeral-attachments/111111111111111111/222222222222222222/bank.mp4?ex=deadbeef&is=abcd&hm=signature';
const video=brand=>{const bytes=Buffer.alloc(64);bytes.writeUInt32BE(24,0);bytes.write('ftyp',4);bytes.write(brand||'isom',8);bytes.write('isommp42',16);return bytes;};
const attachment=(bytes,extra={})=>({url:attachmentUrl,name:'bankoverval.mp4',size:bytes.length,contentType:'video/mp4',...extra});
const response=(bytes,headers={})=>new Response(bytes,{headers:{'content-type':'video/mp4','content-length':String(bytes.length),...headers}});
async function fixture(fn){const directory=await mkdtemp(join(tmpdir(),'ln-clips-'));try{await fn(directory);}finally{await rm(directory,{recursive:true,force:true});}}
async function leftovers(directory){try{return await readdir(join(directory,'scenario-clips'));}catch(error){if(error.code==='ENOENT')return [];throw error;}}

test('Discord clip archive writes durable bytes under an opaque safe key and removes only selected file',async()=>fixture(async directory=>{
 const bytes=video();let options;
 const file=await archiveScenarioClip(attachment(bytes,{name:'../Bank "test".mp4'}),{directory,fetcher:async(url,opts)=>{assert.equal(url,attachmentUrl);options=opts;return response(bytes);}});
 assert.equal(options.redirect,'error');assert(options.signal instanceof AbortSignal);
 assert.equal(file.type,'file');assert.equal(file.size,bytes.length);assert.equal(file.mime,'video/mp4');assert.match(file.key,/^[a-f\d-]{36}\.mp4$/);
 assert(!file.filename.includes('/'));assert(!file.filename.includes('"'));assert(!file.filename.startsWith('.'));
 assert.deepEqual(await readFile(scenarioClipPath(file.key,{directory})),bytes);
 assert.deepEqual(await leftovers(directory),[file.key]);
 assert.throws(()=>scenarioClipPath('../../secret.mp4',{directory}),ScenarioClipError);
 await removeScenarioClip(file,{directory});await removeScenarioClip(file,{directory});assert.deepEqual(await leftovers(directory),[]);
}));

test('only exact Discord attachment origins and paths are fetched; redirects and partial responses are rejected',async()=>fixture(async directory=>{
 const bytes=video();let calls=0;
 for(const url of ['http://cdn.discordapp.com/attachments/111111111111111111/222222222222222222/x.mp4','https://cdn.discordapp.com.evil.com/attachments/111111111111111111/222222222222222222/x.mp4','https://user@cdn.discordapp.com/attachments/111111111111111111/222222222222222222/x.mp4','https://cdn.discordapp.com:444/attachments/111111111111111111/222222222222222222/x.mp4','https://cdn.discordapp.com/avatars/111111111111111111/x.mp4','https://cdn.discordapp.com/attachments/111111111111111111/222222222222222222/a%2Fb.mp4','https://127.0.0.1/attachments/111111111111111111/222222222222222222/x.mp4']){
  await assert.rejects(archiveScenarioClip({...attachment(bytes),url},{directory,fetcher:async()=>{calls++;return response(bytes);}}),ScenarioClipError);
 }
 assert.equal(calls,0);
 for(const invalid of [new Response(null,{status:302,headers:{location:'https://example.com'}}),new Response(bytes,{status:206}),{ok:true,status:200,redirected:true}, {ok:true,status:200,url:'https://example.com/private'}])await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,fetcher:async()=>invalid}),ScenarioClipError);
 assert.deepEqual(await leftovers(directory),[]);
}));

test('bounded streaming rejects oversized and truncated files without leaving partial artifacts',async()=>fixture(async directory=>{
 const bytes=video();
 await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,maxBytes:32,fetcher:async()=>{throw new Error('must not fetch')}}),/te groot/);
 const stream=()=>({ok:true,status:200,headers:new Headers({'content-type':'video/mp4'}),body:(async function*(){yield bytes;yield bytes;})()});
 await assert.rejects(archiveScenarioClip({url:attachmentUrl,contentType:'video/mp4'},{directory,maxBytes:70,fetcher:async()=>stream()}),/te groot/);
 await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,fetcher:async()=>response(bytes.subarray(0,30),{'content-length':'64'})}),/onvolledig/);
 await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,fetcher:async()=>response(bytes,{'content-length':'128'})}),/onvolledig/);
 assert.deepEqual(await leftovers(directory),[]);
}));

test('magic bytes and MIME are checked together and supported containers receive correct MIME',async()=>fixture(async directory=>{
 const html=Buffer.from('<html><script>attack()</script></html>');
 await assert.rejects(archiveScenarioClip(attachment(html),{directory,fetcher:async()=>response(html)}),/videobestand/);
 const bytes=video();await assert.rejects(archiveScenarioClip(attachment(bytes,{contentType:'text/html'}),{directory,fetcher:async()=>response(bytes)}),/bestandstype/);
 await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,fetcher:async()=>response(bytes,{'content-type':'text/html'})}),/bestandstype/);
 assert.deepEqual(await leftovers(directory),[]);
 const cases=[
  {bytes:video('qt  '),mime:'video/quicktime',extension:'mov'},
  {bytes:Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from('....webm....video')]),mime:'video/webm',extension:'webm'},
  {bytes:Buffer.concat([Buffer.from('OggS'),Buffer.alloc(24),Buffer.from('\x80theora','binary')]),mime:'video/ogg',extension:'ogv'},
 ];
 for(const item of cases){const file=await archiveScenarioClip(attachment(item.bytes,{contentType:item.mime}),{directory,fetcher:async()=>response(item.bytes,{'content-type':item.mime})});assert.equal(file.mime,item.mime);assert(file.key.endsWith('.'+item.extension));}
}));

test('interrupted downloads clean up and offer a retry instead of retaining incomplete clips',async()=>fixture(async directory=>{
 const bytes=video();
 const interrupted={ok:true,status:200,headers:new Headers(),body:(async function*(){yield bytes;throw new Error('network disconnected');})()};
 await assert.rejects(archiveScenarioClip({url:attachmentUrl},{directory,fetcher:async()=>interrupted}),error=>error instanceof ScenarioClipError&&error.status===503);
 assert.deepEqual(await leftovers(directory),[]);
 const aborted=new AbortController();aborted.abort();
 await assert.rejects(archiveScenarioClip(attachment(bytes),{directory,signal:aborted.signal,fetcher:async()=>response(bytes)}),ScenarioClipError);
 assert.deepEqual(await leftovers(directory),[]);
}));

test('external clip links remain links and reject credentials, non-HTTPS and internal targets',()=>{
 assert.deepEqual(normalizeScenarioClipLink(' https://medal.tv/games/gta-v/clips/abc?foo=1#clip '),{type:'link',url:'https://medal.tv/games/gta-v/clips/abc?foo=1#clip'});
 for(const url of ['javascript:alert(1)','data:video/mp4,abc','http://example.com/clip','https://user:secret@example.com/clip','https://127.0.0.1/video','https://[::1]/video','https://2130706433/video','https://localhost/video','https://service.local/video','https://example.com:8080/video','https://invalid','not a url'])assert.throws(()=>normalizeScenarioClipLink(url),ScenarioClipError);
});
