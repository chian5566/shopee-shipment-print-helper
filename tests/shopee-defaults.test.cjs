const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const location={pathname:'/portal/sale/mass/ship'};
const intervals=[],timeouts=[],events={},sent=[];let selected=false,runtimeListener,panel;const duplicates=[],thermalDuplicates=[];
function control(type,value,checked=false){return {type,value,checked,disabled:false,clicks:0,click(){this.clicks++;this.checked=type==='radio'?true:!this.checked;if(this===header)selected=this.checked;},closest(selector){return selector==='label'?{innerText:value,parentElement:{innerText:value}}:null;}};}
const header=control('checkbox','all'),label=control('checkbox','寄件單'),packing=control('checkbox','裝箱單'),picklist=control('checkbox','撿貨單'),packingPdf=control('radio','PACKING_LIST_PDF');let thermal=control('radio','C2C_SHIPPING_LABEL_THERMAL');
const row={innerText:'buyer TW000000000000',querySelector(selector){if(selector.includes('checkbox'))return selected?{}:null;return {textContent:'250101TEST0002',getAttribute:()=>'/portal/sale/order/123'};}};
const listeners=[];let nativeRuns=0;const native={textContent:'下載所選文件',dataset:{},addEventListener:(type,fn)=>listeners.push(fn),closest(){return this;},click(){events.click?.({target:this});for(const fn of listeners)fn({preventDefault(){throw Error('must not prevent native download')},stopPropagation(){throw Error('must not stop native download')}});nativeRuns++;}};
let pushed=false,resizes=0;const classes={add(){pushed=true;},remove(){pushed=false;}};
function makePanel(){const slots=Object.fromEntries(['.lh-orders','.lh-count','.lh-tasks','.lh-mode-hint','.lh-close','.lh-clear-tasks'].map(k=>[k,{textContent:'',innerHTML:'',hidden:false,style:{setProperty(name,value,priority){this[name]=value;this.priority=priority;}},querySelectorAll:()=>[]} ]));return {id:'',innerHTML:'',isConnected:false,querySelector:key=>slots[key],remove(){this.isConnected=false;}};}
const attributes={};
const document={addEventListener:(type,fn)=>events[type]=fn,createElement:()=>panel=makePanel(),documentElement:{setAttribute(k,v){attributes[k]=v;},removeAttribute(k){delete attributes[k];},append(p){p.isConnected=true;}},getElementById:()=>panel?.isConnected?panel:null,querySelectorAll(selector){if(selector==='input[type="radio"][value="C2C_SHIPPING_LABEL_THERMAL"]')return [...thermalDuplicates,thermal];if(selector==='.mass-ship-row')return [row];if(selector==='button')return [native];if(selector==='input[type="checkbox"]')return [...duplicates,header,label,packing,picklist];return [];},querySelector(selector){if(selector==='#app')return {classList:classes};if(selector.includes('.mass-ship-header'))return header;if(selector.includes('C2C_SHIPPING_LABEL_THERMAL'))return thermal;if(selector.includes('PACKING_LIST_PDF'))return packingPdf;return [label,packing,picklist].find(c=>selector.includes(`value="${c.value}"`))||null;}};
const windowEvents={};
const window={dispatchEvent(){resizes++;},addEventListener(type,fn){windowEvents[type]=fn;},setInterval(fn,delay){intervals.push({fn,delay});},setTimeout(fn,delay){timeouts.push({fn,delay});},clearTimeout(){},clearInterval(){}};
const chrome={runtime:{onMessage:{addListener(fn){runtimeListener=fn;}},sendMessage(message){sent.push(message);}}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../content.js'),'utf8'),{window,document,chrome,console,atob,URL,Event,location});
const tick=intervals.find(i=>i.delay===250).fn;
tick();assert.ok(selected);assert.ok(!label.checked&&!packing.checked&&!picklist.checked);assert.equal(label.clicks+packing.clicks+picklist.clicks,0);
runtimeListener({type:'TOGGLE_PANEL'});assert.ok(panel.isConnected);assert.ok(!panel.querySelector('.lh-mode-hint').hidden);assert.equal(label.clicks+packing.clicks,0);
for(const [l,p] of [[false,false],[true,false],[false,true],[true,true]]){
 label.checked=l;packing.checked=p;thermal.checked=true;packingPdf.checked=true;tick();tick();
 assert.equal(label.checked,l);assert.equal(packing.checked,p);assert.equal(label.clicks+packing.clicks,0);
 assert.equal(panel.querySelector('.lh-mode-hint').hidden,l&&p);assert.equal(panel.querySelector('.lh-mode-hint').style.display,l&&p?'none':'block');assert.equal(panel.querySelector('.lh-mode-hint').style.priority,'important');
 sent.length=0;native.click();assert.equal(sent.some(m=>m.type==='START_DOCUMENT_TASK'),l&&p);assert.ok(sent.some(m=>m.type==='STOP_DOCUMENT_TASK'));
}
const oldId=sent.find(m=>m.type==='START_DOCUMENT_TASK').taskId;
 packing.checked=false;sent.length=0;native.click();
 const taskMarkup=panel.querySelector('.lh-tasks').innerHTML;runtimeListener({type:'PREVIEW_URL',taskId:oldId,url:'https://seller.shopee.tw/awbprint?job_id=stale'});assert.equal(panel.querySelector('.lh-tasks').innerHTML,taskMarkup);
 packing.checked=true;
 assert.equal(nativeRuns,5);assert.equal(listeners.length,0);
// Hidden stale controls before the active controls must not determine the hint.
 duplicates.push({value:'寄件單',checked:false,getClientRects:()=>[],closest(selector){return selector==='label'?{innerText:'寄件單',getClientRects:()=>[]}:null;}});
 label.checked=true;packing.checked=true;tick();assert.ok(panel.querySelector('.lh-mode-hint').hidden);duplicates.length=0;
 // Exact own labels work when Shopee's native input values are generic.
 label.value='shipping';packing.value='packing';tick();assert.ok(panel.querySelector('.lh-mode-hint').hidden);label.value='寄件單';packing.value='裝箱單';
 // General printing shows guidance, never intercepts native download or starts a wait.
thermal.checked=false;tick();
assert.equal(panel.querySelector('.lh-mode-hint').hidden,false);
assert.match(panel.querySelector('.lh-mode-hint').textContent,/僅支援熱感列印/);
assert.equal(thermal.checked,false);
const nativeBefore=nativeRuns,waitsBefore=timeouts.filter(t=>t.delay===90000).length;
sent.length=0;native.click();assert.equal(nativeRuns,nativeBefore+1);
assert.equal(sent.some(m=>m.type==='START_DOCUMENT_TASK'),false);
assert.equal(attributes['data-lh-background-task'],undefined);
assert.equal(timeouts.filter(t=>t.delay===90000).length,waitsBefore);
// Hidden checked controls must not permit interception.
thermalDuplicates.push({checked:true,closest:()=>({getClientRects:()=>[]})});
sent.length=0;native.click();assert.equal(sent.some(m=>m.type==='START_DOCUMENT_TASK'),false);thermalDuplicates.length=0;
// Even with the panel closed, a general-print click reveals the hint.
panel.remove();sent.length=0;native.click();assert.ok(panel.isConnected);
assert.match(panel.querySelector('.lh-mode-hint').textContent,/僅支援熱感列印/);
assert.equal(sent.some(m=>m.type==='START_DOCUMENT_TASK'),false);
// A disabled/unavailable thermal option cannot enable the helper.
thermal.checked=true;thermal.disabled=true;tick();assert.equal(panel.querySelector('.lh-mode-hint').hidden,false);thermal.disabled=false;
thermal.checked=true;tick();assert.equal(panel.querySelector('.lh-mode-hint').hidden,true);
// Selecting an extra file does not disable the helper.
thermal.checked=true;picklist.checked=true;tick();assert.ok(panel.querySelector('.lh-mode-hint').hidden);assert.ok(picklist.checked);sent.length=0;native.click();assert.ok(sent.some(m=>m.type==='START_DOCUMENT_TASK'));assert.equal(sent.find(m=>m.type==='START_DOCUMENT_TASK').expectedFiles,2);
picklist.checked=false;
// A new radio or a fresh order-selection cycle receives a default once.
thermal=control('radio','C2C_SHIPPING_LABEL_THERMAL');tick();assert.ok(thermal.checked);
selected=false;header.checked=false;thermal.checked=false;tick();assert.equal(header.clicks,1);assert.equal(thermal.checked,false);
selected=true;events.change();timeouts.filter(t=>t.delay===0).forEach(t=>t.fn());assert.ok(thermal.checked);assert.equal(header.clicks,1);
// Closing the panel must not disable the download handler.
 label.checked=true;packing.checked=true;selected=true;panel.remove();sent.length=0;native.click();assert.ok(panel.isConnected);assert.ok(sent.some(m=>m.type==='START_DOCUMENT_TASK'));
 // A replacement button (including a click on its child) is handled immediately,
 // before any polling interval could bind a new listener.
 const replacement={textContent:'下載所選文件',disabled:false};sent.length=0;events.click({target:{closest:()=>replacement}});assert.ok(sent.some(m=>m.type==='START_DOCUMENT_TASK'));
 console.log('PASS: all four document selections, hint visibility, native click preserved, no forced checkbox changes, thermal-only guard/native fallback, fresh format defaults, no order reselection');

// Task timestamps and terminal states are visible without a stuck progress bar.
let markup=panel.querySelector('.lh-tasks').innerHTML;
assert.match(markup,/開始：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
const cancelledCards=markup.split('<div class="lh-task">').filter(card=>card.includes('任務已取消'));
assert.ok(cancelledCards.length>0);assert.ok(cancelledCards.every(card=>!card.includes('lh-progress')));
let taskId=sent.findLast(m=>m.type==='START_DOCUMENT_TASK').taskId;
runtimeListener({type:'PREVIEW_PDF',taskId,url:'https://seller.shopee.tw/awbprint?job_id=bad',base64:btoa('invalid pdf')},null,()=>{});
markup=panel.querySelector('.lh-tasks').innerHTML;
const failedCard=markup.split('<div class="lh-task">').find(card=>card.includes('文件讀取失敗'));
assert.ok(failedCard);assert.ok(!failedCard.includes('lh-progress'));
assert.equal(panel.querySelector('.lh-clear-tasks').disabled,false);
panel.querySelector('.lh-clear-tasks').onclick();
assert.match(panel.querySelector('.lh-tasks').innerHTML,/尚無列印任務/);
assert.equal(panel.querySelector('.lh-clear-tasks').disabled,true);
assert.equal(sent.at(-1).type,'STOP_DOCUMENT_TASK');
runtimeListener({type:'PREVIEW_PDF',taskId,url:'late',base64:btoa('%PDF-1.7')},null,()=>{throw Error('cleared task must not accept PDF');});
timeouts.filter(t=>t.delay===90000).forEach(t=>t.fn());
assert.match(panel.querySelector('.lh-tasks').innerHTML,/尚無列印任務/);
native.click();assert.equal(panel.querySelector('.lh-clear-tasks').disabled,false);
windowEvents.pagehide();assert.match(panel.querySelector('.lh-tasks').innerHTML,/尚無列印任務/);
console.log('PASS: start timestamp, cancelled/error progress hidden, clear cancels pending work, late PDFs/timeouts ignored, page exit clears tasks');
assert.ok(pushed);const resizeBefore=resizes;
runtimeListener({type:'TOGGLE_PANEL'});assert.equal(pushed,false);assert.equal(resizes,resizeBefore+1);
runtimeListener({type:'TOGGLE_PANEL'});assert.equal(pushed,true);assert.equal(resizes,resizeBefore+2);
panel.querySelector('.lh-close').onclick();assert.equal(pushed,false);

// The panel always opens off-route and recovers when SPA navigation returns.
location.pathname='/portal/home';
let reply;runtimeListener({type:'OPEN_PANEL'},null,value=>reply=value);
assert.ok(panel.isConnected);assert.equal(reply.downloadPage,false);
assert.match(panel.querySelector('.lh-mode-hint').textContent,/批次出貨 → 下載出貨文件/);
assert.match(panel.querySelector('.lh-mode-hint').innerHTML,/href="https:\/\/seller\.shopee\.tw\/portal\/sale\/mass\/ship\?mass_shipment_tab=301"/);
sent.length=0;native.click();assert.equal(sent.length,0);
location.pathname='/portal/sale/mass/ship';tick();
assert.equal(panel.querySelector('.lh-mode-hint').hidden,true);
runtimeListener({type:'GET_PAGE_STATUS'},null,value=>reply=value);assert.equal(reply.downloadPage,true);
// Earlier steps on the same route have no document controls.
const originalQueries=document.querySelectorAll;
document.querySelectorAll=selector=>selector==='input[type="checkbox"]'?[]:originalQueries(selector);
runtimeListener({type:'GET_PAGE_STATUS'},null,value=>reply=value);assert.equal(reply.downloadPage,false);
tick();assert.match(panel.querySelector('.lh-mode-hint').textContent,/批次出貨 → 下載出貨文件/);
assert.match(panel.querySelector('.lh-mode-hint').innerHTML,/href="https:\/\/seller\.shopee\.tw\/portal\/sale\/mass\/ship\?mass_shipment_tab=301"/);
console.log('PASS: off-page open, page hint, SPA recovery, earlier shipping step');
