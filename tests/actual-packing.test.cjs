const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const PDFLib=require('../node_modules/pdf-lib');const fontkit=require('../vendor/fontkit.umd.min.js');const slip=require('../packing-slip.js');
const fixture=require('./fixtures/shopee-packing-columns.json');
const expected=[{sku:'TS13',spec:'白色(給人溫暖的顏色) / XL',qty:1},{sku:'TS13',spec:'深藍(低調又帶有光澤感) / XL',qty:1},{sku:'TS13',spec:'酒紅(高質感顏色!最推薦) / XL',qty:1}];
assert.deepEqual(slip.extractRows(fixture),expected);
assert.equal(slip.extractBuyerNote(fixture),'');
const noteItem=(str,x,y)=>({str,transform:[10,0,0,10,x,y],width:40,height:10});
const withNote=[...fixture,noteItem('請分開包裝',90,604),noteItem('白色請放上面',31,589)];
assert.equal(slip.extractBuyerNote(withNote),'請分開包裝\n白色請放上面');
assert.deepEqual(slip.extractRows(withNote),expected);
assert.equal(slip.extractBuyerNote([noteItem('買家',31,604),noteItem('備注',51,604),noteItem(': 請勿折疊',75,604)]),'請勿折疊');
(async()=>{
 const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href);
 pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
 if (process.argv[2]) {
   const data=fs.readFileSync(process.argv[2]);const parsed=await slip.readPacking(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),pdfjs);
   assert.deepEqual(parsed,[{rows:expected,buyerNote:'',orderId:'250101TEST0002'}]);
 }
 const fontBytes=fs.readFileSync(path.resolve(__dirname,'../vendor/NotoSansTC.ttf'));
 async function make(note){const out=await PDFLib.PDFDocument.create();out.registerFontkit(fontkit);const font=await out.embedFont(fontBytes,{subset:false});const numberFont=await out.embedFont(PDFLib.StandardFonts.HelveticaBold);await slip.appendRows(out,expected,{font,numberFont},PDFLib,note,'250101TEST0002');return out;}
 const out=await make('');assert.equal(out.getPageCount(),1);
 const bytes=await out.save();const dir=path.resolve(__dirname,'../output/pdf');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'裝箱單_重新排版.pdf'),bytes);
 // Check top-left 125% printing reverses the PDF's 80% compensation.
 const geom=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
 const gp=await geom.getPage(1);assert.deepEqual(gp.view,[0,0,...slip.PAPER]);
 const gi=(await gp.getTextContent()).items.filter(i=>i.str.trim());
 for (const i of gi) {const x=i.transform[4]*1.25,y=i.transform[5]*1.25-slip.PAPER[1]*.25;assert.ok(x>=0 && x+i.width*1.25<slip.PAPER[0]);assert.ok(y>=0 && y+i.height*1.25<slip.PAPER[1]);}
 assert.ok(gi.some(i=>i.str==='250101TEST0002'));
 const heading=gi.find(i=>i.str==='貨號');assert.ok(Math.abs(heading.transform[4]*1.25-37)<.01);assert.ok(Math.abs(heading.transform[5]*1.25-slip.PAPER[1]*.25-359)<.01);await geom.loadingTask.destroy();
 const note='請分開包裝\n白色請放上面';const noted=await make(note);assert.equal(noted.getPageCount(),1);
 const temp=path.resolve(__dirname,'../tmp/pdfs');fs.mkdirSync(temp,{recursive:true});fs.writeFileSync(path.join(temp,'actual-packing-with-note.pdf'),await noted.save());
 const doc=await pdfjs.getDocument({data:await noted.save(),isEvalSupported:false}).promise;
 const text=(await(await doc.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');for(const value of ['請分開包裝','白色請放上面','買家備註'])assert.ok(text.includes(value));assert.ok(!text.includes('490'));assert.ok(!text.includes('商品名稱'));await doc.loadingTask.destroy();
 const long=await make('這是一段要完整保留的長備註。'.repeat(150));assert.ok(long.getPageCount()>1);
 const ld=await pdfjs.getDocument({data:await long.save(),isEvalSupported:false}).promise;let lt='';for(let n=1;n<=ld.numPages;n++)lt+=(await(await ld.getPage(n)).getTextContent()).items.map(i=>i.str).join('');lt=lt.replace(/\s/g,'').replace(/貨號規格數量/g,'').replace(/訂單編號250101TEST0002/g,'').replace(/買家備註[（(]續[）)]|買家備註/g,'');fs.writeFileSync(path.join(temp,'note-extracted.txt'),lt);assert.ok(lt.endsWith('這是一段要完整保留的長備註。'.repeat(150)));await ld.loadingTask.destroy();
 const preview=await PDFLib.PDFDocument.create();const source=await PDFLib.PDFDocument.load(bytes);const embedded=await preview.embedPage(source.getPage(0));const page=preview.addPage(slip.PAPER);page.drawPage(embedded,{x:0,y:-slip.PAPER[1]*.25,width:slip.PAPER[0]*1.25,height:slip.PAPER[1]*1.25});fs.writeFileSync(path.join(temp,'actual-packing-125.pdf'),await preview.save());
 console.log('PASS: actual Shopee PDF, 3 quantities excluding totals, wrapped specs, empty/multiline/split note, long note pagination, 125% preview');
})().catch(e=>{console.error(e);process.exitCode=1;});
