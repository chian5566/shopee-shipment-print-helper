const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
  const page=await browser.newPage({viewport:{width:1200,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://seller.shopee.tw/**',r=>r.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body>
   <label><input type="checkbox" value="寄件單" checked>寄件單</label>
   <label><input type="checkbox" value="裝箱單" checked>裝箱單</label>
   <label><input id="pick" type="checkbox" value="撿貨單">撿貨單</label>
   <button id="download" style="margin-top:100px">下載所選文件</button>
  </body></html>`}));
  await page.goto('https://seller.shopee.tw/portal/sale/mass/ship');
  await page.evaluate(()=>{
   window.chrome={runtime:{onMessage:{addListener(){}},sendMessage(){}}};
   window.nativeRuns=0;
   document.addEventListener('click',e=>{if(e.target.closest('#download'))window.nativeRuns++;});
  });
  await page.addStyleTag({path:path.join(__dirname,'../panel.css')});
  await page.addScriptTag({path:path.join(__dirname,'../content.js')});
  await page.locator('#pick').check();
  await page.waitForFunction(()=>document.querySelector('#download').disabled);
  assert.match(await page.locator('.lh-download-error').innerText(),/取消勾選「撿貨單」/);
  const button=await page.locator('#download').boundingBox(), note=await page.locator('.lh-download-error').boundingBox();
  assert.ok(note.y>=button.y+button.height,'message must be below the button');
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
  assert.deepEqual(errors,[]);
  console.log('PASS: picklist disables download, message below button, cancel restores, replacement click blocked, route cleanup, native disabled and accessibility state preserved');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
