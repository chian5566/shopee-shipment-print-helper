(function(root){
  const LABEL_PATH='/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx';
  function isLabelUrl(value){try{const u=new URL(value);return u.origin==='https://epayment.7-11.com.tw' && u.pathname===LABEL_PATH;}catch{return false;}}
  function validateLabels(labels,orderIds){
    if(!Array.isArray(labels) || !labels.length || labels.length>100 || labels.length!==orderIds.length || new Set(orderIds).size!==orderIds.length)throw new Error('7-ELEVEN 寄件單與已選訂單數量不符');
    let bytes=0;
    const ids=labels.map(label=>{
      if(!label || !/^\d{6}[A-Z0-9]{6,20}$/i.test(label.orderId || '') || !orderIds.includes(label.orderId))throw new Error('7-ELEVEN 寄件單訂單編號不符');
      if(typeof label.png!=='string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(label.png))throw new Error('7-ELEVEN 寄件單圖片格式無效');
      bytes+=label.png.length;
      if(!Number.isFinite(label.width) || !Number.isFinite(label.height) || label.width<100 || label.height<200 || label.width>100*96/25.4 || label.height>150*96/25.4)throw new Error('7-ELEVEN 原單尺寸超過 100 × 150 mm，已停止產生');
      return label.orderId;
    });
    if(new Set(ids).size!==ids.length || bytes>28*1024*1024)throw new Error('7-ELEVEN 寄件單重複或資料過大');
    return labels;
  }
  async function appendLabel(out,label,PDFLib){
    const png=await out.embedPng(label.png);
    // Rasterize at 3x without changing the source CSS layout or QR aspect ratio.
    if(Math.abs(png.width-label.width*3)>2 || Math.abs(png.height-label.height*3)>2)throw new Error('7-ELEVEN 原單圖片與版面尺寸不一致');
    const paper=[100*72/25.4,150*72/25.4];const page=out.addPage(paper);
    const width=label.width*.75,height=label.height*.75;
    page.drawImage(png,{x:(paper[0]-width)/2,y:paper[1]-height,width,height});
    // Same top-left 80% compensation as packing slips: print the combined PDF at 125%.
    page.scaleContent(.8,.8);page.translateContent(0,paper[1]*.2);
    return page;
  }
  root.LHSevenEleven={isLabelUrl,validateLabels,appendLabel};
  if(typeof module!=='undefined')module.exports=root.LHSevenEleven;
})(globalThis);
