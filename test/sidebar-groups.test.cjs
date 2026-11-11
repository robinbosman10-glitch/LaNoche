const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../web/app.js','utf8');
const section=source.slice(source.indexOf('const sidebarGroupKeys='),source.indexOf('const chartHourFormatter='));
function setup(identity,storage=new Map()){
 const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',hidden:false,scrollTop:17,classList:{toggle(){}},focus(){},addEventListener(){}});return nodes.get(key);};
 const ctx={identity,data:null,active:'scenarios',read:(key,fallback)=>storage.has(key)?JSON.parse(storage.get(key)):fallback,localStorage:{setItem:(key,value)=>storage.set(key,value)},$:node,document:{querySelector:node},icon:()=>'',esc:String,canPage:id=>identity.pages.includes(id),pageRoute:id=>'#/'+id,toolPages:{studio:{hash:'#/embedstudio',title:'Embedstudio'},permissions:{hash:'#/rechtenkaart',title:'Rechtenkaart'}},cats:{messages:{label:'Berichten',group:'Discord'},tickets:{label:'Tickets',group:'La Noche'}}};
 vm.createContext(ctx);vm.runInContext(section,ctx);ctx.nav();
 return {ctx,node,storage,toggle(key,expanded){ctx.toggleSidebarGroup({target:{closest:()=>({dataset:{sidebarGroup:key},getAttribute:()=>String(expanded)})}})}};
}
test('only Website Development receives collapsible groups; grants remain filtered',()=>{
 const s=setup({id:'ordinary',admin:false,pages:['scenarios','messages']});
 assert.doesNotMatch(s.node('#nav').innerHTML,/data-sidebar-group|Website Development|Tickets/);
 assert.match(s.node('#nav').innerHTML,/Gangpunten & scenario’s/);assert.equal(s.node('#managementItems').hidden,false);
 s.toggle('discord',true);assert.equal(s.storage.size,0);
});
test('owner collapse state persists per owner ID and leaves page links intact',()=>{
 const owner={id:'424086753327054849',admin:true,pages:['overview','scenarios','messages','tickets']};
 const s=setup(owner);s.toggle('organisation',true);
 assert.match(s.node('#nav').innerHTML,/id="sidebar-items-organisation" hidden/);assert.match(s.node('#nav').innerHTML,/href="#\/scenarios"/);
 assert.match(s.storage.get('ln-sidebar-groups:'+owner.id),/"organisation":true/);
 const restored=setup(owner,s.storage);assert.match(restored.node('#nav').innerHTML,/id="sidebar-items-organisation" hidden/);
 restored.toggle('organisation',false);assert.doesNotMatch(restored.node('#nav').innerHTML,/id="sidebar-items-organisation" hidden/);
 restored.toggle('management',true);assert.equal(restored.node('#managementItems').hidden,true);assert.match(restored.node('#managementHeading').innerHTML,/aria-expanded="false"/);
});
