const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {runInNewContext}=require('node:vm');
const source=readFileSync(__dirname+'/../web/app.js','utf8');
function handler(){
 const form={};
 const bulk=source.match(/function bulkPages\(e\)\{[^\n]+/)[0];
 const binding=source.match(/\$\('#addAccount'\)\.onclick=[^\n]+/)[0];
 runInNewContext(bulk+'\n'+binding,{$:()=>form});return form.onclick;
}
test('submit buttons and individual checkboxes retain their browser default action',()=>{
 for(const type of ['submit','checkbox','label']){
  const result=handler()({target:{type,closest:()=>null}});
  assert.notEqual(result,false,type+' must not cancel click default');
 }
});
test('select all and none still update every checkbox',()=>{
 const checks=[{checked:false},{checked:false}];
 for(const action of ['all','none']){
  const button={dataset:{check:action},closest:()=>({querySelectorAll:()=>checks})};
  handler()({target:{closest:()=>button}});
  assert(checks.every(c=>c.checked===(action==='all')));
 }
});
