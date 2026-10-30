const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../print-guide.js'),'utf8');
function fixture(){
 const nodes=[],handlers={},intervals=[];let nativeControls=[];
 const box={left:320,right:336,top:200,bottom:216,width:16,height:16};
 function element(text='',rect={...box}){return {textContent:text,disabled:false,isConnected:true,checked:false,dataset:{},style:{setProperty(){}},offsetWidth:175,offsetHeight:32,getBoundingClientRect:()=>rect,getClientRects:()=>[rect],setAttribute(){},append(e){nodes.push(e);e.isConnected=true;},remove(){this.isConnected=false;if(this.id==='lh-print-guide')for(const n of nodes)n.isConnected=false;},closest:()=>null,querySelector:()=>null};}
 function control(value,top){const input=element();input.value=value;const indicator=element('',{...box,top,bottom:top+16});const label=element(value,{...box,top,bottom:top+16});label.querySelector=()=>indicator;input.closest=s=>s==='label'?label:null;return input;}
 const all=control('all',180),shipping=control('寄件單',360),packing=control('裝箱單',460),thermal=control('C2C_SHIPPING_LABEL_THERMAL',400),pdf=control('PACKING_LIST_PDF',500),download=element('下載所選文件',{...box,top:600,bottom:640,height:40});
 let selected=false,thermalShown=true,pdfShown=true,downloadShown=true,hiddenCopy=false;
 const hidden=control('C2C_SHIPPING_LABEL_THERMAL',400);hidden.checked=true;hidden.closest=()=>null;hidden.getBoundingClientRect=()=>({...box,width:0,height:0});
 const row={querySelector:()=>selected?{}:null};
 const document={documentElement:{append(e){nodes.push(e);}},createElement:()=>element(),getElementById:()=>null,addEventListener:(type,fn)=>handlers[type]=fn,
 querySelectorAll(s){if(s==='input[type="checkbox"], input[type="radio"], button, [role="button"]')return nativeControls;if(s==='button, [role="button"]')return downloadShown?[download]:[];if(s==='.mass-ship-header input[type="checkbox"]')return [all];if(s==='.mass-ship-row')return [row];if(s==='input[type="checkbox"]')return [all,shipping,packing];if(s.includes('C2C_SHIPPING_LABEL_THERMAL'))return [...(hiddenCopy?[hidden]:[]),...(thermalShown?[thermal]:[])];if(s.includes('PACKING_LIST_PDF'))return pdfShown?[pdf]:[];throw Error(s);}};
 const context={document,window:{addEventListener:(type,fn)=>handlers[type]=fn,setInterval(fn){intervals.push(fn);},clearInterval(){}},location:{pathname:'/portal/sale/mass/ship'},innerWidth:1200,innerHeight:800,getComputedStyle:()=>({visibility:'visible',display:'block'}),requestAnimationFrame:fn=>fn()};
 vm.runInNewContext(source,context);
 const tick=()=>intervals[0]();
 const visible=()=>nodes.filter(n=>n.className==='lh-guide-bubble'&&n.isConnected&&!n.hidden);
 return {context,all,shipping,packing,thermal,pdf,tick,visible,handlers,setSelected:v=>selected=v,setThermal:v=>thermalShown=v,setPdf:v=>pdfShown=v,setDownload:v=>downloadShown=v,setControls:v=>nativeControls=v,setHidden:v=>hiddenCopy=v};
}
test('guide reveals each step only after earlier steps complete and rolls back when unchecked',()=>{
 const f=fixture();assert.deepEqual(f.visible().map(x=>x.textContent),['1. 勾選訂單']);
 f.setSelected(true);f.tick();
 assert.deepEqual(f.visible().map(x=>x.textContent),['1. 勾選訂單 ✓','2. 勾選寄件單']);
 f.shipping.checked=true;f.handlers.change();
 assert.deepEqual(f.visible().map(x=>x.textContent),['1. 勾選訂單 ✓','2. 選擇「熱感列印」']);
 f.thermal.checked=true;f.handlers.change();
 assert.ok(f.visible().some(x=>x.textContent==='3. 勾選裝箱單'));
 assert.ok(!f.visible().some(x=>x.textContent.includes('下載所選文件')));
 f.packing.checked=true;f.handlers.change();
 assert.ok(f.visible().some(x=>x.textContent==='3. 選擇「PDF」'));
 assert.ok(!f.visible().some(x=>x.textContent.includes('下載所選文件')));
 f.pdf.checked=true;f.handlers.change();
 assert.ok(f.visible().some(x=>x.textContent==='4. 點擊「下載所選文件」'));
 f.thermal.checked=false;f.handlers.change();
 assert.equal(f.visible().find(x=>x.textContent.includes('熱感')).dataset.done,'false');
 assert.ok(!f.visible().some(x=>/PDF|下載所選文件/.test(x.textContent)));
 assert.equal(f.pdf.checked,true);
 f.setSelected(false);f.tick();assert.deepEqual(f.visible().map(x=>x.textContent),['1. 勾選訂單']);
});
test('carrier remount skips unavailable formats and ignores hidden duplicate',()=>{
 const f=fixture();f.setSelected(true);f.shipping.checked=f.packing.checked=true;f.setThermal(false);f.tick();
 assert.deepEqual(f.visible().map(x=>x.textContent),['1. 勾選訂單 ✓','2. 勾選寄件單 ✓','3. 選擇「PDF」']);
 f.setThermal(true);f.setHidden(true);f.tick();assert.equal(f.visible().find(x=>x.textContent.includes('熱感')).dataset.done,'false');
 f.setPdf(false);f.tick();assert.ok(!f.visible().some(x=>x.textContent.includes('PDF')));
 f.context.location.pathname='/portal/product/list/live';f.tick();assert.equal(f.visible().length,0);
});
test('7-ELEVEN keeps shipping as step two before and after checking without a thermal option',()=>{
 const f=fixture();f.setSelected(true);f.setThermal(false);f.packing.checked=f.pdf.checked=true;f.tick();
 assert.ok(f.visible().some(b=>b.textContent==='2. 勾選寄件單' && b.dataset.done==='false'));
 f.shipping.checked=true;f.handlers.change();
 assert.ok(f.visible().some(b=>b.textContent==='2. 勾選寄件單 ✓' && b.dataset.done==='true'));
 assert.ok(f.visible().some(b=>b.textContent==='3. 選擇「PDF」 ✓'));
 assert.ok(f.visible().some(b=>b.textContent==='4. 點擊「下載所選文件」'));
 f.shipping.checked=false;f.handlers.change();
 assert.ok(f.visible().some(b=>b.textContent==='2. 勾選寄件單'));
});
test('scroll hides offscreen targets and guide never overlaps its own bubbles',()=>{
 const f=fixture();f.setSelected(true);f.shipping.checked=f.packing.checked=f.thermal.checked=f.pdf.checked=true;f.tick();const bubbles=f.visible();
 for(let i=0;i<bubbles.length;i++)for(let j=i+1;j<bubbles.length;j++){
 const a=bubbles[i],b=bubbles[j];assert.ok(Math.abs(parseFloat(a.style.top)-parseFloat(b.style.top))>=38);
 }
 f.context.innerHeight=100;f.handlers.scroll();assert.equal(f.visible().length,0);
 f.context.innerHeight=800;f.handlers.resize();assert.ok(f.visible().length);
 f.setDownload(false);f.tick();assert.equal(f.visible().length,0);
});

test('bubble avoids adjacent document label while arrow stays aligned to radio',()=>{
 const f=fixture();f.setSelected(true);f.shipping.checked=f.packing.checked=f.thermal.checked=true;
 f.setControls([f.packing.closest('label')]);f.tick();
 const bubble=f.visible().find(b=>b.textContent.includes('PDF'));
 assert.ok(bubble);assert.equal(bubble.dataset.below,'true');
 const center=328,left=parseFloat(bubble.style.left);assert.ok(center>=left+5&&center<=left+bubble.offsetWidth-5);
});

test('dense 7-ELEVEN document list keeps shipping prompt visible beside checkbox',()=>{
 const f=fixture();f.setSelected(true);f.setThermal(false);
 const rect=(top,width=150)=>({left:320,right:320+width,top,bottom:top+22,width,height:22});
 const move=(input,top)=>{
  const label=input.closest('label');label.getBoundingClientRect=()=>rect(top);
  label.querySelector().getBoundingClientRect=()=>rect(top,16);
 };
 move(f.shipping,360);move(f.packing,392);
 const preceding={closest:()=>null,getClientRects:()=>[rect(328)],getBoundingClientRect:()=>rect(328)};
 f.setControls([preceding,f.shipping,f.packing]);f.tick();
 const shipping=f.visible().find(b=>b.textContent==='2. 勾選寄件單');
 assert.ok(shipping,'second step must not disappear when adjacent labels block vertical placements');
 assert.equal(shipping.dataset.side,'left');
 assert.ok(parseFloat(shipping.style.left)+shipping.offsetWidth<320);
 f.shipping.checked=true;f.tick();
 assert.ok(f.visible().some(b=>b.textContent==='2. 勾選寄件單 ✓'));
});
