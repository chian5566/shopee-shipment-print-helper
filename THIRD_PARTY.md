# 第三方程式與字型

本安裝包僅附可散布的開源元件，不附 Arial Unicode、Hiragino 或其他本機系統字型。

| 元件 | 版本／來源 | 授權 |
| --- | --- | --- |
| PDF.js | pdfjs-dist 6.4.299，legacy build | Apache-2.0；vendor/PDFJS-LICENSE |
| pdf-lib | 1.17.1 | MIT；vendor/PDFLIB-LICENSE |
| @pdf-lib/fontkit | 1.1.1，Hopding/fontkit | MIT；vendor/FONTKIT-LICENSE |
| pako（fontkit 內含） | fontkit 相依元件 | MIT／Zlib；vendor/PAKO-LICENSE |
| jsQR | 1.4.0 | Apache-2.0；vendor/JSQR-LICENSE |
| html2canvas | 1.4.1 | MIT；vendor/HTML2CANVAS-LICENSE |
| Noto Sans TC | google/fonts 的 NotoSansTC[wght].ttf，固定為 400 字重以供 PDF 使用 | SIL OFL 1.1；vendor/NOTO-LICENSE |

Noto 字型來源：https://github.com/google/fonts/tree/main/ofl/notosanstc

fontkit 原始授權聲明：https://github.com/Hopding/fontkit#license

PDF.js 的 `pdf.classic.min.js` 與 `pdf.worker.classic.min.js` 由同目錄的官方 legacy `.mjs` 以鎖定版本 esbuild 轉成 IIFE；保留授權註記。執行 `npm run build:pdf` 可重建。此瀏覽器版本使用預載的 WorkerMessageHandler，沿用原有同執行緒解析方式。
