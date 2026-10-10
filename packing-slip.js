(function (root) {
  const PAPER = [100 * 72 / 25.4, 150 * 72 / 25.4];
  const PRINT_COMPENSATION = 1 / 1.25;
  const PRINT_MARGIN = 5 * 72 / 25.4;
  const compact = s => String(s || '').normalize('NFKC').replace(/\s+/g, '');

  // Use PDF text coordinates to read columns, never infer quantities from product titles.
  function extractRows(items) {
    const text = items.filter(i => i.str?.trim()).map(i => ({
      text: i.str.normalize('NFKC').trim(), x: i.transform[4], y: i.transform[5], width:i.width || 0,
      height: Math.abs(i.height || i.transform[3] || 10)
    }));
    const lines = [];
    for (const item of [...text].sort((a,b) => b.y-a.y || a.x-b.x)) {
      let line = lines.find(l => Math.abs(l.y-item.y) < 3);
      if (!line) { line = {y:item.y, items:[]}; lines.push(line); }
      line.items.push(item);
    }
    const names = {sku:['主商品貨號','商品貨號','貨號'], name:['商品名稱'], variantSku:['商品選項貨號'], spec:['商品規格名稱','商品規格','規格名稱','商品選項','選項','規格'], qty:['商品數量','購買數量','數量'], total:['總計','小計','金額'], index:['#','序號']};
    function find(line, aliases) {
      const parts = [...line.items].sort((a,b)=>a.x-b.x || b.y-a.y);
      for (let length=1; length<=8; length++) for (let i=0; i+length<=parts.length; i++) {
        if (aliases.includes(compact(parts.slice(i,i+length).map(p=>p.text).join('')))) return parts[i].x;
      }
      return null;
    }
    let columns, header;
    for (const line of lines) {
      // Headers may be split over two baselines. Search a small vertical band,
      // retaining each complete source fragment's coordinate for column boundaries.
      const band = {items:text.filter(i=>Math.abs(i.y-line.y)<=Math.max(18,line.items[0].height*1.5))};
      const c = Object.fromEntries(Object.entries(names).map(([key,aliases])=>[key,find(band,aliases)]));
      if (c.sku !== null && c.spec !== null && c.qty !== null) {
        columns=c;
        const headerItems=band.items.filter(i=>Object.values(names).flat().some(alias=>alias.includes(compact(i.text))));
        header={y:Math.min(...headerItems.map(i=>i.y))};break;
      }
    }
    if (!columns || !(columns.sku < columns.spec && columns.spec < columns.qty)) {
      throw new Error('無法辨識裝箱單的貨號／規格／數量欄位，請提供原始裝箱單 PDF 以校正');
    }
    const footer = lines.filter(l => l.y < header.y && /買家備[註注]|賣家備[註注]|訂單備[註注]/.test(compact(l.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join('')))).sort((a,b)=>b.y-a.y)[0];
    const body = text.filter(i=>i.y<header.y-4 && (!footer || i.y>footer.y+3));
    const hasIndex=columns.index!==null && columns.index<columns.sku;
    const starts = body.filter(i=>hasIndex
      ? i.x < columns.sku-4 && /^\d+[.)]?$/.test(compact(i.text))
      : Math.abs(i.x-columns.sku)<12 && /^[A-Za-z][A-Za-z0-9_.-]*\d[A-Za-z0-9_.-]*$/.test(compact(i.text))
    ).sort((a,b)=>b.y-a.y);
    if (!starts.length) throw new Error('裝箱單未找到商品列，已停止產生');
    const rows = starts.map((start,index) => {
      if (hasIndex && Number(compact(start.text).replace(/[.)]$/,'')) !== index+1) throw new Error('裝箱單商品序號不連續，無法安全重排');
      const bottom = starts[index+1]?.y ?? (footer ? footer.y+3 : -Infinity);
      const group = body.filter(i=>i.y<=start.y+3 && i.y>bottom+3);
      const field = (left,right) => group.filter(i=>i.x>=left-3 && i.x<right-3).sort((a,b)=>b.y-a.y || a.x-b.x).map(i=>i.text).join(' ').trim();
      let sku=field(columns.sku,columns.name ?? columns.variantSku ?? columns.spec);
      const variantSku=columns.variantSku === null ? '' : compact(field(columns.variantSku,columns.spec));
      // Shopee permits an empty parent SKU. Only use the explicit variant SKU's
      // established LEISURE HOMME prefix; never infer it from a product title.
      if (!sku && columns.variantSku !== null) {
        sku=variantSku.match(/^([A-Z]{2}\d{2})_[A-Z0-9]+_[A-Z0-9]+$/i)?.[1] || '';
      }
      const spec=field(columns.spec,columns.qty).replace(/([\u3400-\u9fff!！])\s+(?=[\u3400-\u9fff])/g,'$1').replace(/\s*([,，])\s*/g,' / ');
      const qty=compact(field(columns.qty,columns.total ?? Infinity));
      if (!/^[A-Za-z0-9][A-Za-z0-9_. /-]*$/.test(sku) || !spec || !/^\d+$/.test(qty) || Number(qty)<1 || !Number.isSafeInteger(Number(qty))) {
        throw new Error(`第 ${index+1} 列貨號、規格或數量不完整，已停止產生`);
      }
      const name=columns.name === null ? '' : field(columns.name,columns.variantSku ?? columns.spec).replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1');
      return {sku,variantSku,name,spec,qty:Number(qty)};
    });
    return rows;
  }

  function extractBuyerNote(items) {
    const lines=[];
    for (const item of items.filter(i=>i.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5] || a.transform[4]-b.transform[4])) {
      let line=lines.find(l=>Math.abs(l.y-item.transform[5])<3);
      if (!line) {line={y:item.transform[5],items:[]};lines.push(line);}
      line.items.push(item);
    }
    const joined=line=>line.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join('').trim();
    const start=lines.findIndex(l=>/買家備[註注]\s*[:：]?/.test(joined(l)));
    if (start<0) return '';
    const note=[joined(lines[start]).replace(/^.*?買家備[註注]\s*[:：]?\s*/,'')];
    for (const line of lines.slice(start+1)) {
      const value=joined(line);
      if (/賣家備[註注]|訂單編號|^商品列表$|^第?\s*\d+\s*[\/／]\s*\d+\s*頁?$/.test(value)) break;
      note.push(value);
    }
    return note.filter(Boolean).join('\n').trim();
  }

  function extractOrderId(items) {
    const text=items.map(i=>i.str||'').join(' ').normalize('NFKC');
    return text.match(/訂單編號\s*(?:\([^)]*\))?\s*[:：]?\s*(\d{6}[A-Z0-9]{6,20})\b/i)?.[1] || '';
  }

  function extractPackingSections(items) {
    const anchors=[];
    for (const item of items.filter(i=>i.str?.trim())) {
      const y=item.transform[5];
      const line=items.filter(i=>Math.abs(i.transform[5]-y)<3).sort((a,b)=>a.transform[4]-b.transform[4]);
      const orderId=extractOrderId(line);
      if (orderId && !anchors.some(a=>Math.abs(a.y-y)<3)) anchors.push({y,orderId});
    }
    anchors.sort((a,b)=>b.y-a.y);
    // Keep the no-ID path for column diagnostics; document identification still
    // requires a nonempty, unique order ID before pairing with shipping labels.
    if (!anchors.length) return [{rows:extractRows(items),buyerNote:extractBuyerNote(items),orderId:''}];
    return anchors.map((anchor,index)=>{
      const bottom=anchors[index+1]?.y ?? -Infinity;
      const section=items.filter(i=>i.transform[5]<=anchor.y+3 && i.transform[5]>bottom+3);
      return {rows:extractRows(section),buyerNote:extractBuyerNote(section),orderId:anchor.orderId};
    });
  }

  function matchPackingToLabels(packing, labelIds) {
    if (packing.length!==labelIds.length) throw new Error('寄件單與裝箱單訂單數不同，無法安全逐筆配對，請核對原始文件');
    const ordered=labelIds.map((id,index)=>{
      if (!id && labelIds.length===1) id=packing[0].orderId;
      const matches=packing.filter(p=>p.orderId && p.orderId===id);
      if (matches.length!==1) throw new Error(`第 ${index+1} 張寄件單無法唯一對應訂單編號，已停止產生`);
      return matches[0];
    });
    if (new Set(ordered).size!==packing.length) throw new Error('寄件單訂單配對重複，已停止產生');
    return ordered;
  }

  async function readLabelOrderIds(bytes, pdfjs, knownIds, orders = []) {
    const doc=await pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,enableScripting:false}).promise;
    try {
      const ids=[];
      for(let n=1;n<=doc.numPages;n++) {
        const items=(await(await doc.getPage(n)).getTextContent()).items;
        const text=compact(items.map(i=>i.str||'').join(''));
        const found=knownIds.filter(id=>text.includes(id));
        const byTracking=orders.filter(order=>(order.summary||'').split(/\s+/).some(token=>/^TW[A-Z0-9]{8,}$/i.test(token)&&text.includes(token)));
        ids.push(found.length===1?found[0]:extractOrderId(items)||(byTracking.length===1?byTracking[0].orderId:''));
      }
      return ids;
    } finally {await doc.loadingTask.destroy();}
  }

  async function readPacking(bytes, pdfjs) {
    const loading = pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,enableScripting:false,useSystemFonts:false});
    const doc = await loading.promise;
    try {
      const pages=[];
      for (let n=1;n<=doc.numPages;n++) {
        const items=(await (await doc.getPage(n)).getTextContent()).items;
        pages.push(...extractPackingSections(items));
      }
      return pages;
    } finally { await doc.loadingTask.destroy(); }
  }

  function wrap(value, font, size, width) {
    const lines=[];let line='';
    for (const char of String(value)) {
      if (char==='\n' || (line && font.widthOfTextAtSize(line+char,size)>width)) {lines.push(line);line='';}
      if (char!=='\n') line+=char;
    }
    if (line) lines.push(line);
    return lines.length?lines:[''];
  }

  async function appendRows(out, rows, fonts, PDFLib, buyerNote = '', orderId = '') {
    if (!rows.length) throw new Error('裝箱單沒有商品');
    if(orderId && !/^\d{6}[A-Z0-9]{6,20}$/i.test(orderId))throw new Error('裝箱單訂單編號無效');
    // The selected thermal printer stock is 100 x 150 mm. Source label PDFs
    // can use different page/crop sizes; do not let those expand the packing sheet.
    const paper=PAPER;
    const layoutScale=Math.min(paper[0]/PAPER[0],paper[1]/PAPER[1]);
    const margin=PRINT_MARGIN/layoutScale;
    const contentWidth=paper[0]/layoutScale-2*margin;
    if (contentWidth<=0 || paper[1]/layoutScale<=2*margin+80) throw new Error('寄件單尺寸不足以排版裝箱單');
    const columnScale=contentWidth/211;
    const x=value=>margin+(value-37)*columnScale;
    const top=paper[1]/layoutScale-margin;
    const topOffset=top-399;
    const firstPage=out.getPageCount();
    const {font,numberFont}=fonts;
    let page,y;
    const newPage = (showColumns = true) => {
      page=out.addPage(paper);
      if(orderId) {
        page.drawText('訂單編號',{x:x(37),y:390+topOffset,size:8.5,font});
        page.drawText(orderId,{x:x(78),y:390+topOffset,size:9,font:numberFont});
      }
      if (!showColumns) { y=370+topOffset; return; }
      page.drawText('貨號',{x:x(37),y:359+topOffset,size:10,font});
      page.drawText('商品選項',{x:x(76),y:365+topOffset,size:9,font});
      page.drawText('貨號',{x:x(76),y:353+topOffset,size:9,font});
      page.drawText('規格',{x:x(164),y:359+topOffset,size:10,font});
      page.drawText('數量',{x:x(222),y:359+topOffset,size:10,font});
      page.drawLine({start:{x:x(37),y:348+topOffset},end:{x:x(248),y:348+topOffset},thickness:1,color:PDFLib.rgb(0,0,0)});
      y=337+topOffset;
    };
    newPage();
    for (const row of rows) {
      if (!row.sku || !row.spec || !Number.isSafeInteger(row.qty) || row.qty<1) throw new Error('裝箱單商品資料無效');
      const skuLines=wrap(row.sku,numberFont,11,32*columnScale), variantSkuLines=wrap(row.variantSku || '—',row.variantSku ? numberFont : font,9,78*columnScale), specLines=wrap(row.spec,font,10,52*columnScale);
      const height=Math.max(47,Math.max(skuLines.length,variantSkuLines.length,specLines.length)*13+20);
      if (height>270) throw new Error('規格內容過長，請人工核對原始裝箱單');
      const titleLines=row.name?.trim() ? wrap(row.name,font,7.5,contentWidth-8) : [];
      const totalHeight=height+(titleLines.length ? titleLines.length*11+6 : 0);
      // Keep ordinary items together; exceptionally long names may continue.
      const available=337+topOffset-(margin+30);
      if (y-Math.min(totalHeight,available)<margin+30) newPage();
      skuLines.forEach((line,n)=>page.drawText(line,{x:x(37),y:y-16-n*13,size:11,font:numberFont}));
      variantSkuLines.forEach((line,n)=>page.drawText(line,{x:x(76),y:y-16-n*13,size:9,font:row.variantSku ? numberFont : font}));
      specLines.forEach((line,n)=>page.drawText(line,{x:x(164),y:y-16-n*13,size:10,font}));
      const qty=String(row.qty);const size=Math.min(18,29/numberFont.widthOfTextAtSize(qty,1));
      page.drawText(qty,{x:x(234)-numberFont.widthOfTextAtSize(qty,size)/2,y:y-21,size,font:numberFont});
      y-=height;
      if (titleLines.length) {
        y-=2;
        for (const line of titleLines) {
          if (y<margin+7.5) {
            newPage(false);
            page.drawText(`${row.sku}｜商品名稱（續）`,{x:x(37),y,size:8,font});y-=14;
          }
          page.drawText(line,{x:x(37),y,size:7.5,font});y-=11;
        }
        y-=4;
      }
      page.drawLine({start:{x:x(37),y},end:{x:x(248),y},thickness:0.4,color:PDFLib.rgb(0.65,0.65,0.65)});
    }
    const noteLines=wrap(buyerNote || '無',font,10,contentWidth);
    if (y-45<margin+4) newPage(false);
    y-=25;
    page.drawText('買家備註',{x:x(37),y,size:10,font});
    y-=20;
    for (const line of noteLines) {
      if (y<margin+4) {
        newPage();y-=20;
        page.drawText('買家備註（續）',{x:x(37),y,size:10,font});y-=20;
      }
      page.drawText(line,{x:x(37),y,size:10,font});y-=16;
    }
    // Chrome's custom print scaling in the user's preview expands from the
    // top-left, not the page centre. Pre-shrink about that same anchor.
    // Compensate packing pages only, preserving the fixed thermal paper size.
    for (const sheet of out.getPages().slice(firstPage)) {
      sheet.scaleContent(layoutScale*PRINT_COMPENSATION,layoutScale*PRINT_COMPENSATION);
      sheet.translateContent(0,paper[1]*(1-PRINT_COMPENSATION));
    }
  }

  root.LHPackingSlip={PAPER,PRINT_COMPENSATION,PRINT_MARGIN,extractRows,extractBuyerNote,extractOrderId,extractPackingSections,matchPackingToLabels,readLabelOrderIds,readPacking,appendRows,wrap};
  if (typeof module !== 'undefined') module.exports=root.LHPackingSlip;
})(globalThis);
