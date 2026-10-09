const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const opened=[],posted=[];let taskId='';let resolveFetch;
const window={open(...args){opened.push(args);return 'native';},postMessage:m=>posted.push(m),fetch:()=>new Promise(resolve=>resolveFetch=resolve)};
function XMLHttpRequest(){};XMLHttpRequest.prototype.open=function(){};XMLHttpRequest.prototype.send=function(){};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../network-hook.js'),'utf8'),{window,document:{documentElement:{getAttribute:()=>taskId}},location:{href:'https://seller.shopee.tw/portal/sale/mass/ship'},URL,XMLHttpRequest});
(async()=>{
assert.equal(window.open('/awbprint?job_id=a','_blank'),'native');taskId='task-1';
assert.equal(window.open('/awbprint?job_id=a','_blank','noopener'),null);assert.equal(posted[0].taskId,taskId);assert.equal(opened.length,1);
const pending=window.fetch('/api/logistics/create_sd_jobs');taskId='task-2';
resolveFetch({clone:()=>({json:async()=>({job_id:'a'})})});await pending;await Promise.resolve();
assert.equal(posted.find(m=>m.type==='SD_JOB').taskId,'task-1');
const count=posted.length;assert.equal(window.open('/awbprint?job_id=a','_blank'),null);assert.equal(posted.length,count);
for(const url of ['blob:https://seller.shopee.tw/pdf','https://example.com/awbprint?job_id=a','/awbprint','/portal/product'])assert.equal(window.open(url,'_blank'),'native');
taskId='';assert.equal(window.open('/awbprint?job_id=b','_blank'),'native');
console.log('PASS: request task snapshot, cancelled late previews discarded, background preview routed, native final print/other sites preserved');
})();
