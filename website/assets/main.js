'use strict';
/* Falcon – Website: Menü, Einblenden, Lightbox, aktuelle Version von GitHub */

document.documentElement.classList.remove('no-js');

// ---------- Menü ----------
const header = document.querySelector('.header');
const nav = document.querySelector('.nav');
const menuBtn = document.querySelector('.menu-btn');
if (menuBtn && nav) {
  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  };
  menuBtn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  window.matchMedia('(min-width: 921px)').addEventListener('change', (m) => { if (m.matches) setOpen(false); });
}
const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---------- Einblenden ----------
const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }) : null;
document.querySelectorAll('.reveal, .hero-shot').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));

// ---------- Lightbox ----------
const shots = [...document.querySelectorAll('[data-lightbox]')];
if (shots.length) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML = `
    <button class="lb-close" aria-label="Schließen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <button class="lb-nav lb-prev" aria-label="Vorheriges Bild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 6-6 6 6 6"/></svg></button>
    <figure style="margin:0"><img alt="" /><p></p></figure>
    <button class="lb-nav lb-next" aria-label="Nächstes Bild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg></button>`;
  document.body.append(box);
  const img = box.querySelector('img');
  const cap = box.querySelector('p');
  let index = 0, lastFocus = null;
  const show = (i) => {
    index = (i + shots.length) % shots.length;
    img.src = shots[index].dataset.lightbox;
    img.alt = shots[index].dataset.caption || '';
    cap.textContent = shots[index].dataset.caption || '';
  };
  const open = (i) => { lastFocus = document.activeElement; show(i); box.classList.add('open'); document.body.style.overflow = 'hidden'; box.querySelector('.lb-close').focus(); };
  const close = () => { box.classList.remove('open'); document.body.style.overflow = ''; lastFocus?.focus(); };
  shots.forEach((s, i) => s.addEventListener('click', () => open(i)));
  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  box.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  let startX = null;
  box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    startX = null;
  });
}

// ---------- Aktuelle Versionen von GitHub ----------
// Eine Abfrage für alles: die letzten Releases (Windows-Installer, Android-APK) und – falls gerade ein
// Release gebaut wird – dessen Stand. „Fertig“ heißt: die Datei liegt im Release.
// Bis die Daten da sind, zeigt die Seite „Neueste Version wird geladen …“ mit gelbem Punkt –
// nie eine veraltete Versionsnummer.
const REPO = 'calvinistkrass/Falcon';
const FALLBACK = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = 'falcon.dl3';
const gh = (url) => fetch(url, { headers: { accept: 'application/vnd.github+json' } })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
const verOf = (name) => (String(name).match(/(\d+\.\d+\.\d+)/) || [])[1] || '';
const mb = (n) => `${(n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;
const dateDe = (d) => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const SPIN = '<span class="spin" aria-hidden="true"></span>';

function cachedDownloads() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    // Während ein Build läuft öfter nachsehen
    if (c && Date.now() - c.at < (c.data.build ? 90_000 : 5 * 60_000)) return c.data;
  } catch { /* egal */ }
  return null;
}
async function fetchDownloads() {
  const [releases, runs] = await Promise.all([
    gh(`https://api.github.com/repos/${REPO}/releases?per_page=10`),
    gh(`https://api.github.com/repos/${REPO}/actions/workflows/release.yml/runs?per_page=1`).catch(() => null)
  ]);
  const list = (Array.isArray(releases) ? releases : []).filter((r) => !r.draft && !r.prerelease);
  const findAsset = (test) => {
    for (const r of list) { const a = (r.assets || []).find((x) => test(x.name)); if (a) return { r, a }; }
    return null;
  };
  const exe = findAsset((n) => /\.exe$/i.test(n) && !/blockmap/i.test(n));
  const apk = findAsset((n) => /^Falcon-Mobile-.*\.apk$/i.test(n));
  const pick = (re) => { const f = findAsset((n) => re.test(n)); return f ? { url: f.a.browser_download_url, size: f.a.size, version: verOf(f.a.name), date: f.r.published_at } : null; };
  const mac = { arm64: pick(/-mac-arm64\.dmg$/i), x64: pick(/-mac-x64\.dmg$/i) };
  const linux = { deb: pick(/-linux-[\w]+\.deb$/i), rpm: pick(/-linux-[\w]+\.rpm$/i) };
  const data = {
    version: exe ? exe.r.tag_name.replace(/^v/, '') : '',
    url: exe ? exe.a.browser_download_url : FALLBACK,
    size: exe ? exe.a.size : 0,
    date: exe ? exe.r.published_at : '',
    apk: apk ? { url: apk.a.browser_download_url, size: apk.a.size, version: verOf(apk.a.name), date: apk.r.published_at } : null,
    mac: mac.arm64 || mac.x64 ? mac : null,
    linux: linux.deb || linux.rpm ? linux : null,
    build: null
  };
  const run = runs?.workflow_runs?.[0];
  if (run && run.status !== 'completed' && /^v\d+\.\d+\.\d+$/.test(run.head_branch || '') && Date.now() - Date.parse(run.created_at) < 6 * 3600_000) {
    const target = list.find((r) => r.tag_name === run.head_branch);
    const has = (test) => !!target && (target.assets || []).some((x) => test(x.name));
    const windows = has((n) => /\.exe$/i.test(n) && !/blockmap/i.test(n));
    const android = has((n) => /\.apk$/i.test(n));
    const macDone = has((n) => /-mac-.*\.dmg$/i.test(n));
    const linuxDone = has((n) => /\.(deb|rpm)$/i.test(n));
    if (!windows || !android || !macDone || !linuxDone) data.build = { version: run.head_branch.slice(1), windows, android, mac: macDone, linux: linuxDone };
  }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* egal */ }
  return data;
}

function renderDownloads(d) {
  document.querySelectorAll('[data-version-badge]').forEach((el) => {
    el.classList.remove('is-loading');
    el.querySelector('[data-badge-text]').textContent = d.version ? `Version ${d.version}${el.dataset.badgeSuffix || ''}` : 'Neueste Version';
  });
  if (d.version) document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = d.version; });
  document.querySelectorAll('[data-download]').forEach((a) => { a.href = d.url; });
  document.querySelectorAll('[data-win-meta]').forEach((el) => {
    el.textContent = d.version ? [`Version ${d.version}`, d.size && mb(d.size), d.date && dateDe(d.date)].filter(Boolean).join(' · ') : 'Neueste Version auf GitHub';
  });
  if (d.apk) {
    document.querySelectorAll('[data-apk]').forEach((a) => { a.href = d.apk.url; });
    document.querySelectorAll('[data-apk-version]').forEach((el) => { if (d.apk.version) el.textContent = d.apk.version; });
    document.querySelectorAll('[data-apk-meta]').forEach((el) => {
      el.textContent = [d.apk.version && `Version ${d.apk.version}`, d.apk.size && mb(d.apk.size), d.apk.date && dateDe(d.apk.date)].filter(Boolean).join(' · ');
    });
  } else {
    document.querySelectorAll('[data-apk-meta]').forEach((el) => { el.textContent = 'Noch keine Version veröffentlicht'; });
    document.querySelectorAll('[data-apk-label]').forEach((el) => { el.textContent = 'Bald verfügbar'; });
  }

  // macOS und Linux: je zwei Downloads (Apple-Chip/Intel, .deb/.rpm)
  const meta = (x) => (x ? [x.version && `Version ${x.version}`, x.size && mb(x.size), x.date && dateDe(x.date)].filter(Boolean).join(' · ') : '');
  const fill = (attr, metaAttr, group, keys) => {
    document.querySelectorAll(`[${metaAttr}]`).forEach((el) => { el.textContent = group ? meta(group[keys[0]] || group[keys[1]]) : 'Erscheint mit dem nächsten Release'; });
    document.querySelectorAll(`[${attr}]`).forEach((a) => {
      const x = group?.[a.getAttribute(attr)];
      if (x) { a.href = x.url; a.classList.remove('is-off'); a.removeAttribute('aria-disabled'); }
      else { a.classList.add('is-off'); a.setAttribute('aria-disabled', 'true'); }
    });
  };
  fill('data-mac', 'data-mac-meta', d.mac, ['arm64', 'x64']);
  fill('data-linux', 'data-linux-meta', d.linux, ['deb', 'rpm']);

  // Neue Version wird gerade gebaut → Hinweis oben auf jeder Seite und pro Plattform auf der Download-Seite
  document.querySelectorAll('.build-banner').forEach((el) => el.remove());
  document.querySelectorAll('[data-build-win], [data-build-apk], [data-build-mac], [data-build-linux]').forEach((el) => { el.hidden = true; });
  const b = d.build;
  if (!b) return;
  const main = document.querySelector('main');
  if (main) {
    // Welche Plattformen sind schon da, welche werden noch gebaut?
    const all = [['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux'], ['android', 'Android']];
    const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);
    const pending = all.filter(([k]) => !b[k]).map(([, n]) => n);
    const ready = all.filter(([k]) => b[k]).map(([, n]) => n);
    const text = !b.windows
      ? `<b>Die neue Version wird für den Download vorbereitet.</b> Falcon ${b.version} für ${list(pending)} ist in den nächsten Minuten bis Stunden verfügbar.`
      : `<b>Falcon ${b.version} für ${list(pending)} wird für den Download vorbereitet.</b> Das dauert noch einige Minuten bis Stunden – ${list(ready)} ${ready.length > 1 ? 'sind' : 'ist'} schon da.`;
    const bar = document.createElement('div');
    bar.className = 'build-banner';
    bar.setAttribute('role', 'status');
    bar.innerHTML = `<div class="container">${SPIN}<span>${text}</span>${location.pathname.startsWith('/download') ? '' : '<a href="/download">Zum Download</a>'}</div>`;
    main.prepend(bar);
  }
  if (!b.windows) {
    document.querySelectorAll('[data-build-win]').forEach((el) => {
      el.innerHTML = `${SPIN}<span>Version ${b.version} wird gerade für den Download vorbereitet. Bis dahin bekommst du ${d.version ? `Version ${d.version}` : 'die bisherige Version'} – sie aktualisiert sich danach automatisch.</span>`;
      el.hidden = false;
    });
  }
  for (const [key, attr, name] of [['mac', 'data-build-mac', 'macOS'], ['linux', 'data-build-linux', 'Linux']]) {
    if (b[key]) continue;
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      el.innerHTML = `${SPIN}<span>Version ${b.version} für ${name} wird gerade für den Download vorbereitet. Das dauert noch einige Minuten bis Stunden.</span>`;
      el.hidden = false;
    });
  }
  if (!b.android) {
    document.querySelectorAll('[data-build-apk]').forEach((el) => {
      el.innerHTML = `${SPIN}<span>Die neue Android-Version wird gerade für den Download vorbereitet. Bis dahin bekommst du ${d.apk?.version ? `Version ${d.apk.version}` : 'die bisherige'}.</span>`;
      el.hidden = false;
    });
  }
}

const cached = cachedDownloads();
if (cached) renderDownloads(cached);
else {
  fetchDownloads().then(renderDownloads).catch(() => {
    // GitHub nicht erreichbar (oder Limit erreicht): Links führen zur Release-Seite
    document.querySelectorAll('[data-version-badge]').forEach((el) => { el.classList.remove('is-loading'); el.querySelector('[data-badge-text]').textContent = 'Neueste Version'; });
    document.querySelectorAll('[data-win-meta], [data-apk-meta]').forEach((el) => { el.textContent = 'Neueste Version auf GitHub'; });
  });
}

// ---------- Gerät erkennen und passende Version anbieten ----------
async function detectDevice() {
  const ua = navigator.userAgent || '';
  const uad = navigator.userAgentData;
  let platform = 'windows', name = '', model = '', version = '', arch = '';
  if (/Android/i.test(ua)) {
    platform = 'android';
    version = (ua.match(/Android ([\d.]+)/) || [])[1] || '';
    model = (ua.match(/Android [\d.]+;\s*([^;)]+?)(?:\s+Build\/|\))/) || [])[1] || '';
    name = /Mobile/i.test(ua) ? 'Android-Handy' : 'Android-Tablet';
  } else if (/iPhone|iPod/i.test(ua)) {
    platform = 'ios'; name = 'iPhone'; version = (ua.match(/OS (\d+)_(\d+)/) || []).slice(1, 3).join('.');
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    platform = 'ios'; name = 'iPad'; version = (ua.match(/OS (\d+)_(\d+)/) || []).slice(1, 3).join('.');
  } else if (/CrOS/i.test(ua)) {
    platform = 'android'; name = 'Chromebook';
  } else if (/Windows NT/i.test(ua)) {
    platform = 'windows'; name = 'Windows-PC';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    platform = 'mac'; name = 'Mac';
  } else if (/Linux/i.test(ua)) {
    platform = 'linux'; name = 'Linux-PC';
  }
  // Chromium nennt das echte Modell und die Windows-Version nur auf Nachfrage
  if (uad?.getHighEntropyValues) {
    try {
      const h = await uad.getHighEntropyValues(['model', 'platformVersion', 'architecture']);
      if (platform === 'mac' && h.architecture) arch = h.architecture === 'arm' ? 'arm64' : 'x64';
      if (h.model) model = h.model;
      if (platform === 'windows' && h.platformVersion) version = Number(h.platformVersion.split('.')[0]) >= 13 ? '11' : '10';
      if (platform === 'android' && h.platformVersion) version = h.platformVersion.replace(/\.0(\.0)?$/, '');
    } catch { /* egal */ }
  }
  if (model === 'K' || /^Linux/i.test(model)) model = ''; // gekürzte Kennung neuer Chrome-Versionen
  const os = { windows: 'Windows', android: 'Android', ios: name === 'iPad' ? 'iPadOS' : 'iOS', mac: 'macOS', linux: 'Linux' }[platform];
  const device = model || name;
  return { platform, arch, label: [device, arch === 'arm64' ? 'Apple-Chip' : arch === 'x64' && platform === 'mac' ? 'Intel' : '', version ? `${os} ${version}` : (model ? os : '')].filter(Boolean).join(' · ') };
}

const PLATFORM_KEY = 'falcon.platform';
const picker = document.querySelector('[data-platform]');
const HOME_CTA = { windows: 'Kostenlos herunterladen', android: 'App für Android herunterladen', ios: 'Falcon auf iPhone & iPad', mac: 'Für macOS herunterladen', linux: 'Für Linux herunterladen' };
const SOON = {
  ios: { title: 'Falcon für iPhone & iPad', text: 'Eine eigene App für iPhone und iPad gibt es noch nicht. Bis dahin zeigt dir die Falcon-Web-App deine Lesezeichen und die Tabs deiner PCs.', btn: 'Zur Falcon-Web-App', href: '/app' },

};

// Eigenes Auswahlmenü: der ganze Knopf öffnet die Liste; Maus, Touch und Tastatur
const menuRoot = document.querySelector('[data-platform-menu]');
function syncMenu(p) {
  if (!menuRoot) return;
  const opt = menuRoot.querySelector(`[data-value="${p}"]`);
  if (!opt) return;
  menuRoot.querySelector('[data-platform-current]').innerHTML = opt.querySelector('b').innerHTML;
  menuRoot.querySelector('[data-platform-icon]').innerHTML = opt.querySelector('.dl-opt-ic').innerHTML;
  menuRoot.querySelectorAll('[role="option"]').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
}
if (menuRoot) {
  const btn = menuRoot.querySelector('.dl-select-btn');
  const list = menuRoot.querySelector('.dl-select-list');
  const options = [...list.querySelectorAll('[role="option"]')];
  let active = -1;
  const highlight = (i) => {
    active = (i + options.length) % options.length;
    options.forEach((o, k) => o.classList.toggle('hl', k === active));
    list.setAttribute('aria-activedescendant', options[active].id);
    options[active].scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    list.hidden = false;
    menuRoot.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    highlight(Math.max(0, options.findIndex((o) => o.getAttribute('aria-selected') === 'true')));
    list.focus();
  };
  const close = (focusBtn = true) => {
    if (list.hidden) return;
    list.hidden = true;
    menuRoot.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) btn.focus();
  };
  const choose = (o) => {
    close();
    if (picker && picker.value !== o.dataset.value) {
      picker.value = o.dataset.value;
      picker.dispatchEvent(new Event('change'));
    }
  };
  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  options.forEach((o, i) => {
    o.addEventListener('click', () => choose(o));
    o.addEventListener('mousemove', () => { if (active !== i) highlight(i); });
  });
  btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open(); } });
  list.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); highlight(0); }
    else if (e.key === 'End') { e.preventDefault(); highlight(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') { close(e.key === 'Escape'); }
  });
  document.addEventListener('click', (e) => { if (!menuRoot.contains(e.target)) close(false); });
}

function showPlatform(p) {
  document.querySelectorAll('[data-platform-box]').forEach((el) => { el.hidden = !el.dataset.platformBox.split(' ').includes(p); });
  document.querySelectorAll('[data-platform-steps]').forEach((el) => { el.hidden = !el.dataset.platformSteps.split(' ').includes(p); });
  const soon = SOON[p];
  if (soon) {
    document.querySelector('[data-soon-title]').textContent = soon.title;
    document.querySelector('[data-soon-text]').textContent = soon.text;
    const btn = document.querySelector('[data-soon-btn]');
    btn.textContent = soon.btn;
    btn.href = soon.href;
  }
  if (picker && picker.value !== p) picker.value = p;
  syncMenu(p);
}

if (picker) {
  // Sofort die naheliegende Plattform zeigen, dann genauer erkennen
  showPlatform('windows');
  document.querySelector('[data-soon-btn]')?.addEventListener('click', (e) => {
    if (e.currentTarget.getAttribute('href') === '#windows') { e.preventDefault(); showPlatform('windows'); }
  });
  // Links wie /download#linux auf derselben Seite
  addEventListener('hashchange', () => {
    const p = { '#android': 'android', '#windows': 'windows', '#ios': 'ios', '#mac': 'mac', '#linux': 'linux' }[location.hash];
    if (p) showPlatform(p);
  });
  picker.addEventListener('change', () => {
    showPlatform(picker.value);
    try { localStorage.setItem(PLATFORM_KEY, picker.value); } catch { /* egal */ }
  });
}
detectDevice().then((dev) => {
  // Startseite: Knopf passend zum Gerät beschriften
  document.querySelectorAll('[data-cta]').forEach((a) => {
    const label = a.querySelector('[data-cta-label]');
    if (label) label.textContent = HOME_CTA[dev.platform];
    if (dev.platform !== 'windows') a.href = `/download#${dev.platform}`;
  });
  if (!picker) return;
  let chosen = '';
  try { chosen = localStorage.getItem(PLATFORM_KEY) || ''; } catch { /* egal */ }
  const fromHash = { '#android': 'android', '#windows': 'windows', '#ios': 'ios', '#mac': 'mac', '#linux': 'linux' }[location.hash] || '';
  const info = document.querySelector('[data-detected]');
  if (info) info.textContent = dev.label ? `Erkannt: ${dev.label}` : 'Wähle deine Plattform';
  document.querySelector('.dl-picker')?.removeAttribute('hidden');
  // Intel-Mac erkannt → Intel-Knopf als Hauptknopf
  if (dev.platform === 'mac' && dev.arch === 'x64') {
    const arm = document.querySelector('[data-mac="arm64"]'), intel = document.querySelector('[data-mac="x64"]');
    if (arm && intel) { arm.classList.replace('btn-primary', 'btn-ghost'); arm.classList.add('dl-second'); intel.classList.replace('btn-ghost', 'btn-primary'); intel.classList.remove('dl-second'); arm.before(intel); }
  }
  showPlatform(fromHash || chosen || dev.platform);
});

// Neuerungen der aktuellen Version aus CHANGELOG.md (Download-Seite)
const notesEl = document.querySelector('[data-notes]');
if (notesEl) {
  fetch(`https://raw.githubusercontent.com/${REPO}/main/CHANGELOG.md`)
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((md) => {
      const block = md.split(/\n## /)[1];
      if (!block) throw new Error('empty');
      const lines = block.split('\n');
      const [ver, date] = lines.shift().replace(/[[\]]/g, '').split(/\s+[–-]\s+/);
      const items = lines
        .filter((l) => /^- /.test(l.trim()))
        .map((l) => l.trim().replace(/^- /, ''))
        .slice(0, 8);
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
      const when = date && !Number.isNaN(Date.parse(date)) ? ` · ${dateDe(date)}` : '';
      notesEl.innerHTML = `<h3>Version ${esc(ver || '')}<span class="muted" style="font-weight:400;font-size:14px">${esc(when)}</span> <span class="tag">Neu</span></h3><ul>${items.map((i) => `<li>${fmt(i)}</li>`).join('')}</ul>` +
        `<p class="muted" style="margin:14px 0 0;font-size:13px">Aus dem <a href="https://github.com/${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener" style="color:inherit">Changelog</a> (englisch).</p>`;
    })
    .catch(() => {
      notesEl.innerHTML = `<h3>Neuerungen</h3><p class="muted" style="margin:10px 0 0">Alle Änderungen findest du im <a href="https://github.com/${REPO}/blob/main/CHANGELOG.md" target="_blank" rel="noopener">Changelog auf GitHub</a>.</p>`;
    });
}

// Jahr in der Fußzeile
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
