const {test}=require('node:test');
const assert=require('node:assert/strict');
const slip=require('../packing-slip.js');
const fixture=require('./fixtures/shopee-packing-joined-quantity.json');
const copy=()=>structuredClone(fixture);
const joined=items=>items.find(i=>i.str===',M 1');

test('actual two-section PDF with a joined size/quantity retains all six rows',()=>{
  const sections=slip.extractPackingSections(fixture);
  assert.deepEqual(sections.map(p=>p.orderId),['250101TEST0001','250101TEST0002']);
  assert.deepEqual(sections.map(p=>p.rows.map(r=>[r.sku,r.variantSku,r.spec,r.qty])),[
    [['PT14','PT14_BLK_M','黑色(俐落收斂 / 第一次買選它) / M (約 30~31 腰)',1],['','TS12_CRM_L','奶油白(乾淨提亮) / L',1]],
    [['','TS12_CRM_M','奶油白(乾淨提亮) / M',1],['','TS12_BLK_M','黑色(顯瘦耐穿) / M',1],['TS13','TS13_RDS_M','酒紅(高質感顏色!最推薦) / M',1],['TS13','TS13_WHT_M','白色(給人溫暖的顏色) / M',1]]
  ]);
});

test('joined multi-digit quantity uses the measured numeric column',()=>{
  const items=copy(),i=joined(items);
  i.str=',M 12';i.width+=5.82080441274164;
  const row=slip.extractPackingSections(items)[1].rows[1];
  assert.equal(row.qty,12);assert.equal(row.spec,'黑色(顯瘦耐穿) / M');
});

test('uncertain geometry, font, baseline, and duplicate quantities still stop',()=>{
  for(const mutate of [
    (items,i)=>{i.width-=4;},
    (items,i)=>{i.fontName='unknown';},
    (items,i)=>{i.transform[5]-=5;},
    (items,i)=>{i.str=',M 0';},
    (items,i)=>{items.push({...i,str:'1',width:5.82080441274164,transform:[...i.transform.slice(0,4),485.03982682658966,i.transform[5]]});},
    (items,i)=>{items.find(t=>t.fontName===i.fontName && t.str==='590').width+=2;}
  ]) {
    const items=copy();mutate(items,joined(items));
    assert.throws(()=>slip.extractPackingSections(items),/不完整/);
  }
});

// Product specification text belongs to the seller; geometry identifies quantity.
test('joined quantities support arbitrary seller specifications',()=>{
  for(const spec of ['加大尺寸','鞋碼42','abc','規格#★']) {
    const items=copy(),i=joined(items);
    i.str=spec+' 1';
    const row=slip.extractPackingSections(items)[1].rows[1];
    assert.equal(row.qty,1);assert.ok(row.spec.endsWith(spec));
  }
});
