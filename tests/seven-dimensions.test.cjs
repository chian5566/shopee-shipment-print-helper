const {test}=require('node:test');
const assert=require('node:assert/strict');
const seven=require('../seven-eleven.js');
const id='250101TEST0001';
const png='data:image/png;base64,aGVsbG8=';

test('capture uses explicit rounded bounds and bitmap dimensions for fractional layouts',async()=>{
 for(const [width,height] of [[306,454],[306.25,454.125],[306.015625,454.25],[377.9,566.9],[500.25,720.125],[250,900],[1000,700]]){
  const node={getBoundingClientRect:()=>({width,height})};let options;
  const label=await seven.captureLabel(node,id,async(actual,opts)=>{
   assert.equal(actual,node);options=opts;
   return {width:opts.width*opts.scale,height:opts.height*opts.scale,toDataURL:()=>png};
  });
  assert.equal(options.scale,3);assert.equal(options.width,Math.ceil(width));assert.equal(options.height,Math.ceil(height));
  assert.equal(label.width,Math.ceil(width));assert.equal(label.height,Math.ceil(height));
  assert.equal(label.sourceWidth,width);assert.equal(label.sourceHeight,height);
  seven.validateLabels([label],[id]);
 }
});

test('invalid or excessive capture dimensions stop before rendering; incomplete captures stop before delivery',async()=>{
 for(const [width,height] of [[NaN,454],[306,Infinity],[0,454],[306,0],[3000,454],[306,5000],[2048,2048]]){
  let called=false;
  await assert.rejects(()=>seven.captureLabel({getBoundingClientRect:()=>({width,height})},id,()=>{called=true;}),/尺寸/);
  assert.equal(called,false);
 }
 await assert.rejects(()=>seven.captureLabel({getBoundingClientRect:()=>({width:306.25,height:454})},id,async()=>({width:918,height:1362})),/擷取不完整/);
});

test('PDF fits varied sizes uniformly, preserves PNG aspect ratio, keeps smaller originals and 125% compensation',async()=>{
 for(const [cssWidth,cssHeight] of [[306,454],[306.25,454.125],[377.9,566.9],[500,720],[250,900],[1000,700]]){
  const bitmap={width:Math.ceil(cssWidth)*3,height:Math.ceil(cssHeight)*3};let draw,scale,translate;
  const page={drawImage(image,opts){assert.equal(image,bitmap);draw=opts;},scaleContent(...args){scale=args;},translateContent(...args){translate=args;}};
  const paper=[100*72/25.4,150*72/25.4];
  const out={embedPng:async()=>bitmap,addPage(size){assert.deepEqual(size,paper);return page;}};
  await seven.appendLabel(out,{png,width:cssWidth,height:cssHeight});
  assert.ok(Math.abs(draw.width/draw.height-bitmap.width/bitmap.height)<1e-10);
  assert.ok(draw.x>=-1e-10 && draw.y>=-1e-10);
  assert.ok(draw.x+draw.width<=paper[0]+1e-10 && draw.y+draw.height<=paper[1]+1e-10);
  assert.ok(Math.abs(draw.x*2+draw.width-paper[0])<1e-10);
  assert.ok(Math.abs(draw.y+draw.height-paper[1])<1e-10);
  assert.ok(draw.width<=bitmap.width/3*.75+1e-10 && draw.height<=bitmap.height/3*.75+1e-10);
  if(cssWidth===306)assert.equal(draw.width,306*.75);
  assert.deepEqual(scale,[.8,.8]);assert.deepEqual(translate,[0,paper[1]*.2]);
  // At 125% around the top-left, the compensation restores the fitted bounds.
  const finalX=draw.x*.8*1.25;
  const finalY=(draw.y*.8+paper[1]*.2)*1.25-paper[1]*.25;
  assert.ok(Math.abs(finalX-draw.x)<1e-10 && Math.abs(finalY-draw.y)<1e-10);
 }
});

test('corrupt bitmap dimensions are rejected with numerical diagnostics before adding a PDF page',async()=>{
 for(const bitmap of [{width:1200,height:1362},{width:918,height:1000}]){
  let added=false;
  const out={embedPng:async()=>bitmap,addPage(){added=true;}};
  await assert.rejects(()=>seven.appendLabel(out,{png,width:306,height:454}),e=>/尺寸不一致/.test(e.message)&&/CSS 306 × 454; PNG/.test(e.cause.message));
  assert.equal(added,false);
 }
});
