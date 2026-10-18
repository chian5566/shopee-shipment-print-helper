// Only in-memory state. Each source tab owns its own task and preview tabs.
const tasks=new Map();
if(typeof importScripts==='function')importScripts('seven-eleven.js','familymart.js');
const sevenUrl=value=>{try{const u=new URL(value);return u.origin==='https://epayment.7-11.com.tw' && u.pathname==='/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx';}catch{return false;}};
const SOURCE='https://seller.shopee.tw/portal/sale/mass/ship';
const sourceTab=sender=>sender.tab?.url?.startsWith(SOURCE);
function previewUrl(value) {
  try {const url=new URL(value);return url.origin==='https://seller.shopee.tw' && url.pathname==='/awbprint' && url.searchParams.get('job_id') ? url : null;}catch (_) {return null;}
}
function stopTask(task) {
  if (!task) return;
  if (tasks.get(task.sourceTabId)===task) tasks.delete(task.sourceTabId);
  for (const id of task.backgroundTabs) chrome.tabs.remove(id,()=>void chrome.runtime.lastError);
}
function openPreview(task,url,windowId,sendResponse=()=>{}) {
  if(task.openedUrls.has(url.href)){sendResponse({ok:true});return;}
  if(task.openedUrls.size>=4){sendResponse({ok:false});return;}
  task.openedUrls.add(url.href);
  chrome.tabs.create({url:url.href,active:false,openerTabId:task.sourceTabId,windowId},tab=>{
    if(chrome.runtime.lastError || !tab?.id){task.openedUrls.delete(url.href);sendResponse({ok:false});return;}
    if(tasks.get(task.sourceTabId)!==task){chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);sendResponse({ok:false});return;}
    task.backgroundTabs.add(tab.id);task.previews.set(tab.id,url.href);sendResponse({ok:true});
  });
}
// Preserve native blank-window/form submissions; restore Shopee only when its
// task's verified carrier original is the foreground tab in the focused window.
function backgroundSevenOriginal(task,tab){
  if((!task.sevenEleven && !task.familyMart) || !tab.active || task.restoredSevenTabs.has(tab.id) || task.restoringSevenTabs.has(tab.id) || Date.now()>task.until)return;
  task.restoringSevenTabs.add(tab.id);
  const finish=()=>task.restoringSevenTabs.delete(tab.id);
  chrome.windows.get(tab.windowId,originalWindow=>{
    if(chrome.runtime.lastError || !originalWindow?.focused || tasks.get(task.sourceTabId)!==task){finish();return;}
    chrome.tabs.get(task.sourceTabId,source=>{
      if(chrome.runtime.lastError || !sourceTab({tab:source}) || tasks.get(task.sourceTabId)!==task){finish();return;}
      chrome.tabs.update(source.id,{active:true},()=>{
        if(chrome.runtime.lastError || tasks.get(task.sourceTabId)!==task){finish();return;}
        chrome.windows.update(source.windowId,{focused:true},()=>{
          if(!chrome.runtime.lastError)task.restoredSevenTabs.add(tab.id);
          finish();
        });
      });
    });
  });
}
function currentTask(sender) {
  const tab=sender.tab;if(!tab)return null;
  const url=previewUrl(tab.url);
  const matches=[...tasks.values()].filter(task=>Date.now()<=task.until && (task.previews.has(tab.id) || (url && task.jobIds.has(url.searchParams.get('job_id')))));
  if (matches.length!==1)return null;
  const task=matches[0];
  if (url)task.previews.set(tab.id,url.href);
  return task;
}
const DOWNLOAD_PAGE_URL=SOURCE+'?mass_shipment_tab=301';
chrome.action.onClicked.addListener(async tab=>{
  let sellerPage=false;
  try { sellerPage=new URL(tab.url).origin==='https://seller.shopee.tw'; } catch (_) {}
  if (!tab.id || !sellerPage) {
    chrome.tabs.create({url:DOWNLOAD_PAGE_URL,active:true});return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id,{type:'TOGGLE_PANEL'});
  } catch (_) {
    try {
      // Recover old tabs without showing an extra menu or refreshing Shopee.
      await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['network-hook.js']});
      await chrome.scripting.insertCSS({target:{tabId:tab.id},files:['panel.css']});
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['vendor/fontkit.umd.min.js','vendor/pdf-lib.min.js','print-layout.js','packing-slip.js','seven-eleven.js','familymart.js','content.js']});
      await chrome.tabs.sendMessage(tab.id,{type:'TOGGLE_PANEL'});
    } catch (_) {
      chrome.tabs.create({url:DOWNLOAD_PAGE_URL,active:true});
    }
  }
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(['GET_SEVEN_TASK','SEVEN_LABELS_READY','GET_FAMILY_TASK','FAMILY_LABELS_READY'].includes(message.type)){
    const family=message.type==='GET_FAMILY_TASK' || message.type==='FAMILY_LABELS_READY';
    const adapter=family?globalThis.LHFamilyMart:globalThis.LHSevenEleven;
    const validUrl=family?adapter.isLabelUrl:sevenUrl;
    const getting=message.type==='GET_SEVEN_TASK' || message.type==='GET_FAMILY_TASK';
    if(!validUrl(sender.tab?.url)){sendResponse({ok:false});return;}
    const matches=[...tasks.values()].filter(task=>(family?task.familyMart:task.sevenEleven) && Date.now()<=task.until && (!sender.tab.openerTabId || sender.tab.openerTabId===task.sourceTabId) && (
      getting ? Array.isArray(message.orderIds) && message.orderIds.length===task.orderIds.length && new Set(message.orderIds).size===message.orderIds.length && message.orderIds.every(id=>task.orderIds.includes(id)) : task.sevenPreviews.has(sender.tab.id) && message.taskId===task.taskId
    ));
    if(matches.length!==1){sendResponse({ok:false});return;}
    const task=matches[0];
    if(getting){
      task.sevenPreviews.add(sender.tab.id);backgroundSevenOriginal(task,sender.tab);sendResponse({ok:true,taskId:task.taskId,orderIds:task.orderIds});return;
    }
    if(task.sevenDelivered || task.sevenDelivering){sendResponse({ok:false});return;}
    try{adapter.validateLabels(message.labels,task.orderIds);}catch{sendResponse({ok:false});return;}
    task.sevenDelivering=true;
    chrome.tabs.sendMessage(task.sourceTabId,{type:family?'PREVIEW_FAMILY_LABELS':'PREVIEW_SEVEN_LABELS',taskId:task.taskId,labels:message.labels},response=>{
      task.sevenDelivering=false;
      if(tasks.get(task.sourceTabId)!==task || chrome.runtime.lastError || !response?.ok){sendResponse({ok:false});return;}
      task.sevenDelivered=true;task.sevenLabelTab={id:sender.tab.id,url:sender.tab.url};sendResponse({ok:true});
    });return true;
  }
  if (['START_DOCUMENT_TASK','STOP_DOCUMENT_TASK','REGISTER_DOCUMENT_JOBS','OPEN_BACKGROUND_PREVIEW','COMPLETE_DOCUMENT_TASK','OPEN_BACKGROUND_SEVEN_PREVIEW','OPEN_BACKGROUND_FAMILY_PREVIEW'].includes(message.type)) {
    if (!sourceTab(sender)) {sendResponse({ok:false});return;}
    const sourceId=sender.tab.id;
    if(message.type==='START_DOCUMENT_TASK') {
      if(message.sevenEleven && message.familyMart){sendResponse({ok:false});return;}
      if(typeof message.taskId!=='string' || message.taskId.length>128){sendResponse({ok:false});return;}
      const orderIds=(message.sevenEleven || message.familyMart) ? message.orderIds : [];
      if((message.sevenEleven || message.familyMart) && (!Array.isArray(orderIds) || !orderIds.length || orderIds.length>100 || new Set(orderIds).size!==orderIds.length || orderIds.some(id=>typeof id!=='string' || !/^\d{6}[A-Z0-9]{6,20}$/i.test(id)))){sendResponse({ok:false});return;}
      stopTask(tasks.get(sourceId));
      tasks.set(sourceId,{taskId:message.taskId,sourceTabId:sourceId,until:Date.now()+90000,previews:new Map(),delivered:new Set(),jobIds:new Set(),backgroundTabs:new Set(),openedUrls:new Set(),pendingUrls:new Map(),sevenEleven:Boolean(message.sevenEleven),familyMart:Boolean(message.familyMart),orderIds,sevenPreviews:new Set(),sevenDelivered:false,openedSevenUrls:new Set(),restoredSevenTabs:new Set(),restoringSevenTabs:new Set()});
      sendResponse({ok:true});return;
    }
    const task=tasks.get(sourceId);
    if (message.type==='STOP_DOCUMENT_TASK') {
      if(task && (!message.taskId || task.taskId===message.taskId))stopTask(task);
      sendResponse({ok:true});return;
    }
    if(message.type==='COMPLETE_DOCUMENT_TASK') {
      if(!task || task.taskId!==message.taskId || !task.sevenDelivered || task.finishing){sendResponse({ok:false});return;}
      task.finishing=true;
      const original=task.sevenLabelTab;
      if(!original){stopTask(task);sendResponse({ok:true});return;}
      chrome.tabs.get(original.id,tab=>{
        const missing=chrome.runtime.lastError;
        if(tasks.get(sourceId)!==task){sendResponse({ok:false});return;}
        // Close only the original that delivered this task, if it has not navigated away.
        if(!missing && tab?.url===original.url && (task.familyMart?globalThis.LHFamilyMart.isLabelUrl(tab.url):sevenUrl(tab.url)))chrome.tabs.remove(original.id,()=>void chrome.runtime.lastError);
        stopTask(task);sendResponse({ok:true});
      });return true;
    }
    if(!task || task.taskId!==message.taskId || Date.now()>task.until){sendResponse({ok:false});return;}
    if(message.type==='OPEN_BACKGROUND_SEVEN_PREVIEW' || message.type==='OPEN_BACKGROUND_FAMILY_PREVIEW'){
      const family=message.type==='OPEN_BACKGROUND_FAMILY_PREVIEW';
      if(!(family?task.familyMart:task.sevenEleven) || !(family?globalThis.LHFamilyMart:globalThis.LHSevenEleven).isLaunchUrl(message.url)){sendResponse({ok:false});return;}
      if(task.openedSevenUrls.has(message.url)){sendResponse({ok:true});return;}
      if(task.openedSevenUrls.size>=2){sendResponse({ok:false});return;}
      task.openedSevenUrls.add(message.url);
      chrome.tabs.create({url:message.url,active:false,openerTabId:sourceId,windowId:sender.tab.windowId},tab=>{
        if(chrome.runtime.lastError || !tab?.id){task.openedSevenUrls.delete(message.url);sendResponse({ok:false});return;}
        sendResponse({ok:tasks.get(sourceId)===task});
      });return true;
    }
    if(message.type==='REGISTER_DOCUMENT_JOBS') {
      for (const id of Array.isArray(message.jobIds)?message.jobIds.slice(0,8):[]) if(typeof id==='string' && id.length<=160)task.jobIds.add(id);
      for(const [href,windowId] of task.pendingUrls) {
        const url=previewUrl(href);
        if(task.jobIds.has(url.searchParams.get('job_id'))){task.pendingUrls.delete(href);openPreview(task,url,windowId);}
      }
      sendResponse({ok:true});return;
    }
    const url=previewUrl(message.url);
    if(!url){sendResponse({ok:false});return;}
    if(!task.jobIds.has(url.searchParams.get('job_id'))) {
      if(task.pendingUrls.size>=4){sendResponse({ok:false});return;}
      task.pendingUrls.set(url.href,sender.tab.windowId);sendResponse({ok:true});return;
    }
    openPreview(task,url,sender.tab.windowId,sendResponse);
    return true;
  }
  if(message.type==='GET_PREVIEW_TASK' || message.type==='PREVIEW_PDF_READY') {
    const task=currentTask(sender),url=task?.previews.get(sender.tab?.id);
    if(!task || !url){sendResponse({ok:false});return;}
    if(message.type==='GET_PREVIEW_TASK'){sendResponse({ok:true,taskId:task.taskId});return;}
    if(message.taskId!==task.taskId || task.delivered.has(url) || typeof message.base64!=='string' || message.base64.length>28*1024*1024){sendResponse({ok:false});return;}
    chrome.tabs.sendMessage(task.sourceTabId,{type:'PREVIEW_PDF',taskId:task.taskId,url,base64:message.base64},response=>{
      if(chrome.runtime.lastError || !response?.ok){sendResponse({ok:false});return;}
      task.delivered.add(url);task.backgroundTabs.delete(sender.tab.id);
      chrome.tabs.remove(sender.tab.id,()=>void chrome.runtime.lastError);sendResponse({ok:true});
    });
    return true;
  }
});
chrome.tabs.onUpdated.addListener((tabId,_changeInfo,tab)=>{
  if(_changeInfo.status==='loading')for(const task of tasks.values())if(task.sevenLabelTab?.id===tabId)task.sevenLabelTab=null;
  const task=tasks.get(tab.openerTabId),url=previewUrl(tab.url);
  if(task && (task.familyMart?globalThis.LHFamilyMart.isLabelUrl(tab.url || tab.pendingUrl):sevenUrl(tab.url || tab.pendingUrl)))backgroundSevenOriginal(task,tab);
  if(task && Date.now()<=task.until && url && task.jobIds.has(url.searchParams.get('job_id')))task.previews.set(tabId,url.href);
});
chrome.tabs.onRemoved.addListener(tabId=>{
  stopTask(tasks.get(tabId));
  for(const task of tasks.values()){task.backgroundTabs.delete(tabId);task.previews.delete(tabId);if(task.sevenLabelTab?.id===tabId)task.sevenLabelTab=null;}
});
