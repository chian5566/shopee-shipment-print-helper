// 100 x 150 mm. Keep content inside 76% so 125% printing retains a margin.
// Embed the original PDF instead of rasterizing or discarding product columns.
(function (root) {
  const PAPER = [100 * 72 / 25.4, 150 * 72 / 25.4];
  function placement(width, height, rotation = 0, contentRatio = 0.76) {
    rotation = ((rotation % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation)) throw new Error('不支援的 PDF 旋轉角度');
    const sideways = rotation === 90 || rotation === 270;
    const scale = Math.min(PAPER[0] * contentRatio / (sideways ? height : width), PAPER[1] * contentRatio / (sideways ? width : height));
    const w = width * scale, h = height * scale;
    const visibleWidth = sideways ? h : w, visibleHeight = sideways ? w : h;
    let x = (PAPER[0] - visibleWidth) / 2, y = (PAPER[1] - visibleHeight) / 2;
    if (rotation === 90) y += w;
    if (rotation === 180) { x += w; y += h; }
    if (rotation === 270) x += h;
    return { x, y, width: w, height: h, rotation: -rotation, visibleWidth, visibleHeight };
  }
  async function appendPackingPage(out, sourcePage, PDFLib, contentRatio = 0.76, region = null) {
    const crop = region || sourcePage.getCropBox();
    const media = sourcePage.getMediaBox();
    const box = { left: Math.max(crop.x, media.x), bottom: Math.max(crop.y, media.y), right: Math.min(crop.x + crop.width, media.x + media.width), top: Math.min(crop.y + crop.height, media.y + media.height) };
    if (box.right <= box.left || box.top <= box.bottom) throw new Error('裝箱單頁面尺寸無效');
    const embedded = await out.embedPage(sourcePage, box);
    const fit = placement(embedded.width, embedded.height, sourcePage.getRotation().angle, contentRatio);
    const page = out.addPage(PAPER);
    page.drawPage(embedded, { x: fit.x, y: fit.y, width: fit.width, height: fit.height, rotate: PDFLib.degrees(fit.rotation) });
    return page;
  }
  function isHctOrder(order) {
    return /新竹(?:物流|貨運)|\bHCT\b/i.test(order?.summary || '');
  }
  async function appendHctLabel(out, sourcePage, PDFLib, region = null) {
    // Preserve vector text/barcodes; normalize crop/rotation to 100 x 150 mm.
    const page = await appendPackingPage(out, sourcePage, PDFLib, 1, region);
    // 80% in the PDF x 125% in the print dialog = original fitted size.
    // Match the top-left print origin used by packing slips and 7-ELEVEN.
    page.scaleContent(0.8, 0.8);
    page.translateContent(0, PAPER[1] * 0.2);
    return page;
  }
  root.LHPrintLayout = { PAPER, placement, appendPackingPage, isHctOrder, appendHctLabel };
  if (typeof module !== 'undefined') module.exports = root.LHPrintLayout;
})(globalThis);
