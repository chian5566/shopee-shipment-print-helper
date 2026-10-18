(() => {
  if(window.__lhFamilyReaderLoaded || !globalThis.LHFamilyMart.isLabelUrl(location.href))return;
  window.__lhFamilyReaderLoaded=true;
  const started=Date.now();let busy=false,finished=false,labels;
  const send=message=>new Promise(resolve=>chrome.runtime.sendMessage(message,response=>{if(chrome.runtime.lastError)resolve(null);else resolve(response);}));
  async function readLabels(){
    if(busy || finished)return;
    if(Date.now()-started>90000){window.clearInterval(timer);return;}
    const images=[...document.querySelectorAll('#form1 img')];
    if(!images.length || images.length>25 || images.some(i=>!i.complete || !i.naturalWidth))return;
    busy=true;
    try{
      labels ||= images.flatMap(image=>globalThis.LHFamilyMart.captureSheet(image,()=>document.createElement('canvas'),globalThis.jsQR));
      const orderIds=labels.map(label=>label.orderId);
      const task=await send({type:'GET_FAMILY_TASK',orderIds});
      if(!task?.ok)return; // No matched task: leave ordinary originals open.
      globalThis.LHFamilyMart.validateLabels(labels,task.orderIds);
      const result=await send({type:'FAMILY_LABELS_READY',taskId:task.taskId,labels});
      if(result?.ok){finished=true;window.clearInterval(timer);}
    }catch(error){if(!readLabels.reported){console.warn('LH 全家: '+error.message);readLabels.reported=true;}}
    finally{busy=false;}
  }
  const timer=window.setInterval(readLabels,500);readLabels();
})();
