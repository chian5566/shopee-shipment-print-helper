const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../manifest.json');
assert.equal(manifest.version,require('../package.json').version);
const development=manifest.version_name?.includes('-dev');
const uiVersion=fs.readFileSync(path.join(root,'content.js'),'utf8').match(/const VERSION = '([^']+)'/)[1];
assert.equal(uiVersion,manifest.version+(development?'-dev':''),'Assistant header must match the package version');
if(!development){
 assert.equal(manifest.name,'LEISURE HOMME 出貨印單助手');
 for(const [size,file] of Object.entries(manifest.icons))assert.equal(file,`icons/icon${size}.png`);
 for(const [size,file] of Object.entries(manifest.action.default_icon))assert.equal(file,`icons/icon${size}.png`);
 const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
 assert.ok(readme.includes(`目前版本：**v${manifest.version}**`));
 assert.ok(readme.includes(`/releases/download/v${manifest.version}/shopee-shipment-print-helper-v${manifest.version}.zip`),'README must download the current release');
}
assert.deepEqual(manifest.permissions,['tabs','scripting']);
assert.deepEqual(manifest.host_permissions,['https://seller.shopee.tw/*','https://epayment.7-11.com.tw/C2C/C2CWeb/MultiplePrintC2CPinCode.aspx']);
assert.equal(require('../package.json').license,'SEE LICENSE IN LICENSE.md');
const required=new Set([...Object.values(manifest.icons),'LICENSE.md']);
for(const script of manifest.content_scripts)for(const file of [...(script.js||[]),...(script.css||[])])required.add(file);
required.add(manifest.background.service_worker);
required.add('seven-eleven.js');
assert.ok(!manifest.action.default_popup,'Toolbar must open the assistant directly');
for(const rule of manifest.web_accessible_resources)for(const file of rule.resources)required.add(file);
for(const file of required)assert.ok(fs.existsSync(path.join(root,file)),`Missing: ${file}`);
require('./build-pdf-classic.cjs')(true);
const forbidden=/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\/Users\/|TW(?!0{12})\d{10,})/;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','tmp','output','dist'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.(?:js|cjs|json|md|yml)$/.test(entry.name)){
 const text=fs.readFileSync(file,'utf8');if(file===__filename)continue;
 assert.ok(!forbidden.test(text),`Private or excluded data found: ${path.relative(root,file)}`);
 if(!file.includes(path.sep+'vendor'+path.sep)){assert.ok(!/ArialUnicode|HiraginoSansGB/.test(text),`Excluded font: ${path.relative(root,file)}`);const ids=text.match(/\b\d{6}(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,20}\b/g)||[];assert.ok(ids.every(id=>id.startsWith('250101TEST')),`Non-demo order ID: ${path.relative(root,file)}`);}
}}}
scan(root);
const versions=[['vendor/pdf.min.mjs','6.4.299'],['vendor/pdf.worker.min.mjs','6.4.299']];for(const [file,v]of versions)assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(v));
assert.ok(!fs.readFileSync(path.join(root,'service-worker.js'),'utf8').includes('chrome.downloads'));
assert.ok(fs.readFileSync(path.join(root,'packing-slip.js'),'utf8').includes('enableScripting:false'));
for(const file of required)if(file.startsWith('vendor/'))console.log(path.basename(file),crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'));
console.log('PASS: manifest/assets/version, minimal permissions, patched PDF.js, local-only code, no credentials/local paths/real order identifiers');
