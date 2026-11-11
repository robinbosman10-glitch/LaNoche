import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {scenarioStore,SCENARIO_CHANNEL} from '../src/scenario-store.js';
import {publicScenario} from '../src/scenario-api.js';
import {logsiteStore} from '../src/logsite-store.js';

const G='1311580149094809650',G2='222222222222222222',A='111111111111111111',B='333333333333333333',C='444444444444444444',RESET='555555555555555555',RESET2='666666666666666666';
const clip={type:'link',url:'https://medal.tv/games/gta-v/clips/example'};
const input=(extra={})=>({name:'Robin',kind:'Bankoverval',points:10,times:2,participants:[{id:A,name:'Robin'},{id:B,name:'Jaro'},{id:B,name:'Jaro'}],...extra});
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'ln-points-')),file=join(directory,'test.sqlite'),db=new DatabaseSync(file);
 const store={...logsiteStore(db),...scenarioStore(db)};
 const add=(entry=input(),{guild=G,author=A,now=1000}={})=>{const draft=store.createScenarioDraft(guild,author,entry,{now});return store.finalizeScenario(guild,draft.id,author,{clip,now});};
 return {db,store,add,file,close(){db.close();rmSync(directory,{force:true,recursive:true});}};
}

test('each unique participant receives the full score while the gang counts each scenario once',()=>{
 const f=fixture();try{
  f.add();f.add(input({points:5,times:3,participants:[{id:B,name:'Jaro'},{id:C,name:'Melvin'}]}),{author:B});
  assert.deepEqual(f.store.scenarioPoints(G),{epoch:0,resetAt:null,points:35,members:[{id:B,points:35,scenarios:2},{id:A,points:20,scenarios:1},{id:C,points:15,scenarios:1}]});
  assert.deepEqual(f.store.scenarioPoints(G2),{epoch:0,resetAt:null,points:0,members:[]});
 }finally{f.close();}
});

test('reset clears current gang and personal points and preserves all scenario records and clip metadata',()=>{
 const f=fixture();try{
  const before=f.add();f.add(input(),{guild:G2});
  const result=f.store.resetScenarioPoints(G,A,RESET,{now:2000});
  assert.deepEqual(result,{epoch:1,resetAt:2000,previousPoints:20,duplicate:false});
  assert.deepEqual(f.store.scenarioPoints(G),{epoch:1,resetAt:2000,points:0,members:[]});
  assert.equal(f.store.scenarioPoints(G2).points,20);
  const archived=f.store.scenario(G,before.id);
  assert.equal(archived.total,20);assert.equal(archived.pointsEpoch,0);assert.equal(archived.pointsActive,false);assert.deepEqual(archived.clip,clip);
  assert.equal(publicScenario(archived).pointsActive,false);
  const list=f.store.listScenarios(G);assert.deepEqual(list.summary,{points:0,scenarios:1,clips:1,epoch:1,resetAt:2000});assert.equal(list.updatedAt,2000);
  assert.equal(f.store.pendingScenarioPublishes(G).length,1);
  const record=f.db.prepare("SELECT * FROM web_logs WHERE id=?").get(`scenario-points-reset:${G}:${RESET}`),event=JSON.parse(record.payload);
  assert.equal(event.actor,A);assert.equal(event.action,'Gangpunten gereset');assert.match(event.detail,/20/);assert(!record.payload.includes('medal.tv'));
 }finally{f.close();}
});

test('reset retries cannot erase scenarios finalized later and old scenario retries cannot restore reset points',()=>{
 const f=fixture();try{
  const old=f.add();f.store.resetScenarioPoints(G,A,RESET,{now:2000});
  const current=f.add(input({points:7,times:3}),{now:3000});assert.equal(current.pointsEpoch,1);assert.equal(current.pointsActive,true);
  const repeated=f.store.resetScenarioPoints(G,A,RESET,{now:4000});assert.equal(repeated.duplicate,true);assert.equal(repeated.resetAt,2000);
  assert.equal(f.store.scenarioPoints(G).points,21);
  assert.throws(()=>f.store.resetScenarioPoints(G,B,RESET,{now:4000}),e=>e.status===403);
  const oldRetry=f.store.finalizeScenario(G,old.id,A,{clip,now:5000});assert.equal(oldRetry.duplicate,true);assert.equal(oldRetry.pointsActive,false);
  assert.equal(f.store.scenarioPoints(G).points,21);assert.equal(f.store.listScenarios(G).summary.scenarios,2);
  f.store.resetScenarioPoints(G,A,RESET2,{now:6000});assert.equal(f.store.scenarioPoints(G).epoch,2);assert.equal(f.store.scenarioPoints(G).points,0);
 }finally{f.close();}
});

test('a draft prepared before reset only earns points in the period when it is finalized',()=>{
 const f=fixture();try{
  const draft=f.store.createScenarioDraft(G,A,input(),{now:1000});f.store.resetScenarioPoints(G,A,RESET,{now:2000});
  const saved=f.store.finalizeScenario(G,draft.id,A,{clip,now:3000});assert.equal(saved.pointsEpoch,1);assert.equal(f.store.scenarioPoints(G).points,20);
 }finally{f.close();}
});

test('a failed reset audit rolls back both the epoch and idempotency receipt',()=>{
 const f=fixture();try{
  f.add();f.db.exec("CREATE TRIGGER fail_points_audit BEFORE INSERT ON web_logs BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
  assert.throws(()=>f.store.resetScenarioPoints(G,A,RESET,{now:2000}),/audit failed/);
  assert.equal(f.store.scenarioPoints(G).epoch,0);assert.equal(f.store.scenarioPoints(G).points,20);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM scenario_points_resets').get().n,0);
  f.db.exec('DROP TRIGGER fail_points_audit');assert.equal(f.store.resetScenarioPoints(G,A,RESET,{now:3000}).duplicate,false);
 }finally{f.close();}
});

test('periods, reset receipts and list messages persist across process restarts without resetting again',()=>{
 const f=fixture();try{
  f.add();f.store.resetScenarioPoints(G,A,RESET,{now:2000});f.add(input({points:3,times:4}),{now:3000});
  f.store.savePointsList(G,SCENARIO_CHANNEL,[A,B,A]);
  const reopened=new DatabaseSync(f.file);try{
   const store=scenarioStore(reopened);assert.deepEqual(store.pointsList(G),{channel:SCENARIO_CHANNEL,messages:[A,B]});assert.equal(store.pointsList(G2),null);
   assert.equal(store.scenarioPoints(G).points,12);assert.equal(store.scenarioPoints(G).epoch,1);assert.equal(store.resetScenarioPoints(G,A,RESET,{now:4000}).duplicate,true);assert.equal(store.scenarioPoints(G).points,12);
   assert.equal(store.listScenarios(G).summary.scenarios,2);
  }finally{reopened.close();}
 }finally{f.close();}
});

test('legacy records migrate into period zero and duplicate historical attendance cannot multiply personal points',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE scenarios(guild TEXT NOT NULL,id TEXT NOT NULL,author TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,points INTEGER NOT NULL,times INTEGER NOT NULL,total INTEGER NOT NULL,time INTEGER NOT NULL,participants TEXT NOT NULL,clip TEXT NOT NULL,search_text TEXT NOT NULL,publish_status TEXT NOT NULL DEFAULT 'pending',publish_message TEXT,publish_channel TEXT NOT NULL,publish_attempted INTEGER,publish_attempts INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,id))");
  const id=randomUUID();db.prepare('INSERT INTO scenarios(guild,id,author,name,kind,points,times,total,time,participants,clip,search_text,publish_channel) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(G,id,A,'Robin','Bank',10,2,20,1000,JSON.stringify([{id:B,name:'Jaro'},{id:B,name:'Jaro'}]),JSON.stringify(clip),'robin jaro',SCENARIO_CHANNEL);
  const store=scenarioStore(db);assert.deepEqual(store.scenarioPoints(G),{epoch:0,resetAt:null,points:20,members:[{id:A,points:20,scenarios:1},{id:B,points:20,scenarios:1}]});
  assert.equal(store.scenario(G,id).pointsActive,true);assert.equal(store.scenario(G,id).pointsEpoch,0);
  scenarioStore(db);assert.equal(store.scenarioPoints(G).points,20);
 }finally{db.close();}
});
