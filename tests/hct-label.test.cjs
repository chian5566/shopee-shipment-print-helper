const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),PDFLib=require('pdf-lib'),layout=require('../print-layout.js');
for(const summary of ['buyer 新竹物流','buyer 新竹貨運','buyer HCT'])assert.ok(layout.isHctOrder({summary}));
for(const summary of ['buyer 7-ELEVEN','buyer 蝦皮店到店','buyer 黑貓宅急便','buyer ABC_HCT_SKU'])assert.ok(!layout.isHctOrder({summary}));
assert.ok(!layout.isHctOrder(null));
(async()=>{
 const out=await PDFLib.PDFDocument.create(),source=await PDFLib.PDFDocument.create();
 source.registerFontkit(require('@pdf-lib/fontkit'));
 const font=await source.embedFont(fs.readFileSync(path.resolve(__dirname,'../vendor/NotoSansTC.ttf')),{subset:false});
 for(const [w,h,crop] of [[...layout.PAPER,null],[105*72/25.4,150*72/25.4,null],[595.28,841.89,[40,50,280,420]]])for(const rotation of [0,90,180,270]){
   const page=source.addPage([w,h]);page.setRotation(PDFLib.degrees(rotation));if(crop)page.setCropBox(...crop);
   const [x,y,width,height]=crop || [0,0,w,h];
   page.drawRectangle({x:x+2,y:y+2,width:width-4,height:height-4,borderWidth:1,borderColor:PDFLib.rgb(0,0,0)});
   page.drawText('HCT ORIGINAL',{x:x+4,y:y+height-14,size:8,font});page.drawText('LEFT',{x:x+4,y:y+5,size:8,font});page.drawText('RIGHT',{x:x+width-30,y:y+5,size:8,font});
   for(let i=0;i<30;i++)page.drawRectangle({x:x+4+i*3,y:y+height/2,width:i%2?1:2,height:30,color:PDFLib.rgb(0,0,0)});

 }
 const loaded=await PDFLib.PDFDocument.load(await source.save());
 for(const page of loaded.getPages()){const result=await layout.appendHctLabel(out,page,PDFLib);assert.deepEqual(result.getSize(),{width:layout.PAPER[0],height:layout.PAPER[1]});}
 const bytes=await out.save(),reopened=await PDFLib.PDFDocument.load(bytes);assert.equal(reopened.getPageCount(),12);
 const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href);pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
 const doc=await pdfjs.getDocument({data:bytes,isEvalSupported:false}).promise;
 for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),items=(await page.getTextContent()).items.filter(item=>item.str.trim());assert.deepEqual(items.map(item=>item.str),['HCT ORIGINAL','LEFT','RIGHT']);
   for(const item of items){const [a,b,,,x,y]=item.transform,len=Math.hypot(a,b),u=[a/len,b/len],v=[-u[1],u[0]];
     for(const [along,up] of [[0,0],[item.width,0],[0,item.height],[item.width,item.height]]){
       const px=(x+u[0]*along+v[0]*up)*1.25,py=(y+u[1]*along+v[1]*up)*1.25-layout.PAPER[1]*.25;
       assert.ok(px>=-.01&&px<=layout.PAPER[0]+.01,`page ${n} x=${px}`);assert.ok(py>=-.01&&py<=layout.PAPER[1]+.01,`page ${n} y=${py}`);
     }
   }
   const ops=await page.getOperatorList();assert.ok(ops.fnArray.includes(pdfjs.OPS.constructPath));assert.ok(!ops.fnArray.includes(pdfjs.OPS.paintImageXObject));
 }
 await doc.loadingTask.destroy();
 const dir=path.resolve(__dirname,'../tmp/pdfs');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'hct-80-compensation.pdf'),bytes);
 const preview=await PDFLib.PDFDocument.create();const embedded=await preview.embedPage(reopened.getPage(0));const p=preview.addPage(layout.PAPER);p.drawPage(embedded,{x:0,y:-layout.PAPER[1]*.25,width:layout.PAPER[0]*1.25,height:layout.PAPER[1]*1.25});fs.writeFileSync(path.join(dir,'hct-125-preview.pdf'),await preview.save());
 console.log('PASS: HCT-only detection, 80% compensation, 12 size/crop/rotation cases, reopened 100×150 mm PDF, all text inside 125% print bounds, vector barcode retained');
})().catch(error=>{console.error(error);process.exitCode=1;});
