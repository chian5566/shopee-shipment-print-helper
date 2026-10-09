const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDFLib = require('../node_modules/pdf-lib');
const layout = require('../print-layout.js');
(async () => {
  const out = await PDFLib.PDFDocument.create();
  let cases = 0;
  for (const [w, h] of [[595.28,841.89],[283.46,425.20],[841.89,595.28]]) {
    for (const rotation of [0,90,180,270]) {
      const source = await PDFLib.PDFDocument.create();
      const p = source.addPage([w,h]); p.setRotation(PDFLib.degrees(rotation));
      p.drawRectangle({x:2,y:2,width:w-4,height:h-4,borderWidth:2,borderColor:PDFLib.rgb(0,0,0)});
      for (let i=0;i<5;i++) p.drawText(['SKU: TS13','Product: Knit top','Variant: Navy / L','Quantity: 3','Buyer note: test'][i], {x:20,y:h-35-i*22,size:12});
      p.drawText('RIGHT EDGE / QTY', {x:w-145,y:30,size:10});
      const page = await layout.appendPackingPage(out,(await PDFLib.PDFDocument.load(await source.save())).getPage(0),PDFLib);
      assert.deepEqual(page.getSize(),{width:layout.PAPER[0],height:layout.PAPER[1]});
      const fit = layout.placement(w,h,rotation);
      // Actual 125% print bounding box stays within the paper, with 2.5% minimum margin.
      assert.ok(fit.visibleWidth*1.25 <= layout.PAPER[0]*0.950001);
      assert.ok(fit.visibleHeight*1.25 <= layout.PAPER[1]*0.950001);
      cases++;
    }
  }
  const bytes=await out.save(); const reopened=await PDFLib.PDFDocument.load(bytes);
  assert.equal(reopened.getPageCount(),12);
  // Reproduce enlargement in the print dialog for visual inspection.
  const preview=await PDFLib.PDFDocument.create();
  const embedded=await preview.embedPage(reopened.getPage(0));
  const page=preview.addPage(layout.PAPER);
  page.drawPage(embedded,{x:-layout.PAPER[0]*0.125,y:-layout.PAPER[1]*0.125,width:layout.PAPER[0]*1.25,height:layout.PAPER[1]*1.25});
  const dir=path.resolve(__dirname,'../tmp/pdfs'); fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'packing-layout-regression.pdf'),bytes);
  fs.writeFileSync(path.join(dir,'packing-125-preview.pdf'),await preview.save());
  console.log(`PASS: ${cases} paper-size/rotation cases, PDF reopen, 125% bounds`);
})().catch(e=>{console.error(e);process.exitCode=1;});
