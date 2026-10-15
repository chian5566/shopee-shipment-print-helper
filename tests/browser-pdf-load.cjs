// Optional integration check: CHROME_PATH=/path/to/chrome node tests/browser-pdf-load.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(require.resolve('playwright', { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
const { PDFDocument, StandardFonts } = require('pdf-lib');

(async () => {
  const root = path.resolve(__dirname, '..');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-pdf-browser-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.CHROME_PATH, channel: 'chromium', headless: true,
      args: ['--no-sandbox', `--disable-extensions-except=${root}`, `--load-extension=${root}`],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    let moduleRequests = 0;
    await context.route('**/*', route => {
      if (/\.mjs(?:$|\?)/.test(route.request().url())) {
        moduleRequests++;
        return route.abort();
      }
      return route.fulfill({ status: 200, contentType: 'text/html',
        headers: { 'Content-Security-Policy': "default-src 'none'; script-src 'none'" },
        body: '<!doctype html><title>Local extension integration fixture</title><body></body>' });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    await page.goto('https://seller.shopee.tw/portal/sale/mass/ship');
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('PDF module ready', { font });
    const bytes = Array.from(await pdf.save());
    const result = await worker.evaluate(async bytes => {
      const [tab] = await chrome.tabs.query({ url: 'https://seller.shopee.tw/portal/sale/mass/ship' });
      const [frame] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, world: 'ISOLATED', args: [bytes],
        func: async bytes => {
          const pdfjs = globalThis.pdfjsLib;
          if (!pdfjs || !globalThis.pdfjsWorker?.WorkerMessageHandler) throw new Error('PDF scripts not loaded');
          const results = await Promise.all([1, 2].map(async () => {
            const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, enableScripting: false });
            const pdf = await loading.promise;
            try { return (await (await pdf.getPage(1)).getTextContent()).items.map(i => i.str).join(' '); }
            finally { await loading.destroy(); }
          }));
          return { version: pdfjs.version, results };
        },
      });
      return frame.result;
    }, bytes);
    assert.equal(result.version, '6.4.299');
    assert.deepEqual(result.results, ['PDF module ready', 'PDF module ready']);
    assert.equal(await page.evaluate(() => typeof globalThis.pdfjsLib), 'undefined', 'PDF globals must remain isolated');
    assert.equal(moduleRequests, 0);
    console.log('PASS: real Chromium extension parses concurrent PDFs with strict page CSP, no module fetch, and isolated globals');
  } finally {
    await context?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
