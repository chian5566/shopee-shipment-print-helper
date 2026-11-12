const {test}=require('node:test');
const assert=require('node:assert/strict');
const slip=require('../packing-slip.js');
const A='250101TEST0001',B='250101TEST0002';
const item=(str,x,y)=>({str,transform:[10,0,0,10,x,y],height:10,width:10});
const xs=[20,55,180,300,400,540,580];
function source() {
 return [item(`訂單編號：${A}`,340,800),
 ...['#','主商品貨號','商品名稱','商品選項貨號','商品規格','數量','總計'].map((s,i)=>item(s,xs[i],770)),
 ...['1','SKU_A','Product A','VAR_A','Blue / M','2','100'].map((s,i)=>item(s,xs[i],757)),
 ...['2','SKU_B','Product B','VAR_B','Red / L','1','200'].map((s,i)=>item(s,xs[i],710)),
 item('買家備註：請完整保留',20,660)];
}
test('all product text columns preserve complete header, note and order-like strings',()=>{
 const words=['數','量','商品名稱','貨號','#','規格','數量','總計','買家備註：測試','賣家備註：測試',`訂單編號：${B}`,'商品列表'];
 for(const x of xs.slice(1,5))for(const value of words) {
  const items=source();items.find(i=>i.transform[4]===x && i.transform[5]===757).str=value;
  const [parsed]=slip.extractPackingSections(items);
  assert.equal(parsed.orderId,A);assert.equal(parsed.rows.length,2);
  assert.deepEqual(parsed.rows.map(r=>r.qty),[2,1]);assert.equal(parsed.buyerNote,'請完整保留');
  assert.ok(Object.values(parsed.rows[0]).includes([180,400].includes(x)?value.normalize('NFKC'):value),`${x}: ${value}`);
 }
});
test('wrapped product metadata never creates a new order or terminates a table',()=>{
 const items=source();items.push(item(`訂單編號：${B}`,180,740),item('買家備註：不是備註',180,728),item('商品列表',400,728));
 const sections=slip.extractPackingSections(items);
 assert.equal(sections.length,1);assert.equal(sections[0].orderId,A);
 assert.equal(sections[0].rows.length,2);assert.ok(sections[0].rows[0].name.includes(B));
 assert.ok(sections[0].rows[0].name.includes('不是備註'));assert.equal(sections[0].buyerNote,'請完整保留');
});
test('simultaneous header words across product fields and notes are not new tables',()=>{
 const items=source();
 for(const [x,value] of [[55,'數量'],[180,'商品名稱'],[300,'商品選項貨號'],[400,'規格']])items.find(i=>i.transform[4]===x && i.transform[5]===757).str=value;
 items.push(item('商品名稱',20,640),item('數量',400,640));
 const [p]=slip.extractPackingSections(items);
 assert.equal(p.rows.length,2);assert.equal(p.rows[0].sku,'數量');assert.equal(p.rows[0].name,'商品名稱');
 assert.equal(p.buyerNote,'請完整保留\n商品名稱數量');
});
test('a long footer reaching quantity-column coordinates still ends the product table',()=>{
 const items=source();items.push(item('備註延伸內容',540,660),item('3',20,640),item('這仍是買家備註',400,640));
 const [p]=slip.extractPackingSections(items);
 assert.equal(p.rows.length,2);assert.ok(p.buyerNote.includes('備註延伸內容'));assert.ok(p.buyerNote.includes('3這仍是買家備註'));
});
test('buyer notes preserve header keywords, order-like text and note keywords',()=>{
 const lines=[`訂單編號：${B}`,'內容含賣家備註與買家備註','商品列表','數量與規格'];
 const items=source();lines.forEach((s,i)=>items.push(item(s,20,640-i*16)));
 const [p]=slip.extractPackingSections(items);
 assert.equal(p.orderId,A);assert.equal(p.buyerNote,['請完整保留',...lines].join('\n'));
});
test('order-like buyer note text stays in the previous section of a multi-order page',()=>{
 const first=source();first.push(item(`訂單編號：${B}`,20,620));
 const second=source().map(i=>({...i,str:i.str.replace(A,B),transform:[...i.transform.slice(0,5),i.transform[5]-350]}));
 const parsed=slip.extractPackingSections([...first,...second]);
 assert.deepEqual(parsed.map(p=>p.orderId),[A,B]);
 assert.ok(parsed[0].buyerNote.includes(B));assert.equal(parsed[1].buyerNote,'請完整保留');
});
test('same-baseline headers cannot borrow a full label from the first product',()=>{
 const items=source().filter(i=>!(i.transform[4]===400 && i.transform[5]===770));
 items.find(i=>i.transform[4]===180 && i.transform[5]===757).str='規格';
 assert.equal(slip.extractRows(items).length,2);
 assert.equal(slip.extractRows(items)[0].spec,'');
});
test('ambiguous metadata, overlapping columns and missing section boundaries fail closed',()=>{
 assert.throws(()=>slip.extractPackingSections([...source(),item(`訂單編號：${B}`,20,790)]),/不唯一/);
 const overlap=source();overlap.find(i=>i.str==='商品規格').transform[4]=180;
 assert.throws(()=>slip.extractRows(overlap),/重疊|重複/);
 const first=source().filter(i=>i.transform[5]>660),next=source().map(i=>({...i,transform:[...i.transform.slice(0,5),i.transform[5]-250]}));
 assert.throws(()=>slip.extractPackingSections([...first,...next]),/邊界不明/);
});
test('a single label still requires positive order identity',()=>{
 assert.throws(()=>slip.matchPackingToLabels([{orderId:A,rows:[]}],['']),/無法唯一/);
});
test('no-index product marker stays a product; ambiguous wrapped markers and invalid geometry stop',()=>{
 const items=source().filter(i=>i.transform[4]!==20 || i.transform[5]===660);
 items.find(i=>i.transform[4]===55 && i.transform[5]===757).str='買家備註：商品貨號';
 assert.equal(slip.extractRows(items)[0].sku,'買家備註：商品貨號');
 assert.throws(()=>slip.extractRows([...items,item('買家備註：無法確定',55,730)]),/邊界不明/);
 assert.throws(()=>slip.extractRows([...source(),item('bad',NaN,700)]),/座標無效/);
});
async function label(items,known=[A],orders=[]) {
 let destroyed=false;
 const doc={numPages:1,async getPage(){return {async getTextContent(){return {items};}};},loadingTask:{async destroy(){destroyed=true;}}};
 try{return await slip.readLabelOrderIds(new ArrayBuffer(1),{getDocument(){return {promise:Promise.resolve(doc)};}},known,orders);}
 finally{assert.equal(destroyed,true);}
}
test('label pairing rejects conflicting, out-of-scope and prefix-only order evidence',async()=>{
 assert.deepEqual(await label([item(`蝦皮訂單編號：${A}`,20,300)]),[A]);
 await assert.rejects(label([item(`訂單編號：${B}`,20,300)]),/範圍外/);
 assert.deepEqual(await label([item(A+'EXTRA',20,300)]),['']);
 await assert.rejects(label([item(`訂單編號：${A}`,20,300),item('TW000000000000',20,250)],[A,B],[{orderId:B,summary:'TW000000000000'}]),/不一致/);
 await assert.rejects(label([item(`訂單編號：${A}`,20,300),item(`訂單編號：${B}`,20,250)],[A,B]),/多個|不一致/);
});
