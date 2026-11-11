const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../web/scenarios.js','utf8');
const id='d734225e-6e91-40ce-9ade-8221445fb97b';
const scenario={id,name:'Robin',author:'424086753327054849',kind:'Bankoverval',time:1794429000000,points:10,times:2,total:20,pointsEpoch:0,pointsActive:true,participants:[{id:'1',name:'Robin'},{id:'2',name:'Jaro'},{id:'3',name:'Milan'}],clip:{type:'file',filename:'clip.mp4',mime:'video/mp4',size:1024},publish:{status:'sent'}};
const result={items:[scenario],total:1,page:1,pages:1,summary:{points:20,scenarios:1,clips:1,epoch:0,resetAt:null},updatedAt:scenario.time};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function setup(hash='#/scenarios'){
 const elements=new Map(),listeners=new Map(),timers=new Map(),calls=[];let timerId=0,status=200,paused=0,cleared=0,requiresLogin=0,listResult=structuredClone(result),detailResult=structuredClone(scenario);
 function node(key){if(!elements.has(key))elements.set(key,{hidden:false,value:'',textContent:'',innerHTML:'',classList:{toggle(){}},querySelector(selector){return selector==='video'&&this.innerHTML.includes('<video')?video:null;},replaceChildren(){this.innerHTML='';}});return elements.get(key);}
 const video={pause(){paused++},removeAttribute(){cleared++},load(){},addEventListener(){}};
 const host={innerHTML:'',querySelector:node,querySelectorAll:selector=>selector==='video'&&node('.scenarios-detail').innerHTML.includes('<video')?[video]:[],replaceChildren(){this.innerHTML='';elements.clear()}};
 const document={hidden:false,documentElement:{dataset:{}},querySelector:()=>null,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
 const ctx={window:{lnRequireLogin(){requiresLogin++}},document,location:{hash},URL,URLSearchParams,AbortController,Intl,Date,Set,Error,setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),fetch:async(path,options)=>{calls.push({path,options});return {ok:status===200,status,json:async()=>status===200?(path.includes('?')?structuredClone(listResult):{scenario:structuredClone(detailResult)}):{error:'Geen toegang'}};}};
 vm.runInNewContext(source,ctx);
 return {ctx,host,node,document,calls,timers,listeners,module:ctx.window.lnTools.scenarios,get paused(){return paused},get cleared(){return cleared},get requiresLogin(){return requiresLogin},setStatus:value=>status=value,setData(list,detail){listResult=structuredClone(list);if(detail)detailResult=structuredClone(detail);},async poll(){const entry=[...timers].find(([,timer])=>String(timer.fn).includes('loadList'));assert(entry,'Poll scheduled');timers.delete(entry[0]);entry[1].fn();await turn();}};
}
const user={id:'owner',allowed:true,admin:true,pages:['scenarios']};
test('gang UI uses one server total and keeps the video element stable across polls',async()=>{
 const s=setup('#/scenarios/'+id);s.module.open(s.host,user);await turn();
 assert.equal(s.node('[data-scenario-total]').textContent,'20');
 assert.match(s.node('.scenarios-list').innerHTML,/\+20/);assert.doesNotMatch(s.host.innerHTML,/Ranglijst|per deelnemer|p\.p\./);
 const detailMarkup=s.node('.scenarios-detail').innerHTML;
 assert.match(detailMarkup,/preload="none"/);assert.match(detailMarkup,/\/api\/scenarios\/.+\/clip/);
 await s.poll();assert.equal(s.node('.scenarios-detail').innerHTML,detailMarkup);assert.equal(s.cleared,0);
 s.module.close();assert.equal(s.cleared,1);assert.equal(s.timers.size,0);assert.equal(s.listeners.size,0);
});
test('live polling resumes after hidden tab and account editor suspension',async()=>{
 const s=setup();s.module.open(s.host,user);await turn();const initial=s.calls.length;
 s.document.hidden=true;s.listeners.get('visibilitychange')();assert.equal(s.timers.size,0);
 s.document.hidden=false;s.listeners.get('visibilitychange')();await turn();assert.equal(s.calls.length,initial+1);
 s.module.suspend();assert.equal(s.timers.size,0);const beforeResume=s.calls.length;
 s.document.documentElement.dataset.accountEditor='open';s.module.resume();await turn();assert.equal(s.calls.length,beforeResume);
 delete s.document.documentElement.dataset.accountEditor;s.module.resume();await turn();assert.equal(s.calls.length,beforeResume+1);assert(s.timers.size>0);
 s.module.close();
});
test('revoked page permission clears archived data and video before reloading identity',async()=>{
 const s=setup('#/scenarios/'+id);s.module.open(s.host,user);await turn();s.setStatus(403);await s.poll();
 assert.equal(s.host.innerHTML,'');assert.equal(s.requiresLogin,1);assert.equal(s.cleared,1);assert.equal(s.timers.size,0);
});
test('ordinary users without scenario grant cannot trigger any API calls',async()=>{
 const s=setup();s.module.open(s.host,{id:'other',allowed:true,admin:false,pages:['overview']});await turn();
 assert.equal(s.calls.length,0);assert.match(s.host.textContent,/geen toegang/);
});

test('archived scenarios retain their clip and original score with an explicit previous-period label',async()=>{
 const old={...scenario,pointsActive:false},list={...result,items:[old],summary:{...result.summary,points:0,epoch:1,resetAt:1794430000000}};
 const s=setup('#/scenarios/'+id);s.setData(list,old);s.module.open(s.host,user);await turn();
 assert.equal(s.node('[data-scenario-total]').textContent,'0');
 assert.equal(s.node('[data-scenario-count]').textContent,'1');
 assert.equal(s.node('[data-scenario-clips]').textContent,'1');
 assert.equal(s.node('[data-scenario-period]').hidden,false);
 assert.match(s.node('[data-scenario-period]').textContent,/Huidige periode · sinds/);
 assert.match(s.node('.scenarios-list').innerHTML,/punten · vorige periode/);
 assert.doesNotMatch(s.node('.scenarios-list').innerHTML,/\+20/);
 assert.equal(s.node('.scenarios-detail-total').textContent,'20');
 assert.equal(s.node('.scenarios-detail-period').hidden,false);
 assert.match(s.node('.scenarios-detail-period').textContent,/Vorige periode/);
 assert.match(s.node('.scenarios-detail').innerHTML,/<video/);
 s.module.close();
});
test('a live reset updates an open archived detail without replacing its video even outside the current list page',async()=>{
 const s=setup('#/scenarios/'+id);s.module.open(s.host,user);await turn();
 const detailMarkup=s.node('.scenarios-detail').innerHTML;
 assert.equal(s.node('.scenarios-detail-total').textContent,'+20');
 assert.equal(s.node('.scenarios-detail-period').hidden,true);
 s.setData({...result,items:[],summary:{...result.summary,points:0,epoch:1,resetAt:1794430000000}});
 await s.poll();
 assert.equal(s.node('[data-scenario-total]').textContent,'0');
 assert.equal(s.node('.scenarios-detail-total').textContent,'20');
 assert.equal(s.node('.scenarios-detail-period').hidden,false);
 assert.match(s.node('.scenarios-detail-period').textContent,/tellen niet mee in het huidige totaal/);
 assert.equal(s.node('.scenarios-detail').innerHTML,detailMarkup);
 assert.equal(s.cleared,0);
 s.module.close();
});
