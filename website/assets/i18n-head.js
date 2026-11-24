/* Läuft im <head> vor dem ersten Zeichnen: Seite verstecken, bis i18n.js übersetzt hat (eigene Datei, weil die CSP Inline-Skripte verbietet) */
(function () {
  var d = document.documentElement, lang = 'en';
  try { lang = localStorage.getItem('falcon.lang') || 'en'; } catch (e) { /* egal */ }
  if (lang === 'de') return;
  d.classList.add('i18n-wait');
  setTimeout(function () { d.classList.remove('i18n-wait'); }, 2500);
})();
