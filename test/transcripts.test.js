import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection} from 'discord.js';
import {captureTranscript} from '../src/transcripts.js';
test('custom transcript escapes scripts, preserves messages and attachment links',async()=>{
 const m={id:'123',createdTimestamp:1000,content:'<script>alert(1)</script> hello <@42>',author:{username:'Tester'},embeds:[{title:'Titel',description:'Tekst',fields:[]}],attachments:new Map([['a',{name:'test.png',url:'https://example.com/test.png'}]])};
 const channel={name:'ticket',guild:{members:{cache:new Map([['42',{displayName:'Robin'}]])},roles:{cache:new Map()}},messages:{fetch:async()=>new Collection([['123',m]])}};
 const transcript=await captureTranscript(channel,{channel:'1234',kind:'witwas',user:'42'});
 assert.equal(transcript.count,1);assert.ok(transcript.html.includes('&lt;script&gt;'));assert.ok(!transcript.html.includes('<script>'));assert.ok(transcript.html.includes('@Robin'));assert.ok(transcript.html.includes('https://example.com/test.png'));assert.ok(transcript.html.includes('LA NOCHE / ARCHIEF'));
});
