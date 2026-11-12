const {test}=require('node:test');
const assert=require('node:assert/strict');
const slip=require('../packing-slip.js');
const item=(str,x,y)=>({str,transform:[10.466205,0,0,10.466205,x,y],height:10.466205});
// Coordinates from the failing source, with order and product contents replaced.
const columns=[29.012322,59.663351,161.335057,283.191587,384.115707,485.039827,525.409475];
const headerY=788.688955,firstY=775.979992,secondY=752.804823;
function source(fragment='數') {
 return [item('訂單編號：250101TEST0001',346.140674,819.339984),
  ...['#','主商品貨號','商品名稱','商品選項貨號','商品規格名稱','數量','總計'].map((str,i)=>item(str,columns[i],headerY)),
  ...['1','DEMO_A','測試商品','DEMO_A','','1','0'].map((str,i)=>item(str,columns[i],firstY)),
  item(fragment,268.904954,firstY),item('續行文字',columns[2],765.513787),
  ...['2','DEMO_B','第二件商品','DEMO_B_V','藍色 / M','1','225'].map((str,i)=>item(str,columns[i],secondY)),
  item('買家備註：',31.091546,710.940003)];
}
test('nearby product fragments matching header substrings do not hide the first row',()=>{
 for(const fragment of ['數','量','商品','貨號','#','商品名稱']) {
  const sections=slip.extractPackingSections(source(fragment));
  assert.equal(sections.length,1);assert.equal(sections[0].orderId,'250101TEST0001');
  assert.equal(sections[0].rows.length,2);
  assert.deepEqual(sections[0].rows.map(r=>[r.sku,r.variantSku,r.qty]),[['DEMO_A','DEMO_A',1],['DEMO_B','DEMO_B_V',1]]);
  assert.ok(sections[0].rows[0].name.includes(fragment));
  assert.ok(sections[0].rows[0].name.includes('續行文字'));
  assert.equal(sections[0].rows[0].spec,'');
 }
});
test('header-fragment repair keeps missing and duplicate sequence rejection',()=>{
 for(const value of ['1','3']) {
  const items=source();items.find(i=>i.str==='2' && i.transform[4]===columns[0]).str=value;
  assert.throws(()=>slip.extractRows(items),/序號不連續/);
 }
 const missing=source().filter(i=>i.transform[5]!==firstY && i.transform[5]!==765.513787);
 assert.throws(()=>slip.extractRows(missing),/序號不連續/);
});
test('header-fragment repair keeps invalid quantity rejection',()=>{
 const items=source();items.find(i=>i.str==='1' && i.transform[4]===columns[5] && i.transform[5]===firstY).str='bad';
 assert.throws(()=>slip.extractRows(items),/數量不完整或無效/);
});
