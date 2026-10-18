// Real DOM -> seven-reader -> html2canvas -> PNG -> PDF -> raster bounds.
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const jsQR=require('jsqr');
const qr='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'fixtures/seven-demo-qr.png')).toString('base64');
const {chromium}=require('playwright');
const {PDFDocument}=require('pdf-lib');
const seven=require('../seven-eleven.js');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let cases=0;
 try{
  const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
  const {createCanvas}=require('@napi-rs/canvas');
  for(const deviceScaleFactor of [1,1.25,1.5,2]){
   const context=await browser.newContext({viewport:{width:1600,height:1400},deviceScaleFactor});
   const page=await context.newPage();
   await page.route('https://epayment.7-11.com.tw/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
   for(const [width,height,zoom] of [[306.25,454.125,1],[306.015625,454.25,1],[306.25,454.125,.8],[306.25,454.125,1.1],[306.25,454.125,1.25],[306.25,454.125,1.5],[500.25,720.125,1],[250.25,900.25,1],[1000.25,700.125,1]]){
    await page.goto('https://epayment.7-11.com.tw/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx');
    // Colored edge markers expose cropping. Two real image nodes exercise the
    // reader's image-ready gate. All content is synthetic; no account/network.
    await page.evaluate(({width,height,zoom,qr})=>{
     document.body.style.cssText=`margin:0;zoom:${zoom}`;
     document.body.innerHTML=`<div id="label" style="position:relative;box-sizing:border-box;width:${width}px;height:${height}px;background:white;border:8px solid rgb(255,0,0)"><div class="div_frame"><span id="lblOrderNo">250101TEST0001</span><img style="position:absolute;left:16px;top:60px;width:120px;height:120px" src="${qr}"><img style="position:absolute;right:16px;top:190px;width:120px;height:120px" src="${qr}"></div><div style="position:absolute;left:4px;bottom:4px;width:12px;height:12px;background:blue"></div></div>`;
     window.messages=[];
     window.chrome={runtime:{sendMessage(message,callback){
      if(message.type==='GET_SEVEN_TASK')callback({ok:true,taskId:'fixture',orderIds:['250101TEST0001']});
      else {window.messages.push(message);callback({ok:true});}
     }}};
    },{width,height,zoom,qr});
    await page.addScriptTag({path:path.resolve(__dirname,'../vendor/html2canvas.min.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../seven-eleven.js')});
    await page.addScriptTag({path:path.resolve(__dirname,'../seven-reader.js')});
    await page.waitForFunction(()=>window.messages.some(m=>m.type==='SEVEN_LABELS_READY'),{},{timeout:15000});
    const labels=await page.evaluate(()=>window.messages.find(m=>m.type==='SEVEN_LABELS_READY').labels);
    assert.equal(labels.length,1);seven.validateLabels(labels,['250101TEST0001']);
    const out=await PDFDocument.create();await seven.appendLabel(out,labels[0]);
    const document=await pdfjs.getDocument({data:await out.save(),isEvalSupported:false}).promise;
    try{
     const pdfPage=await document.getPage(1);const viewport=pdfPage.getViewport({scale:3});
     const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
     await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
     const {data}=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
     const fit=Math.min(1,(100*72/25.4)/(labels[0].width*.75),(150*72/25.4)/(labels[0].height*.75));
     const factor=.75*fit*.8*viewport.scale;
     const left=((100*72/25.4-labels[0].width*.75*fit)/2)*.8*viewport.scale;
     // Decode each QR separately; a single-code decoder can mix finder patterns
     // from two otherwise valid neighboring codes when scanning the whole page.
     const qrRects=await page.evaluate(()=>{
      const root=document.querySelector('#label').getBoundingClientRect();
      return [...document.querySelectorAll('img')].map(img=>{const r=img.getBoundingClientRect();return {x:r.left-root.left,y:r.top-root.top,width:r.width,height:r.height};});
     });
     for(const r of qrRects){
      const x=Math.max(0,Math.floor(left+(r.x-2)*factor)),y=Math.max(0,Math.floor((r.y-2)*factor));
      const w=Math.ceil((r.width+4)*factor),h=Math.ceil((r.height+4)*factor);
      const pixels=canvas.getContext('2d').getImageData(x,y,w,h);
      const decoded=jsQR(new Uint8ClampedArray(pixels.data),w,h);
      assert.equal(decoded?.data,'LH-DEMO-QR-ONLY',`QR unreadable: ${JSON.stringify({width,height,zoom,deviceScaleFactor})}`);
     }
     let blue=0;for(let i=0;i<data.length;i+=4)if(data[i]<50&&data[i+1]<50&&data[i+2]>200)blue++;
     assert.ok(blue>5,`bottom marker clipped: ${JSON.stringify({width,height,zoom,deviceScaleFactor})}`);
     // The source bottom-left blue square must remain square after PDF placement.
     let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
     for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      const i=(y*canvas.width+x)*4;
      if(data[i]<50&&data[i+1]<50&&data[i+2]>200){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
     }
     assert.ok(Math.abs((maxX-minX)-(maxY-minY))<=2,'marker aspect ratio changed');
    }finally{await document.loadingTask.destroy();}
    cases++;
   }
   await context.close();
  }
  console.log(`PASS: ${cases} real Chromium reader/capture/PDF cases; fractional sizes, CSS zoom, device scales, wide/tall layouts, QR decoding and bottom-marker aspect ratio`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
