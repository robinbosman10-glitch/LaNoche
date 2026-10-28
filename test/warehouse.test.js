import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.js';
import {createWarehouseApi} from '../src/warehouse-api.js';
import {createLogsiteApi} from '../src/logsite-api.js';
import {LOGSITE_OWNER} from '../src/logsite-auth-store.js';
import {sessionCookie} from '../src/logsite-auth.js';
import {leadRole} from '../src/vault.js';
const G='1311580149094809650',V='111111111111111111',origin='https://la-noche-logs.nl';
const fixture=fn=>async()=>{const dir=mkdtempSync(join(tmpdir(),'ln-warehouse-')),store=createStore(dir);try{await fn(store,dir);}finally{store.close();rmSync(dir,{recursive:true,force:true});}};
async function dispatch(handler,path,method='GET',headers={},body=''){
 const req=Readable.from(body?[body]:[]);Object.assign(req,{url:path,method,headers:{host:'la-noche-logs.nl',...headers}});const r={};await handler(req,{writeHead(status){r.status=status;},end(body){r.body=body?.toString()||'';}});return r;
}
test('warehouse stock is isolated, atomic, normalized, persisted and source logs import only once',fixture(async(store,dir)=>{
 const entry={location:'  Coke  Loods ',item:'Goede cokezaadjes',amount:722,action:'add',actor:V,time:Date.now(),date:'28/10/2026',reason:'Nieuwe voorraad'};
 assert.deepEqual(store.warehouseBalances(G),[]);store.bookWarehouse('a',G,entry);assert.equal(store.bookWarehouse('a',G,entry),false);
 store.bookWarehouse('other-warehouse',G,{...entry,location:'andere loods',amount:10});store.bookWarehouse('other-guild','other',{...entry,amount:90});
 assert.throws(()=>store.bookWarehouse('too-much',G,{...entry,action:'remove',amount:723}),/Onvoldoende/);assert.equal(store.warehouseBalances(G).find(b=>b.location==='coke loods').amount,722);
 store.bookWarehouse('take',G,{...entry,action:'remove',amount:22});assert.equal(store.warehouseBalances(G).find(b=>b.location==='coke loods').amount,700);
 store.syncWebLogs(G);store.syncWebLogs(G);assert.equal(store.queryWebLogs(G,{cat:'warehouses'}).total,3);assert.match(store.queryWebLogs(G,{cat:'warehouses'}).logs[0].detail,/goede cokezaadjes/);
 const second=createStore(dir);try{assert.equal(second.warehouseBalances(G).find(b=>b.location==='coke loods').amount,700);assert.equal(second.queryWebLogs(G,{cat:'warehouses'}).total,3);}finally{second.close();}
}));
test('warehouse website requires page + fresh role + CSRF; preview no mutation and retries never double-book',fixture(async store=>{
 const roles=new Set([leadRole]),guild={id:G,name:'La Noche',members:{cache:new Map([[V,{roles:{cache:roles},displayName:'Lead'}]]),fetch:async()=>({roles:{cache:roles}}),me:{permissions:{has:()=>true}}},roles:{cache:new Map()},channels:{cache:new Map()}};
 const client={isReady:()=>true,guilds:{cache:new Map([[G,guild]])},users:{cache:new Map()},options:{intents:{has:()=>true}}};
 const api=createWarehouseApi(store,()=>client,G),logApi=createLogsiteApi(store,()=>client,G);assert.equal((await dispatch(api,'/api/warehouses')).status,401);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,true,{label:'Lead',pages:['warehousestock','warehouses']});const token=store.loginLogsite(G,V,'Actual Discord'),session=store.logsiteSession(token),h={cookie:sessionCookie+'='+token,origin,'x-csrf-token':session.csrf,'content-type':'application/json'};
 const send=(path,e,headers=h)=>dispatch(api,path,'POST',headers,JSON.stringify(e));
 const input={location:'Cokeloods',item:'Goede cokezaadjes',amount:'722',action:'add',date:'28/10/2026',reason:'Nieuwe voorraad',requestId:'11111111-1111-4111-8111-111111111111'};
 assert.equal((await send('/api/warehouses/book',input,{...h,origin:'https://evil.test'})).status,403);
 const preview=await send('/api/warehouses/preview',input);assert.equal(preview.status,200);assert.equal(JSON.parse(preview.body).after,722);assert.equal(store.warehouseBalances(G).length,0);
 assert.equal((await send('/api/warehouses/book',input)).status,200);assert.equal(JSON.parse((await send('/api/warehouses/book',input)).body).changed,false);
 assert.equal((await send('/api/warehouses/book',{...input,amount:'723'})).status,409);
 const state=JSON.parse((await dispatch(api,'/api/warehouses','GET',h)).body);assert.equal(state.locations[0].items[0].amount,722);assert.equal(state.permissions.manage,true);
 const remove={...input,amount:'722',action:'remove',requestId:'22222222-2222-4222-8222-222222222222'};assert.equal((await send('/api/warehouses/book',remove)).status,200);assert.equal(JSON.parse((await send('/api/warehouses/book',remove)).body).changed,false);
 assert.equal(JSON.parse((await dispatch(api,'/api/warehouses','GET',h)).body).totalUnits,0);
 for(const amount of ['-1','0','2.5','1e3','1000000000001'])assert.equal((await send('/api/warehouses/preview',{...input,amount})).status,400);
 assert.equal((await send('/api/warehouses/preview',{...input,date:'31/02/2026'})).status,400);
 roles.clear();assert.equal((await send('/api/warehouses/book',input)).status,403);roles.add(leadRole);
 assert.equal((await dispatch(logApi,'/api/logsite?cat=warehouses','GET',h)).status,200);
 store.updateLogsiteAccount(G,LOGSITE_OWNER,V,'Lead',['warehouses']);assert.equal((await send('/api/warehouses/book',input)).status,403);assert.equal((await dispatch(api,'/api/warehouses','GET',h)).status,403);
 store.updateLogsiteAccount(G,LOGSITE_OWNER,V,'Lead',['warehousestock']);assert.equal((await dispatch(logApi,'/api/logsite?cat=warehouses','GET',h)).status,403);
 store.changeLogsiteAccess(G,LOGSITE_OWNER,V,false);assert.equal((await send('/api/warehouses/book',input)).status,401);
}));
