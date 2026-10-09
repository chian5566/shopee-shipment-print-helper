const PAGE_HINT='請前往蝦皮「批次出貨 → 下載出貨文件」頁面使用出貨助手。';
const status=document.getElementById('status');
async function openAssistant() {
  status.textContent='正在開啟助手…';
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !tab.url || new URL(tab.url).origin!=='https://seller.shopee.tw') {
      status.textContent=PAGE_HINT; return;
    }
    let response;
    try { response=await chrome.tabs.sendMessage(tab.id,{type:'OPEN_PANEL'}); }
    catch (_) {
      // Recover tabs opened before installation/reload, without refreshing Shopee.
      await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['network-hook.js']});
      await chrome.scripting.insertCSS({target:{tabId:tab.id},files:['panel.css']});
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['vendor/fontkit.umd.min.js','vendor/pdf-lib.min.js','print-layout.js','packing-slip.js','content.js']});
      response=await chrome.tabs.sendMessage(tab.id,{type:'OPEN_PANEL'});
    }
    status.textContent=response?.ok ? (response.downloadPage?'助手已開啟。':PAGE_HINT) : '助手尚未連線，請重新整理蝦皮頁面後再開啟。';
    if (response?.ok && response.downloadPage) window.close();
  } catch (_) {
    status.textContent='助手尚未連線，請重新整理蝦皮頁面後再開啟。'+PAGE_HINT;
  }
}
document.getElementById('retry').addEventListener('click',openAssistant);
openAssistant();
