// Schnelles PBKDF2 (seit 2.7.0): Die Anmeldung braucht 310.000 Runden PBKDF2-SHA256. In reinem JavaScript (Hermes)
// dauert das auf manchen Handys Minuten. Die Web Crypto API des System-WebViews rechnet dasselbe nativ in Bruchteilen
// einer Sekunde. Dafür hängt ein unsichtbarer WebView in der App (components/kdf-bridge.tsx); fehlt er oder klappt
// etwas nicht, rechnet crypto.ts wie bisher selbst.
import { Platform } from 'react-native';

type Pending = { resolve: (b: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };
type Runner = (js: string) => void;

let runner: Runner | null = null;
let ready = false;
const pending = new Map<string, Pending>();
let seq = 0;

/** Vom unsichtbaren WebView: Code ausführen können (null = weg) */
export function attachRunner(r: Runner | null) { runner = r; if (!r) ready = false; }
export function markReady() { ready = true; }
/** Antwort aus dem WebView */
export function onBridgeMessage(raw: string) {
  let m: { id?: string; ok?: boolean; bits?: string; ready?: boolean };
  try { m = JSON.parse(raw); } catch { return; }
  if (m.ready) { ready = true; return; }
  const p = m.id ? pending.get(m.id) : undefined;
  if (!p) return;
  pending.delete(m.id as string);
  clearTimeout(p.timer);
  if (m.ok && typeof m.bits === 'string') p.resolve(fromB64(m.bits));
  else p.reject(new Error('kdf'));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function fromB64(s: string) {
  const out = new Uint8Array(Math.floor((s.replace(/=+$/, '').length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of s) { if (ch === '=') break; buf = (buf << 6) | B64.indexOf(ch); bits += 6; if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; } }
  return out.subarray(0, o);
}
function toB64(b: Uint8Array) {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}

/** PBKDF2-SHA256 mit 32 Byte Ergebnis – nativ über Web Crypto. Wirft, wenn das nicht geht (dann JavaScript-Fallback). */
export async function nativePbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (Platform.OS === 'web' && subtle) {
    const k = await subtle.importKey('raw', password as BufferSource, 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, k, 256));
  }
  // Kurz auf den WebView warten (er startet mit der App)
  for (let i = 0; i < 30 && !(runner && ready); i++) await new Promise((r) => setTimeout(r, 100));
  if (!runner || !ready) throw new Error('kein WebView');
  const id = `k${++seq}`;
  return new Promise<Uint8Array>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Zeit')); }, 20_000);
    pending.set(id, { resolve, reject, timer });
    // Nur Base64 und eine Zahl gehen in den Code – keine Anführungszeichen aus dem Passwort
    runner?.(`window.falconKdf(${JSON.stringify(id)}, ${JSON.stringify(toB64(password))}, ${JSON.stringify(toB64(salt))}, ${Math.floor(iterations)}); true;`);
  });
}

/** Seite für den WebView (sicherer Ursprung https://localhost, damit crypto.subtle da ist) */
export const KDF_PAGE = `<!doctype html><meta charset="utf-8"><script>
const d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const e = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const post = (o) => window.ReactNativeWebView.postMessage(JSON.stringify(o));
window.falconKdf = async (id, pw, salt, iter) => {
  try {
    const k = await crypto.subtle.importKey('raw', d(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: d(salt), iterations: iter, hash: 'SHA-256' }, k, 256);
    post({ id, ok: true, bits: e(bits) });
  } catch (err) { post({ id, ok: false }); }
};
post({ ready: !!(window.crypto && crypto.subtle) });
</script>`;
