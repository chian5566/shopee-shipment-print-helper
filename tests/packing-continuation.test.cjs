const {test}=require('node:test');
const assert=require('node:assert/strict');
const slip=require('../packing-slip.js');
const item=(str,x,y)=>({str,transform:[10,0,0,10,x,y],height:10});
function section(id,sequence,top=800,note='') {
 return [item(`訂單編號：${id}`,20,top),...[[20,'#'],[55,'主商品貨號'],[180,'商品名稱'],[300,'商品選項貨號'],[400,'商品規格'],[540,'數量']].map(([x,str])=>item(str,x,top-30)),...sequence.flatMap((n,i)=>{const y=top-60-i*25;return [item(String(n),20,y),item('SKU',55,y),item(`Product ${n}`,180,y),item(`VAR_${n}`,300,y),item('Blue / M',400,y),item(n===5?'2':'1',540,y)];}),item(`買家備註：${note}`,20,top-65-sequence.length*25)];
}
async function read(pages){let destroyed=false;const doc={numPages:pages.length,async getPage(n){return {async getTextContent(){return {items:pages[n-1]};}}},loadingTask:{async destroy(){destroyed=true;}}};try{return await slip.readPacking(new ArrayBuffer(1),{getDocument(){return {promise:Promise.resolve(doc)}}});}finally{assert.ok(destroyed);}}
const A='250101TEST0001',B='250101TEST0002',C='250101TEST0003';
test('same-page repeated order with 1–5 then 6–8 becomes one complete order',async()=>{
 const p=await read([[...section(A,[1,2,3,4,5]),...section(A,[6,7,8],400)]]);
 assert.equal(p.length,1);assert.equal(p[0].rows.length,8);assert.equal(p[0].rows.reduce((n,r)=>n+r.qty,0),9);
 assert.deepEqual(p[0].rows.map(r=>r.variantSku),Array.from({length:8},(_,i)=>`VAR_${i+1}`));
 assert.deepEqual(slip.matchPackingToLabels(p,[A]),p);
});
test('continuation across pages and multiple sections retains order and notes',async()=>{
 const p=await read([[...section(A,[1]),...section(B,[1,2],500,'Handle carefully')],[...section(B,[3,4]),...section(B,[5],500,'Handle carefully')],[...section(B,[6]),...section(C,[1],500)]]);
 assert.deepEqual(p.map(s=>s.rows.length),[1,6,1]);assert.equal(p[1].buyerNote,'Handle carefully');
 assert.deepEqual(slip.matchPackingToLabels(p,[C,B,A]).map(s=>s.orderId),[C,B,A]);
});
test('gaps, overlaps, restarts, missing first section and nonadjacent repeats still fail',async()=>{
 for(const seq of [[4,5],[2,3],[1,2],[3,5]]) await assert.rejects(read([[...section(A,[1,2]),...section(A,seq,500)]]),/序號不連續/);
 await assert.rejects(read([section(A,[6,7,8])]),/序號不連續/);
 await assert.rejects(read([section(A,[1]),section(B,[1]),section(A,[2])]),/重複或順序不明/);
 await assert.rejects(read([section(A,[1,2]),section(A,[4])]),e=>e.diagnostics.expectedSequence===3 && e.diagnostics.actualSequence===4);
});
test('invalid continuation quantity still fails',async()=>{
 const next=section(A,[2]);next.push(item('bad',540,740));
 await assert.rejects(read([section(A,[1]),next]),/數量不完整或無效/);
});

test('continuation without sequence evidence fails',async()=>{
 const next=section(A,[2]).filter(i=>i.transform[4]!==20 || i.str.startsWith('訂單') || i.str.startsWith('買家'));
 await assert.rejects(read([section(A,[1]),next]),/缺少商品序號/);
});
