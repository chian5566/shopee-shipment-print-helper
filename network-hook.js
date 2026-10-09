(() => {
  if (window.__lhShipmentNetworkHookLoaded) return;
  window.__lhShipmentNetworkHookLoaded = true;
  const jobTasks=new Map();
  function jobs(value,depth=0) {
    if(!value || typeof value!=='object' || depth>6)return [];
    return [...new Set([value.jobId,value.job_id,...Object.values(value).flatMap(child=>jobs(child,depth+1))].filter(id=>typeof id==='string' && id.length<=160))];
  }
  function notifyJobs(data,taskId) {
    if(!taskId)return;
    for(const id of jobs(data)) jobTasks.set(id,taskId);
    while(jobTasks.size>32)jobTasks.delete(jobTasks.keys().next().value);
    window.postMessage({source:'lh-print',type:'SD_JOB',taskId,data},'*');
  }
  const originalWindowOpen=window.open;
  window.open=function(url,...args) {
    const taskId=document.documentElement.getAttribute('data-lh-background-task');
    let target;
    try { target=new URL(String(url),location.href); } catch (_) {}
    const isPreview=target?.origin==='https://seller.shopee.tw' && target.pathname==='/awbprint' && target.searchParams.has('job_id');
    const owner=isPreview && jobTasks.get(target.searchParams.get('job_id'));
    if (owner && owner!==taskId) return null; // Discard a cancelled task's late preview.
    if (taskId && isPreview) {
      window.postMessage({source:'lh-print',type:'BACKGROUND_PREVIEW',taskId,url:target.href},'*');
      return null; // Shopee uses noopener and does not retain a preview handle.
    }
    return originalWindowOpen.call(this,url,...args);
  };
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const taskId=document.documentElement.getAttribute('data-lh-background-task');
    const response = await originalFetch(...args);
    const url = String(args[0]?.url || args[0] || '');
    if (url.includes('/logistics/create_sd_jobs')) {
      response.clone().json().then(data=>notifyJobs(data,taskId)).catch(() => {});
    }
    return response;
  };
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__lhUrl = String(url || '');
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function(...args) {
    const taskId=document.documentElement.getAttribute('data-lh-background-task');
    this.addEventListener('load', () => {
      if (!this.__lhUrl.includes('/logistics/create_sd_jobs')) return;
      try {
        const data = typeof this.response === 'object' && this.response ? this.response : JSON.parse(this.responseText);
        notifyJobs(data,taskId);
      } catch (_) {}
    });
    return originalSend.apply(this, args);
  };
})();
