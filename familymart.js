(function(root){
  function isLabelUrl(value){try{const u=new URL(value);return u.origin==='https://api.sls.shopee.tw' && u.pathname==='/api/logistic/familymart/shipping_label';}catch{return false;}}
  function isLaunchUrl(value){try{const u=new URL(value);return isLabelUrl(value) || (u.origin==='https://sellerfulfilment-shipment-sea.cache.susercontent.com' && /^\/sd-[a-z0-9-]+\/[A-Za-z0-9_-]+--html_c2c_shipping_label_redirect\.html$/.test(u.pathname));}catch{return false;}}
  function orderFromQr(data){
    // The final field is Shopee's order number. Do not infer identity from image order.
    const id=String(data || '').split('||').at(-1).trim();
    if(!/^\d{6}[A-Z0-9]{6,20}$/i.test(id))throw new Error('全家 QR 無法辨識蝦皮訂單編號');
    return id;
  }
  function validateLabels(labels,orderIds){
    if(!Array.isArray(labels) || !labels.length || labels.length>100 || labels.length!==orderIds.length || new Set(orderIds).size!==orderIds.length)throw new Error('全家寄件單與已選訂單數量不符');
    let bytes=0;const ids=[];
    for(const label of labels){
      if(!label || !orderIds.includes(label.orderId) || !/^\d{6}[A-Z0-9]{6,20}$/i.test(label.orderId || ''))throw new Error('全家寄件單訂單編號不符');
      if(!Number.isInteger(label.width) || !Number.isInteger(label.height) || label.width<100 || label.height<200 || label.width>1400 || label.height>2200)throw new Error('全家寄件單圖片尺寸無效');
      if(typeof label.png!=='string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(label.png))throw new Error('全家寄件單圖片格式無效');
      bytes+=label.png.length;ids.push(label.orderId);
    }
    if(new Set(ids).size!==ids.length || bytes>28*1024*1024)throw new Error('全家寄件單重複或資料過大');
    return labels;
  }
  function captureSheet(image,createCanvas,decode){
    // Verified native template: a 2 x 2 sheet. Stop on layout changes rather than cut a label.
    if(image.naturalWidth!==2615 || image.naturalHeight!==4271)throw new Error('全家原單版型已變更，請使用原始文件並回報');
    const labels=[];
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){
      const x=Math.round(col*image.naturalWidth/2),y=Math.round(row*image.naturalHeight/2);
      const width=Math.round((col+1)*image.naturalWidth/2)-x,height=Math.round((row+1)*image.naturalHeight/2)-y;
      const canvas=createCanvas();canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,x,y,width,height,0,0,width,height);
      const pixels=ctx.getImageData(0,0,width,height);let dark=0;
      for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i+3]>127 && pixels.data[i]+pixels.data[i+1]+pixels.data[i+2]<384)dark++;
      if(dark/(width*height)<.01)continue; // Empty slots have only cutting guides.
      const result=decode(pixels.data,width,height,{inversionAttempts:'dontInvert'});
      if(!result)throw new Error('全家原單 QR 無法辨識，已停止產生，請使用原始文件');
      labels.push({orderId:orderFromQr(result.data),png:canvas.toDataURL('image/png'),width,height});
    }
    if(!labels.length)throw new Error('全家原單未找到寄件單');
    return labels;
  }
  async function appendLabel(out,label,PDFLib){
    validateLabels([label],[label.orderId]);
    const png=await out.embedPng(label.png);
    if(png.width!==label.width || png.height!==label.height)throw new Error('全家原單圖片與版面尺寸不一致');
    const paper=[100*72/25.4,150*72/25.4];
    const scale=Math.min(paper[0]/png.width,paper[1]/png.height);
    const width=png.width*scale,height=png.height*scale,page=out.addPage(paper);
    page.drawImage(png,{x:(paper[0]-width)/2,y:paper[1]-height,width,height});
    page.scaleContent(.8,.8);page.translateContent(0,paper[1]*.2);
    return page;
  }
  root.LHFamilyMart={isLabelUrl,isLaunchUrl,orderFromQr,validateLabels,captureSheet,appendLabel};
  if(typeof module!=='undefined')module.exports=root.LHFamilyMart;
})(globalThis);
