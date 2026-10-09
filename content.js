(() => {
  if (window.__lhShipmentAssistantLoaded) return;
  window.__lhShipmentAssistantLoaded = true;
  const PANEL_ID = 'lh-shipment-panel';
  const VERSION = '0.8.15';
  let panel;
  let refreshTimer;
  let tasks = [];
  let defaultsApplied = false;
  let activeTask = null;
  let configuredFormats = new WeakSet();
  function findJobId(value, depth = 0) {
    if (!value || depth > 6) return null;
    if (typeof value === 'object') {
      if (value.jobId || value.job_id) return value.jobId || value.job_id;
      for (const child of Object.values(value)) { const found = findJobId(child, depth + 1); if (found) return found; }
    }
    return null;
  }
  function findJobIds(value, depth = 0) {
    if (!value || typeof value!=='object' || depth>6) return [];
    const own=[value.jobId,value.job_id].filter(id=>typeof id==='string');
    return [...new Set([...own,...Object.values(value).flatMap(child=>findJobIds(child,depth+1))])];
  }
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data?.source === 'lh-print' && event.data.type === 'BACKGROUND_PREVIEW') {
      const task=activeTask;
      if (task && !task.cancelled && !task.failed && event.data.taskId===task.id) chrome.runtime.sendMessage({type:'OPEN_BACKGROUND_PREVIEW',taskId:task.id,url:event.data.url},response=>{
        if((chrome.runtime.lastError || !response?.ok) && activeTask===task && !task.cancelled && !task.combinedUrl) failTask(task,'背景文件開啟失敗，請重新下載。');
      });
      return;
    }
    if (event.source !== window || event.data?.source !== 'lh-print' || event.data.type !== 'SD_JOB') return;
    const task = activeTask; const jobIds = findJobIds(event.data.data);
    if (task && event.data.taskId===task.id && !task.cancelled && !task.failed && !task.combinedUrl && jobIds.length) {
      task.jobIds ||= [];
      for (const jobId of jobIds) if (!task.jobIds.includes(jobId)) task.jobIds.push(jobId);
      chrome.runtime.sendMessage({type:'REGISTER_DOCUMENT_JOBS',taskId:task.id,jobIds:task.jobIds});
      task.progress = 45; task.detail = '正在準備文件…'; renderTasks();
      window.clearTimeout(task.jobTimer);
      // Preview URLs, rather than job count, determine when the files are ready.
    }
  });

  function clean(value) { return (value || '').replace(/\s+/g, ' ').trim(); }

  function selectedOrders() {
    // Shopee 的訂單編號是英數混合（例如 250101TEST0001），且勾選框位於
    // .mass-ship-row 裡；不可把它誤判為純數字編號或只從 a 標籤向上一層找資料。
    const rows = [...document.querySelectorAll('.mass-ship-row')]
      .filter((row) => row.querySelector('input[type="checkbox"]:checked'));
    return rows.map((row) => {
      const link = row.querySelector('a[href*="/portal/sale/order/"]');
      const orderId = clean(link?.textContent);
      const packageId = link?.getAttribute('href')?.match(/\/order\/(\d+)/)?.[1] || '';
      const parts = clean(row.innerText).split(' ').filter(Boolean);
      const summary = parts.filter((part) => !['寄件單', '裝箱單', '撿貨單', orderId].includes(part)).join(' ');
      return orderId ? { orderId, packageId, summary } : null;
    }).filter(Boolean);
  }

  function renderOrders() {
    if (!panel?.isConnected) return [];
    const orders = selectedOrders();
    const list = panel.querySelector('.lh-orders');
    panel.querySelector('.lh-count').textContent = orders.length;
    list.innerHTML = orders.length ? orders.map((order) => {
      const parts = (order.summary || '').split(' '); const buyer = parts[0] || '-'; const tracking = parts.find((part) => /^TW[A-Z0-9]+$/i.test(part)) || '-'; const time = parts.slice(-2).join(' ') || '-';
      return `<div class="lh-order"><strong>${escapeHtml(order.orderId)}</strong><div class="lh-order-meta"><span>買家 ${escapeHtml(buyer)}</span><span>追蹤 ${escapeHtml(tracking)}</span><span>${escapeHtml(time)}</span></div></div>`;
    }).join('') :
      '<div class="lh-order lh-muted">尚未選取訂單</div>';
    return orders;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[c]);
  }

  function documentCheckbox(title) {
    // Shopee can retain hidden copies of document controls during a Vue update.
    // Match the checkbox's own label, not the text of the whole document group.
    const visible=node=>!node?.getClientRects || node.getClientRects().length>0;
    const candidates=[...document.querySelectorAll('input[type="checkbox"]')].filter(input=>{
      if(input.closest?.('.mass-ship-row, #lh-shipment-panel'))return false;
      const label=input.closest?.('label') || input.labels?.[0];
      const wrapper=input.closest?.('[role="checkbox"], .shopee-checkbox, .ant-checkbox-wrapper');
      if(!visible(input)&&!visible(label||wrapper||input))return false;
      const labelText=clean(label?.innerText || label?.textContent || '');
      const aria=clean(input.getAttribute?.('aria-label'));
      if(input.value===title || aria===title || labelText===title || labelText.startsWith(title+' '))return true;
      const parent=label?.parentElement;
      return parent?.querySelectorAll?.('input[type="checkbox"]').length===1 && clean(parent.innerText||parent.textContent).startsWith(title);
    });
    return candidates.find(input=>input.checked) || candidates[0];
  }

  const DOWNLOAD_PAGE_URL = 'https://seller.shopee.tw/portal/sale/mass/ship?mass_shipment_tab=301';
  const PAGE_HINT = '請前往蝦皮「批次出貨 → 下載出貨文件」頁面使用出貨助手。';
  function isDownloadPage() {
    if (!/^\/portal\/sale\/mass\/ship(?:\/|$)/.test(location.pathname)) return false;
    // The route also contains earlier shipping steps; require mounted download controls.
    return Boolean(documentCheckbox('寄件單') && documentCheckbox('裝箱單')) ||
      [...document.querySelectorAll('button, [role="button"]')].some(button =>
        !button.closest?.('#lh-shipment-panel') &&
        (!button.getClientRects || button.getClientRects().length > 0) &&
        clean(button.textContent).replace(/\s/g, '').includes('下載所選文件'));
  }

  function assistantMode() {
    if (!isDownloadPage()) return {enabled:false,hint:PAGE_HINT};
    if (!documentCheckbox('寄件單')?.checked || !documentCheckbox('裝箱單')?.checked) {
      return {enabled:false,hint:'請同時勾選寄件單和裝箱單後才可使用'};
    }
    return {enabled:true,hint:''};
  }

  function renderMode() {
    const hint=panel?.isConnected && panel.querySelector('.lh-mode-hint');
    if (!hint) return;
    const mode=assistantMode();
    hint.textContent=mode.hint;
    if (mode.hint===PAGE_HINT) {
      hint.innerHTML=`請前往蝦皮「<a href="${DOWNLOAD_PAGE_URL}" style="color:inherit;text-decoration:underline">批次出貨 → 下載出貨文件</a>」頁面使用出貨助手。`;
    }
    hint.hidden=mode.enabled;
    hint.style?.setProperty('display',mode.enabled?'none':'block','important');
  }

  function handleNativeDownload(event) {
    if (!isDownloadPage()) return;
    const native=event.target?.closest?.('button, [role="button"]');
    if(!native || native.disabled || !clean(native.textContent).replace(/\s/g,'').includes('下載所選文件'))return;
    if (activeTask && !activeTask.combinedUrl && !activeTask.failed) {
      cancelTask(activeTask);
    }
    activeTask=null;
    document.documentElement.removeAttribute('data-lh-background-task');
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK'});
    renderMode();renderTasks();
    if(!assistantMode().enabled)return;
    const orders=selectedOrders();
    if(!panel?.isConnected)makePanel();
    if(!orders.length) {
      tasks.unshift({name:'寄件單＋裝箱單',detail:'未讀取到已選訂單，請重新勾選訂單。',startedAt:Date.now(),failed:true,progress:0});
      renderTasks();return;
    }
    const startedAt=Date.now(),expectedFiles=2;
    const task={id:startedAt+'-'+Math.random(),name:'寄件單＋裝箱單 × '+orders.length+' 筆',detail:'正在準備文件…',startedAt,orders,expectedFiles,progress:10};
    activeTask=task;
    document.documentElement.setAttribute('data-lh-background-task',task.id);
    chrome.runtime.sendMessage({type:'START_DOCUMENT_TASK',taskId:task.id,expectedFiles:task.expectedFiles});
    tasks.unshift(task);renderTasks();
    task.waitTimer=window.setTimeout(()=>{if(!task.cancelled && (task.previewFiles?.length||0)<task.expectedFiles && !task.combinedUrl && !task.failed)failTask(task,'尚未取得完整文件，請重新下載。');},90000);
  }

  function failTask(task,detail) {
    task.failed=true;task.progress=0;task.detail=detail;
    for(const timer of [task.waitTimer,task.mergeTimer,task.jobTimer])window.clearTimeout(timer);
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK',taskId:task.id});
    if(activeTask===task){activeTask=null;document.documentElement.removeAttribute('data-lh-background-task');}
    renderTasks();
  }

  function releaseTaskFiles(task) {
    for (const url of new Set([task.combinedUrl,...(task.sourceUrls || []),...(task.additionalUrls || [])].filter(Boolean))) URL.revokeObjectURL(url);
    task.combinedUrl=null;task.sourceUrls=[];task.additionalUrls=[];task.previewFiles=[];
  }

  function cancelTask(task) {
    task.cancelled=true;task.progress=0;task.detail='任務已取消';
    for(const timer of [task.waitTimer,task.mergeTimer,task.jobTimer]) window.clearTimeout(timer);
    releaseTaskFiles(task);
  }

  function clearTasks() {
    for (const task of tasks) cancelTask(task);
    activeTask=null;tasks=[];
    document.documentElement.removeAttribute('data-lh-background-task');
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK'});
    renderTasks();
  }

  function renderTasks() {
    const slot = panel?.isConnected && panel.querySelector('.lh-tasks');
    if (!slot) return;
    panel.querySelector('.lh-clear-tasks').disabled=tasks.length===0;
    slot.innerHTML = tasks.length ? tasks.map((task, index) => {
      const started=new Date(task.startedAt);
      const time=started.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hourCycle:'h23'});
      const progress=task.cancelled || task.failed ? '' : `<div class="lh-progress"><i style="width:${task.progress || 0}%"></i></div>`;
      return `<div class="lh-task"><b>${escapeHtml(task.name)}</b><time class="lh-task-time" datetime="${started.toISOString()}">開始：${escapeHtml(time)}</time><span>${escapeHtml(task.detail)}</span>${progress}${task.combinedUrl ? '<button class="lh-print" data-task="' + index + '">列印</button>' : ''}${task.combinedUrl && task.additionalUrls?.length ? task.additionalUrls.map((url,n)=>`<p><a href="${url}" download="其他文件${n+1}.pdf">下載其他文件</a></p>`).join('') : ''}${task.failed && task.sourceUrls ? task.sourceUrls.map((url,n)=>`<p><a href="${url}" download="蝦皮原始文件${n+1}.pdf">下載原始文件 ${n+1}</a></p>`).join('') : ''}</div>`;
    }).join('') : '<div class="lh-muted">尚無列印任務</div>';
    slot.querySelectorAll('.lh-print').forEach((button) => button.onclick = () => window.open(tasks[Number(button.dataset.task)].combinedUrl, '_blank'));
  }

  async function mergeNativeDocuments(task) {
    if (task.cancelled || task.merging || task.combinedUrl || (task.previewFiles?.length || 0) < task.expectedFiles) return;
    task.merging = true;
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK',taskId:task.id});
    document.documentElement.removeAttribute('data-lh-background-task');
    try {
      task.progress = 65; task.detail = '正在處理文件…'; renderTasks();
      const files = task.previewFiles.slice(0, 3).map(file=>file.bytes);
      task.sourceUrls?.forEach(url=>URL.revokeObjectURL(url));
      task.sourceUrls = files.map(bytes=>URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})));
      task.failed = false;
      const { PDFDocument } = window.PDFLib;
      const docs = await Promise.all(files.map((bytes) => PDFDocument.load(bytes)));
      // Parse the table to identify the packing document; both source files may be thermal-sized.
      const pdfjs = await import(chrome.runtime.getURL('vendor/pdf.min.mjs'));
      globalThis.pdfjsWorker ||= await import(chrome.runtime.getURL('vendor/pdf.worker.min.mjs'));
      pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
      const candidates = await Promise.allSettled(files.map(bytes => globalThis.LHPackingSlip.readPacking(bytes, pdfjs)));
      const packingIndices = candidates.map((result,index) => result.status === 'fulfilled' && result.value.every(page=>page.orderId) ? index : -1).filter(index => index >= 0);
      if (packingIndices.length !== 1) throw new Error('無法唯一辨識裝箱單。' + candidates.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('；'));
      const packingIndex = packingIndices[0];
      const rowsByPage = candidates[packingIndex].value;
      const labelIndices=docs.map((doc,index)=>index!==packingIndex && (files.length===2 || doc.getPage(0).getWidth()<=320)?index:-1).filter(index=>index>=0);
      if(labelIndices.length!==1)throw new Error('無法唯一辨識寄件單，請下載原始文件核對');
      const labelIndex=labelIndices[0],label=docs[labelIndex];
      task.additionalUrls=task.sourceUrls.filter((url,index)=>index!==packingIndex&&index!==labelIndex);
      const labelOrderIds = await globalThis.LHPackingSlip.readLabelOrderIds(files[labelIndex],pdfjs,rowsByPage.map(p=>p.orderId).filter(Boolean),task.orders);
      if (rowsByPage.length!==task.orders.length || task.orders.some(order=>!rowsByPage.some(p=>p.orderId===order.orderId))) throw new Error('裝箱單與本次已選訂單不符，已停止產生');
      const orderedPacking = globalThis.LHPackingSlip.matchPackingToLabels(rowsByPage,labelOrderIds);
      const out = await PDFDocument.create();
      out.registerFontkit(window.fontkit);
      const fontResponse = await fetch(chrome.runtime.getURL('vendor/NotoSansTC.ttf'));
      if (!fontResponse.ok) throw new Error('中文字型載入失敗');
      const font = await out.embedFont(await fontResponse.arrayBuffer(), {subset:false});
      const numberFont = await out.embedFont(window.PDFLib.StandardFonts.HelveticaBold);
      for (let i=0;i<label.getPageCount();i++) {
        const packing=orderedPacking[i];
        out.addPage((await out.copyPages(label,[i]))[0]);
        await globalThis.LHPackingSlip.appendRows(out,packing.rows,{font,numberFont},window.PDFLib,packing.buyerNote,packing.orderId);
      }
      if (task.cancelled) return;
      const output=await out.save();
      if (task.cancelled) return;
      task.combinedUrl = URL.createObjectURL(new Blob([output], { type: 'application/pdf' }));
      window.clearTimeout(task.waitTimer);
      task.progress = 100; task.detail = '文件已完成'; renderTasks();
    } catch (error) { if(!task.cancelled)failTask(task,`合併失敗：${error.message}`); }
    finally { task.merging = false; }
  }

  function refreshPageLayout() {
    // Shopee caches its sticky download panel geometry until resize/scroll.
    document.querySelector('#app')?.getBoundingClientRect?.();
    window.dispatchEvent(new Event('resize'));
  }

  function closePanel() {
    panel?.remove();
    document.querySelector('#app')?.classList.remove('lh-page-pushed');
    window.clearInterval(refreshTimer);
    refreshPageLayout();
  }

  function makePanel() {
    panel = document.createElement('aside'); panel.id = PANEL_ID;
    panel.innerHTML = `<div class="lh-head">LEISURE HOMME 出貨印單助手 <small>v${VERSION}</small> <button class="lh-close" title="關閉">×</button></div>
      <div class="lh-body"><p class="lh-section-title">已選訂單 <span class="lh-count">0</span></p><div class="lh-orders"></div>
      <div class="lh-mode-hint lh-warning" role="status" hidden></div>
      <hr><div class="lh-task-heading"><p class="lh-section-title">列印任務</p><button class="lh-clear-tasks" type="button">清除所有任務</button></div><div class="lh-tasks"></div></div>`;
    document.documentElement.append(panel);
    document.querySelector('#app')?.classList.add('lh-page-pushed');
    refreshPageLayout();
    panel.querySelector('.lh-close').onclick = closePanel;
    panel.querySelector('.lh-clear-tasks').onclick=clearTasks;
    renderOrders();
    renderTasks();
    renderMode();
    // 蝦皮以 Vue 動態更新勾選狀態；輪詢只更新本機面板，不讀取或傳送資料。
    window.clearInterval(refreshTimer);
    refreshTimer = window.setInterval(() => { renderOrders(); renderMode(); }, 500);
  }

  function configureShopeeDefaults() {
    if (!isDownloadPage()) { renderMode(); return; }
    const header = document.querySelector('.mass-ship-header input[type="checkbox"]');
    // Select all only on initial setup. A later manual deselection must stay deselected.
    if (!defaultsApplied && header && !header.disabled) {
      defaultsApplied = true;
      if (!header.checked) header.click();
    }
    if (![...document.querySelectorAll('.mass-ship-row')].some(row=>row.querySelector('input[type="checkbox"]:checked'))) {
      configuredFormats=new WeakSet();renderMode();return;
    }
    // Default a newly mounted format control once; preserve subsequent edits.
    const defaultFormat=(title,value)=>{
      if (!documentCheckbox(title)?.checked) return;
      const input=document.querySelector(`input[type="radio"][value="${value}"]`);
      if (!input || input.disabled || configuredFormats.has(input)) return;
      configuredFormats.add(input);if (!input.checked) input.click();
    };
    defaultFormat('寄件單','C2C_SHIPPING_LABEL_THERMAL');
    defaultFormat('裝箱單','PACKING_LIST_PDF');
    renderMode();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_PAGE_STATUS') {
      sendResponse?.({ok:true,downloadPage:isDownloadPage()}); return;
    }
    if (message.type === 'OPEN_PANEL') {
      if (!document.getElementById(PANEL_ID)) makePanel();
      else renderMode();
      sendResponse?.({ok:true,downloadPage:isDownloadPage()}); return;
    }
    if (message.type === 'PREVIEW_PDF') {
      const task = activeTask; if (!task || task.cancelled || task.failed || task.combinedUrl || message.taskId !== task.id) return;
      try {
        if(typeof message.base64!=='string' || message.base64.length>28*1024*1024)throw new Error('文件過大或格式無效');
        const raw=atob(message.base64);
        if (!raw.startsWith('%PDF-')) throw new Error('蝦皮預覽未提供有效 PDF');
        const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0)).buffer;
        task.previewFiles ||= [];
        if (!task.previewFiles.some(file=>file.url===message.url)) task.previewFiles.push({url:message.url,bytes});
        sendResponse?.({ok:true});
      } catch (error) {sendResponse?.({ok:false});failTask(task,`文件讀取失敗：${error.message}`);return;}
      task.detail = '正在處理文件…'; task.progress = 55; renderTasks();
      if (task.previewFiles.length >= task.expectedFiles && !task.merging) {
        window.clearTimeout(task.mergeTimer);
        task.mergeTimer=window.setTimeout(()=>mergeNativeDocuments(task),600);
      }
      return;
    }
    if (message.type === 'PREVIEW_URL') return; // Ignore notifications from an older worker.
    const existing = document.getElementById(PANEL_ID);
    if (message.type !== 'TOGGLE_PANEL') return;
    else if (existing) closePanel();
    else makePanel();
  });
  document.addEventListener('click',handleNativeDownload,true);
  window.addEventListener('pagehide',clearTasks);
  document.addEventListener('change', () => window.setTimeout(configureShopeeDefaults, 0));
  window.setInterval(configureShopeeDefaults, 250);
})();
