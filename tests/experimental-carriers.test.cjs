const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),PDFLib=require('pdf-lib');
const packing=require('../packing-slip.js'),layout=require('../print-layout.js');
const ids=Array.from({length:5},(_,i)=>'250101TEST000'+(i+1));
const pdfjsPromise=import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href).then(pdfjs=>{
 pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;return pdfjs;
});
async function sheet(count,{tracking=false,extra=false,size=[595.28,841.89],rotation=0,contradiction=false,duplicate=false,crossing=false}={}) {
 const doc=await PDFLib.PDFDocument.create(),page=doc.addPage(size);page.setRotation(PDFLib.degrees(rotation));
 for(let i=0;i<count;i++) {
  const col=i%2,row=Math.floor(i/2),x=col*size[0]/2+18,y=(1-row)*size[1]/2+180;
  const id=duplicate?ids[0]:ids[i];
  page.drawText(tracking?'WB: '+String(900000001+i):id,{x,y,size:10});
  if(contradiction)page.drawText('WB: 900000002',{x,y:y-15,size:10});
  if(crossing)page.drawText('CROSSING BOUNDARY TEXT',{x:size[0]/2-10,y:y-30,size:10});
  for(let n=0;n<24;n++)page.drawRectangle({x:x+n*3,y:y-65,width:n%2?1:2,height:25});
 }
 if(extra)page.drawText('UNKNOWN LABEL',{x:320,y:100,size:10});
 return doc.save();
}
const orders=ids.map((orderId,i)=>({orderId,trackingNumber:String(900000001+i)}));
test('Hi-Life PDF: 1–4 occupied A4 quadrants map by ID or tracking; original vectors stay isolated',async()=>{
 const pdfjs=await pdfjsPromise;
 for(const tracking of [false,true])for(let count=1;count<=4;count++) {
  const bytes=await sheet(count,{tracking}),records=await packing.readExperimentalLabels(bytes,pdfjs,ids.slice(0,count).reverse(),orders,{grid:true});
  assert.deepEqual(records.map(r=>r.orderId),ids.slice(0,count));
  const src=await PDFLib.PDFDocument.load(bytes),out=await PDFLib.PDFDocument.create();
  for(const record of records)await layout.appendHctLabel(out,src.getPage(record.pageIndex),PDFLib,record.crop);
  const result=await out.save(),read=await pdfjs.getDocument({data:result,isEvalSupported:false}).promise;
  assert.equal(read.numPages,count);
  try {for(let n=1;n<=read.numPages;n++) {
   const page=await read.getPage(n),text=(await page.getTextContent()).items.map(item=>item.str).join(' ');
   const expected=tracking?orders[n-1].trackingNumber:ids[n-1];assert.ok(text.includes(expected));
   for(let i=0;i<count;i++)if(i!==n-1)assert.ok(!text.includes(tracking?orders[i].trackingNumber:ids[i]),'neighbor label must be clipped');
   const ops=await page.getOperatorList();assert.ok(ops.fnArray.includes(pdfjs.OPS.constructPath));assert.ok(!ops.fnArray.includes(pdfjs.OPS.paintImageXObject));
  }} finally {await read.loadingTask.destroy();}
 }
});
test('experimental PDFs reject unknown cells, duplicate/missing labels, conflicting evidence, clipping and unsupported grids',async()=>{
 const pdfjs=await pdfjsPromise;
 for(const [count,options,wanted] of [[1,{extra:true},ids.slice(0,1)],[2,{duplicate:true},ids.slice(0,2)],[1,{},ids.slice(0,2)],[1,{contradiction:true},ids.slice(0,2)],[1,{crossing:true},ids.slice(0,1)],[1,{size:[600,600]},ids.slice(0,1)],[1,{rotation:90},ids.slice(0,1)]]) {
  await assert.rejects(packing.readExperimentalLabels(await sheet(count,options),pdfjs,wanted,orders,{grid:true}));
 }
 // A longer waybill must not accidentally match a shorter known numeric prefix.
 const doc=await PDFLib.PDFDocument.create();doc.addPage([280,420]).drawText('WB: 9000000019');
 await assert.rejects(packing.readExperimentalLabels(await doc.save(),pdfjs,[ids[0]],orders),/唯一配對/);
});
test('T-Cat/Kerry PDF: reversed page order maps by dedicated tracking, no single-order guess; crop/rotation retained',async()=>{
 const pdfjs=await pdfjsPromise,doc=await PDFLib.PDFDocument.create();
 for(const i of [1,0]){const page=doc.addPage([595.28,841.89]);page.drawText('WB: '+orders[i].trackingNumber,{x:40,y:600,size:12});page.setRotation(PDFLib.degrees(i?90:0));}
 const bytes=await doc.save(),records=await packing.readExperimentalLabels(bytes,pdfjs,ids.slice(0,2),orders);
 assert.deepEqual(records.map(item=>item.orderId),[ids[1],ids[0]]);
 const src=await PDFLib.PDFDocument.load(bytes),out=await PDFLib.PDFDocument.create();
 for(const item of records)await layout.appendHctLabel(out,src.getPage(item.pageIndex),PDFLib,item.crop);
 const reopened=await PDFLib.PDFDocument.load(await out.save());assert.equal(reopened.getPageCount(),2);
 for(const p of reopened.getPages())assert.deepEqual(p.getSize(),{width:layout.PAPER[0],height:layout.PAPER[1]});
 const unknown=await PDFLib.PDFDocument.create();unknown.addPage([280,420]).drawText('NO ORDER OR TRACKING');
 await assert.rejects(packing.readExperimentalLabels(await unknown.save(),pdfjs,[ids[0]],orders),/唯一配對/);
});
