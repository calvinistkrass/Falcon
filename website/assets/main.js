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

// ---------- Aktuelle Version von GitHub ----------
const REPO = 'calvinistkrass/Falcon';
const FALLBACK = `https://github.com/${REPO}/releases/latest`;
async function latestRelease() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('falcon.release2') || 'null');
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;
  } catch { /* egal */ }
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(String(res.status));
  const r = await res.json();
  const exe = (r.assets || []).find((a) => /\.exe$/i.test(a.name) && !/blockmap/i.test(a.name));
  // Android-App: aus dem neuesten Release, sonst aus dem letzten Release mit APK
  let apk = (r.assets || []).find((a) => /\.apk$/i.test(a.name));
  if (!apk) {
    try {
      const list = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, { headers: { accept: 'application/vnd.github+json' } })).json();
      for (const x of Array.isArray(list) ? list : []) { apk = (x.assets || []).find((a) => /\.apk$/i.test(a.name)); if (apk) break; }
    } catch { /* kein APK */ }
  }
  const data = {
    version: String(r.tag_name || '').replace(/^v/, ''),
    url: exe ? exe.browser_download_url : FALLBACK,
    size: exe ? exe.size : 0,
    date: r.published_at,
    apk: apk ? { url: apk.browser_download_url, size: apk.size, version: (apk.name.match(/(\d+\.\d+\.\d+)/) || [])[1] || '' } : null,
    notes: r.body || ''
  };
  try { sessionStorage.setItem('falcon.release2', JSON.stringify({ at: Date.now(), data })); } catch { /* egal */ }
  return data;
}
const mb = (n) => `${(n / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} MB`;
const dateDe = (d) => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });

latestRelease().then((r) => {
  document.querySelectorAll('[data-download]').forEach((a) => { a.href = r.url; });
  document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = r.version; });
  document.querySelectorAll('[data-size]').forEach((el) => { if (r.size) el.textContent = mb(r.size); });
  document.querySelectorAll('[data-date]').forEach((el) => { if (r.date) el.textContent = dateDe(r.date); });
  if (r.apk) {
    document.querySelectorAll('[data-apk]').forEach((a) => { a.href = r.apk.url; });
    document.querySelectorAll('[data-apk-version]').forEach((el) => { if (r.apk.version) el.textContent = r.apk.version; });
    document.querySelectorAll('[data-apk-size]').forEach((el) => { if (r.apk.size) el.textContent = mb(r.apk.size); });
  } else {
    document.querySelectorAll('[data-apk-label]').forEach((el) => { el.textContent = 'Bald verfügbar'; });
  }
}).catch(() => { /* Link führt weiter zur Release-Seite auf GitHub */ });

// ---------- Neue Version wird gerade gebaut ----------
// Läuft der Release-Workflow auf GitHub (Windows-Installer und Android-APK werden gebaut),
// zeigt jede Seite einen Hinweis; auf der Download-Seite zusätzlich pro Plattform.
async function buildStatus() {
  try {
    const cached = JSON.parse(sessionStorage.getItem('falcon.build') || 'null');
    if (cached && Date.now() - cached.at < 2 * 60_000) return cached.data;
  } catch { /* egal */ }
  const gh = (url) => fetch(url, { headers: { accept: 'application/vnd.github+json' } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const runs = await gh(`https://api.github.com/repos/${REPO}/actions/workflows/release.yml/runs?per_page=1`);
  const run = runs.workflow_runs?.[0];
  let data = null;
  // Nur laufende Builds; ein fertiger (auch fehlgeschlagener) Build zeigt nichts an
  if (run && run.status !== 'completed' && /^v\d+\.\d+\.\d+$/.test(run.head_branch || '') && Date.now() - Date.parse(run.created_at) < 6 * 3600_000) {
    const jobs = (await gh(`${run.jobs_url}?per_page=10`)).jobs || [];
    const done = (name) => jobs.some((j) => j.name === name && j.status === 'completed' && j.conclusion === 'success');
    data = { version: run.head_branch.slice(1), windows: done('windows'), android: done('android') };
  }
  try { sessionStorage.setItem('falcon.build', JSON.stringify({ at: Date.now(), data })); } catch { /* egal */ }
  return data;
}
const SPIN = '<span class="spin" aria-hidden="true"></span>';
buildStatus().then((b) => {
  if (!b) return;
  // Hinweis oben auf jeder Seite
  const main = document.querySelector('main');
  if (main && !(b.windows && b.android)) {
    const bar = document.createElement('div');
    bar.className = 'build-banner';
    bar.setAttribute('role', 'status');
    const text = b.windows
      ? `<b>Die neue Android-Version wird für den Download vorbereitet.</b> Sie ist in den nächsten Minuten bis Stunden verfügbar – Falcon ${b.version} für Windows ist schon da.`
      : `<b>Die neue Version wird für den Download vorbereitet.</b> Falcon ${b.version} ist in den nächsten Minuten bis Stunden verfügbar.`;
    bar.innerHTML = `<div class="container">${SPIN}<span>${text}</span>${location.pathname.startsWith('/download') ? '' : '<a href="/download">Zum Download</a>'}</div>`;
    main.prepend(bar);
  }
  // Download-Seite: pro Plattform
  if (!b.windows) {
    document.querySelectorAll('[data-build-win]').forEach((el) => {
      el.innerHTML = `${SPIN}<span>Version ${b.version} wird gerade für den Download vorbereitet. Bis dahin bekommst du die bisherige Version – sie aktualisiert sich danach automatisch.</span>`;
      el.hidden = false;
    });
  }
  if (!b.android) {
    document.querySelectorAll('[data-build-apk]').forEach((el) => {
      el.innerHTML = `${SPIN}<span>Die neue Android-Version wird gerade für den Download vorbereitet. Bis dahin bekommst du die bisherige.</span>`;
      el.hidden = false;
    });
  }
}).catch(() => { /* GitHub nicht erreichbar oder Limit erreicht – dann ohne Hinweis */ });

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
