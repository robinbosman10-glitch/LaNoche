import test from 'node:test';
import assert from 'node:assert/strict';
import { getMembers, invalidateMembers } from '../src/member-cache.js';
test('concurrent and repeated refreshes fetch all members only once and use live cache',async()=>{
 let calls=0, finish;
 const gate=new Promise(r=>{finish=r;});
 const guild={members:{cache:new Map(),fetch:async()=>{calls++;await gate;guild.members.cache.set('one',{});}}};
 const first=getMembers(guild);const second=getMembers(guild);
 finish();await Promise.all([first,second]);
 guild.members.cache.set('two',{});
 assert.equal((await getMembers(guild)).size,2);
 guild.members.cache.delete('one');assert.equal((await getMembers(guild)).size,1);
 assert.equal(calls,1);
 invalidateMembers(guild);await getMembers(guild);assert.equal(calls,2);
});
test('rate-limited or incomplete hydration is not accepted and respects retry_after',async()=>{
 let calls=0;
 const guild={members:{cache:new Map(),fetch:async()=>{calls++;if(calls===1)throw Object.assign(new Error(),{name:'GatewayRateLimitError',data:{retry_after:120}});}}};
 await assert.rejects(getMembers(guild),/Discord begrenst/);
 await assert.rejects(getMembers(guild),/nog niet opnieuw/);
 assert.equal(calls,1);
 await getMembers(guild,Date.now()+122000);assert.equal(calls,2);
 await getMembers(guild);assert.equal(calls,2);
});
