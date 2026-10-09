const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../preview-reader.js'),'utf8');
(async()=>{
async function run({active=true,src='blob:https://seller.shopee.tw/example#toolbar=0',data='%PDF-1.7 test',failure=false}={}) {
 const messages=[],fetched=[];let tick;
 const context={Date,URL,Uint8Array,TextDecoder,String,btoa,location:{href:'https://seller.shopee.tw/awbprint?job_id=1',origin:'https://seller.shopee.tw'},document:{querySelector:()=>({src})},window:{setInterval(fn){tick=fn;return 1;},clearInterval(){}},chrome:{runtime:{sendMessage(message,callback){messages.push(message);callback(message.type==='GET_PREVIEW_TASK'?{ok:active,taskId:'t1'}:{ok:true});}}},fetch:async url=>{fetched.push(url);if(failure)throw Error('temporary');return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(data).buffer};}};
 vm.runInNewContext(source,context);
 for(let n=0;n<12;n++)await Promise.resolve();
 return {messages,fetched,tick};
}
let r=await run();assert.equal(r.messages[1].type,'PREVIEW_PDF_READY');assert.equal(atob(r.messages[1].base64),'%PDF-1.7 test');assert.ok(!r.fetched[0].includes('#'));await r.tick();assert.equal(r.messages.length,2);
r=await run({active:false});assert.equal(r.fetched.length,0);
r=await run({src:'https://unrelated.example/file.pdf'});assert.equal(r.fetched.length,0);
r=await run({data:'<html>not ready</html>'});assert.equal(r.messages.length,1);
r=await run({failure:true});assert.equal(r.messages.length,1);await r.tick();assert.equal(r.fetched.length,2);
console.log('PASS: PDF bridge waits for active task, preserves bytes, rejects unrelated/non-PDF resources, retries temporary failure and leaves native previews untouched');
})().catch(e=>{console.error(e);process.exitCode=1;});
