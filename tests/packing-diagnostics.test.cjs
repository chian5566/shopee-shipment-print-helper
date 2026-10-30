const {test}=require('node:test');
const assert=require('node:assert/strict');
const slip=require('../packing-slip.js');
const item=(str,x,y)=>({str,transform:[12,0,0,12,x,y],height:12});
const headers=[item('#',20,750),item('主商品貨號',55,750),item('商品名稱',180,750),item('商品規格',370,750),item('數量',540,750)];
const section=(sequence)=>[item('訂單編號：250101TESTSECRET01',20,800),...headers,...sequence.flatMap((n,i)=>[item(String(n),20,700-i*80),item('PRIVATE_SKU',55,700-i*80),item('PRIVATE_PRODUCT',180,700-i*80),item('PRIVATE_SPEC',370,700-i*80),item('1',540,700-i*80)]),item('買家備註：PRIVATE_BUYER',20,300)];
test('sequence rejection includes section and numeric coordinates without product or order contents',()=>{
 assert.throws(()=>slip.extractPackingSections(section([5,6,7])),e=>{
  const d=e.diagnostics;
  assert.equal(d.expectedSequence,1);assert.equal(d.actualSequence,5);assert.equal(d.row,1);assert.equal(d.section,1);assert.equal(d.sectionsOnPage,1);
  assert.deepEqual(d.sequence.map(i=>i.value),[5,6,7]);assert.equal(d.columns.qty,540);
  assert.doesNotMatch(JSON.stringify(d),/SECRET|PRIVATE/);return true;
 });
});
test('multi-page failure retains completed progress and destroys PDF runtime',async()=>{
 let destroyed=false;
 const doc={numPages:2,async getPage(n){return {async getTextContent(){return {items:section(n===1?[1,2]:[5,6])};}};},loadingTask:{async destroy(){destroyed=true;}}};
 const pdfjs={getDocument(){return {promise:Promise.resolve(doc)};}};
 await assert.rejects(slip.readPacking(new ArrayBuffer(1),pdfjs),e=>{
  assert.equal(e.diagnostics.page,2);assert.equal(e.diagnostics.totalPages,2);assert.equal(e.diagnostics.completedPages,1);assert.equal(e.diagnostics.completedSections,1);assert.equal(e.diagnostics.completedRows,2);return true;
 });
 assert.equal(destroyed,true);
});
test('missing columns and invalid quantities retain diagnostic evidence and still reject',()=>{
 assert.throws(()=>slip.extractRows([item('PRIVATE',20,800)]),e=>e.diagnostics.textItemCount===1);
 const bad=section([1]);bad.push(item('invalid',540,690));
 assert.throws(()=>slip.extractRows(bad),e=>e.diagnostics.row===1 && e.diagnostics.quantityTokenCount===2);
});
