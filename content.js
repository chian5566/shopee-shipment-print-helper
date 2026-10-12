(() => {
  if (window.__lhShipmentAssistantLoaded) return;
  window.__lhShipmentAssistantLoaded = true;
  const PANEL_ID = 'lh-shipment-panel';
  const VERSION = '0.10.0-dev';
  const REPORT_URL = 'https://forms.gle/TaJMxYJGf8wVDF7T8';
  let errorDialog;
  let panel;
  let refreshTimer;
  let tasks = [];
  let defaultsApplied = false;
  let activeTask = null;
  let configuredFormats = new WeakSet();
  let chineseFontBytesPromise;
  async function loadChineseFontBytes() {
    if (!chineseFontBytesPromise) {
      chineseFontBytesPromise=fetch(chrome.runtime.getURL('vendor/NotoSansTC.ttf')).then(response=>{
        if (!response.ok) throw new Error('中文字型載入失敗');
        return response.arrayBuffer();
      }).catch(error=>{chineseFontBytesPromise=null;throw error;});
    }
    return chineseFontBytesPromise;
  }
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
        if((chrome.runtime.lastError || !response?.ok) && activeTask===task && !task.cancelled && !task.combinedUrl) failTask(task,'背景文件開啟失敗，請重新下載。',new Error(chrome.runtime.lastError?.message || response?.error || '背景文件開啟失敗'));
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
    const count=panel.querySelector('.lh-count');
    const countText=`已選 ${orders.length} 個訂單`;
    if (count.textContent!==countText) count.textContent=countText;
    const markup = orders.length ? orders.map((order) => {
      const summary=order.summary || '';
      const buyer=summary.split(' ')[0] || '—';
      const time=summary.match(/(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2})\s+\d{1,2}:\d{2}(?::\d{2})?/g)?.at(-1) || '—';
      return `<div class="lh-order"><div class="lh-order-id"><span>訂單編號</span><strong>${escapeHtml(order.orderId)}</strong></div><dl class="lh-order-meta"><dt>買家</dt><dd>${escapeHtml(buyer)}</dd><dt>時間</dt><dd>${escapeHtml(time)}</dd></dl></div>`;
    }).join('') :
      '<div class="lh-order lh-muted">尚未選取訂單</div>';
    // Preserve the actual DOM nodes and text selection on unchanged poll ticks.
    // Cache authored markup: browser serialization can normalize escaped names.
    if (list.__lhOrdersMarkup!==markup) {
      list.innerHTML=markup;list.__lhOrdersMarkup=markup;
    }
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

  const THERMAL_HINT = '助手目前僅支援熱感列印，請將寄件單切換為熱感列印。一般列印仍可使用蝦皮原生下載。';
  function thermalLabelSelected() {
    return [...document.querySelectorAll('input[type="radio"][value="C2C_SHIPPING_LABEL_THERMAL"]')].some(input => {
      const wrapper=input.closest?.('label') || input;
      const visible=!wrapper.getClientRects || wrapper.getClientRects().length>0;
      return visible && input.checked && !input.disabled;
    });
  }

  function assistantMode() {
    if (!isDownloadPage()) return {enabled:false,hint:PAGE_HINT};
    if (!documentCheckbox('寄件單')?.checked || !documentCheckbox('裝箱單')?.checked) {
      return {enabled:false,hint:'請同時勾選寄件單和裝箱單後才可使用'};
    }
    const orders=selectedOrders();
    const sevenCount=orders.filter(order=>/7-ELEVEN/i.test(order.summary)).length;
    if(sevenCount && sevenCount!==orders.length)return {enabled:false,hint:'請將 7-ELEVEN 與其他物流分開下載，避免寄件單格式混用。'};
    if(sevenCount)return {enabled:true,hint:'',sevenEleven:true};
    if (!thermalLabelSelected()) return {enabled:false,hint:THERMAL_HINT};
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
    const mode=assistantMode();
    if (!mode.enabled) {
      if (mode.hint===THERMAL_HINT && !panel?.isConnected) makePanel();
      return;
    }
    const orders=selectedOrders();
    if(!panel?.isConnected)makePanel();
    if(!orders.length) {
      const task={name:'寄件單＋裝箱單',startedAt:Date.now(),orders:[],stage:'讀取已選訂單'};
      tasks.unshift(task);failTask(task,'未讀取到已選訂單，請重新勾選訂單。');return;
    }
    const startedAt=Date.now(),expectedFiles=mode.sevenEleven?(documentCheckbox('撿貨單')?.checked?2:1):2;
    const task={id:startedAt+'-'+Math.random(),name:(mode.sevenEleven?'7-ELEVEN ':'')+'寄件單＋裝箱單 × '+orders.length+' 筆',detail:'正在準備文件…',stage:'等待蝦皮文件',startedAt,orders,expectedFiles,sevenEleven:Boolean(mode.sevenEleven),progress:10};
    activeTask=task;
    document.documentElement.setAttribute('data-lh-background-task',task.id);
    chrome.runtime.sendMessage({type:'START_DOCUMENT_TASK',taskId:task.id,expectedFiles:task.expectedFiles,sevenEleven:task.sevenEleven,orderIds:orders.map(order=>order.orderId)});
    tasks.unshift(task);renderTasks();
    task.waitTimer=window.setTimeout(()=>{if(!task.cancelled && ((task.previewFiles?.length||0)<task.expectedFiles || (task.sevenEleven && !task.sevenLabels)) && !task.combinedUrl && !task.failed)failTask(task,task.sevenEleven?'尚未取得完整文件，請確認 7-ELEVEN 服務單視窗已開啟、圖片載入完成且擴充功能已允許該網站。':'尚未取得完整文件，請重新下載。');},90000);
  }

  function errorInfo(error) {
    if (!error) return null;
    return {name:String(error.name || 'Error'),message:String(error.message || error),stack:String(error.stack || ''),cause:error.cause ? String(error.cause.message || error.cause) : ''};
  }

  function diagnosticText(task) {
    return 'LEISURE HOMME 出貨印單助手｜錯誤回報\n'+JSON.stringify({
      version:VERSION,startedAt:new Date(task.startedAt).toISOString(),failedAt:task.failedAt ? new Date(task.failedAt).toISOString() : null,
      stage:task.stage || '未知階段',message:task.detail,error:task.error || null,
      browser:navigator.userAgent,page:location.origin+location.pathname,
      selectedOrderCount:task.orders?.length || 0,expectedFiles:task.expectedFiles || 0,
      receivedFiles:(task.previewFiles || []).map((file,index)=>({file:index+1,bytes:file.bytes?.byteLength || 0})),
      documents:task.documentInfo || [],packingChecks:task.packingChecks || [],shippingFormat:task.sevenEleven?'7-ELEVEN':'Shopee PDF',receivedSevenLabels:task.sevenLabels?.length || 0
    },null,2);
  }

  function closeErrorDialog() {
    if (errorDialog) {errorDialog.close();errorDialog=null;}
  }

  function showErrorDetails(task,trigger) {
    if (!task?.failed || task.cancelled) return;
    closeErrorDialog();
    const dialog=document.createElement('dialog');errorDialog=dialog;dialog.id='lh-error-dialog';
    dialog.setAttribute('aria-labelledby','lh-error-title');
    dialog.innerHTML=`<div class="lh-error-heading"><h2 id="lh-error-title">錯誤詳情</h2><button type="button" class="lh-error-close" aria-label="關閉錯誤詳情">×</button></div>
      <p>請複製下方錯誤資訊，貼到 Google 表單，協助完善這個功能。</p>
      <textarea class="lh-error-text" aria-label="可複製的錯誤資訊" readonly spellcheck="false"></textarea>
      <p class="lh-error-copy-status" role="status" aria-live="polite"></p>
      <div class="lh-error-actions"><button type="button" class="lh-error-copy">複製錯誤資訊</button><a href="${REPORT_URL}" target="_blank" rel="noopener noreferrer">開啟回報表單 ↗</a><button type="button" class="lh-error-done">關閉</button></div>`;
    const textarea=dialog.querySelector('.lh-error-text');textarea.value=diagnosticText(task);
    const status=dialog.querySelector('.lh-error-copy-status');
    dialog.querySelector('.lh-error-copy').onclick=async()=>{
      try {
        await navigator.clipboard.writeText(textarea.value);status.textContent='已複製，可貼到回報表單。';
      } catch {
        textarea.focus();textarea.select();status.textContent='無法自動複製，已選取全部內容，請按 Ctrl+C（Mac：⌘C）複製。';
      }
    };
    dialog.querySelector('.lh-error-close').onclick=()=>dialog.close();
    dialog.querySelector('.lh-error-done').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{dialog.remove();if(errorDialog===dialog)errorDialog=null;if(trigger?.isConnected)trigger.focus();},{once:true});
    document.documentElement.append(dialog);dialog.showModal();
  }

  function failTask(task,detail,error) {
    task.failed=true;task.progress=0;task.detail=detail;
    task.failedAt=Date.now();task.error=errorInfo(error || new Error(detail));
    for(const timer of [task.waitTimer,task.mergeTimer,task.jobTimer,task.readyTimer])window.clearTimeout(timer);
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK',taskId:task.id});
    if(activeTask===task){activeTask=null;document.documentElement.removeAttribute('data-lh-background-task');}
    renderTasks();
  }

  function releaseTaskFiles(task) {
    for (const url of new Set([task.combinedUrl,...(task.sourceUrls || []),...(task.additionalUrls || [])].filter(Boolean))) URL.revokeObjectURL(url);
    task.combinedUrl=null;task.sourceUrls=[];task.additionalUrls=[];task.previewFiles=[];task.sevenLabels=null;
  }

  function cancelTask(task) {
    task.cancelled=true;task.progress=0;task.detail='任務已取消';
    for(const timer of [task.waitTimer,task.mergeTimer,task.jobTimer,task.readyTimer]) window.clearTimeout(timer);
    releaseTaskFiles(task);
  }

  function clearTasks() {
    closeErrorDialog();
    for (const task of tasks) cancelTask(task);
    activeTask=null;tasks=[];
    document.documentElement.removeAttribute('data-lh-background-task');
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK'});
    renderTasks();
  }

  function markTaskReady(task) {
    task.progress=100;task.detail='文件已完成，可預覽';task.readyAt=Date.now();
    renderTasks();
    task.readyTimer=window.setTimeout(()=>{if(!task.cancelled)renderTasks();},2400);
  }

  function previewTask(task) {
    if (!task?.combinedUrl || task.cancelled || task.failed) return;
    const preview=window.open(task.combinedUrl,'_blank');
    if (!preview) {
      task.previewError='預覽視窗未開啟，請允許彈出視窗後重試。';renderTasks();return;
    }
    task.lastPreviewAt=Date.now();task.previewError='';renderTasks();
  }

  function renderTasks() {
    const slot = panel?.isConnected && panel.querySelector('.lh-tasks');
    if (!slot) return;
    panel.querySelector('.lh-clear-tasks').disabled=tasks.length===0;
    slot.innerHTML = tasks.length ? tasks.map((task, index) => {
      const started=new Date(task.startedAt);
      const time=started.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hourCycle:'h23'});
      const progress=task.cancelled || task.failed ? '' : `<div class="lh-progress"><i style="width:${task.progress || 0}%"></i></div>`;
      const readyAge=task.readyAt ? Date.now()-task.readyAt : 2400;
      const flashing=task.combinedUrl && readyAge>=0 && readyAge<2400 && !task.lastPreviewAt;
      const stateClass=task.combinedUrl ? (task.lastPreviewAt ? ' lh-task-viewed' : ' lh-task-unviewed') : '';
      const animation=flashing ? ` style="--lh-ready-delay:-${readyAge}ms"` : '';
      const previewTime=task.lastPreviewAt ? new Date(task.lastPreviewAt) : null;
      const previewStatus=task.combinedUrl ? `<span class="lh-preview-state">${previewTime ? '已預覽' : '尚未預覽'}</span>${previewTime ? `<time class="lh-task-time" datetime="${previewTime.toISOString()}">上次預覽：${escapeHtml(previewTime.toLocaleString('sv-SE',{timeZone:'Asia/Taipei',hourCycle:'h23'}))}</time>` : ''}` : '';
      const errorActions=task.failed && !task.cancelled ? `<p class="lh-error-report">發生錯誤？請<a href="${REPORT_URL}" target="_blank" rel="noopener noreferrer">回報到 Google 表單</a>，協助完善這個功能。</p><button type="button" class="lh-error-details" data-task="${index}">查看錯誤詳情</button>` : '';
      return `<div class="lh-task${stateClass}${flashing ? ' lh-ready-flash' : ''}"${animation}><b>${escapeHtml(task.name)}</b><time class="lh-task-time" datetime="${started.toISOString()}">開始：${escapeHtml(time)}</time><span>${escapeHtml(task.detail)}</span>${errorActions}${progress}${previewStatus}${task.previewError ? `<span class="lh-preview-error">${escapeHtml(task.previewError)}</span>` : ''}${task.combinedUrl ? '<button class="lh-print" data-task="' + index + '">'+(previewTime ? '再次預覽文件' : '預覽文件')+'</button>' : ''}${task.combinedUrl && task.additionalUrls?.length ? task.additionalUrls.map((url,n)=>`<p><a href="${url}" download="其他文件${n+1}.pdf">下載其他文件</a></p>`).join('') : ''}${task.failed && task.sourceUrls ? task.sourceUrls.map((url,n)=>`<p><a href="${url}" download="蝦皮原始文件${n+1}.pdf">下載原始文件 ${n+1}</a></p>`).join('') : ''}</div>`;
    }).join('') : '<div class="lh-muted">尚無列印任務</div>';
    slot.querySelectorAll('.lh-print').forEach(button=>button.onclick=()=>previewTask(tasks[Number(button.dataset.task)]));
    slot.querySelectorAll('.lh-error-details').forEach(button=>{const task=tasks[Number(button.dataset.task)];button.onclick=()=>showErrorDetails(task,button);});
  }

  async function mergeNativeDocuments(task) {
    if (task.cancelled || task.merging || task.combinedUrl || (task.previewFiles?.length || 0) < task.expectedFiles || (task.sevenEleven && !task.sevenLabels)) return;
    task.merging = true;
    chrome.runtime.sendMessage({type:'STOP_DOCUMENT_TASK',taskId:task.id});
    document.documentElement.removeAttribute('data-lh-background-task');
    try {
      task.stage='載入原始 PDF';
      task.progress = 65; task.detail = '正在處理文件…'; renderTasks();
      const files = task.previewFiles.slice(0, 3).map(file=>file.bytes);
      task.sourceUrls?.forEach(url=>URL.revokeObjectURL(url));
      task.sourceUrls = files.map(bytes=>URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})));
      task.failed = false;
      const { PDFDocument } = window.PDFLib;
      const docs = await Promise.all(files.map((bytes) => PDFDocument.load(bytes)));
      task.documentInfo=docs.map((doc,index)=>({file:index+1,pages:doc.getPageCount(),pageSizes:doc.getPages().map(page=>page.getSize())}));
      task.stage='辨識裝箱單';
      // Parse the table to identify the packing document; both source files may be thermal-sized.
      const pdfjs = await import(chrome.runtime.getURL('vendor/pdf.min.mjs'));
      globalThis.pdfjsWorker ||= await import(chrome.runtime.getURL('vendor/pdf.worker.min.mjs'));
      pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
      const candidates = await Promise.allSettled(files.map(bytes => globalThis.LHPackingSlip.readPacking(bytes, pdfjs)));
      task.packingChecks=candidates.map((result,index)=>result.status==='fulfilled' ? {file:index+1,status:'parsed',orders:result.value.length,rows:result.value.map(section=>section.rows.length)} : {file:index+1,status:'rejected',error:errorInfo(result.reason)});
      const packingIndices = candidates.map((result,index) => result.status === 'fulfilled' && result.value.every(page=>page.orderId) ? index : -1).filter(index => index >= 0);
      if (packingIndices.length !== 1) throw new Error('無法唯一辨識裝箱單。' + candidates.filter(r=>r.status==='rejected').map(r=>r.reason.message).join('；'));
      const packingIndex = packingIndices[0];
      const rowsByPage = candidates[packingIndex].value;
      const labelIndices=docs.map((doc,index)=>index!==packingIndex && (files.length===2 || doc.getPage(0).getWidth()<=320)?index:-1).filter(index=>index>=0);
      if(!task.sevenEleven && labelIndices.length!==1)throw new Error('無法唯一辨識寄件單，請下載原始文件核對');
      const labelIndex=labelIndices[0],label=task.sevenEleven?null:docs[labelIndex];
      task.stage='配對訂單與寄件單';
      task.additionalUrls=task.sourceUrls.filter((url,index)=>index!==packingIndex&&index!==labelIndex);
      if(task.sevenEleven)globalThis.LHSevenEleven.validateLabels(task.sevenLabels,task.orders.map(order=>order.orderId));
      const labelOrderIds = task.sevenEleven?task.sevenLabels.map(item=>item.orderId):await globalThis.LHPackingSlip.readLabelOrderIds(files[labelIndex],pdfjs,rowsByPage.map(p=>p.orderId).filter(Boolean),task.orders);
      if (rowsByPage.length!==task.orders.length || task.orders.some(order=>!rowsByPage.some(p=>p.orderId===order.orderId))) throw new Error('裝箱單與本次已選訂單不符，已停止產生');
      const orderedPacking = globalThis.LHPackingSlip.matchPackingToLabels(rowsByPage,labelOrderIds);
      const out = await PDFDocument.create();
      task.stage='排版裝箱單';
      out.registerFontkit(window.fontkit);
      const font = await out.embedFont(await loadChineseFontBytes(), {subset:false});
      const numberFont = await out.embedFont(window.PDFLib.StandardFonts.CourierBold);
      for (let i=0;i<labelOrderIds.length;i++) {
        const packing=orderedPacking[i];
        if(task.sevenEleven)await globalThis.LHSevenEleven.appendLabel(out,task.sevenLabels[i],window.PDFLib);
        else out.addPage((await out.copyPages(label,[i]))[0]);
        await globalThis.LHPackingSlip.appendRows(out,packing.rows,{font,numberFont},window.PDFLib,packing.buyerNote,packing.orderId);
      }
      if (task.cancelled) return;
      task.stage='儲存合併 PDF';
      const output=await out.save();
      if (task.cancelled) return;
      task.combinedUrl = URL.createObjectURL(new Blob([output], { type: 'application/pdf' }));
      window.clearTimeout(task.waitTimer);
      markTaskReady(task);
    } catch (error) { if(!task.cancelled)failTask(task,`合併失敗：${error.message}`,error); }
    finally { task.merging = false; }
  }

  function refreshPageLayout() {
    // Shopee caches its sticky download panel geometry until resize/scroll.
    document.querySelector('#app')?.getBoundingClientRect?.();
    window.dispatchEvent(new Event('resize'));
  }

  function closePanel() {
    closeErrorDialog();
    panel?.remove();
    document.querySelector('#app')?.classList.remove('lh-page-pushed');
    window.clearInterval(refreshTimer);
    refreshPageLayout();
  }

  function makePanel() {
    panel = document.createElement('aside'); panel.id = PANEL_ID;
    panel.innerHTML = `<div class="lh-head">LEISURE HOMME 出貨印單助手 <small>v${VERSION}</small> <button class="lh-close" title="關閉">×</button></div>
      <div class="lh-body"><p class="lh-section-title"><span class="lh-count">已選 0 個訂單</span></p><div class="lh-orders"></div>
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
    if(!selectedOrders().some(order=>/7-ELEVEN/i.test(order.summary)))defaultFormat('寄件單','C2C_SHIPPING_LABEL_THERMAL');
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
        task.stage='讀取蝦皮文件';
        if(typeof message.base64!=='string' || message.base64.length>28*1024*1024)throw new Error('文件過大或格式無效');
        const raw=atob(message.base64);
        if (!raw.startsWith('%PDF-')) throw new Error('蝦皮預覽未提供有效 PDF');
        const bytes=Uint8Array.from(raw,char=>char.charCodeAt(0)).buffer;
        task.previewFiles ||= [];
        if (!task.previewFiles.some(file=>file.url===message.url)) task.previewFiles.push({url:message.url,bytes});
        sendResponse?.({ok:true});
      } catch (error) {sendResponse?.({ok:false});failTask(task,`文件讀取失敗：${error.message}`,error);return;}
      task.detail = '正在處理文件…'; task.progress = 55; renderTasks();
      if (task.previewFiles.length >= task.expectedFiles && !task.merging) {
        window.clearTimeout(task.mergeTimer);
        task.mergeTimer=window.setTimeout(()=>mergeNativeDocuments(task),600);
      }
      return;
    }
    if(message.type==='PREVIEW_SEVEN_LABELS'){
      const task=activeTask;if(!task?.sevenEleven || task.cancelled || task.failed || task.combinedUrl || message.taskId!==task.id || task.sevenLabels){sendResponse?.({ok:false});return;}
      try{globalThis.LHSevenEleven.validateLabels(message.labels,task.orders.map(order=>order.orderId));task.sevenLabels=message.labels;sendResponse?.({ok:true});}
      catch(error){sendResponse?.({ok:false});failTask(task,`7-ELEVEN 文件讀取失敗：${error.message}`,error);return;}
      task.detail='7-ELEVEN 寄件單已取得，正在核對装箱單…';renderTasks();
      window.clearTimeout(task.mergeTimer);task.mergeTimer=window.setTimeout(()=>mergeNativeDocuments(task),600);return;
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
