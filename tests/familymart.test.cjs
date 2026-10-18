const assert=require('node:assert/strict'),family=require('../familymart.js');
const ids=['250101TEST0001','250101TEST0002','250101TEST0003','250101TEST0004'];
assert.ok(family.isLabelUrl('https://api.sls.shopee.tw/api/logistic/familymart/shipping_label?jwt=demo'));
for(const url of ['http://api.sls.shopee.tw/api/logistic/familymart/shipping_label','https://evil.test/api/logistic/familymart/shipping_label','https://api.sls.shopee.tw/other'])assert.ok(!family.isLabelUrl(url));
assert.equal(family.orderFromQr('A3||tracking|| '+ids[0]+'   '),ids[0]);
assert.throws(()=>family.orderFromQr('A3||'+ids[0]+'||bad'),/訂單編號/);
function sheet(count,decodeFailure=false){
 let cell=0;const rectangles=[];
 const labels=family.captureSheet({naturalWidth:2615,naturalHeight:4271},()=>{
  const index=cell++,canvas={getContext:()=>({drawImage(_image,x,y,w,h){rectangles.push([x,y,w,h]);},getImageData(){const data=new Uint8ClampedArray(400);data.fill(255);return {data};}}),toDataURL:()=> 'data:image/png;base64,AAAA'};
  // Simulate occupied slots with enough black pixels; empty slots only have guides.
  canvas.getContext=()=>({drawImage(_image,x,y,w,h){rectangles.push([x,y,w,h]);},getImageData(){const data=new Uint8ClampedArray(index<count?120000:400);for(let i=3;i<data.length;i+=4)data[i]=255;return {data};}});
  return canvas;
 },()=>decodeFailure?null:{data:'A3|| '+ids[rectangles.length-1]+' '});
 return {labels,rectangles};
}
for(let count=1;count<=4;count++){
 const {labels,rectangles}=sheet(count);assert.deepEqual(labels.map(l=>l.orderId),ids.slice(0,count));family.validateLabels(labels,ids.slice(0,count).reverse());
 assert.deepEqual(rectangles,[[0,0,1308,2136],[1308,0,1307,2136],[0,2136,1308,2135],[1308,2136,1307,2135]]);
}
assert.throws(()=>sheet(1,true),/QR/);assert.throws(()=>sheet(0),/未找到/);
assert.throws(()=>family.captureSheet({naturalWidth:2600,naturalHeight:4271}),/版型/);
const labels=sheet(2).labels;
assert.throws(()=>family.validateLabels(labels,[ids[0]]),/數量/);
assert.throws(()=>family.validateLabels([labels[0],labels[0]],ids.slice(0,2)),/重複/);
assert.throws(()=>family.validateLabels(labels,[ids[2],ids[3]]),/編號/);
assert.throws(()=>family.validateLabels([{...labels[0],width:9999}],[ids[0]]),/尺寸/);
(async()=>{
 const calls=[],page={drawImage(_png,opts){calls.push(opts);},scaleContent(...v){calls.push(v);},translateContent(...v){calls.push(v);}};
 const out={embedPng:async()=>({width:1308,height:2136}),addPage(size){calls.push(size);return page;}};
 await family.appendLabel(out,labels[0],{});
 const [paper,draw,scale,translate]=calls;assert.deepEqual(paper,[100*72/25.4,150*72/25.4]);assert.ok(draw.width<=paper[0] && draw.height<=paper[1]);assert.ok(Math.abs(draw.width/draw.height-1308/2136)<1e-12);assert.deepEqual(scale,[.8,.8]);assert.equal(translate[1],paper[1]*.2);
 await assert.rejects(family.appendLabel({...out,embedPng:async()=>({width:1,height:1})},labels[0],{}),/不一致/);
 console.log('PASS: FamilyMart exact URL, QR identity, 1–4 labels, empty cells, unknown layouts, duplicate/mismatch guards, original aspect ratio and 125% bounds');
})().catch(e=>{console.error(e);process.exitCode=1;});
