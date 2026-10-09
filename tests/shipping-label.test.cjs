const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {pathToFileURL}=require('node:url');
const PDFLib=require('../node_modules/pdf-lib'),fontkit=require('../vendor/fontkit.umd.min.js'),slip=require('../packing-slip.js');
(async()=>{
 const source=await PDFLib.PDFDocument.create(),sf=await source.embedFont(PDFLib.StandardFonts.Helvetica);
 const sp=source.addPage(slip.PAPER);sp.drawText('ORIGINAL CARRIER LABEL',{x:8,y:slip.PAPER[1]-14,size:9,font:sf});sp.drawText('ORIGINAL BOTTOM',{x:8,y:6,size:9,font:sf});sp.drawText('TW000000000000',{x:8,y:220,size:9,font:sf});
 const raw=await source.save(),loaded=await PDFLib.PDFDocument.load(raw);
 const out=await PDFLib.PDFDocument.create();out.addPage((await out.copyPages(loaded,[0]))[0]);out.registerFontkit(fontkit);
 const font=await out.embedFont(fs.readFileSync(path.resolve(__dirname,'../vendor/NotoSansTC.ttf')),{subset:false}),numberFont=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);
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
 console.log('PASS: shipping label content/coordinates/size unchanged; order ID on packing page only; tracking matching');
})().catch(e=>{console.error(e);process.exitCode=1;});
