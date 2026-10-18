const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const manifest = require('../manifest.json');

test('manifest PDF scripts parse concurrent documents without dynamic import', async () => {
  const context = vm.createContext({
    console, TextEncoder, TextDecoder, URL, URLSearchParams, Blob, AbortController,
    Response, Request, Headers, DOMException, AbortSignal, ...require('@napi-rs/canvas'),
    setTimeout, clearTimeout, queueMicrotask, structuredClone, performance,
    atob, btoa, Uint8Array, Uint8ClampedArray, ArrayBuffer, ReadableStream,
    // Browser context: no process/module/require, no Worker, no network.
  });
  const scripts = manifest.content_scripts.find(s => s.js?.includes('content.js')).js;
  for (const file of scripts.filter(p => p.startsWith('vendor/pdf.') && p.endsWith('.js'))) {
    const code = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    vm.runInContext(code, context, { filename: file, importModuleDynamically() { throw new Error('Module imports are blocked'); } });
  }
  const pdfjs = context.pdfjsLib;
  assert.equal(pdfjs.version, '6.4.299');
  assert.equal(typeof context.pdfjsWorker.WorkerMessageHandler, 'function');
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.addPage().drawText('PDF runtime works', { font });
  const bytes = await source.save();
  await Promise.all([1, 2].map(async () => {
    const loading = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, enableScripting: false });
    const pdf = await loading.promise;
    try {
      assert.equal(pdf.numPages, 1);
      const text = (await (await pdf.getPage(1)).getTextContent()).items.map(i => i.str).join(' ');
      assert.equal(text, 'PDF runtime works');
    } finally { await loading.destroy(); }
  }));
});
