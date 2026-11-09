'use strict';
/*
 * Passkeys über die Windows-WebAuthn-API (webauthn.dll) – an Electron vorbei.
 *
 * Electron reicht WebAuthn-Anfragen nicht an Windows weiter (electron/electron#24573), deshalb
 * ruft Falcon die gleiche Systemschnittstelle auf, die auch Chrome und Edge nutzen. Windows zeigt
 * dann seinen eigenen Dialog mit Windows Hello, Sicherheitsschlüsseln und „iPhone, iPad oder
 * Android-Gerät“ (QR-Code + Bluetooth).
 *
 * clientDataJSON baut Falcon selbst – mit dem echten Ursprung der anfragenden Seite. Die
 * Aufrufe laufen auf einem Hintergrund-Thread, damit Falcon während des Dialogs nicht hängt.
 */

const crypto = require('crypto');

let koffi = null;
let api = null;

function load() {
  if (api !== null) return api;
  api = false;
  if (process.platform !== 'win32') return api;
  try {
    koffi = require('koffi');
    const lib = koffi.load('webauthn.dll');

    const CREDENTIAL = koffi.struct('WEBAUTHN_CREDENTIAL', { dwVersion: 'uint32', cbId: 'uint32', pbId: 'void *', pwszCredentialType: 'void *' });
    const CREDENTIALS = koffi.struct('WEBAUTHN_CREDENTIALS', { cCredentials: 'uint32', pCredentials: 'void *' });
    const EXTENSIONS = koffi.struct('WEBAUTHN_EXTENSIONS', { cExtensions: 'uint32', pExtensions: 'void *' });
    const RP = koffi.struct('WEBAUTHN_RP_ENTITY_INFORMATION', { dwVersion: 'uint32', pwszId: 'void *', pwszName: 'void *', pwszIcon: 'void *' });
    const USER = koffi.struct('WEBAUTHN_USER_ENTITY_INFORMATION', { dwVersion: 'uint32', cbId: 'uint32', pbId: 'void *', pwszName: 'void *', pwszIcon: 'void *', pwszDisplayName: 'void *' });
    const COSE_PARAM = koffi.struct('WEBAUTHN_COSE_CREDENTIAL_PARAMETER', { dwVersion: 'uint32', pwszCredentialType: 'void *', lAlg: 'int32' });
    const COSE_PARAMS = koffi.struct('WEBAUTHN_COSE_CREDENTIAL_PARAMETERS', { cCredentialParameters: 'uint32', pCredentialParameters: 'void *' });
    const CLIENT_DATA = koffi.struct('WEBAUTHN_CLIENT_DATA', { dwVersion: 'uint32', cbClientDataJSON: 'uint32', pbClientDataJSON: 'void *', pwszHashAlgId: 'void *' });
    // Version 4 der Optionen (Windows 10 1903+ kennt mindestens Version 1; Windows liest nur bis dwVersion)
    const MAKE_OPTIONS = koffi.struct('WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS', {
      dwVersion: 'uint32', dwTimeoutMilliseconds: 'uint32', CredentialList: CREDENTIALS, Extensions: EXTENSIONS,
      dwAuthenticatorAttachment: 'uint32', bRequireResidentKey: 'int32', dwUserVerificationRequirement: 'uint32',
      dwAttestationConveyancePreference: 'uint32', dwFlags: 'uint32', pCancellationId: 'void *', pExcludeCredentialList: 'void *',
      dwEnterpriseAttestation: 'uint32', dwLargeBlobSupport: 'uint32', bPreferResidentKey: 'int32'
    });
    const GET_OPTIONS = koffi.struct('WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS', {
      dwVersion: 'uint32', dwTimeoutMilliseconds: 'uint32', CredentialList: CREDENTIALS, Extensions: EXTENSIONS,
      dwAuthenticatorAttachment: 'uint32', dwUserVerificationRequirement: 'uint32', dwFlags: 'uint32'
    });
    const ATTESTATION = koffi.struct('WEBAUTHN_CREDENTIAL_ATTESTATION', {
      dwVersion: 'uint32', pwszFormatType: 'void *', cbAuthenticatorData: 'uint32', pbAuthenticatorData: 'void *',
      cbAttestation: 'uint32', pbAttestation: 'void *', dwAttestationDecodeType: 'uint32', pvAttestationDecode: 'void *',
      cbAttestationObject: 'uint32', pbAttestationObject: 'void *', cbCredentialId: 'uint32', pbCredentialId: 'void *',
      Extensions: EXTENSIONS, dwUsedTransport: 'uint32'
    });
    const ASSERTION = koffi.struct('WEBAUTHN_ASSERTION', {
      dwVersion: 'uint32', cbAuthenticatorData: 'uint32', pbAuthenticatorData: 'void *', cbSignature: 'uint32', pbSignature: 'void *',
      Credential: CREDENTIAL, cbUserId: 'uint32', pbUserId: 'void *'
    });

    api = {
      types: { CREDENTIAL, RP, USER, COSE_PARAM, COSE_PARAMS, CLIENT_DATA, MAKE_OPTIONS, GET_OPTIONS, ATTESTATION, ASSERTION },
      version: lib.func('uint32 __stdcall WebAuthNGetApiVersionNumber()'),
      isUvpaa: lib.func('int32 __stdcall WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable(_Out_ int32 *available)'),
      makeCredential: lib.func('int32 __stdcall WebAuthNAuthenticatorMakeCredential(uint64 hWnd, void *rp, void *user, void *params, void *clientData, void *options, _Out_ void **attestation)'),
      getAssertion: lib.func('int32 __stdcall WebAuthNAuthenticatorGetAssertion(uint64 hWnd, void *rpId, void *clientData, void *options, _Out_ void **assertion)'),
      freeAttestation: lib.func('void __stdcall WebAuthNFreeCredentialAttestation(void *attestation)'),
      freeAssertion: lib.func('void __stdcall WebAuthNFreeAssertion(void *assertion)'),
      errorName: lib.func('void * __stdcall WebAuthNGetErrorName(int32 hr)')
    };
  } catch (err) {
    console.warn('Windows-WebAuthn nicht verfügbar:', err.message);
    api = false;
  }
  return api;
}

// ---------------------------------------------------------------------------
// Speicher: alles, was Windows liest, liegt in selbst angelegtem Speicher
// ---------------------------------------------------------------------------
class Arena {
  constructor() { this.ptrs = []; }
  bytes(buf) {
    const n = Math.max(1, buf.length);
    const p = koffi.alloc('uint8', n);
    if (buf.length) koffi.encode(p, koffi.array('uint8', buf.length), Array.from(buf));
    this.ptrs.push(p);
    return p;
  }
  wstr(s) {
    const codes = [...String(s)].flatMap((ch) => { const c = ch.codePointAt(0); return c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c]; });
    codes.push(0);
    const p = koffi.alloc('uint16', codes.length);
    koffi.encode(p, koffi.array('uint16', codes.length), codes);
    this.ptrs.push(p);
    return p;
  }
  struct(type, value) {
    const p = koffi.alloc(type, 1);
    koffi.encode(p, type, value);
    this.ptrs.push(p);
    return p;
  }
  array(type, values) {
    if (!values.length) return null;
    const p = koffi.alloc(type, values.length);
    koffi.encode(p, koffi.array(type, values.length), values);
    this.ptrs.push(p);
    return p;
  }
  free() { for (const p of this.ptrs) koffi.free(p); this.ptrs = []; }
}

const readBytes = (ptr, len) => (len && ptr ? Buffer.from(koffi.decode(ptr, koffi.array('uint8', len, 'Typed'))) : Buffer.alloc(0));
const b64u = (buf) => Buffer.from(buf).toString('base64url');

const UV = { required: 1, preferred: 2, discouraged: 3 };
const ATTACHMENT = { platform: 1, 'cross-platform': 2 };
const TRANSPORTS = [[0x1, 'usb'], [0x2, 'nfc'], [0x4, 'ble'], [0x10, 'internal'], [0x20, 'hybrid']];
const TRANSPORT_BITS = { usb: 0x1, nfc: 0x2, ble: 0x4, internal: 0x10, hybrid: 0x20 };

function errorName(hr) {
  try { return koffi.decode(api.errorName(hr), 'str16') || `0x${(hr >>> 0).toString(16)}`; } catch { return `0x${(hr >>> 0).toString(16)}`; }
}
function callAsync(fn, args) {
  return new Promise((resolve, reject) => fn.async(...args, (err, hr) => (err ? reject(err) : resolve(hr))));
}

// ---------------------------------------------------------------------------
// COSE-Schlüssel aus den Authenticator-Daten lesen (für getPublicKey bzw. die Signaturprüfung)
// ---------------------------------------------------------------------------
function cborDecode(buf, offset = 0) {
  const head = buf[offset];
  const major = head >> 5;
  let info = head & 0x1f;
  let pos = offset + 1;
  let value = info;
  if (info === 24) { value = buf[pos]; pos += 1; }
  else if (info === 25) { value = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { value = buf.readUInt32BE(pos); pos += 4; }
  else if (info === 27) { value = Number(buf.readBigUInt64BE(pos)); pos += 8; }
  switch (major) {
    case 0: return { value, end: pos };
    case 1: return { value: -1 - value, end: pos };
    case 2: return { value: buf.subarray(pos, pos + value), end: pos + value };
    case 3: return { value: buf.subarray(pos, pos + value).toString('utf8'), end: pos + value };
    case 4: { const arr = []; for (let i = 0; i < value; i++) { const r = cborDecode(buf, pos); arr.push(r.value); pos = r.end; } return { value: arr, end: pos }; }
    case 5: { const map = new Map(); for (let i = 0; i < value; i++) { const k = cborDecode(buf, pos); const v = cborDecode(buf, k.end); map.set(k.value, v.value); pos = v.end; } return { value: map, end: pos }; }
    case 7: return { value: info === 20 ? false : info === 21 ? true : null, end: pos };
    default: throw new Error('CBOR-Typ nicht unterstützt');
  }
}

/** authData → { spki, alg } aus den attestierten Anmeldedaten */
function publicKeyFromAuthData(authData) {
  if (!(authData[32] & 0x40)) return null; // AT-Flag fehlt
  const idLen = authData.readUInt16BE(53);
  const cose = cborDecode(authData, 55 + idLen).value;
  const kty = cose.get(1);
  const alg = cose.get(3);
  let jwk;
  if (kty === 2) jwk = { kty: 'EC', crv: { 1: 'P-256', 2: 'P-384', 3: 'P-521' }[cose.get(-1)], x: b64u(cose.get(-2)), y: b64u(cose.get(-3)) };
  else if (kty === 3) jwk = { kty: 'RSA', n: b64u(cose.get(-1)), e: b64u(cose.get(-2)) };
  else if (kty === 1) jwk = { kty: 'OKP', crv: cose.get(-1) === 6 ? 'Ed25519' : 'Ed448', x: b64u(cose.get(-2)) };
  else return { spki: null, alg };
  const spki = crypto.createPublicKey({ key: jwk, format: 'jwk' }).export({ type: 'spki', format: 'der' });
  return { spki: Buffer.from(spki), alg };
}

// ---------------------------------------------------------------------------
// Öffentliche Funktionen
// ---------------------------------------------------------------------------
function isAvailable() {
  const a = load();
  return !!a && a.version() >= 1;
}

function platformAuthenticatorAvailable() {
  const a = load();
  if (!a) return false;
  const out = [0];
  return a.isUvpaa(out) === 0 && !!out[0];
}

function clientData(type, challenge, origin) {
  return Buffer.from(JSON.stringify({ type, challenge: b64u(challenge), origin, crossOrigin: false }), 'utf8');
}

/**
 * Neuen Passkey anlegen.
 * opts: { hwnd, origin, rp: { id, name }, user: { id: Buffer, name, displayName }, challenge: Buffer,
 *         algs: number[], exclude: [{ id: Buffer }], residentKey, userVerification, attachment, timeout }
 */
async function makeCredential(opts) {
  const a = load();
  if (!a) throw new Error('NotSupportedError');
  const T = a.types;
  const mem = new Arena();
  const cdj = clientData('webauthn.create', opts.challenge, opts.origin);
  try {
    const pk = mem.wstr('public-key');
    const rp = mem.struct(T.RP, { dwVersion: 1, pwszId: mem.wstr(opts.rp.id), pwszName: mem.wstr(opts.rp.name || opts.rp.id), pwszIcon: null });
    const user = mem.struct(T.USER, {
      dwVersion: 1, cbId: opts.user.id.length, pbId: mem.bytes(opts.user.id),
      pwszName: mem.wstr(opts.user.name || ''), pwszIcon: null, pwszDisplayName: mem.wstr(opts.user.displayName || opts.user.name || '')
    });
    const algs = (opts.algs && opts.algs.length ? opts.algs : [-7, -257]);
    const params = mem.struct(T.COSE_PARAMS, {
      cCredentialParameters: algs.length,
      pCredentialParameters: mem.array(T.COSE_PARAM, algs.map((alg) => ({ dwVersion: 1, pwszCredentialType: pk, lAlg: alg })))
    });
    const cd = mem.struct(T.CLIENT_DATA, { dwVersion: 1, cbClientDataJSON: cdj.length, pbClientDataJSON: mem.bytes(cdj), pwszHashAlgId: mem.wstr('SHA-256') });
    const exclude = (opts.exclude || []).map((c) => ({ dwVersion: 1, cbId: c.id.length, pbId: mem.bytes(c.id), pwszCredentialType: pk }));
    const version = Math.min(4, a.version() >= 3 ? 4 : 1);
    const options = mem.struct(T.MAKE_OPTIONS, {
      dwVersion: version, dwTimeoutMilliseconds: opts.timeout || 120000,
      CredentialList: { cCredentials: exclude.length, pCredentials: mem.array(T.CREDENTIAL, exclude) },
      Extensions: { cExtensions: 0, pExtensions: null },
      dwAuthenticatorAttachment: ATTACHMENT[opts.attachment] || 0,
      bRequireResidentKey: opts.residentKey === 'required' ? 1 : 0,
      dwUserVerificationRequirement: UV[opts.userVerification] || 2,
      dwAttestationConveyancePreference: 1, // keine Attestierung
      dwFlags: 0, pCancellationId: null, pExcludeCredentialList: null,
      dwEnterpriseAttestation: 0, dwLargeBlobSupport: 0, bPreferResidentKey: opts.residentKey === 'preferred' ? 1 : 0
    });

    const out = [null];
    const hr = await callAsync(a.makeCredential, [BigInt(opts.hwnd || 0), rp, user, params, cd, options, out]);
    if (hr !== 0) throw Object.assign(new Error(errorName(hr)), { name: errorName(hr), hr });
    const att = koffi.decode(out[0], T.ATTESTATION);
    try {
      const authenticatorData = readBytes(att.pbAuthenticatorData, att.cbAuthenticatorData);
      const transports = att.dwVersion >= 3 ? TRANSPORTS.filter(([bit]) => att.dwUsedTransport & bit).map(([, name]) => name) : [];
      const key = publicKeyFromAuthData(authenticatorData) || {};
      return {
        clientDataJSON: cdj,
        attestationObject: readBytes(att.pbAttestationObject, att.cbAttestationObject),
        authenticatorData,
        credentialId: readBytes(att.pbCredentialId, att.cbCredentialId),
        transports,
        publicKey: key.spki || null,
        alg: key.alg
      };
    } finally {
      a.freeAttestation(out[0]);
    }
  } finally {
    mem.free();
  }
}

/**
 * Mit vorhandenem Passkey anmelden.
 * opts: { hwnd, origin, rpId, challenge: Buffer, allow: [{ id: Buffer, transports? }], userVerification, timeout }
 */
async function getAssertion(opts) {
  const a = load();
  if (!a) throw new Error('NotSupportedError');
  const T = a.types;
  const mem = new Arena();
  const cdj = clientData('webauthn.get', opts.challenge, opts.origin);
  try {
    const pk = mem.wstr('public-key');
    const cd = mem.struct(T.CLIENT_DATA, { dwVersion: 1, cbClientDataJSON: cdj.length, pbClientDataJSON: mem.bytes(cdj), pwszHashAlgId: mem.wstr('SHA-256') });
    const allow = (opts.allow || []).map((c) => ({ dwVersion: 1, cbId: c.id.length, pbId: mem.bytes(c.id), pwszCredentialType: pk }));
    const options = mem.struct(T.GET_OPTIONS, {
      dwVersion: 1, dwTimeoutMilliseconds: opts.timeout || 120000,
      CredentialList: { cCredentials: allow.length, pCredentials: mem.array(T.CREDENTIAL, allow) },
      Extensions: { cExtensions: 0, pExtensions: null },
      dwAuthenticatorAttachment: 0, dwUserVerificationRequirement: UV[opts.userVerification] || 2, dwFlags: 0
    });
    const out = [null];
    const hr = await callAsync(a.getAssertion, [BigInt(opts.hwnd || 0), mem.wstr(opts.rpId), cd, options, out]);
    if (hr !== 0) throw Object.assign(new Error(errorName(hr)), { name: errorName(hr), hr });
    const as = koffi.decode(out[0], T.ASSERTION);
    try {
      return {
        clientDataJSON: cdj,
        authenticatorData: readBytes(as.pbAuthenticatorData, as.cbAuthenticatorData),
        signature: readBytes(as.pbSignature, as.cbSignature),
        credentialId: readBytes(as.Credential.pbId, as.Credential.cbId),
        userHandle: as.cbUserId ? readBytes(as.pbUserId, as.cbUserId) : null
      };
    } finally {
      a.freeAssertion(out[0]);
    }
  } finally {
    mem.free();
  }
}

module.exports = { isAvailable, platformAuthenticatorAvailable, makeCredential, getAssertion, publicKeyFromAuthData, TRANSPORT_BITS, apiVersion: () => (load() ? api.version() : 0) };
