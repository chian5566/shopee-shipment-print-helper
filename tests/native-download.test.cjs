const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
let handler,updated,removedHandler;const forwarded=[],removed=[],created=[];let tabSeq=100;
const chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener(fn){handler=fn;}}},tabs:{create:(opts,callback)=>{created.push(opts);callback({id:++tabSeq});},onUpdated:{addListener(fn){updated=fn;}},onRemoved:{addListener(fn){removedHandler=fn;}},sendMessage:(id,msg,callback)=>{forwarded.push({id,msg});callback?.({ok:true});},remove:(id,cb)=>{removed.push(id);cb?.();}}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../service-worker.js'),'utf8'),{chrome,Date,Set,Map,URL});
const source='https://seller.shopee.tw/portal/sale/mass/ship',preview=id=>'https://seller.shopee.tw/awbprint?job_id='+id;
const send=(msg,id,url=source)=>{let reply;handler(msg,{tab:{id,url,windowId:1}},r=>reply=r);return reply;};
const start=(id,taskId,jobIds)=>{assert.equal(send({type:'START_DOCUMENT_TASK',taskId},id).ok,true);send({type:'REGISTER_DOCUMENT_JOBS',taskId,jobIds},id);};
start(7,'task1',['a']);
assert.equal(send({type:'GET_PREVIEW_TASK'},11,preview('a')).taskId,'task1');
assert.equal(send({type:'GET_PREVIEW_TASK'},99,preview('unknown')).ok,false);
assert.equal(send({type:'PREVIEW_PDF_READY',taskId:'old',base64:'JVBERi0='},11,preview('a')).ok,false);
assert.equal(send({type:'PREVIEW_PDF_READY',taskId:'task1',base64:'JVBERi0='},11,preview('a')).ok,true);assert.deepEqual(removed,[11]);assert.equal(forwarded[0].id,7);
assert.equal(send({type:'PREVIEW_PDF_READY',taskId:'task1',base64:'JVBERi0='},11,preview('a')).ok,false);
// Parallel source tabs are isolated; stopping another tab or old task cannot cancel one.
start(8,'task2',['b']);send({type:'STOP_DOCUMENT_TASK',taskId:'old'},7);
assert.equal(send({type:'GET_PREVIEW_TASK'},12,preview('a')).taskId,'task1');assert.equal(send({type:'GET_PREVIEW_TASK'},13,preview('b')).taskId,'task2');
assert.equal(send({type:'OPEN_BACKGROUND_PREVIEW',taskId:'task1',url:preview('a')},7).ok,true);assert.equal(created[0].active,false);assert.equal(created[0].openerTabId,7);
send({type:'OPEN_BACKGROUND_PREVIEW',taskId:'task1',url:preview('a')},7);assert.equal(created.length,1);
assert.equal(send({type:'OPEN_BACKGROUND_PREVIEW',taskId:'task1',url:preview('a')},8).ok,false);
assert.equal(send({type:'OPEN_BACKGROUND_PREVIEW',taskId:'task1',url:'https://example.com/awbprint?job_id=a'},7).ok,false);
// Preview can arrive before job registration, but no tab opens until authorized ID arrives.
assert.equal(send({type:'OPEN_BACKGROUND_PREVIEW',taskId:'task1',url:preview('later')},7).ok,true);assert.equal(created.length,1);
send({type:'REGISTER_DOCUMENT_JOBS',taskId:'task1',jobIds:['later']},7);assert.equal(created.length,2);
send({type:'STOP_DOCUMENT_TASK',taskId:'task1'},7);assert.ok(removed.includes(101)&&removed.includes(102));assert.equal(send({type:'GET_PREVIEW_TASK'},12,preview('a')).ok,false);assert.equal(send({type:'GET_PREVIEW_TASK'},13,preview('b')).taskId,'task2');
removedHandler(8);assert.equal(send({type:'GET_PREVIEW_TASK'},13,preview('b')).ok,false);
assert.equal(send({type:'START_DOCUMENT_TASK',taskId:'evil'},20,'https://example.com').ok,false);
console.log('PASS: independent tabs, task IDs, job validation, deferred/duplicate background opens, cancelled previews closed, stale/unrelated PDFs rejected');
