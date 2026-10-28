(() => {
  if (window.__lhPrintGuideLoaded) return;
  window.__lhPrintGuideLoaded = true;
  const ID = 'lh-print-guide';
  const clean = text => (text || '').replace(/\s+/g, ' ').trim();
  let root;
  const bubbles = new Map();

  // Inputs are often transparent/zero-sized; anchor to the visible indicator.
  function anchor(control) {
    if (!control || control.disabled) return null;
    const label = control.closest('label');
    const candidates = [label?.querySelector('.eds-checkbox__indicator, .eds-radio__indicator'), control, label];
    return candidates.find(node => {
      if (!node) return false;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }) || null;
  }
  function radio(value) {
    return [...document.querySelectorAll(`input[type="radio"][value="${value}"]`)].find(input => anchor(input));
  }
  function checkbox(title) {
    return [...document.querySelectorAll('input[type="checkbox"]')].find(input => {
      if (input.closest('.mass-ship-row, #lh-shipment-panel')) return false;
      return anchor(input) && (input.value === title || clean(input.closest('label')?.textContent) === title);
    });
  }
  function remove() {
    root?.remove(); root = null; bubbles.clear();
  }
  function steps() {
    if (!/^\/portal\/sale\/mass\/ship(?:\/|$)/.test(location.pathname)) return [];
    const download = [...document.querySelectorAll('button, [role="button"]')].find(button =>
      !button.closest('#lh-shipment-panel') && button.getClientRects().length && clean(button.textContent).replace(/\s/g, '').includes('下載所選文件'));
    if (!download) return [];
    const all = [...document.querySelectorAll('.mass-ship-header input[type="checkbox"]')].find(input => anchor(input));
    const selected = [...document.querySelectorAll('.mass-ship-row')].some(row => row.querySelector('input[type="checkbox"]:checked'));
    const shipping = checkbox('寄件單'), packing = checkbox('裝箱單');
    const thermal = radio('C2C_SHIPPING_LABEL_THERMAL'), pdf = radio('PACKING_LIST_PDF');
    const result = [];
    const add = (key, control, text, done) => { if (anchor(control)) result.push({key, control, text, done}); };
    add('orders', all, '勾選訂單', selected);
    // A format cannot be selected until its document checkbox is enabled.
    if (shipping && !shipping.checked) add('shipping', shipping, '勾選寄件單', false);
    else if (thermal) add('thermal', thermal, '選擇「熱感列印」', thermal.checked);
    else if (shipping) add('shipping', shipping, '勾選寄件單', shipping.checked);
    if (packing && !packing.checked) add('packing', packing, '勾選裝箱單', false);
    else if (pdf) add('pdf', pdf, '選擇「PDF」', pdf.checked);
    result.push({key:'download', control:download, text:'點擊「下載所選文件」', done:false});
    return result;
  }
  function render() {
    const items = steps();
    if (!items.length) { remove(); return; }
    if (!root?.isConnected) {
      root = document.createElement('div'); root.id = ID;
      root.setAttribute('aria-label', '印單助手操作提示');
      document.documentElement.append(root);
    }
    const keys = new Set(items.map(item => item.key));
    for (const [key, bubble] of bubbles) if (!keys.has(key)) { bubble.remove(); bubbles.delete(key); }
    const placed = [];
    const controls = [...document.querySelectorAll('input[type="checkbox"], input[type="radio"], button, [role="button"]')]
      .filter(node => !node.closest('#lh-shipment-panel'))
      .map(node => node.closest('label') || node)
      .filter(node => node.getClientRects().length)
      .map(node => node.getBoundingClientRect());
    items.forEach((item, index) => {
      let bubble = bubbles.get(item.key);
      if (!bubble) {
        bubble = document.createElement('div'); bubble.className = 'lh-guide-bubble';
        root.append(bubble); bubbles.set(item.key, bubble);
      }
      const text = `${index + 1}. ${item.text}${item.done ? ' ✓' : ''}`;
      if (bubble.textContent !== text) bubble.textContent = text;
      bubble.dataset.done = String(item.done);
      const target = anchor(item.control);
      const box = target?.getBoundingClientRect();
      // Do not pin an offscreen target's bubble to an unrelated viewport edge.
      const panel = document.getElementById('lh-shipment-panel')?.getBoundingClientRect();
      const right = panel && panel.width > 0 ? Math.min(innerWidth, panel.left) : innerWidth;
      const visible = box && box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < right;
      bubble.hidden = !visible;
      if (!visible) return;
      const width = bubble.offsetWidth, height = bubble.offsetHeight;
      const labelBox = item.control.closest('label')?.getBoundingClientRect() || box;
      const center = box.left + box.width / 2;
      const horizontal = [center - 12, center - width / 2, center - width + 12]
        .map(left => Math.max(8, Math.min(left, right - width - 8)));
      const candidates = [
        ...horizontal.map(left => ({left, top:labelBox.top - height - 9, below:false})),
        ...horizontal.map(left => ({left, top:labelBox.bottom + 9, below:true}))
      ];
      const position = candidates.find(p => {
        if (p.top < 8 || p.top + height > innerHeight - 8 || center < p.left + 5 || center > p.left + width - 5) return false;
        return ![...controls, ...placed].some(other => p.left < other.right + 3 && p.left + width + 3 > other.left && p.top < other.bottom + 3 && p.top + height + 3 > other.top);
      });
      if (!position) { bubble.hidden = true; return; }
      const {left, top, below} = position;
      bubble.dataset.below = String(below);
      bubble.style.left = `${Math.round(left)}px`; bubble.style.top = `${Math.round(top)}px`;
      bubble.style.setProperty('--lh-guide-arrow', `${Math.max(12, Math.min(width - 12, box.left + box.width / 2 - left))}px`);
      placed.push({left, right:left + width, top, bottom:top + height});
    });
  }
  // A single throttled update also catches Vue remounts and programmatic defaults.
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  }
  document.addEventListener('change', schedule, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.setInterval(schedule, 250);
  window.addEventListener('pagehide', remove);
  window.addEventListener('pageshow', schedule);
  schedule();
})();
