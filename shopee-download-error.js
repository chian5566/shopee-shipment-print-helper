(() => {
  if (globalThis.LHShopeeDownloadError) return;
  const title = '下載文件失敗';
  function visibleTitles(document) {
    const body = document.body;
    if (!body?.innerText.includes(title)) return [];
    return [...body.querySelectorAll('*')].filter(node =>
      node.textContent.trim() === title &&
      !node.closest('#lh-shipment-panel, #lh-error-dialog') &&
      ![...node.children].some(child => child.textContent.trim() === title) &&
      node.getClientRects().length > 0 &&
      getComputedStyle(node).visibility === 'visible'
    );
  }
  globalThis.LHShopeeDownloadError = {
    visibleTitles,
    message: '蝦皮下載文件失敗：目前無法列印出貨文件，請稍後再試。若仍無法展示資訊，請與蝦皮客服聯繫。'
  };
})();
