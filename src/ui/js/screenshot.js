'use strict';
/* Screenshot-Werkzeug: Bereich auswählen, sichtbarer Bereich oder ganze Seite → Zwischenablage */

const Screenshot = (() => {
  const dataUrlToBytes = (url) => Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));

  function activeWebview() {
    const t = Tabs.active();
    return t?.webview && t.ready ? t.webview : null;
  }

  async function finish(dataUrl) {
    if (!dataUrl) { toast($t('Screenshot fehlgeschlagen'), 'warning'); return; }
    const ok = await F.writeImage(dataUrlToBytes(dataUrl));
    toast(ok ? $t('Screenshot in die Zwischenablage kopiert') : $t('Screenshot fehlgeschlagen'), ok ? 'image' : 'warning',
      { label: $t('Speichern'), onClick: () => F.screenshot.save(dataUrl) });
  }

  async function capture(mode) {
    const wv = activeWebview();
    if (!wv) { toast($t('Auf dieser Seite ist kein Screenshot möglich.'), 'warning'); return; }
    const id = wv.getWebContentsId();
    if (mode === 'area') return selectArea(wv, await F.screenshot.capture(id, 'visible'));
    finish(await F.screenshot.capture(id, mode));
  }

  // Bereich auf einem Standbild der Seite aufziehen
  function selectArea(wv, dataUrl) {
    if (!dataUrl) return finish(null);
    const r = wv.getBoundingClientRect();
    const img = h('img', { class: 'shot-img', src: dataUrl, alt: '' });
    const sel = h('div', { class: 'shot-sel hidden' });
    const hint = h('div', { class: 'shot-hint' }, $t('Bereich aufziehen · Esc zum Abbrechen'));
    const layer = h('div', { class: 'shot-layer', style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` } }, img, sel, hint);
    document.body.append(layer);
    let start = null;
    const close = () => { layer.remove(); window.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    const box = (e) => {
      const x = Math.max(0, Math.min(e.clientX - r.left, r.width)), y = Math.max(0, Math.min(e.clientY - r.top, r.height));
      return { x1: Math.min(start.x, x), y1: Math.min(start.y, y), x2: Math.max(start.x, x), y2: Math.max(start.y, y) };
    };
    layer.addEventListener('mousedown', (e) => {
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      sel.classList.remove('hidden');
      hint.classList.add('hidden');
    });
    layer.addEventListener('mousemove', (e) => {
      if (!start) return;
      const b = box(e);
      Object.assign(sel.style, { left: `${b.x1}px`, top: `${b.y1}px`, width: `${b.x2 - b.x1}px`, height: `${b.y2 - b.y1}px` });
    });
    layer.addEventListener('mouseup', async (e) => {
      if (!start) return;
      const b = box(e);
      close();
      if (b.x2 - b.x1 < 4 || b.y2 - b.y1 < 4) return;
      await img.decode().catch(() => {});
      const sx = img.naturalWidth / r.width, sy = img.naturalHeight / r.height;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round((b.x2 - b.x1) * sx);
      canvas.height = Math.round((b.y2 - b.y1) * sy);
      canvas.getContext('2d').drawImage(img, b.x1 * sx, b.y1 * sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      finish(canvas.toDataURL('image/png'));
    });
  }

  function menu(anchorPoint) {
    showMenu([
      { label: $t('Bereich auswählen'), icon: 'scissors', shortcut: kb('Strg+Umschalt+S'), onClick: () => capture('area') },
      { label: $t('Sichtbarer Bereich'), icon: 'monitor', onClick: () => capture('visible') },
      { label: $t('Ganze Seite'), icon: 'file', onClick: () => capture('full') }
    ], anchorPoint || { anchor: $('#menuBtn'), align: 'end' });
  }

  return { capture, menu };
})();
