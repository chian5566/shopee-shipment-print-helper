const {test}=require('node:test');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
function setup(){
 const dialogs=[],copied=[],messages=[];let blocked=false;
 const task={name:'寄件單＋裝箱單',startedAt:Date.now(),orders:[{summary:'private buyer',orderId:'250101TEST0001'}],expectedFiles:2,stage:'辨識裝箱單',previewFiles:[{url:'https://example.test/?secret=token',bytes:new ArrayBuffer(12)}],documentInfo:[{file:1,pages:9}],packingChecks:[{file:1,status:'rejected',error:{message:'第 2 列不完整'}}]};
 const slot={innerHTML:'',querySelectorAll(selector){const cls=selector.slice(1);return [...this.innerHTML.matchAll(new RegExp('class="'+cls+'" data-task="(\\d+)"','g'))].map(m=>({dataset:{task:m[1]}}));}};
 const document={documentElement:{append(d){dialogs.push(d);},removeAttribute(){}},createElement(){
  const nodes=Object.fromEntries(['.lh-error-text','.lh-error-copy-status','.lh-error-copy','.lh-error-close','.lh-error-done'].map(k=>[k,{value:'',textContent:'',focus(){this.focused=true;},select(){this.selected=true;}}]));
  return {nodes,setAttribute(){},querySelector:k=>nodes[k],showModal(){this.open=true;},close(){this.open=false;this.closeEvent?.();},remove(){this.removed=true;},get closeEvent(){return this['closeListener'];},set closeEvent(fn){this['closeListener']=fn;},
   addEventListener(type,fn){if(type==='close')this.closeEvent=fn;}};
 }};
 const context={VERSION:'0.9.2',REPORT_URL:'https://forms.gle/TaJMxYJGf8wVDF7T8',errorDialog:null,tasks:[task],activeTask:task,Date,document,navigator:{userAgent:'Test browser',clipboard:{async writeText(value){if(blocked)throw new Error('denied');copied.push(value);}}},location:{origin:'https://seller.shopee.tw',pathname:'/portal/sale/mass/ship',search:'?secret=token'},panel:{isConnected:true,querySelector:s=>s==='.lh-tasks'?slot:{}},window:{clearTimeout(){},setTimeout(){}},chrome:{runtime:{sendMessage:m=>messages.push(m)}},escapeHtml:s=>String(s).replace(/</g,'&lt;')};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function errorInfo('),source.indexOf('  function releaseTaskFiles('))+source.slice(source.indexOf('  function markTaskReady('),source.indexOf('  async function mergeNativeDocuments'))+'\nglobalThis.api={failTask,diagnosticText,showErrorDetails,closeErrorDialog,renderTasks};',context);
 return {context,task,slot,dialogs,copied,messages,block(){blocked=true;}};
}

test('failed tasks retain detailed errors and show the report link without exposing buyer/file data',()=>{
 const s=setup(),error=new Error('bad <script>');s.context.api.failTask(s.task,'合併失敗：bad <script>',error);
 assert.match(s.slot.innerHTML,/forms.gle\/TaJMxYJGf8wVDF7T8/);assert.match(s.slot.innerHTML,/查看錯誤詳情/);assert.match(s.slot.innerHTML,/&lt;script>/);
 assert.equal(s.task.error.stack,error.stack);assert.equal(s.task.failed,true);assert.equal(s.messages[0].type,'STOP_DOCUMENT_TASK');
 const text=s.context.api.diagnosticText(s.task);assert.match(text,/Test browser|辨識裝箱單|第 2 列不完整/);assert.doesNotMatch(text,/private buyer|secret=token|250101TEST0001/);
 s.task.cancelled=true;s.context.api.renderTasks();assert.doesNotMatch(s.slot.innerHTML,/查看錯誤詳情|回報到 Google/);
});

test('dialog copies exact text, falls back to selection, closes and returns focus',async()=>{
 const s=setup();s.context.api.failTask(s.task,'失敗',new Error('test'));const trigger={isConnected:true,focus(){this.focused=true;}};
 s.context.api.showErrorDetails(s.task,trigger);const d=s.dialogs[0];assert.equal(d.open,true);
 assert.equal(d.nodes['.lh-error-text'].value,s.context.api.diagnosticText(s.task));
 await d.nodes['.lh-error-copy'].onclick();assert.equal(s.copied[0],d.nodes['.lh-error-text'].value);assert.match(d.nodes['.lh-error-copy-status'].textContent,/已複製/);
 s.block();await d.nodes['.lh-error-copy'].onclick();assert.equal(d.nodes['.lh-error-text'].selected,true);assert.match(d.nodes['.lh-error-copy-status'].textContent,/Ctrl\+C/);
 d.nodes['.lh-error-done'].onclick();assert.equal(d.removed,true);assert.equal(trigger.focused,true);
 s.context.api.showErrorDetails(s.task);s.context.api.closeErrorDialog();assert.equal(s.dialogs[1].removed,true);
});
