(() => {
  const startedAt=Date.now();
  let busy=false,finished=false;
  const send=message=>new Promise(resolve=>chrome.runtime.sendMessage(message,response=>{
    if (chrome.runtime.lastError) {console.warn('LH preview: '+chrome.runtime.lastError.message);resolve(null);} else resolve(response);
  }));
  async function readPreview() {
    if (busy || finished) return;
    if (Date.now()-startedAt>180000) {window.clearInterval(timer);return;}
    const frame=document.querySelector('iframe[type="application/pdf"]');
    const failed=globalThis.LHShopeeDownloadError?.visibleTitles(document).length;
    if (!failed && !frame?.src) return;
    busy=true;
    try {
      const task=await send({type:'GET_PREVIEW_TASK'});
      if (!task?.ok) return; // Leave ordinary Shopee previews untouched.
      if (failed) {
        const result=await send({type:'PREVIEW_DOWNLOAD_FAILED',taskId:task.taskId});
        if (result?.ok) {finished=true;window.clearInterval(timer);}
        return;
      }
      const url=new URL(frame.src,location.href);
      if (url.origin!==location.origin || !['blob:','https:'].includes(url.protocol)) return;
      url.hash='';
      const response=await fetch(url.href,{credentials:'include'});
      if (!response.ok) return;
      const bytes=new Uint8Array(await response.arrayBuffer());
      if (bytes.length>20*1024*1024 || new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') return;
      const parts=[];
      for (let i=0;i<bytes.length;i+=32768) parts.push(String.fromCharCode(...bytes.subarray(i,i+32768)));
      const result=await send({type:'PREVIEW_PDF_READY',taskId:task.taskId,base64:btoa(parts.join(''))});
      if (result?.ok) {finished=true;window.clearInterval(timer);}
    } catch (error) { if (!readPreview.failed) {console.warn('LH preview: '+error.message);readPreview.failed=true;} }
    finally {busy=false;}
  }
  const timer=window.setInterval(readPreview,1000);
  readPreview();
})();
