'use strict';
/* Fehler melden: Dialog mit Beschreibung, optional Seitenadresse und Screenshot */

const Report = (() => {
  const CATEGORIES = [
    ['bug', 'Fehler'],
    ['site', 'Website funktioniert nicht'],
    ['crash', 'Absturz oder Einfrieren'],
    ['idea', 'Vorschlag'],
    ['other', 'Sonstiges']
  ];

  async function open() {
    const tab = Tabs.active();
    const pageUrl = tab && /^https?:/.test(tab.url) ? tab.url : '';
    let shot = null;
    if (tab?.webview && tab.ready) {
      try { shot = await F.reportScreenshot(tab.webview.getWebContentsId()); } catch { shot = null; }
    }
    const acc = typeof Account !== 'undefined' ? Account.state : { signedIn: false };

    const error = h('p', { class: 'dialog-error' });
    const category = h('select', { class: 'field-input' }, CATEGORIES.map(([v, l]) => h('option', { value: v }, $t(l))));
    const text = h('textarea', { class: 'field-input report-text', rows: 6, placeholder: $t('Was ist passiert? Was hast du erwartet? Wie lässt sich der Fehler nachstellen?') });
    const email = h('input', { class: 'field-input', type: 'email', placeholder: $t('Optional – falls wir nachfragen dürfen'), value: acc.signedIn ? acc.email : '', spellcheck: false });
    const withUrl = h('input', { type: 'checkbox' });
    const withShot = h('input', { type: 'checkbox' });
    const preview = shot ? h('img', { class: 'report-shot', src: shot, alt: '' }) : null;

    const form = h('form', { class: 'dialog report-dialog', novalidate: true },
      h('div', { class: 'dialog-body' },
        h('h3', {}, $t('Fehler melden')),
        h('p', {}, $t('Hilf mit, Falcon besser zu machen. Deine Meldung geht direkt an den Entwickler.')),
        h('div', { class: 'fields' },
          h('label', {}, $t('Art'), category),
          h('label', {}, $t('Beschreibung'), text),
          h('label', {}, $t('E-Mail-Adresse'), email)),
        pageUrl ? h('label', { class: 'check-row' }, withUrl, h('span', {}, $t('Adresse der aktuellen Seite mitsenden'), h('small', { 'data-no-i18n': '' }, pageUrl))) : null,
        shot ? h('label', { class: 'check-row' }, withShot, h('span', {}, $t('Screenshot der aktuellen Seite mitsenden'))) : null,
        preview,
        h('p', { class: 'report-note' }, icon('info'), h('span', {}, $t('Deine Beschreibung erscheint öffentlich auf falcon://reports. E-Mail-Adresse, Seitenadresse und Screenshot sieht nur der Entwickler.'))),
        error),
      h('div', { class: 'dialog-foot' },
        h('button', { type: 'button', class: 'btn ghost', onclick: () => close() }, $t('Abbrechen')),
        h('button', { type: 'submit', class: 'btn primary' }, $t('Senden'))));
    if (preview) {
      preview.hidden = true;
      withShot.addEventListener('change', () => { preview.hidden = !withShot.checked; });
    }
    category.addEventListener('change', () => { if (category.value === 'site' && pageUrl) withUrl.checked = true; });

    const close = dialogShell(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (text.value.trim().length < 5) { error.textContent = $t('Bitte beschreibe kurz, was passiert ist.'); text.focus(); return; }
      const submit = form.querySelector('.btn.primary');
      submit.disabled = true;
      const r = await F.account.submitReport({
        category: category.value, text: text.value, email: email.value,
        url: withUrl.checked ? pageUrl : '', screenshot: withShot.checked ? shot : ''
      });
      submit.disabled = false;
      if (!r.ok) {
        error.textContent = r.error === 'NETWORK' ? $t('Keine Verbindung zum Falcon-Server. Bist du online?') : $t('Senden fehlgeschlagen ({code}).', { code: r.error });
        return;
      }
      close();
      toast($t('Danke! Deine Meldung wurde gesendet.'), 'check');
    });
    text.focus();
  }

  return { open };
})();
