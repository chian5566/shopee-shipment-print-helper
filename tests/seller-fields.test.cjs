const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const slip=require('../packing-slip.js'),PDFLib=require('pdf-lib'),fontkit=require('../vendor/fontkit.umd.min.js');
const item=(str,x,y)=>({str,transform:[12,0,0,12,x,y],height:12});
const columns=[['#',20,'1'],['主商品貨號',55,'中文貨號 / A★01'],['商品名稱',180,'商品名稱'],['商品選項貨號',280,'任意 貨號#123'],['商品規格',370,'單一規格'],['數量',540,'2']];
const source=()=>columns.flatMap(([header,x,value])=>[item(header,x,750),item(value,x,700)]).concat(item('買家備註:',20,600));
test('every product column may be blank or absent without losing the row',()=>{
  for(const [header,x] of columns){
    for(const removeHeader of [false,true]){
      const rows=slip.extractRows(source().filter(i=>i.transform[4]!==x || (!removeHeader && i.transform[5]===750)));
      assert.equal(rows.length,1,header);
      assert.equal(rows[0].qty,x===540?null:2,header);
    }
  }
});
test('no seller format inference, all identifiers/specs may be empty',()=>{
  const row=slip.extractRows(source())[0];assert.equal(row.sku,'中文貨號 / A★01');assert.equal(row.variantSku,'任意 貨號#123');
  const empty=slip.extractRows(source().filter(i=>i.transform[5]!==700 || [20,540].includes(i.transform[4])))[0];
  assert.deepEqual(empty,{sku:'',variantSku:'',name:'',spec:'',qty:2});
  for(const value of ['123456','A','中文','A/B#★','sku with spaces']){
    const items=source().map(i=>i.transform[4]===55 && i.transform[5]===700?{...i,str:value}:i);
    assert.equal(slip.extractRows(items)[0].sku,value);
  }
});
test('invalid/duplicate quantities remain rejected, empty quantity stays unknown',()=>{
  for(const value of ['0','-1','1.5','abc','9007199254740992'])assert.throws(()=>slip.extractRows(source().map(i=>i.transform[4]===540 && i.transform[5]===700?{...i,str:value}:i)),/數量/);
  assert.throws(()=>slip.extractRows([...source(),item('2',540,690)]),/數量/);
});
test('real PDF output preserves Chinese/special identifiers and prints unknown fields without inventing totals',async()=>{
  const out=await PDFLib.PDFDocument.create();out.registerFontkit(fontkit);
  const font=await out.embedFont(fs.readFileSync(path.resolve(__dirname,'../vendor/NotoSansTC.ttf')),{subset:false});
  const numberFont=await out.embedFont(PDFLib.StandardFonts.CourierBold);
  const rows=[slip.extractRows(source())[0],{sku:'',variantSku:'',name:'',spec:'',qty:null}];
  await slip.appendRows(out,rows,{font,numberFont},PDFLib);
  const bytes=await out.save();
  const pdfjs=await import(pathToFileURL(path.resolve(__dirname,'../vendor/pdf.min.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve(__dirname,'../vendor/pdf.worker.min.mjs')).href;
  const doc=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
  let text='';for(let n=1;n<=doc.numPages;n++)text+=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join('');
  assert.ok(text.includes('中文貨號'));assert.ok(text.includes('★'));assert.ok(text.includes('任意 貨號#123'));assert.ok(text.includes('總數量 未提供'));assert.ok(text.includes('—'));
  await doc.loadingTask.destroy();
  fs.mkdirSync(path.resolve(__dirname,'../tmp/pdfs'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../tmp/pdfs/seller-fields.pdf'),bytes);
});
