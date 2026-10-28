import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {logsiteStore} from '../src/logsite-store.js';
import {siteActivityStore} from '../src/site-activity-store.js';
import {ownerLogDmStore} from '../src/owner-log-dm-store.js';

function open(path=':memory:'){
 const db=new DatabaseSync(path);db.exec('CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT)');
 const logs=logsiteStore(db),activity=siteActivityStore(db),notifications=ownerLogDmStore(db);
 return {db,...logs,...activity,...notifications};
}
const log=(id,time=1100)=>({id,time,cat:'tickets',action:'Ticket geopend',user:'member',detail:'Categorie: sollicitatie'});

test('owner DM activation skips existing history and later imports dated before activation',()=>{
 const store=open();
 try{
  store.recordWebLog('g',log('already-present',2000));
  store.recordSiteEvent('g','member','Member','','login',2000);
  assert.equal(store.enableOwnerLogDm('g',1000),true);
  assert.equal(store.enableOwnerLogDm('g',5000),false);
  assert.deepEqual(store.pendingOwnerLogDms('g'),[]);
  store.recordWebLog('g',log('historical:old',999));
  store.recordSiteEvent('g','member','Member','','visit',999);
  assert.deepEqual(store.pendingOwnerLogDms('g'),[]);
  store.recordWebLog('g',log('new-at-cutoff',1000));
  assert.equal(store.pendingOwnerLogDms('g')[0].payload.id,'new-at-cutoff');
  assert.equal(store.db.prepare('SELECT since FROM owner_log_dm_enabled WHERE guild=?').get('g').since,1000);
 }finally{store.db.close();}
});

test('new logs and activity queue once per source event, isolate guilds and ignore presence polls',()=>{
 const store=open();
 try{
  store.enableOwnerLogDm('g',1000);
  store.recordWebLog('g',log('same-log'));
  store.recordWebLog('g',log('same-log'));
  store.recordWebLog('disabled-guild',log('disabled'));
  store.recordSiteEvent('disabled-guild','member','Hidden','','login',1100);
  for(const kind of ['login','login_denied','logout','visit'])store.recordSiteEvent('g','member','Visible name','',kind,1100);
  store.noteSiteSeen('g','member','Visible name','','pots',1200);
  store.noteSiteSeen('g','member','Visible name','','safe',1300);
  const pending=store.pendingOwnerLogDms('g',1500);
  assert.equal(pending.length,5);
  assert.equal(pending[0].source,'weblog');assert.equal(pending[0].event,'same-log');assert.equal(pending[0].eventTime,1100);
  assert.deepEqual(pending.slice(1).map(row=>row.payload.action),['Ingelogd','Inloggen geweigerd','Uitgelogd','Website bezocht']);
  assert.ok(pending.slice(1).every(row=>row.source==='activity'&&row.payload.cat==='siteactivity'&&row.payload.user==='member'&&row.payload.person==='Visible name'&&row.payload.source==='Website'&&row.payload.channel==='Website'));
  assert.deepEqual(store.pendingOwnerLogDms('disabled-guild',1500),[]);
  store.enableOwnerLogDm('other',1000);store.recordWebLog('other',log('other-event'));
  assert.equal(store.pendingOwnerLogDms('g',1500).length,5);assert.equal(store.pendingOwnerLogDms('other',1500).length,1);
  store.db.exec('BEGIN');store.recordWebLog('g',log('rolled-back'));store.db.exec('ROLLBACK');
  assert.equal(store.pendingOwnerLogDms('g',1500).length,5);
 }finally{store.db.close();}
});

test('retry state and delivered messages survive reopening without requeueing old events',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ln-owner-dm-')),path=join(dir,'notifications.sqlite');let store=open(path);
 try{
  store.enableOwnerLogDm('g',1000);store.recordWebLog('g',log('first'));store.recordWebLog('g',log('second'));
  const [first,second]=store.pendingOwnerLogDms('g',1500);
  assert.equal(store.retryOwnerLogDm(first.id,3000),true);
  assert.equal(store.markOwnerLogDmSent(second.id,'discord-message-2',1600),true);
  store.db.close();store=open(path);
  assert.equal(store.enableOwnerLogDm('g',9000),false);
  assert.deepEqual(store.pendingOwnerLogDms('g',2999),[]);
  const retry=store.pendingOwnerLogDms('g',3000);assert.equal(retry.length,1);assert.equal(retry[0].id,first.id);assert.equal(retry[0].attempts,1);
  const delivered=store.db.prepare('SELECT message,delivered FROM owner_log_dm_outbox WHERE id=?').get(second.id);
  assert.deepEqual({...delivered},{message:'discord-message-2',delivered:1600});
  assert.equal(store.markOwnerLogDmSent(first.id,'discord-message-1',3100),true);
  assert.equal(store.retryOwnerLogDm(first.id,9999),false);
  assert.equal(store.markOwnerLogDmSent(first.id,'duplicate',3200),false);
  store.recordWebLog('g',log('first'));assert.deepEqual(store.pendingOwnerLogDms('g',9999),[]);
  store.db.close();store=open(path);assert.deepEqual(store.pendingOwnerLogDms('g',9999),[]);
 }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
