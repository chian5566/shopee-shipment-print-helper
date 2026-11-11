(function (root) {
  const PAPER = [100 * 72 / 25.4, 150 * 72 / 25.4];
  const PRINT_COMPENSATION = 1 / 1.25;
  const PRINT_MARGIN = 5 * 72 / 25.4;
  const compact = s => String(s || '').normalize('NFKC').replace(/\s+/g, '');

  const HEADER_NAMES = {sku:['主商品貨號','商品貨號','貨號'], name:['商品名稱'], variantSku:['商品選項貨號'], spec:['商品規格名稱','商品規格','規格名稱','商品選項','選項','規格'], qty:['商品數量','購買數量','數量'], total:['總計','小計','金額'], index:['#','序號']};
  function tableText(items) {
    const text=items.filter(i=>i.str?.trim()).map(i=>({text:i.str.trim(),x:i.transform[4],y:i.transform[5],width:i.width||0,height:Math.abs(i.height||i.transform[3]||10),fontName:i.fontName}));
    if(text.some(i=>![i.x,i.y,i.width,i.height].every(Number.isFinite)||i.width<0||i.height<=0))throw new Error('文件文字座標無效，已停止產生');
    return text;
  }
  function textLines(text) {
    const lines=[];
    for(const item of [...text].sort((a,b)=>b.y-a.y||a.x-b.x)) {
      let line=lines.find(l=>Math.abs(l.y-item.y)<3);
      if(!line){line={y:item.y,items:[]};lines.push(line);}
      line.items.push(item);
    }
    return lines;
  }
  const lineText=line=>[...line.items].sort((a,b)=>a.x-b.x).map(i=>i.text).join('').trim();
  function headerAt(lines,index) {
    const line=lines[index],parts=[...line.items].sort((a,b)=>a.x-b.x);
    const find=(parts,aliases,required=null)=>{
      for(let length=1;length<=8;length++)for(let n=0;n+length<=parts.length;n++) {
        const matched=parts.slice(n,n+length);
        const adjacent=matched.every((part,k)=>!k || (Math.abs(part.y-matched[k-1].y)<3
          ? part.x-(matched[k-1].x+(matched[k-1].width||matched[k-1].text.length*matched[k-1].height))<=Math.max(3,part.height)
          : Math.abs(part.x-matched[k-1].x)<3));
        if(adjacent && (!required||matched.includes(required)) && aliases.includes(compact(matched.map(i=>i.text).join(''))))return {x:matched[0].x,items:matched};
      }
      return null;
    };
    // Match complete labels on one baseline first. Only a header's own
    // unfinished fragment can extend vertically into a second header line.
    const matches=Object.fromEntries(Object.entries(HEADER_NAMES).map(([key,names])=>[key,find(parts,names)]));
    const occupied=new Set(Object.values(matches).filter(Boolean).flatMap(m=>m.items));
    for(const [key,names] of Object.entries(HEADER_NAMES))if(!matches[key]) {
      for(const first of parts.filter(i=>!occupied.has(i))) {
        const below=lines.slice(index+1).filter(l=>line.y-l.y<=Math.max(18,first.height*1.5)).flatMap(l=>l.items).filter(i=>Math.abs(i.x-first.x)<3);
        const match=find([first,...below],names,first);
        if(match && match.items.includes(first)) {matches[key]=match;break;}
      }
    }
    const columns=Object.fromEntries(Object.entries(matches).map(([k,m])=>[k,m?.x??null]));
    const count=Object.values(matches).filter(Boolean).length;
    if(count<2 || (columns.index===null && columns.qty===null) || !['sku','name','variantSku','spec'].some(k=>columns[k]!==null))return null;
    const ordered=['index','sku','name','variantSku','spec','qty','total'].map(k=>columns[k]).filter(x=>x!==null);
    if(ordered.some((x,i)=>i && x<=ordered[i-1]+3))throw new Error('裝箱單表頭位置重疊或順序不明，已停止產生');
    const used=Object.values(matches).filter(Boolean).flatMap(m=>m.items);
    if(new Set(used).size!==used.length)throw new Error('裝箱單表頭文字重複配對，已停止產生');
    return {columns,y:Math.min(...used.map(i=>i.y)),top:line.y,matchedColumns:count};
  }
  function tableLayout(items) {
    const text=tableText(items),lines=textLines(text);
    for(let n=0;n<lines.length;n++) {
      const header=headerAt(lines,n);
      if(header)return {text,lines,header,columns:header.columns};
    }
    return {text,lines,header:null,columns:null};
  }
  function tableFooter(layout) {
    const {lines,header,columns}=layout;
    if(!header)return null;
    const left=Math.min(...Object.values(columns).filter(x=>x!==null));
    const next=Object.values(columns).filter(x=>x!==null && x>left).sort((a,b)=>a-b)[0]??Infinity;
    for(const line of lines.filter(l=>l.y<header.y-4)) {
      const first=[...line.items].sort((a,b)=>a.x-b.x)[0];
      if(first.x>Math.min(left+12,next-3) || !/^(?:買家|賣家|訂單)備[註注](?:[:：]|$)/u.test(lineText(line)))continue;
      // A marker in a populated product row is product content, never a footer.
      if(columns.index===null && first.x>=left-3 && columns.qty!==null && line.items.some(i=>i.x>=columns.qty-3 && (columns.total===null||i.x<columns.total-3)))continue;
      if(columns.index===null && first.x>=left-3)throw new Error('裝箱單備註與商品欄位邊界不明，已停止產生');
      return line;
    }
    return null;
  }

  // Read only inside established table columns; never infer quantity from text.
  function extractRows(items, {startSequence = 1} = {}) {
    const diagnostic = {parser:'packing-columns-v2',textItemCount:items.length};
    const fail = (message, detail = {}) => {
      const error = new Error(message);
      error.diagnostics = {...diagnostic,...detail};
      throw error;
    };
    const layout=tableLayout(items),{text,lines,header,columns}=layout;
    if(!header)fail('無法辨識裝箱單欄位，請提供原始裝箱單 PDF 以校正');
    Object.assign(diagnostic,{headerCandidate:{columns,baselineY:header.top,matchedColumns:header.matchedColumns},columns,headerY:header.y});
    const footer=tableFooter(layout);
    const body = text.filter(i=>i.y<header.y-4 && (!footer || i.y>footer.y+3));
    const positions=Object.values(columns).filter(value=>value!==null).sort((a,b)=>a-b);
    const rightOf=left=>positions.find(value=>value>left) ?? Infinity;
    const hasIndex=columns.index!==null && columns.index===positions[0] && body.some(i=>i.x>=columns.index-3 && i.x<rightOf(columns.index)-3 && /^\d+[.)]?$/.test(compact(i.text)));
    // Without a sequence column, use the leftmost populated product column.
    // Ambiguous wrapped rows still fail quantity validation rather than disappear.
    const anchor=['sku','variantSku','name','spec'].map(key=>columns[key]).filter(x=>x!==null && body.some(i=>Math.abs(i.x-x)<12)).sort((a,b)=>a-b)[0];
    let starts = body.filter(i=>hasIndex
      ? i.x>=columns.index-3 && i.x<rightOf(columns.index)-3 && /^\d+[.)]?$/.test(compact(i.text))
      : anchor!==undefined && Math.abs(i.x-anchor)<12
    ).sort((a,b)=>b.y-a.y);
    if (!hasIndex) {
      for (const i of body.filter(i=>columns.qty!==null && i.x>=columns.qty-3 && i.x<rightOf(columns.qty)-3)) {
        if (!starts.some(start=>Math.abs(start.y-i.y)<3)) starts.push(i);
      }
      starts=starts.sort((a,b)=>b.y-a.y).filter((start,index,list)=>index===0 || Math.abs(start.y-list[index-1].y)>=3);
    }
    Object.assign(diagnostic,{hasIndex,rowCount:starts.length,sequence:hasIndex ? starts.slice(0,100).map(i=>({value:Number(compact(i.text).replace(/[.)]$/,'')),x:i.x,y:i.y})) : [],sequenceTruncated:hasIndex && starts.length>100});
    if (!starts.length) fail('裝箱單未找到商品列，已停止產生');
    if (startSequence>1 && !hasIndex) fail('裝箱單接續區段缺少商品序號，無法安全重排',{expectedSequence:startSequence});
    const rows = starts.map((start,index) => {
      if (hasIndex && Number(compact(start.text).replace(/[.)]$/,'')) !== startSequence+index) fail('裝箱單商品序號不連續，無法安全重排',{row:index+1,expectedSequence:startSequence+index,actualSequence:Number(compact(start.text).replace(/[.)]$/,''))});
      const bottom = starts[index+1]?.y ?? (footer ? footer.y+3 : -Infinity);
      const group = body.filter(i=>i.y<=start.y+3 && i.y>bottom+3).flatMap(i=>{
        // PDF.js can combine arbitrary specification text and the adjacent quantity.
        // Split only when measured same-font digit widths place the final token
        // exactly at the quantity column on this row's first baseline.
        const match=i.text.match(/^(.+?)\s+(\d+)$/u);
        if (columns.spec===null || columns.qty===null || !match || !i.fontName || i.x<columns.spec-3 || i.x>=columns.qty-3 || Math.abs(i.y-start.y)>=3) return [i];
        const widths=body.filter(t=>t.fontName===i.fontName && Math.abs(t.height-i.height)<.01 && /^\d+$/.test(t.text) && t.width>0).map(t=>t.width/t.text.length);
        if (!widths.length || Math.max(...widths)-Math.min(...widths)>.01) return [i];
        const qtyWidth=widths[0]*match[2].length;
        const qtyX=i.x+i.width-qtyWidth;
        if (Math.abs(qtyX-columns.qty)>.5 || qtyX+qtyWidth>(columns.total ?? Infinity)-3) return [i];
        return [{...i,text:match[1],width:qtyX-i.x},{...i,text:match[2],x:qtyX,width:qtyWidth}];
      });
      const field = (left,joiner=' ') => left===null ? '' : group.filter(i=>i.x>=left-3 && i.x<rightOf(left)-3).sort((a,b)=>b.y-a.y || a.x-b.x).map(i=>i.text).join(joiner).trim();
      // Seller-defined identifiers are opaque text. Never derive a parent SKU.
      const sku=field(columns.sku);
      const variantSku=field(columns.variantSku,'');
      const spec=field(columns.spec).normalize('NFKC').replace(/([\u3400-\u9fff!！])\s+(?=[\u3400-\u9fff])/g,'$1').replace(/\s*([,，])\s*/g,' / ');
      const qtyItems=columns.qty===null ? [] : group.filter(i=>i.x>=columns.qty-3 && i.x<rightOf(columns.qty)-3);
      Object.assign(diagnostic,{row:index+1,quantityTokenCount:qtyItems.length,quantityPositions:qtyItems.slice(0,10).map(i=>({x:i.x,y:i.y,width:i.width}))});
      if (columns.qty!==null && qtyItems.length===0 && group.some(i=>columns.spec!==null && i.x>=columns.spec-3 && i.x<rightOf(columns.spec)-3 && /^(.+?)\s+(\d+)$/u.test(i.text))) fail(`第 ${index+1} 列數量不完整或位置不明，已停止產生`,{row:index+1});
      const qty=qtyItems.length===0 ? null : qtyItems.length===1 ? Number(compact(qtyItems[0].text)) : NaN;
      if (qty!==null && (qtyItems.length!==1 || !/^\d+$/.test(compact(qtyItems[0].text)) || !Number.isSafeInteger(qty) || qty<1)) {
        fail(`第 ${index+1} 列數量不完整或無效，已停止產生`,{row:index+1});
      }
      if (!hasIndex && qty===null && starts.length>1) fail(`第 ${index+1} 列數量不完整且商品列邊界不明，已停止產生`,{row:index+1});
      const name=field(columns.name).normalize('NFKC').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1');
      return {sku,variantSku,name,spec,qty};
    });
    return rows;
  }

  function extractBuyerNote(items) {
    const layout=tableLayout(items);
    const footer=layout.header?tableFooter(layout):layout.lines.find(l=>/^買家備[註注](?:[:：]|$)/u.test(lineText(l)));
    if(!footer || !/^買家備[註注]/u.test(lineText(footer)))return '';
    const note=[lineText(footer).replace(/^買家備[註注]\s*[:：]?\s*/u,'')];
    const left=Math.min(...footer.items.map(i=>i.x));
    for(const line of layout.lines.filter(l=>l.y<footer.y-3)) {
      const first=[...line.items].sort((a,b)=>a.x-b.x)[0];
      // Only a separate, aligned seller-note label ends the note. Keywords and
      // order-like strings inside the buyer's note remain opaque user text.
      if(Math.abs(first.x-left)<3 && /^(?:賣家|訂單)備[註注][:：]?$/u.test(first.text.normalize('NFKC')))break;
      note.push(lineText(line));
    }
    return note.filter(Boolean).join('\n').trim();
  }

  function metadataOrderId(line) {
    const match=lineText(line).normalize('NFKC').match(/^(?:蝦皮)?訂單編號\s*(?:\([^)]*\))?\s*[:：]?\s*(\d{6}[A-Z0-9]{6,20})(?:\s+package\s+\d+)?\s*$/i);
    return match?.[1]||'';
  }
  function extractOrderId(items) {
    const layout=tableLayout(items);
    const ids=[...new Set(layout.lines.filter(l=>!layout.header||l.y>layout.header.top+3).map(metadataOrderId).filter(Boolean))];
    if(ids.length>1)throw new Error('文件包含多個訂單編號，無法唯一配對');
    return ids[0]||'';
  }

  function extractPackingSections(items, {previousSections = []} = {}) {
    const layout=tableLayout(items),headers=layout.header?[layout.header]:[];
    // Once inside a table, product and note lines are opaque. A later table
    // must follow an explicit metadata line, never just look like headers.
    if(layout.header)for(const metadata of layout.lines.filter(l=>l.y<layout.header.y && metadataOrderId(l))) {
      for(let n=0;n<layout.lines.length;n++) {
        const line=layout.lines[n];
        if(line.y>=metadata.y-3 || metadata.y-line.y>64)continue;
        const header=headerAt(layout.lines,n);
        if(header) {
          if(!headers.some(h=>Math.abs(h.y-header.y)<3))headers.push(header);
          break;
        }
      }
    }
    headers.sort((a,b)=>b.top-a.top);
    if(!headers.length) {
      try {return [{rows:extractRows(items),buyerNote:'',orderId:''}];}
      catch(error){error.diagnostics={...error.diagnostics,section:1,sectionsOnPage:1,orderIdPresent:false};throw error;}
    }
    const regions=[];
    for(const [index,header] of headers.entries()) {
      const previous=headers[index-1];
      let ceiling=Infinity;
      if(previous) {
        const upperItems=items.filter(i=>i.transform[5]<=previous.top+3 && i.transform[5]>header.top+3);
        const footer=tableFooter(tableLayout(upperItems));
        if(!footer)throw new Error('裝箱單區段邊界不明，已停止產生');
        ceiling=footer.y;
      }
      const titleBefore=layout.lines.find(l=>l.y>header.top+3 && l.y<ceiling-3 && l.y-header.top<80 && lineText(l)==='商品列表');
      const candidates=layout.lines.filter(l=>l.y>header.top+3 && l.y<ceiling-3 && (!index || (titleBefore?l.y<titleBefore.y+3:l.y-header.top<=64)))
        .map(line=>({line,orderId:metadataOrderId(line)})).filter(a=>a.orderId);
      if(candidates.length>1)throw new Error('裝箱單訂單編號不唯一，已停止產生');
      if(index && !candidates.length)throw new Error('裝箱單接續區段缺少訂單編號，已停止產生');
      let top=candidates[0]?.line.y??header.top;
      const title=layout.lines.find(l=>l.y>top && l.y<ceiling-3 && l.y-top<20 && lineText(l)==='商品列表' && l.items[0].x<=Math.min(...Object.values(header.columns).filter(x=>x!==null))+12);
      if(title)top=title.y;
      regions.push({header,orderId:candidates[0]?.orderId||'',top});
    }
    const sections=[];
    for(const [index,region] of regions.entries()) {
      const bottom=regions[index+1]?.top??-Infinity;
      const section=items.filter(i=>i.transform[5]<=region.top+3 && i.transform[5]>bottom+3);
      try {
        const preceding=[...previousSections,...sections];
        let startSequence=1;
        for(let n=preceding.length-1;n>=0 && preceding[n].orderId===region.orderId;n--)startSequence+=preceding[n].rows.length;
        if(startSequence===1 && region.orderId && preceding.some(s=>s.orderId===region.orderId))throw new Error('裝箱單訂單區段重複或順序不明，已停止產生');
        sections.push({rows:extractRows(section,{startSequence}),buyerNote:extractBuyerNote(section),orderId:region.orderId});
      } catch(error) {
        error.diagnostics={...error.diagnostics,section:index+1,sectionsOnPage:regions.length,sectionTopY:region.top,sectionBottomY:Number.isFinite(bottom)?bottom:null,orderIdPresent:!!region.orderId};throw error;
      }
    }
    return sections;
  }

  function matchPackingToLabels(packing, labelIds) {
    if (packing.length!==labelIds.length) throw new Error('寄件單與裝箱單訂單數不同，無法安全逐筆配對，請核對原始文件');
    const ordered=labelIds.map((id,index)=>{
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
        const text=items.map(i=>i.str||'').join(' ').normalize('NFKC').toUpperCase();
        const token=value=>new RegExp('(?:^|[^A-Z0-9])'+value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^A-Z0-9])').test(text);
        const evidence=new Set(knownIds.filter(token));
        const explicit=extractOrderId(items);
        if(explicit)evidence.add(explicit);
        for(const order of orders)if((order.summary||'').split(/\s+/).some(t=>/^TW[A-Z0-9]{8,}$/i.test(t)&&token(t.toUpperCase())))evidence.add(order.orderId);
        if(evidence.size>1)throw new Error('寄件單訂單編號與物流證據不一致，已停止產生');
        const id=[...evidence][0]||'';
        if(id && !knownIds.includes(id))throw new Error('寄件單包含本次範圍外訂單，已停止產生');
        ids.push(id);
      }
      return ids;
    } finally {await doc.loadingTask.destroy();}
  }

  // Experimental carriers: require an explicit order ID or the dedicated
  // tracking-number cell. Never infer pairing from page position or row summaries.
  function experimentalOrderId(items, knownIds, orders) {
    const text = items.map(item=>item.str || '').join(' ').toUpperCase();
    const evidence = new Set(knownIds.filter(id=>new RegExp('(?:^|[^A-Z0-9])'+id+'(?=$|[^A-Z0-9])').test(text)));
    const explicit=extractOrderId(items);
    if(explicit)evidence.add(explicit);
    for (const order of orders) {
      const tracking = (order.trackingNumber || '').replace(/\s/g, '').toUpperCase();
      if (!/^[A-Z0-9-]{8,32}$/.test(tracking)) continue;
      // Keep token boundaries, especially for numeric waybills sharing a prefix.
      const escaped = tracking.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(?:^|[^A-Z0-9-])'+escaped+'(?=$|[^A-Z0-9-])').test(text)) evidence.add(order.orderId);
    }
    if (evidence.size !== 1) throw new Error('試作物流寄件單無法唯一配對訂單，請核對原始文件');
    const id = [...evidence][0];
    if (!knownIds.includes(id)) throw new Error('試作物流寄件單包含本次範圍外訂單');
    return id;
  }

  async function readExperimentalLabels(bytes, pdfjs, knownIds, orders, {grid=false}={}) {
    const loading = pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,enableScripting:false});
    const doc = await loading.promise;
    try {
      const labels=[];
      for (let pageIndex=0;pageIndex<doc.numPages;pageIndex++) {
        const page=await doc.getPage(pageIndex+1),items=(await page.getTextContent()).items.filter(item=>item.str?.trim());
        const [left,bottom,right,top]=page.view,width=right-left,height=top-bottom;
        if (![left,bottom,right,top].every(Number.isFinite) || width<=0 || height<=0) throw new Error('試作物流寄件單尺寸無效');
        const a4=Math.abs(width-595.28)<4 && Math.abs(height-841.89)<4;
        let regions=[{x:left,y:bottom,width,height}];
        if (grid && a4) {
          if (page.rotate!==0) throw new Error('萊爾富四格寄件單旋轉版型尚未驗證，請使用原始文件');
          regions=[{x:left,y:bottom+height/2,width:width/2,height:height/2},{x:left+width/2,y:bottom+height/2,width:width/2,height:height/2},
            {x:left,y:bottom,width:width/2,height:height/2},{x:left+width/2,y:bottom,width:width/2,height:height/2}];
        } else if (grid && !(width<=330 && height<=460)) {
          throw new Error('萊爾富寄件單版型尚未驗證，僅試作單張熱感 PDF 或直式 A4 四格 PDF');
        }
        if (!items.length) throw new Error('試作物流寄件單沒有可辨識文字，請使用原始文件');
        for (const crop of regions) {
          const cell=items.filter(item=>item.transform[4]>=crop.x && item.transform[4]<crop.x+crop.width && item.transform[5]>=crop.y && item.transform[5]<crop.y+crop.height);
          if (!cell.length) continue;
          // Refuse text crossing a grid boundary instead of clipping another label.
          if (regions.length>1 && cell.some(item=>item.transform[4]+Math.abs(item.width)>crop.x+crop.width+1 || item.transform[5]+Math.abs(item.height)>crop.y+crop.height+1)) {
            throw new Error('萊爾富寄件單內容超出四格範圍，請使用原始文件');
          }
          labels.push({orderId:experimentalOrderId(cell,knownIds,orders),pageIndex,crop});
        }
      }
      if (labels.length!==knownIds.length || new Set(labels.map(item=>item.orderId)).size!==knownIds.length || knownIds.some(id=>!labels.some(item=>item.orderId===id))) {
        throw new Error('試作物流寄件單數量、重複或訂單範圍不符，已停止產生');
      }
      return labels;
    } finally {await loading.destroy();}
  }

  async function readPacking(bytes, pdfjs) {
    const loading = pdfjs.getDocument({data:new Uint8Array(bytes.slice(0)),isEvalSupported:false,enableScripting:false,useSystemFonts:false});
    const doc = await loading.promise;
    try {
      const pages=[];
      for (let n=1;n<=doc.numPages;n++) {
        try {
          const items=(await (await doc.getPage(n)).getTextContent()).items;
          const sections=extractPackingSections(items,{previousSections:pages});
          for (const section of sections) {
            const last=pages.at(-1);
            if (section.orderId && last?.orderId===section.orderId) {
              last.rows.push(...section.rows);
              last.buyerNote=[...new Set([last.buyerNote,section.buyerNote].filter(Boolean))].join('\n');
            } else pages.push(section);
          }
        } catch (error) {
          error.diagnostics={...error.diagnostics,page:n,totalPages:doc.numPages,completedPages:n-1,completedSections:pages.length,completedRows:pages.reduce((sum,section)=>sum+section.rows.length,0)};
          throw error;
        }
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
    let totalQty=0, hasUnknownQty=false;
    for (const row of rows) {
      if (row.qty!==null && (!Number.isSafeInteger(row.qty) || row.qty<1)) throw new Error('裝箱單商品資料無效');
      hasUnknownQty ||= row.qty===null;
      totalQty+=row.qty ?? 0;
      if (!Number.isSafeInteger(totalQty)) throw new Error('裝箱單總數量無效');
    }
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
      const totalText=`總數量 ${hasUnknownQty ? '未提供' : totalQty+' 件'}`,totalSize=8.5;
      const totalX=x(248)-font.widthOfTextAtSize(totalText,totalSize);
      if(orderId) {
        page.drawText('訂單編號',{x:x(37),y:390+topOffset,size:8.5,font});
        const orderSize=Math.min(9,(totalX-x(78)-8)/numberFont.widthOfTextAtSize(orderId,1));
        page.drawText(orderId,{x:x(78),y:390+topOffset,size:orderSize,font:numberFont});
      }
      page.drawText(totalText,{x:totalX,y:390+topOffset,size:totalSize,font});
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
      if (row.qty!==null && (!Number.isSafeInteger(row.qty) || row.qty<1)) throw new Error('裝箱單商品資料無效');
      const identifierFont=value=>value && /^[\x20-\x7e]+$/.test(value) ? numberFont : font;
      const skuFont=identifierFont(row.sku),variantFont=identifierFont(row.variantSku);
      const skuLines=wrap(row.sku || '—',skuFont,11,32*columnScale), variantSkuLines=wrap(row.variantSku || '—',variantFont,9,78*columnScale), specLines=wrap(row.spec || '—',font,10,52*columnScale);
      const lineHeight=11;
      const height=Math.max(32,Math.max(skuLines.length,variantSkuLines.length,specLines.length)*lineHeight+10);
      if (height>270) throw new Error('規格內容過長，請人工核對原始裝箱單');
      const titleLines=row.name?.trim() ? wrap(row.name,font,7.5,contentWidth-8) : [];
      const titleLineHeight=9.5;
      const totalHeight=height+(titleLines.length ? titleLines.length*titleLineHeight+6 : 0);
      // Keep ordinary items together; exceptionally long names may continue.
      const available=337+topOffset-(margin+30);
      if (y-Math.min(totalHeight,available)<margin+30) newPage();
      skuLines.forEach((line,n)=>page.drawText(line,{x:x(37),y:y-13-n*lineHeight,size:11,font:skuFont}));
      variantSkuLines.forEach((line,n)=>page.drawText(line,{x:x(76),y:y-13-n*lineHeight,size:9,font:variantFont}));
      specLines.forEach((line,n)=>page.drawText(line,{x:x(164),y:y-13-n*lineHeight,size:10,font}));
      const qty=row.qty===null ? '—' : String(row.qty),qtyFont=row.qty===null ? font : numberFont;const size=Math.min(18,29/qtyFont.widthOfTextAtSize(qty,1));
      page.drawText(qty,{x:x(234)-qtyFont.widthOfTextAtSize(qty,size)/2,y:y-21,size,font:qtyFont});
      y-=height;
      if (titleLines.length) {
        y-=2;
        for (const line of titleLines) {
          if (y<margin+7.5) {
            newPage(false);
            page.drawText(`${row.sku || '—'}｜商品名稱（續）`,{x:x(37),y,size:8,font});y-=14;
          }
          page.drawText(line,{x:x(37),y,size:7.5,font});y-=titleLineHeight;
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

  root.LHPackingSlip={PAPER,PRINT_COMPENSATION,PRINT_MARGIN,extractRows,extractBuyerNote,extractOrderId,extractPackingSections,matchPackingToLabels,readLabelOrderIds,readExperimentalLabels,readPacking,appendRows,wrap};
  if (typeof module !== 'undefined') module.exports=root.LHPackingSlip;
})(globalThis);
