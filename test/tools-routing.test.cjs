const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/../web/app.js','utf8');
function setup(user,hash){
 const nodes=new Map();const node=key=>{if(!nodes.has(key))nodes.set(key,{hidden:false,value:'',innerHTML:'',textContent:'',classList:{toggle(){}},replaceChildren(){}});return nodes.get(key);};
 const ctx={identity:user,location:{hash},document:{documentElement:{dataset:{}}},$:node,cats:{},active:'all',mountedTool:null,actionFilter:'',page:1,data:null,warehousesData:null,roster:null,window:{lnTools:{}},clearBotSettings(){},applyTheme(){},render(){},hidePageLinks(){},refresh(){ctx.refreshed=ctx.active;},esc:x=>x};
 vm.createContext(ctx);vm.runInContext(source.match(/const toolPages=[^\n]+/)[0]+'\n'+source.match(/const canPage=[^\n]+/)[0]+'\n'+source.match(/const pageRoute=[^\n]+/)[0]+'\n'+source.slice(source.indexOf('function route(){'),source.indexOf('function renderMembers(){')),ctx);
 ctx.route();return {ctx,node};
}
test('only owner can route directly to embedstudio and permissions map',()=>{
 for(const hash of ['#/embedstudio','#/rechtenkaart']){
  const {ctx}=setup({id:'ordinary',admin:false,allowed:true,pages:['overview','studio','permissions']},hash);
  assert.equal(ctx.location.hash,'#/overzicht');assert.equal(ctx.refreshed,undefined);
 }
});
test('respondent with no granted log pages can open audience-filtered forms',()=>{
 const {ctx,node}=setup({id:'ordinary',admin:false,allowed:true,pages:[]},'#/formulieren');
 assert.equal(ctx.active,'forms');assert.equal(node('#toolsPanel').hidden,false);assert.equal(node('#botSettingsPanel').hidden,true);assert.equal(node('#export').hidden,true);
});
test('owner tools hide logs and show correct active title without polling log API',()=>{
 for(const [hash,key,title]of [['#/embedstudio','studio','Embedstudio'],['#/rechtenkaart','permissions','Discord-rechtenkaart']]){
  const {ctx,node}=setup({id:'owner',admin:true,allowed:true,pages:[]},hash);assert.equal(ctx.active,key);assert.equal(node('#toolsPanel').hidden,false);assert.equal(node('.logpanel').hidden,true);assert.equal(node('.breadcrumb strong').textContent,title);
 }
});
