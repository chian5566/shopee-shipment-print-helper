const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8');
const destination='https://seller.shopee.tw/portal/sale/mass/ship?mass_shipment_tab=301';
async function run(url,{missing=false,fail=false}={}) {
 const calls=[];let click,messages=0;
 const chrome={action:{onClicked:{addListener(fn){click=fn;}}},runtime:{onMessage:{addListener(){}}},tabs:{create:options=>calls.push(options),sendMessage:async(id,message)=>{calls.push(message);if(fail||missing&&messages++===0)throw Error('no receiver');return {ok:true};},onUpdated:{addListener(){}},onRemoved:{addListener(){}}},scripting:{executeScript:async options=>calls.push(options),insertCSS:async options=>calls.push(options)}};
 vm.runInNewContext(code,{chrome,URL});await click({id:1,url});return JSON.parse(JSON.stringify(calls));
}
test('toolbar directly opens panel and repairs old tabs without popup',async()=>{
 assert.ok(!require('../manifest.json').action.default_popup);
 for(const url of ['https://seller.shopee.tw/portal/home',destination])assert.deepEqual(await run(url),[{type:'OPEN_PANEL'}]);
 const calls=await run(destination,{missing:true});assert.equal(calls.length,5);assert.equal(calls[1].world,'MAIN');assert.equal(calls.at(-1).type,'OPEN_PANEL');
});
test('other sites or failed repairs open exact download page',async()=>{
 for(const url of ['https://example.com','chrome://extensions/'])assert.equal((await run(url))[0].url,destination);
 assert.equal((await run(destination,{fail:true})).at(-1).url,destination);
});
