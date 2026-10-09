// 100 x 150 mm. Keep content inside 76% so 125% printing retains a margin.
// Embed the original PDF instead of rasterizing or discarding product columns.
(function (root) {
  const PAPER = [100 * 72 / 25.4, 150 * 72 / 25.4];
  function placement(width, height, rotation = 0) {
    rotation = ((rotation % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(rotation)) throw new Error('不支援的 PDF 旋轉角度');
    const sideways = rotation === 90 || rotation === 270;
    const scale = Math.min(PAPER[0] * 0.76 / (sideways ? height : width), PAPER[1] * 0.76 / (sideways ? width : height));
    const w = width * scale, h = height * scale;
    const visibleWidth = sideways ? h : w, visibleHeight = sideways ? w : h;
    let x = (PAPER[0] - visibleWidth) / 2, y = (PAPER[1] - visibleHeight) / 2;
    if (rotation === 90) y += w;
    if (rotation === 180) { x += w; y += h; }
    if (rotation === 270) x += h;
    return { x, y, width: w, height: h, rotation: -rotation, visibleWidth, visibleHeight };
  }
  async function appendPackingPage(out, sourcePage, PDFLib) {
    const crop = sourcePage.getCropBox();
    const media = sourcePage.getMediaBox();
    const box = { left: Math.max(crop.x, media.x), bottom: Math.max(crop.y, media.y), right: Math.min(crop.x + crop.width, media.x + media.width), top: Math.min(crop.y + crop.height, media.y + media.height) };
    if (box.right <= box.left || box.top <= box.bottom) throw new Error('裝箱單頁面尺寸無效');
    const embedded = await out.embedPage(sourcePage, box);
    const fit = placement(embedded.width, embedded.height, sourcePage.getRotation().angle);
    const page = out.addPage(PAPER);
    page.drawPage(embedded, { x: fit.x, y: fit.y, width: fit.width, height: fit.height, rotate: PDFLib.degrees(fit.rotation) });
    return page;
  }
  root.LHPrintLayout = { PAPER, placement, appendPackingPage };
  if (typeof module !== 'undefined') module.exports = root.LHPrintLayout;
})(globalThis);
