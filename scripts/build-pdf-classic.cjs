const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
function build(check = false) {
  for (const [source, target] of [
    ['pdf.min.mjs', 'pdf.classic.min.js'],
    ['pdf.worker.min.mjs', 'pdf.worker.classic.min.js'],
  ]) {
    const input = fs.readFileSync(path.join(root, 'vendor', source), 'utf8');
    const result = esbuild.transformSync(input, {
      format: 'iife', target: 'chrome120', minify: true,
      legalComments: 'inline', sourcefile: source,
      // Only Node/canvas and optional image decoder paths use import.meta.
      // This extension reads PDF text with its preloaded in-process worker.
      logOverride: { 'empty-import-meta': 'silent' },
    });
    const output = path.join(root, 'vendor', target);
    if (check) require('node:assert/strict').equal(fs.readFileSync(output, 'utf8'), result.code, `Rebuild ${target}`);
    else fs.writeFileSync(output, result.code);
  }
}
module.exports = build;
if (require.main === module) build(process.argv.includes('--check'));
