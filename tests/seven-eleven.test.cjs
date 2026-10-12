const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const seven=require('../seven-eleven.js'),{PDFDocument}=require('pdf-lib');
const ids=['250101TEST0001','250101TEST0002'];
const png='data:image/png;base64,aGVsbG8=';
const label=id=>({orderId:id,png,width:306,height:454});
assert.ok(seven.isLabelUrl('https://epayment.7-11.com.tw/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx'));
assert.ok(!seven.isLabelUrl('https://example.com/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx'));
assert.ok(!seven.isLabelUrl('http://epayment.7-11.com.tw/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx'));
seven.validateLabels(ids.map(label).reverse(),ids);
for(const labels of [[label(ids[0])],[label(ids[0]),label(ids[0])],[label('250101TEST9999'),label(ids[1])],[{...label(ids[0]),width:500},label(ids[1])],[{...label(ids[0]),png:'https://example.com/image'},label(ids[1])]])assert.throws(()=>seven.validateLabels(labels,ids));
let handler,updated;let currentUrl;const forwarded=[],removed=[];
const chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener(fn){handler=fn;}}},tabs:{onUpdated:{addListener(fn){updated=fn;}},get(id,cb){cb({id,url:currentUrl || url});},onRemoved:{addListener(){}},remove(id){removed.push(id);},sendMessage(id,msg,cb){forwarded.push({id,msg});cb({ok:true});}}};
vm.runInNewContext(fs.readFileSync(require.resolve('../service-worker.js'),'utf8'),{chrome,Date,Set,Map,URL,LHSevenEleven:seven});
const source='https://seller.shopee.tw/portal/sale/mass/ship',url='https://epayment.7-11.com.tw/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx';
const send=(msg,id,address=source,openerTabId)=>{let reply;handler(msg,{tab:{id,url:address,openerTabId}},r=>reply=r);return reply;};
const start=(id,taskId,orderIds=ids)=>send({type:'START_DOCUMENT_TASK',taskId,sevenEleven:true,orderIds},id);
assert.equal(start(1,'a').ok,true);
assert.equal(start(2,'bad',[ids[0],ids[0]]).ok,false);
assert.equal(send({type:'GET_SEVEN_TASK',orderIds:ids},10,'https://example.com').ok,false);
assert.equal(send({type:'GET_SEVEN_TASK',orderIds:[ids[0]]},10,url,1).ok,false);
assert.equal(send({type:'GET_SEVEN_TASK',orderIds:ids},10,url,2).ok,false);
assert.equal(send({type:'GET_SEVEN_TASK',orderIds:[...ids].reverse()},10,url,1).taskId,'a');
assert.equal(send({type:'SEVEN_LABELS_READY',taskId:'a',labels:ids.map(label)},11,url,1).ok,false);
assert.equal(send({type:'SEVEN_LABELS_READY',taskId:'stale',labels:ids.map(label)},10,url,1).ok,false);
assert.equal(send({type:'SEVEN_LABELS_READY',taskId:'a',labels:[label(ids[0]),label(ids[0])]},10,url,1).ok,false);
assert.equal(send({type:'SEVEN_LABELS_READY',taskId:'a',labels:ids.map(label)},10,url,1).ok,true);
assert.equal(forwarded[0].id,1);assert.equal(forwarded[0].msg.type,'PREVIEW_SEVEN_LABELS');assert.equal(removed.length,0);
assert.equal(send({type:'SEVEN_LABELS_READY',taskId:'a',labels:ids.map(label)},10,url,1).ok,false);
start(2,'b');assert.equal(send({type:'GET_SEVEN_TASK',orderIds:ids},20,url).ok,false);
send({type:'STOP_DOCUMENT_TASK',taskId:'a'},1);assert.equal(send({type:'GET_SEVEN_TASK',orderIds:ids},10,url,1).ok,false);
// Completion closes only the delivering tab; failed/cancelled tasks preserve originals.
assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'b'},2).ok,false);
send({type:'GET_SEVEN_TASK',orderIds:ids},20,url,2);send({type:'GET_SEVEN_TASK',orderIds:ids},21,url,2);
send({type:'SEVEN_LABELS_READY',taskId:'b',labels:ids.map(label)},20,url,2);
assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'b'},1).ok,false);
assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'stale'},2).ok,false);
assert.equal(removed.length,0);assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'b'},2).ok,true);assert.deepEqual(removed,[20]);
assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'b'},2).ok,false);
function delivered(taskId,tabId){start(3,taskId);send({type:'GET_SEVEN_TASK',orderIds:ids},tabId,url,3);send({type:'SEVEN_LABELS_READY',taskId,labels:ids.map(label)},tabId,url,3);}
delivered('cancel',30);send({type:'STOP_DOCUMENT_TASK',taskId:'cancel'},3);assert.equal(send({type:'COMPLETE_DOCUMENT_TASK',taskId:'cancel'},3).ok,false);
delivered('navigated',31);currentUrl='https://example.com';send({type:'COMPLETE_DOCUMENT_TASK',taskId:'navigated'},3);currentUrl=null;
delivered('reload',32);updated(32,{status:'loading'},{url,openerTabId:3});send({type:'COMPLETE_DOCUMENT_TASK',taskId:'reload'},3);assert.deepEqual(removed,[20]);
console.log('PASS: completion closes delivering original only; waiting, failure/cancellation, stale/wrong-source completion and navigated originals preserved');
// Build a real 3x PNG; reopening the generated PDF validates image embedding and page size.
function crc(buf){let n=-1;for(const b of buf){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^-1)>>>0;}
function chunk(type,data){const t=Buffer.from(type),h=Buffer.alloc(4),c=Buffer.alloc(4);h.writeUInt32BE(data.length);c.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([h,t,data,c]);}
function makePng(w,h){const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=2;const pixels=Buffer.alloc((w*3+1)*h,255);for(let y=0;y<h;y++)pixels[y*(w*3+1)]=0;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);}
(async()=>{const out=await PDFDocument.create(),item={...label(ids[0]),png:'data:image/png;base64,'+makePng(918,1362).toString('base64')};await seven.appendLabel(out,item);const reopened=await PDFDocument.load(await out.save());assert.equal(reopened.getPageCount(),1);assert.ok(Math.abs(reopened.getPage(0).getWidth()-100*72/25.4)<.001);assert.ok(Math.abs(reopened.getPage(0).getHeight()-150*72/25.4)<.001);await assert.rejects(()=>seven.appendLabel(out,{...item,width:300}),/尺寸不一致/);console.log('PASS: 7-ELEVEN batch pairing, duplicate/missing/wrong-origin/opener/stale/cancelled guards, concurrent tasks, completion-only tab cleanup, 3x PNG and 100×150 mm PDF');})().catch(e=>{console.error(e);process.exitCode=1;});
