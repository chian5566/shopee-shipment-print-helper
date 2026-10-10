const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');require('./check-release.cjs');
const version=require('../manifest.json').version;fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const target=path.join(root,'dist',`出貨印單助手-v${version}.zip`);
const files=['manifest.json','content.js','network-hook.js','service-worker.js','preview-reader.js','packing-slip.js','print-layout.js','panel.css','icons','vendor','README.md','CHANGELOG.md','LICENSE.md','PRIVACY.md','THIRD_PARTY.md'];
if(fs.existsSync(target))fs.unlinkSync(target);
execFileSync('zip',['-qr',target,...files],{cwd:root});console.log(target);
