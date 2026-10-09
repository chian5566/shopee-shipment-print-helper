const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../popup.js'),'utf8');
async function run(url,{missing=false,fail=false,downloadPage=false}={}) {
 const status={},calls=[];let messages=0,closed=false;
 const chrome={tabs:{query:async()=>[{id:1,url}],sendMessage:async()=>{calls.push('message');if(fail||missing&&messages++===0)throw Error('no receiver');return {ok:true,downloadPage};}},scripting:{executeScript:async options=>calls.push(options),insertCSS:async options=>calls.push(options)}};
 const ctx=vm.createContext({chrome,URL,window:{close(){closed=true;}},document:{getElementById:id=>id==='status'?status:{addEventListener(){}}}});
 // Remove only the startup call, then explicitly await the same entry point.
 vm.runInContext(code.replace(/openAssistant\(\);\s*$/,''),ctx);await vm.runInContext('openAssistant()',ctx);
 return {status,calls,closed};
}
test('any page has a useful prompt, correct page opens, missing receiver repairs, errors remain visible',async()=>{
 for(const url of ['https://example.com','chrome://extensions/','https://seller.shopee.tw/portal/home']){
  const result=await run(url);assert.match(result.status.textContent,/批次出貨 → 下載出貨文件/);assert.equal(result.closed,false);
 }
 const correct=await run('https://seller.shopee.tw/portal/sale/mass/ship',{downloadPage:true});assert.equal(correct.closed,true);
 const repaired=await run('https://seller.shopee.tw/portal/sale/mass/ship',{missing:true,downloadPage:true});assert.equal(repaired.closed,true);assert.equal(repaired.calls.length,5);assert.equal(repaired.calls[1].world,'MAIN');
 const failed=await run('https://seller.shopee.tw/portal/home',{fail:true});assert.match(failed.status.textContent,/重新整理/);assert.equal(failed.closed,false);
});
