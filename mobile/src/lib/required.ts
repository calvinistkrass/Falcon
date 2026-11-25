// Pflicht-Update (seit 2.6.0): Ab zwei Versionen Rückstand ruht das Falcon-Konto, bis aktualisiert wird. Die Anmeldung
// bleibt gespeichert – nach dem Update ist man automatisch wieder angemeldet. Gesetzt wird das in update.ts (nur dort,
// wo es wirklich eine neuere APK gibt); hier ohne weitere Abhängigkeiten, damit session.tsx es lesen kann.
import { useSyncExternalStore } from 'react';
import { load, save } from './storage';

const KEY = 'falcon.update.required';
let required = false;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const change = (on: boolean) => { if (on !== required) { required = on; listeners.forEach((fn) => fn()); } };

export const isUpdateRequired = () => required;
export const useUpdateRequired = () => useSyncExternalStore(subscribe, isUpdateRequired, isUpdateRequired);

/** Gemerkt wird die Version, für die die Sperre galt – nach dem Update passt sie nicht mehr. */
export async function setUpdateRequired(on: boolean, current: string) {
  change(on);
  await save(KEY, on ? current : null).catch(() => {});
}
export async function restoreUpdateRequired(current: string) {
  try {
    const saved = await load(KEY);
    if (saved === current) change(true);
    else if (saved) await save(KEY, null);
  } catch { /* egal */ }
}
