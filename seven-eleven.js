(function(root){
  const LABEL_PATH='/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx';
  function isLabelUrl(value){try{const u=new URL(value);return u.origin==='https://epayment.7-11.com.tw' && u.pathname===LABEL_PATH;}catch{return false;}}
  function isLaunchUrl(value){try{const u=new URL(value);return isLabelUrl(value) || (u.origin==='https://sellerfulfilment-shipment-sea.cache.susercontent.com' && /^\/sd-[a-z0-9-]+\/[A-Za-z0-9_-]+--html_c2c_shipping_label_redirect\.html$/.test(u.pathname));}catch{return false;}}
  const RASTER_SCALE=3;
  // Bound memory before allocating a canvas, independently of the printed paper size.
  function validateSize(width,height){
    if(!Number.isFinite(width) || !Number.isFinite(height) || width<100 || height<200 || width>2048 || height>4096 || width*height>2*1024*1024)throw new Error('7-ELEVEN 寄件單版面尺寸無效或過大');
  }
  async function captureLabel(node,orderId,render){
    const rect=node.getBoundingClientRect();
    validateSize(rect.width,rect.height);
    // html2canvas rounds its default bounds UP before applying scale. Make that
    // explicit, and use the returned bitmap as the single source of dimensions.
    const width=Math.ceil(rect.width),height=Math.ceil(rect.height);
    validateSize(width,height);
    const canvas=await render(node,{width,height,scale:RASTER_SCALE,backgroundColor:'#ffffff',logging:false,allowTaint:false,useCORS:false});
    if(canvas.width!==width*RASTER_SCALE || canvas.height!==height*RASTER_SCALE)throw new Error('7-ELEVEN 寄件單擷取不完整，請重新整理寄件單頁面後重試');
    return {orderId,png:canvas.toDataURL('image/png'),width:canvas.width/RASTER_SCALE,height:canvas.height/RASTER_SCALE,sourceWidth:rect.width,sourceHeight:rect.height};
  }
  function validateLabels(labels,orderIds){
    if(!Array.isArray(labels) || !labels.length || labels.length>100 || labels.length!==orderIds.length || new Set(orderIds).size!==orderIds.length)throw new Error('7-ELEVEN 寄件單與已選訂單數量不符');
    let bytes=0;
    const ids=labels.map(label=>{
      if(!label || !/^\d{6}[A-Z0-9]{6,20}$/i.test(label.orderId || '') || !orderIds.includes(label.orderId))throw new Error('7-ELEVEN 寄件單訂單編號不符');
      if(typeof label.png!=='string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(label.png))throw new Error('7-ELEVEN 寄件單圖片格式無效');
      bytes+=label.png.length;
      validateSize(label.width,label.height);
      return label.orderId;
    });
    if(new Set(ids).size!==ids.length || bytes>28*1024*1024)throw new Error('7-ELEVEN 寄件單重複或資料過大');
    return labels;
  }
  async function appendLabel(out,label,PDFLib){
    validateSize(label.width,label.height);
    const png=await out.embedPng(label.png);
    // Accept exact raster dimensions and the documented html2canvas ceil path
    // (including labels delivered by an already open reader after an upgrade).
    const matches=(actual,css)=>Number.isInteger(actual) && actual>0 &&
      (actual===Math.floor(css*RASTER_SCALE) || actual===Math.ceil(css)*RASTER_SCALE);
    if(!matches(png.width,label.width) || !matches(png.height,label.height)){
      throw new Error('7-ELEVEN 原單圖片與版面尺寸不一致', {cause:new Error(`CSS ${label.width} × ${label.height}; PNG ${png.width} × ${png.height}; scale ${RASTER_SCALE}`)});
    }
    const paper=[100*72/25.4,150*72/25.4];
    // Preserve the BITMAP aspect ratio, including fractional CSS rounding. Fit
    // larger source layouts to the paper without clipping or enlarging small ones.
    const nativeWidth=png.width/RASTER_SCALE*.75,nativeHeight=png.height/RASTER_SCALE*.75;
    const fit=Math.min(1,paper[0]/nativeWidth,paper[1]/nativeHeight);
    const width=nativeWidth*fit,height=nativeHeight*fit;
    const page=out.addPage(paper);
    page.drawImage(png,{x:(paper[0]-width)/2,y:paper[1]-height,width,height});
    // Same top-left 80% compensation as packing slips: print the combined PDF at 125%.
    page.scaleContent(.8,.8);page.translateContent(0,paper[1]*.2);
    return page;
  }
  root.LHSevenEleven={isLabelUrl,isLaunchUrl,validateLabels,captureLabel,appendLabel};
  if(typeof module!=='undefined')module.exports=root.LHSevenEleven;
})(globalThis);
