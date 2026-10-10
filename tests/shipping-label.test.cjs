const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {pathToFileURL}=require('node:url');
const PDFLib=require('../node_modules/pdf-lib'),fontkit=require('../vendor/fontkit.umd.min.js'),slip=require('../packing-slip.js');
(async()=>{
 const source=await PDFLib.PDFDocument.create(),sf=await source.embedFont(PDFLib.StandardFonts.Helvetica);
 const sp=source.addPage(slip.PAPER);sp.drawText('ORIGINAL CARRIER LABEL',{x:8,y:slip.PAPER[1]-14,size:9,font:sf});sp.drawText('ORIGINAL BOTTOM',{x:8,y:6,size:9,font:sf});sp.drawText('TW000000000000',{x:8,y:220,size:9,font:sf});
 const raw=await source.save(),loaded=await PDFLib.PDFDocument.load(raw);
 const out=await PDFLib.PDFDocument.create();out.addPage((await out.copyPages(loaded,[0]))[0]);out.registerFontkit(fontkit);
 const font=await out.embedFont(fs.readFileSync(path.resolve(__dirname,'../vendor/NotoSansTC.ttf')),{subset:false}),numberFont=await out.embedFont(PDFLib.StandardFonts.CourierBold);
 await slip.appendRows(out,[{sku:'TS13',spec:'白色 / XL',qty:1}],{font,numberFont},PDFLib,'','250101TEST0002');
 const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href);pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
 async function textItems(bytes,page=1){const d=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;const p=await d.getPage(page),items=(await p.getTextContent()).items.filter(i=>i.str.trim()).map(i=>({str:i.str,transform:i.transform,width:i.width,height:i.height}));await d.loadingTask.destroy();return items;}
 const bytes=await out.save();assert.deepEqual(await textItems(bytes),await textItems(raw));
 assert.deepEqual(out.getPage(0).getSize(),loaded.getPage(0).getSize());
 const packing=await textItems(bytes,2);assert.ok(packing.some(i=>i.str==='250101TEST0002'));assert.ok(packing.some(i=>i.str==='訂單編號'));
 assert.ok(!(await textItems(bytes)).some(i=>i.str.includes('250101TEST0002')));
 const buffer=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
 assert.deepEqual(await slip.readLabelOrderIds(buffer,pdfjs,['250101TEST0002'],[{orderId:'250101TEST0002',summary:'buyer TW000000000000'}]),['250101TEST0002']);
 assert.deepEqual(await slip.readLabelOrderIds(buffer,pdfjs,['250101TEST0002']),['']);
 // Packing uses the actual 100 x 150 mm stock despite different source label sizes.
 for (const [width,height,rotation,crop] of [[283.46,425.20,0,null],[105*72/25.4,150*72/25.4,0,null],[288,432,0,null],[200,300,0,null],[595.28,841.89,90,[40,50,300,500]]]) {
   const label=source.addPage([width,height]);label.setRotation(PDFLib.degrees(rotation));
   if(crop)label.setCropBox(...crop);
   const first=out.getPageCount();out.addPage((await out.copyPages(source,[source.getPageCount()-1]))[0]);
   const rows=Array.from({length:12},()=>({sku:'TS13',variantSku:'TS13_WHT_XL',spec:'白色 / XL',qty:1}));
   await slip.appendRows(out,rows,{font,numberFont},PDFLib,'請分開包裝','',label);
   const doc=await pdfjs.getDocument({data:await out.save(),isEvalSupported:false}).promise;
   const labelView=(await doc.getPage(first+1)).getViewport({scale:1});
   for(let n=first+2;n<=doc.numPages;n++) {
     const page=await doc.getPage(n),view=page.getViewport({scale:1});
     assert.equal(view.width,slip.PAPER[0]);assert.equal(view.height,slip.PAPER[1]);
     // Inspect graphics as well as text: table rules exposed the clipping bug.
     const ops=await page.getOperatorList();let matrix=[1,0,0,1,0,0],stack=[],rules=0;
     for(let k=0;k<ops.fnArray.length;k++) {
       const op=ops.fnArray[k],args=ops.argsArray[k];
       if(op===pdfjs.OPS.save)stack.push([...matrix]);
       else if(op===pdfjs.OPS.restore)matrix=stack.pop();
       else if(op===pdfjs.OPS.transform) {
         const [a,b,c,d,e,f]=matrix,[g,h,i,j,x,y]=args;
         matrix=[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*x+c*y+e,b*x+d*y+f];
       } else if(op===pdfjs.OPS.constructPath && args[2]) {
         const [left,bottom,right,top]=args[2];
         const lx=(matrix[0]*left+matrix[2]*bottom+matrix[4])*1.25;
         const rx=(matrix[0]*right+matrix[2]*top+matrix[4])*1.25;
         assert.ok(Math.abs(lx-slip.PRINT_MARGIN)<.01);
         assert.ok(Math.abs(view.width-rx-slip.PRINT_MARGIN)<.01);
         rules++;
       }
     }
     assert.ok(rules>0);
     const items=(await page.getTextContent()).items.filter(i=>i.str.trim());
     for(const item of items) {
       const x=item.transform[4]*1.25,y=item.transform[5]*1.25-view.height*.25;
       assert.ok(x>=slip.PRINT_MARGIN-.01 && x+item.width*1.25<=view.width-slip.PRINT_MARGIN+.01, item.str);
       assert.ok(y>=slip.PRINT_MARGIN-.01 && y+item.height*1.25<=view.height-slip.PRINT_MARGIN+.01, item.str);
     }
   }
   await doc.loadingTask.destroy();
 }
 console.log('PASS: original labels unchanged; packing stays 100 x 150 mm across five source sizes/crop/rotation and pagination; rules have equal 5 mm margins; 125% bounds; tracking matching');
})().catch(e=>{console.error(e);process.exitCode=1;});
