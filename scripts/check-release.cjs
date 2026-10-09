const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),manifest=require('../manifest.json');
assert.equal(manifest.version,require('../package.json').version);
assert.deepEqual(manifest.permissions,['tabs']);
assert.deepEqual(manifest.host_permissions,['https://seller.shopee.tw/*']);
const required=new Set(Object.values(manifest.icons));
for(const script of manifest.content_scripts)for(const file of [...(script.js||[]),...(script.css||[])])required.add(file);
required.add(manifest.background.service_worker);
for(const rule of manifest.web_accessible_resources)for(const file of rule.resources)required.add(file);
for(const file of required)assert.ok(fs.existsSync(path.join(root,file)),`Missing: ${file}`);
const forbidden=/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\/Users\/|ArialUnicode|HiraginoSansGB|TW(?!0{12})\d{10,})/;
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','tmp','output','dist'].includes(entry.name))continue;const file=path.join(dir,entry.name);if(entry.isDirectory())scan(file);else if(/\.(?:js|cjs|json|md|yml)$/.test(entry.name)){
 const text=fs.readFileSync(file,'utf8');if(file===__filename)continue;
 assert.ok(!forbidden.test(text),`Private or excluded data found: ${path.relative(root,file)}`);
 if(!file.includes(path.sep+'vendor'+path.sep)){const ids=text.match(/\b\d{6}(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,20}\b/g)||[];assert.ok(ids.every(id=>id.startsWith('250101TEST')),`Non-demo order ID: ${path.relative(root,file)}`);}
}}}
scan(root);
const versions=[['vendor/pdf.min.mjs','6.4.299'],['vendor/pdf.worker.min.mjs','6.4.299']];for(const [file,v]of versions)assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(v));
assert.ok(!fs.readFileSync(path.join(root,'service-worker.js'),'utf8').includes('chrome.downloads'));
assert.ok(fs.readFileSync(path.join(root,'packing-slip.js'),'utf8').includes('enableScripting:false'));
for(const file of required)if(file.startsWith('vendor/'))console.log(path.basename(file),crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'));
console.log('PASS: manifest/assets/version, minimal permissions, patched PDF.js, local-only code, no credentials/local paths/real order identifiers');
