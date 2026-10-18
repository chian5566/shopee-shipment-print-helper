const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require.resolve('../content.js'),'utf8');
// Run the actual merge lifecycle with controlled PDF I/O.
const merge=source.slice(source.indexOf('  async function mergeNativeDocuments('),source.indexOf('  function refreshPageLayout('))
.replace('const pdfjs = globalThis.pdfjsLib;', 'const pdfjs = fakePdfjs;')
.replace('if (!pdfjs?.getDocument || !globalThis.pdfjsWorker?.WorkerMessageHandler)', 'if (false)');
const id='250101TEST0001';
async function scenario(mode,carrier='seven'){
 const events=[];let release,started;const saving=new Promise(resolve=>started=resolve),held=new Promise((resolve,reject)=>release=mode==='failure'?reject:resolve);
 const doc={getPageCount:()=>1,getPages:()=>[{getSize:()=>({width:100,height:150})}],getPage:()=>({getWidth:()=>100})};
 const out={registerFontkit(){},embedFont:async()=>({}),save(){events.push('saving');started();return held;}};
 const task={id:'task',orders:[{orderId:id}],expectedFiles:1,sevenEleven:carrier==='seven',familyMart:carrier==='family',sevenLabels:[{orderId:id}],previewFiles:[{bytes:new Uint8Array([1])}]};
 const context={task,fakePdfjs:{GlobalWorkerOptions:{}},Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{documentElement:{removeAttribute(){}}},chrome:{runtime:{sendMessage:m=>events.push(m.type),getURL:path=>path}},renderTasks(){},loadChineseFontBytes:async()=>new Uint8Array(),markTaskReady(){events.push('ready');},failTask(task,detail){task.failed=true;task.failure=detail;events.push('failed');started();},window:{PDFLib:{PDFDocument:{load:async()=>doc,create:async()=>out},StandardFonts:{CourierBold:'CourierBold'}},clearTimeout(){}},LHPackingSlip:{readPacking:async()=>[{orderId:id,rows:[]}],matchPackingToLabels:rows=>rows,appendRows:async()=>{}},LHSevenEleven:{validateLabels(){},appendLabel:async()=>{}},errorInfo:e=>({message:e.message})};
 context.LHFamilyMart=context.LHSevenEleven;
 vm.createContext(context);vm.runInContext(merge,context);const running=vm.runInContext('mergeNativeDocuments(task)',context);
 await saving;assert.deepEqual(events,['saving'],task.failure);
 if(mode==='cancel')task.cancelled=true;
 release(mode==='failure'?new Error('write failed'):new Uint8Array([1]));await running;
 if(mode==='success'){assert.deepEqual(events,['saving','ready','COMPLETE_DOCUMENT_TASK']);assert.ok(task.combinedUrl);}
 else{assert.ok(!events.includes('COMPLETE_DOCUMENT_TASK'));assert.ok(!events.includes('ready'));if(mode==='failure')assert.ok(task.failed);}
}
async function mixedCarrier(){
 const ids=['250101TEST0001','250101TEST0002'],events=[];
 const label={getPageCount:()=>2,getPages:()=>[0,1].map(()=>({getSize:()=>({width:100,height:150})})),getPage:index=>({index,getWidth:()=>100})};
 const out={registerFontkit(){},embedFont:async()=>({}),copyPages:async(_doc,indices)=>{events.push('copy:'+indices[0]);return [{}];},addPage(){},save:async()=>new Uint8Array([1])};
 const task={id:'mixed',orders:[{orderId:ids[0],summary:'buyer 新竹物流'},{orderId:ids[1],summary:'buyer 蝦皮店到店'}],expectedFiles:2,previewFiles:[{bytes:new Uint8Array([0])},{bytes:new Uint8Array([1])}]};
 const rows=ids.map(orderId=>({orderId,rows:[]}));
 const context={task,fakePdfjs:{GlobalWorkerOptions:{}},Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{documentElement:{removeAttribute(){}}},chrome:{runtime:{sendMessage(){},getURL:p=>p}},renderTasks(){},loadChineseFontBytes:async()=>new Uint8Array(),markTaskReady(){events.push('ready');},failTask(_task,detail){throw new Error(detail);},window:{PDFLib:{PDFDocument:{load:async()=>label,create:async()=>out},StandardFonts:{CourierBold:'CourierBold'}},clearTimeout(){}},LHPackingSlip:{readPacking:async bytes=>{if(bytes[0]===0)throw new Error('not packing');return rows;},readLabelOrderIds:async()=>[ids[1],ids[0]],matchPackingToLabels:(rows,ids)=>ids.map(id=>rows.find(row=>row.orderId===id)),appendRows:async()=>{}},LHPrintLayout:{isHctOrder:require('../print-layout.js').isHctOrder,appendHctLabel:async(_out,page)=>events.push('hct:'+page.index)},errorInfo:e=>({message:e.message})};
 vm.createContext(context);vm.runInContext(merge,context);await vm.runInContext('mergeNativeDocuments(task)',context);assert.deepEqual(events,['copy:0','hct:1','ready']);
 console.log('PASS: mixed-carrier merge identifies HCT by matched order ID even when source label order is reversed; other labels copied unchanged');
}
(async()=>{for(const carrier of ['seven','family'])for(const mode of ['success','failure','cancel'])await scenario(mode,carrier);await mixedCarrier();console.log('PASS: original stays open while saving; completion sent only after PDF success, never on failure or late cancellation');})().catch(e=>{console.error(e);process.exitCode=1;});
