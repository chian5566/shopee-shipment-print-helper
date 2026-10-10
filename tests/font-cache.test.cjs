const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../content.js'),'utf8');
const code=source.slice(source.indexOf('  let chineseFontBytesPromise;'),source.indexOf('  function findJobId'));
(async()=>{
 let requests=0,blocked=true;const bytes=new ArrayBuffer(8);
 const context={chrome:{runtime:{getURL:name=>'chrome-extension://test/'+name}},fetch:async url=>{requests++;assert.match(url,/vendor\/NotoSansTC.ttf$/);return {ok:!blocked,arrayBuffer:async()=>bytes};}};
 vm.createContext(context);vm.runInContext(code+'\nglobalThis.loadFont=loadChineseFontBytes;',context);
 await assert.rejects(context.loadFont(),/中文字型載入失敗/);assert.equal(requests,1);
 blocked=false;const [a,b]=await Promise.all([context.loadFont(),context.loadFont()]);assert.equal(a,bytes);assert.equal(b,bytes);assert.equal(requests,2);
 await context.loadFont();assert.equal(requests,2);
 assert.match(source,/embedFont\(await loadChineseFontBytes\(\), \{subset:false\}\)/);assert.match(source,/StandardFonts\.CourierBold/);
 console.log('PASS: bundled font loaded once across concurrent/repeated documents, failed load can retry, full Chinese embedding and standard monospace');
})().catch(error=>{console.error(error);process.exitCode=1;});
