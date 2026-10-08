import test from 'node:test';
import assert from 'node:assert/strict';
import {Collection,ButtonStyle} from 'discord.js';
import {applicationFields,applicationTicketLink,syncApplicationLinks,ticketChannelUrl} from '../src/applications.js';
test('application button links to exact requested ticket channel',()=>{
 const button=applicationTicketLink().toJSON().components[0];
 assert.equal(button.style,ButtonStyle.Link);
 assert.equal(button.url,'https://discord.com/channels/1311580149094809650/1553516379921973329');
});
test('all history pages updated without repinging, unrelated messages or duplicate links',async()=>{
 const edits=[];let fetches=0;
 function message(id,author='bot',title='✦ SOLLICITATIES ZIJN GEOPEND',components=[]) {return {id,author:{id:author},embeds:[{title}],components,edit:async payload=>edits.push({id,payload})};}
 const first=new Collection(Array.from({length:100},(_,n)=>{const m=message(String(200-n),'someone-else');return [m.id,m];}));
 first.set('200',message('200'));first.set('199',message('199','bot','Andere melding'));
 first.set('198',message('198','bot',undefined,[{components:[{url:ticketChannelUrl}]}]));
 const second=new Collection([['100',message('100')]]);
 const guild={id:'g',client:{user:{id:'bot'}},channels:{fetch:async()=>({messages:{fetch:async options=>{fetches++;if(fetches===1)return first;assert.equal(options.before,'101');return second;}}})}};
 const result=await syncApplicationLinks(guild,{panel:()=>null});
 assert.equal(fetches,2);assert.equal(result.updated,3);assert.equal(result.failed,0);
 assert.deepEqual(edits.map(e=>e.id),['200','198','100']);
 for(const {payload} of edits){assert.deepEqual(payload.allowedMentions,{parse:[]});assert.deepEqual(payload.embeds[0].fields,applicationFields);assert.equal(payload.content,undefined);assert.equal(payload.attachments,undefined);}
});
