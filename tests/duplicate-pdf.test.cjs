const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const PDFLib=require('pdf-lib');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content.js'),'utf8');
const buffer=bytes=>Uint8Array.from(bytes).buffer;
const orderId='250101TEST0001';
const packing=[{orderId,rows:[{sku:'DEMO',variantSku:'DEMO_M',name:'Demo shirt',spec:'M',qty:1}]}];
async function pdf(text){const doc=await PDFLib.PDFDocument.create();doc.addPage().drawText(text);return buffer(await doc.save());}
function setup({expectedFiles=1,sevenEleven=true,familyMart=false,readPacking=async()=>packing,orders=packing.map(p=>({orderId:p.orderId}))}={}){
 const task={id:'test',orders,expectedFiles,sevenEleven,familyMart,previewFiles:[],sevenLabels:orders.map(o=>({orderId:o.orderId}))};
 const blobs=new Map(),timers=[],appended=[];let handler;
 const c={Uint8Array,Blob,Promise,URL:{createObjectURL(blob){const id='blob:'+blobs.size;blobs.set(id,blob);return id;},revokeObjectURL(){}},
  window:{PDFLib:{...PDFLib,PDFDocument:{load:PDFLib.PDFDocument.load,async create(){const out=await PDFLib.PDFDocument.create(),copy=out.copyPages.bind(out);out.copyPages=(doc,indices)=>copy(doc,Array.from(indices));return out;}}},fontkit:require('../vendor/fontkit.umd.min.js'),setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){}},
  chrome:{runtime:{onMessage:{addListener(fn){handler=fn;}},sendMessage(){}}},document:{documentElement:{removeAttribute(){}}},
  activeTask:task,panel:null,tasks:[task],renderTasks(){},errorInfo:e=>({message:e.message}),markTaskReady(){task.ready=true;},failTask(t,message){t.failed=true;t.failure=message;},
  atob:v=>Buffer.from(v,'base64').toString('binary'),loadChineseFontBytes:async()=>fs.readFileSync(require('node:path').join(__dirname,'../vendor/NotoSansTC.ttf')),
  pdfjsLib:{getDocument(){}},pdfjsWorker:{WorkerMessageHandler:{}},
  LHPackingSlip:{readPacking,matchPackingToLabels:require('../packing-slip.js').matchPackingToLabels,async appendRows(out,rows,_fonts,_lib,_note,id){appended.push({id,qty:rows.reduce((n,r)=>n+r.qty,0)});out.addPage();},async readLabelOrderIds(){return orders.map(o=>o.orderId);}},
  LHSevenEleven:{validateLabels:require('../seven-eleven.js').validateLabels,async appendLabel(out){out.addPage();}},
  LHFamilyMart:{validateLabels:require('../seven-eleven.js').validateLabels,async appendLabel(out){out.addPage();}},LHPrintLayout:{isHctOrder:()=>false}};
 // Label validation is exercised elsewhere with real image payloads; retain exact order IDs here.
 c.LHSevenEleven.validateLabels=c.LHFamilyMart.validateLabels=(labels,ids)=>assert.deepEqual(labels.map(l=>l.orderId),ids);
 vm.createContext(c);
 const listenerStart=source.indexOf('  chrome.runtime.onMessage.addListener(');
 vm.runInContext(source.slice(source.indexOf('  function samePdfBytes('),source.indexOf('  function refreshPageLayout('))+source.slice(listenerStart,source.indexOf("  document.addEventListener('click',handleNativeDownload",listenerStart))+'\nglobalThis.merge=mergeNativeDocuments;',c);
 return {task,c,blobs,timers,appended,receive(bytes,url){let reply;handler({type:'PREVIEW_PDF',taskId:task.id,url,base64:Buffer.from(bytes).toString('base64')},{},r=>reply=r);return reply;}};
}

test('same PDF from different URLs counts once, while different bytes at the same URL remain distinct',async()=>{
 const a=await pdf('packing'),b=await pdf('label'),s=setup({expectedFiles:2});
 assert.equal(s.receive(a,'a').ok,true);assert.equal(s.receive(a.slice(0),'b').ok,true);
 assert.equal(s.task.previewFiles.length,1);assert.equal(s.timers.length,0,'A duplicate must not satisfy the document count');
 assert.equal(s.receive(b,'a').ok,true);assert.equal(s.task.previewFiles.length,2);assert.equal(s.timers.length,1);
});

for(const carrier of ['seven','family'])test(`${carrier}: duplicate packing PDF merges once, including duplicates already queued`,async()=>{
 const bytes=await pdf('packing'),s=setup({sevenEleven:carrier==='seven',familyMart:carrier==='family'});
 s.receive(bytes,'a');s.receive(bytes.slice(0),'b');
 // Defense at merge time also handles an already queued duplicate.
 s.task.previewFiles.push({url:'queued',bytes:bytes.slice(0)});
 await s.c.merge(s.task);assert.equal(s.task.failure,undefined);assert.equal(s.task.ready,true);
 assert.equal(s.task.documentInfo.length,1);assert.equal(s.task.additionalUrls.length,0);
 assert.deepEqual(s.appended,[{id:orderId,qty:1}]);
 const output=await PDFLib.PDFDocument.load(await s.blobs.get(s.task.combinedUrl).arrayBuffer());assert.equal(output.getPageCount(),2);
});

test('two different valid packing documents remain ambiguous even when parsed orders match',async()=>{
 const s=setup();s.receive(await pdf('first'),'a');s.receive(await pdf('second'),'b');await s.c.merge(s.task);
 assert.match(s.task.failure,/無法唯一辨識裝箱單/);assert.equal(s.task.ready,undefined);
});

test('duplicate removal preserves selected-order mismatch protection',async()=>{
 const s=setup({orders:[{orderId:'250101TEST0002'}]});const bytes=await pdf('packing');s.receive(bytes,'a');s.receive(bytes,'b');await s.c.merge(s.task);
 assert.match(s.task.failure,/裝箱單與本次已選訂單不符/);assert.equal(s.task.ready,undefined);
});

test('ordinary PDF labels and packing still merge after a duplicate arrives',async()=>{
 const a=await pdf('packing'),b=await pdf('label');const s=setup({expectedFiles:2,sevenEleven:false,readPacking:async bytes=>{if(Buffer.from(bytes).equals(Buffer.from(a)))return packing;throw Error('Not packing');}});
 s.receive(a,'a');s.receive(a,'b');s.receive(b,'c');await s.c.merge(s.task);
 assert.equal(s.task.failure,undefined);assert.equal(s.task.ready,true);assert.equal(s.task.documentInfo.length,2);assert.equal(s.task.additionalUrls.length,0);
});

if(process.env.LH_DUPLICATE_PDF)test('supplied original PDF reproduces duplicate candidates and merges with each quantity intact',async()=>{
 const {pathToFileURL}=require('node:url'),path=require('node:path');
 const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')));
 pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
 const slip=require('../packing-slip.js'),bytes=buffer(fs.readFileSync(process.env.LH_DUPLICATE_PDF));
 const parsed=await slip.readPacking(bytes,pdfjs);assert.equal(parsed.length,2);assert.deepEqual(parsed.map(p=>p.rows.map(r=>r.qty)),[[1],[1]]);
 const s=setup({orders:parsed.map(p=>({orderId:p.orderId})),readPacking:bytes=>slip.readPacking(bytes,pdfjs)});
 s.receive(bytes,'a');s.receive(bytes.slice(0),'b');await s.c.merge(s.task);
 assert.equal(s.task.failure,undefined);assert.equal(s.task.ready,true);assert.equal(s.appended.length,2);assert.deepEqual(s.appended.map(p=>p.qty),[1,1]);
});
