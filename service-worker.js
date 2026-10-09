// Only in-memory state. Each source tab owns its own task and preview tabs.
const tasks=new Map();
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
function currentTask(sender) {
  const tab=sender.tab;if(!tab)return null;
  const url=previewUrl(tab.url);
  const matches=[...tasks.values()].filter(task=>Date.now()<=task.until && (task.previews.has(tab.id) || (url && task.jobIds.has(url.searchParams.get('job_id')))));
  if (matches.length!==1)return null;
  const task=matches[0];
  if (url)task.previews.set(tab.id,url.href);
  return task;
}
chrome.action.onClicked.addListener(async tab=>{
  if (!tab.id || !tab.url?.startsWith(SOURCE)) return;
  try {await chrome.tabs.sendMessage(tab.id,{type:'TOGGLE_PANEL'});}catch (_) {}
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if (['START_DOCUMENT_TASK','STOP_DOCUMENT_TASK','REGISTER_DOCUMENT_JOBS','OPEN_BACKGROUND_PREVIEW'].includes(message.type)) {
    if (!sourceTab(sender)) {sendResponse({ok:false});return;}
    const sourceId=sender.tab.id;
    if(message.type==='START_DOCUMENT_TASK') {
      if(typeof message.taskId!=='string' || message.taskId.length>128){sendResponse({ok:false});return;}
      stopTask(tasks.get(sourceId));
      tasks.set(sourceId,{taskId:message.taskId,sourceTabId:sourceId,until:Date.now()+90000,previews:new Map(),delivered:new Set(),jobIds:new Set(),backgroundTabs:new Set(),openedUrls:new Set(),pendingUrls:new Map()});
      sendResponse({ok:true});return;
    }
    const task=tasks.get(sourceId);
    if (message.type==='STOP_DOCUMENT_TASK') {
      if(task && (!message.taskId || task.taskId===message.taskId))stopTask(task);
      sendResponse({ok:true});return;
    }
    if(!task || task.taskId!==message.taskId || Date.now()>task.until){sendResponse({ok:false});return;}
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
  const task=tasks.get(tab.openerTabId),url=previewUrl(tab.url);
  if(task && Date.now()<=task.until && url && task.jobIds.has(url.searchParams.get('job_id')))task.previews.set(tabId,url.href);
});
chrome.tabs.onRemoved.addListener(tabId=>{
  stopTask(tasks.get(tabId));
  for(const task of tasks.values()){task.backgroundTabs.delete(tabId);task.previews.delete(tabId);}
});
