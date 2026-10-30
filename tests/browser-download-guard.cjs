const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://seller.shopee.tw/**',r=>r.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body>
   <div class="mass-ship-filter-item"><span class="label">物流方式</span><label><input type="radio" value="carrier" checked><span label="carrier" id="carrier">7-ELEVEN</span></label></div>
   <div class="mass-ship-row"><input id="order" type="checkbox" checked><a href="/portal/sale/order/123">250101TEST0001</a></div>
   <label><input id="shipping" type="checkbox" value="寄件單" checked>寄件單</label>
   <label><input id="packing" type="checkbox" value="裝箱單" checked>裝箱單</label>
   <label><input id="pick" type="checkbox" value="撿貨單">撿貨單</label>
   <label><input id="thermal" type="radio" name="shippingFormat" value="C2C_SHIPPING_LABEL_THERMAL" checked>熱感列印</label>
   <label><input type="radio" name="shippingFormat" value="general">一般列印</label>
   <label><input id="pdf" type="radio" name="packingFormat" value="PACKING_LIST_PDF" checked>PDF</label>
   <label><input type="radio" name="packingFormat" value="excel">Excel</label>
   <div style="width:340px"><button id="download" style="margin-top:100px">下載所選文件</button><p id="after">原生按鈕說明</p></div>
  </body></html>`}));
  await page.goto('https://seller.shopee.tw/portal/sale/mass/ship');
  await page.evaluate(()=>{
   window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(){}}};
   window.nativeRuns=0;
   document.addEventListener('click',e=>{if(e.target.closest('#download'))window.nativeRuns++;});
  });
  await page.addStyleTag({path:path.join(__dirname,'../panel.css')});
  await page.addScriptTag({path:path.join(__dirname,'../content.js')});
  await page.waitForTimeout(300);
  await page.locator('#pick').check();
  await page.waitForFunction(()=>document.querySelector('#download').disabled);
  assert.match(await page.locator('.lh-download-error').innerText(),/取消勾選「撿貨單」/);
  const button=await page.locator('#download').boundingBox(), note=await page.locator('.lh-download-error').boundingBox();
  assert.ok(note.y>=button.y+button.height,'message must be below the button');
  assert.equal(await page.locator('.lh-download-error').evaluate(e=>getComputedStyle(e).position),'static');
  assert.ok(await page.locator('#after').evaluate(e=>e.getBoundingClientRect().top > document.querySelector('.lh-download-error').getBoundingClientRect().bottom),'message must push later content down');
  assert.equal(await page.locator('#download').getAttribute('aria-disabled'),'true');
  assert.equal(await page.locator('#download').getAttribute('aria-describedby'),await page.locator('.lh-download-error').getAttribute('id'));
  await page.locator('#pick').uncheck();
  assert.equal(await page.locator('#download').isDisabled(),false);
  assert.equal(await page.locator('.lh-download-error').count(),0);
  await page.locator('#download').click();
  assert.equal(await page.evaluate(()=>window.nativeRuns),1);
  // A replacement button and a click in the same turn cannot race the polling guard.
  const cancelled=await page.evaluate(()=>{
   document.querySelector('#pick').checked=true;
   document.querySelector('#download').outerHTML='<button id="download"><span>下載所選文件</span></button>';
   return !document.querySelector('#download span').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  });
  assert.equal(cancelled,true);
  assert.equal(await page.evaluate(()=>window.nativeRuns),1);
  assert.equal(await page.locator('#download').isDisabled(),true);
  assert.equal(await page.locator('.lh-download-error').count(),1);
  // Route departure restores owned state and removes the error message.
  await page.evaluate(()=>history.pushState({},'', '/portal/product/list'));
  await page.waitForFunction(()=>!document.querySelector('#download').disabled);
  assert.equal(await page.locator('.lh-download-error').count(),0);
  // Preserve a native disabled button and existing accessibility attributes.
  await page.evaluate(()=>{
   const b=document.querySelector('#download');b.disabled=true;b.setAttribute('aria-describedby','native-help');b.setAttribute('aria-disabled','true');
   history.pushState({},'', '/portal/sale/mass/ship');
  });
  await page.waitForSelector('.lh-download-error');
  await page.locator('#pick').uncheck();
  assert.equal(await page.locator('#download').isDisabled(),true);
  assert.equal(await page.locator('#download').getAttribute('aria-describedby'),'native-help');
  assert.equal(await page.locator('#download').getAttribute('aria-disabled'),'true');
  // Complete per-carrier matrix, including checkbox and format failures.
  await page.evaluate(()=>{const b=document.querySelector('#download');b.disabled=false;b.removeAttribute('aria-disabled');});
  async function state(carrier,changes={}) {
   return page.evaluate(({carrier,changes})=>{
    document.querySelector('#carrier').textContent=carrier;
    for(const [id,value] of Object.entries({order:true,shipping:true,packing:true,pick:false,thermal:true,pdf:true,...changes})) {
     document.querySelector('#'+id).checked=value;
    }
    document.querySelector('#pick').dispatchEvent(new Event('change',{bubbles:true}));
    return {disabled:document.querySelector('#download').disabled,text:document.querySelector('.lh-download-error')?.textContent||''};
   },{carrier,changes});
  }
  const thermalCarriers=['蝦皮店到店','蝦皮店到店 - 隔日到貨','蝦皮店到店 - 無包裝隔日到','店到家宅配','新竹物流','黑貓宅急便','嘉里快遞'];
  const imageCarriers=['7-ELEVEN','全家','FamilyMart','萊爾富'];
  for(const carrier of [...thermalCarriers,...imageCarriers]) {
   assert.equal((await state(carrier)).disabled,false,carrier);
   for(const [change,message] of [[{shipping:false},'勾選「寄件單」'],[{packing:false},'勾選「裝箱單」'],[{pdf:false},'裝箱單設為「PDF」'],[{pick:true},'取消勾選「撿貨單」'],[{order:false},'至少勾選一筆訂單']]) {
    const result=await state(carrier,change);assert.equal(result.disabled,true,carrier);assert.ok(result.text.includes(message),result.text);
   }
   const result=await state(carrier,{thermal:false});
   assert.equal(result.disabled,thermalCarriers.includes(carrier),carrier);
   if(result.disabled)assert.ok(result.text.includes('熱感列印'));
  }
  assert.equal((await state('其他寄送方式')).disabled,true);
  assert.equal((await state('未知物流')).disabled,true);
  const multi=await state('蝦皮店到店',{shipping:false,packing:false,pick:true});
  assert.equal(multi.text.split('\n').length,3,'show all missing conditions together');
  await state('蝦皮店到店');
  // Native order-selection updates must not unlock a still-invalid download.
  await page.evaluate(()=>document.querySelector('#download').disabled=true);
  await state('蝦皮店到店',{pick:true});
  await page.evaluate(()=>document.querySelector('#download').disabled=false);
  assert.equal((await state('蝦皮店到店',{pick:true})).disabled,true);
  assert.equal((await state('蝦皮店到店')).disabled,false);
  // Disabled required options and hidden stale format radios must never pass.
  await page.evaluate(()=>document.querySelector('#pdf').disabled=true);
  assert.equal((await state('蝦皮店到店')).disabled,true);
  await page.evaluate(()=>{document.querySelector('#pdf').disabled=false;const label=document.createElement('label');label.style.display='none';label.innerHTML='<input type="radio" value="PACKING_LIST_PDF" checked>';document.body.append(label);});
  assert.equal((await state('蝦皮店到店',{pdf:false})).disabled,true);
  await state('蝦皮店到店');
  assert.deepEqual(errors,[]);
  console.log('PASS: 11-carrier conditions matrix, inline error flow, disabled/hidden formats, multiple failures; picklist disables download, message below button, cancel restores, replacement click blocked, route cleanup, native disabled and accessibility state preserved');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
