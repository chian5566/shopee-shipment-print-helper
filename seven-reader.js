(() => {
  if(window.__lhSevenReaderLoaded || !globalThis.LHSevenEleven.isLabelUrl(location.href))return;
  window.__lhSevenReaderLoaded=true;
  const started=Date.now();let busy=false,finished=false;
  const send=message=>new Promise(resolve=>chrome.runtime.sendMessage(message,response=>{if(chrome.runtime.lastError)resolve(null);else resolve(response);}));
  async function readLabels(){
    if(busy || finished)return;
    if(Date.now()-started>90000){window.clearInterval(timer);return;}
    const frames=[...document.querySelectorAll('.div_frame')];
    if(!frames.length)return;
    const orderIds=frames.map(frame=>frame.querySelector('[id$="lblOrderNo"]')?.textContent?.trim());
    if(orderIds.some(id=>!/^\d{6}[A-Z0-9]{6,20}$/i.test(id || '')))return;
    busy=true;
    try{
      const task=await send({type:'GET_SEVEN_TASK',orderIds});
      if(!task?.ok)return; // Ordinary 7-ELEVEN pages stay untouched.
      await document.fonts.ready;
      const labels=[];
      for(let i=0;i<frames.length;i++){
        const frame=frames[i],node=frame.parentElement;
        const images=[...node.querySelectorAll('img')];
        if(images.length<2 || images.some(image=>!image.complete || !image.naturalWidth))return;
        const rect=node.getBoundingClientRect();
        const canvas=await globalThis.html2canvas(node,{scale:3,backgroundColor:'#ffffff',logging:false,allowTaint:false,useCORS:false});
        labels.push({orderId:orderIds[i],png:canvas.toDataURL('image/png'),width:rect.width,height:rect.height});
      }
      globalThis.LHSevenEleven.validateLabels(labels,task.orderIds);
      const result=await send({type:'SEVEN_LABELS_READY',taskId:task.taskId,labels});
      if(result?.ok){finished=true;window.clearInterval(timer);}
    }catch(error){console.warn('LH 7-ELEVEN: '+error.message);}
    finally{busy=false;}
  }
  const timer=window.setInterval(readLabels,500);readLabels();
})();
