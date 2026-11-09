'use strict';
/*
 * Passkey-Hinweis: Statt sofort den Windows-Dialog zu öffnen, fragt Falcon erst mit einem kleinen
 * Hinweis nach. Erst der Klick auf „Passkey verwenden“ startet den eigentlichen Vorgang.
 * Genutzt für Anmeldungen auf Websites und für das Entsperren der Falcon-Passwörter.
 */

const PasskeyPrompt = (() => {
  const pop = $('#pkPrompt');
  const queue = [];   // { key, title, text, anchor, resolve, tabId }
  let current = null;

  function next() {
    if (current) return;
    // Anfragen aus Hintergrund-Tabs warten, bis der Tab geöffnet wird
    const i = queue.findIndex((q) => q.tabId == null || q.tabId === state.activeId);
    if (i < 0) return;
    current = queue.splice(i, 1)[0];
    $('#pkPromptTitle').textContent = current.title;
    $('#pkPromptText').textContent = current.text;
    const anchor = current.anchor?.();
    if (anchor) Popover.open(pop, { anchor, align: 'start', onClose: () => finish(false) });
    else Popover.open(pop, { point: { x: innerWidth / 2 - 180, y: 92 }, onClose: () => finish(false) });
    $('#pkPromptUse').focus();
  }

  function finish(ok) {
    if (!current) return;
    const c = current;
    current = null;
    if (Popover.isOpen(pop)) Popover.close(); // ruft onClose → finish(false), das dann nichts mehr tut
    c.resolve(ok);
    setTimeout(next, 0);
  }

  /** Zeigt den Hinweis und liefert true, wenn der Nutzer „Passkey verwenden“ wählt. */
  function ask({ key, title, text, anchor, tabId }) {
    return new Promise((resolve) => {
      queue.push({ key, title, text, anchor, tabId, resolve });
      next();
    });
  }

  /** Entfernt eine Anfrage, z. B. wenn die Seite sie selbst abbricht. */
  function cancel(key) {
    const i = queue.findIndex((q) => q.key === key);
    if (i >= 0) queue.splice(i, 1)[0].resolve(false);
    if (current?.key === key) finish(false);
  }

  $('#pkPromptUse').addEventListener('click', () => finish(true));
  $('#pkPromptCancel').addEventListener('click', () => finish(false));
  pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  on('tab-activated', () => next());

  // -------------------------------------------------------------------------
  // Websites: Anfragen kommen vom webview-preload
  // -------------------------------------------------------------------------
  function attach(wv, getTab) {
    wv.addEventListener('ipc-message', async (e) => {
      if (e.channel === 'passkey-cancel') return cancel(`${wv.getWebContentsId()}:${e.args[0]}`);
      if (e.channel !== 'passkey-ask') return;
      const { id, kind } = e.args[0] || {};
      let host = '';
      try { host = hostOf(wv.getURL()); } catch { /* noch nicht geladen */ }
      const tab = getTab?.();
      const ok = await ask({
        key: `${wv.getWebContentsId()}:${id}`,
        tabId: tab ? tab.id : null,
        title: kind === 'create' ? $t('Passkey erstellen?') : $t('Mit Passkey anmelden?'),
        text: kind === 'create'
          ? $t('{host} möchte einen Passkey für dich erstellen.', { host })
          : $t('{host} möchte, dass du dich mit einem Passkey anmeldest.', { host }),
        anchor: tab ? () => $('#siteInfo') : null
      });
      // WebAuthn verlangt, dass die Seite den Fokus hat
      if (ok) wv.focus();
      try { wv.send('passkey-answer', id, ok); } catch { /* Seite inzwischen geschlossen */ }
    });
  }

  // -------------------------------------------------------------------------
  // Falcon selbst (Passwörter entsperren): Anfrage kommt vom Hauptprozess
  // -------------------------------------------------------------------------
  F.on('passkey-prompt', async ({ id, reason }) => {
    const ok = await ask({ key: `falcon:${id}`, title: $t('Mit Passkey bestätigen'), text: reason });
    F.answerPasskeyPrompt(id, ok);
  });

  return { ask, attach };
})();
