const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../content.js'),'utf8');
let orders=[{orderId:'250101TEST0001',summary:"buyer'&name TW000000000000 2026/10/10 18:30:00"}],writes=0,countWrites=0,selection=false,html='',countText='';
const list={get innerHTML(){return html;},set innerHTML(value){writes++;selection=false;html=value.replace(/&#39;/g,"'");}};
const count={get textContent(){return countText;},set textContent(value){countWrites++;selection=false;countText=value;}};
const context={panel:{isConnected:true,querySelector:s=>s==='.lh-orders'?list:count},selectedOrders:()=>orders};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function renderOrders()'),source.indexOf('  function documentCheckbox')),context);
context.renderOrders();assert.equal(writes,1);assert.equal(countWrites,1);
selection=true;for(let i=0;i<12;i++)context.renderOrders();assert.equal(selection,true);assert.equal(writes,1);assert.equal(countWrites,1);
// A hidden tracking-code change must not replace the visible selected text.
orders[0].summary=orders[0].summary.replace('TW000000000000','TWDEMO000001');context.renderOrders();assert.equal(selection,true);assert.equal(writes,1);
orders[0].summary=orders[0].summary.replace('18:30:00','18:31:00');context.renderOrders();assert.equal(writes,2);assert.match(html,/18:31:00/);assert.equal(countWrites,1);
orders=[];context.renderOrders();assert.equal(writes,3);assert.equal(countText,'已選 0 個訂單');context.renderOrders();assert.equal(writes,3);
console.log('PASS: unchanged polling preserves text selection and nodes, escaped names do not cause rerender, hidden tracking changes preserved, actual updates and empty selection still refresh');
