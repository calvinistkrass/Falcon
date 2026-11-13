// Entschlüsselung im gleichen Format wie Falcon (Desktop):
// PBKDF2-SHA256 → Schlüssel-Verpackung, AES-256-GCM mit AAD, Daten gzip-komprimiert.
// Gespeichert ist jeweils base64(iv[12] | tag[16] | ciphertext). Reines JavaScript, läuft in Expo Go.
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { gunzipSync, gzipSync } from 'fflate';
import * as ExpoCrypto from 'expo-crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function fromBase64(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0, buf = 0, bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 0xff; }
  }
  return out.subarray(0, o);
}
export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}

// Falcon: iv | tag | ct  →  noble: ct | tag
function openBox(key: Uint8Array, packed: Uint8Array, aad: string): Uint8Array {
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ct = packed.subarray(28);
  const joined = new Uint8Array(ct.length + 16);
  joined.set(ct);
  joined.set(tag, ct.length);
  return gcm(key, iv, enc.encode(aad)).decrypt(joined);
}
function sealBox(key: Uint8Array, plain: Uint8Array, aad: string): Uint8Array {
  const iv = ExpoCrypto.getRandomBytes(12);
  const out = gcm(key, iv, enc.encode(aad)).encrypt(plain); // ct | tag
  const ct = out.subarray(0, out.length - 16);
  const tag = out.subarray(out.length - 16);
  const packed = new Uint8Array(12 + 16 + ct.length);
  packed.set(iv); packed.set(tag, 12); packed.set(ct, 28);
  return packed;
}

/** Sync-Schlüssel mit dem Kontopasswort entpacken (dauert auf dem Handy ein paar Sekunden). */
export async function unwrapKey(fields: { salt: string; iter: number; wrapped: string }, password: string, uid: string): Promise<Uint8Array> {
  const kek = await pbkdf2Async(sha256, enc.encode(password), fromBase64(fields.salt), { c: fields.iter, dkLen: 32, asyncTick: 25 });
  return openBox(kek, fromBase64(fields.wrapped), `falcon-key:${uid}`);
}

/** Verschlüsselte Sync-Daten lesen. */
export function decryptJson<T = unknown>(key: Uint8Array, b64: string, aad: string): T {
  const plain = openBox(key, fromBase64(b64), aad);
  return JSON.parse(dec.decode(gunzipSync(plain))) as T;
}

/** Für Tests und spätere Schreibfunktionen: Daten wie Falcon verschlüsseln. */
export function encryptJson(key: Uint8Array, value: unknown, aad: string): string {
  return toBase64(sealBox(key, gzipSync(enc.encode(JSON.stringify(value))), aad));
}

export const randomId = () => ExpoCrypto.randomUUID();
