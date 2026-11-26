// App-Zustand: Falcon-Konto, Sync-Daten (Ende-zu-Ende-verschlüsselt) und Browser-Tabs.
// Alle Formate entsprechen Falcon auf dem PC (src/account.js), damit beide Seiten dieselben Daten lesen und schreiben.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { isUpdateRequired, restoreUpdateRequired, useUpdateRequired } from './required';
import * as FB from './firebase';
import { decryptJson, encryptJson, fromBase64, newDataKey, randomId, toBase64, unwrapKey, wrapKey } from './crypto';
import { load, save } from './storage';
import { loadTabs, saveTabs } from './tabstore';
import { onIncoming, takeIncoming } from './incoming';
import { hostOf } from './theme';

// Muss zu app.json → expo.version passen (Update-Hinweis vergleicht damit die APKs im GitHub-Release)
export const APP_VERSION = '2.6.2';

export type Bookmark = { title?: string; url?: string; folder?: boolean; children?: Bookmark[] };
export type Password = { id: string; origin: string; username: string; password: string; created?: number; updated?: number; lastUsed?: number };
export type HistoryEntry = { url: string; title?: string; visits?: number; last?: number };
export type Device = { id: string; name: string; at: number; kind?: string; tabs: { url: string; title?: string }[] };
export type Tab = { id: string; src: string; nonce: number; url: string; title: string; incognito?: boolean };
export type Notice = { id: string; title: string; text: string; created: number };
export type Report = { id: string; text?: string; category?: string; version?: string; created?: string; status?: string; url?: string; email?: string; os?: string };
type User = { uid: string; email: string; name: string; emailVerified: boolean };
type Status = 'loading' | 'signedOut' | 'unlocking' | 'signedIn';
type Kind = 'bookmarks' | 'passwords' | 'history' | 'settings';



type Ctx = {
  status: Status;
  user: User | null;
  bookmarks: Bookmark[];
  passwords: Password[];
  history: HistoryEntry[];
  devices: Device[];
  searchEngine: string;
  pwNever: string[];
  admin: boolean;
  loadingData: boolean;
  /** Gespeicherte Tabs sind gelesen (für den Ladebildschirm) */
  tabsReady: boolean;
  dataError: string | null;
  tabs: Tab[];
  activeId: string;
  // Konto
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  updateName: (name: string) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  // Sync-Daten bearbeiten
  addBookmark: (url: string, title: string) => Promise<void>;
  removeBookmark: (url: string) => Promise<void>;
  savePassword: (p: { origin: string; username: string; password: string; id?: string }) => Promise<void>;
  deletePassword: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  neverSave: (origin: string) => Promise<void>;
  removeHistory: (url: string) => Promise<void>;
  // Meldungen & Admin
  submitReport: (r: { text: string; category: string; url?: string; email?: string }) => Promise<void>;
  publicReports: () => Promise<Report[]>;
  adminReports: () => Promise<Report[]>;
  updateReport: (id: string, status: string) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  // Benachrichtigungen vom Admin an alle mit Konto
  notices: () => Promise<Notice[]>;
  sendNotice: (title: string, text: string) => Promise<void>;
  deleteNotice: (id: string) => Promise<void>;
  // Browser
  openUrl: (url: string) => void;
  navigate: (url: string) => void;
  newTab: (incognito?: boolean) => void;
  closeTab: (id: string) => void;
  closeAllTabs: () => void;
  switchTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Pick<Tab, 'url' | 'title'>>) => void;
  visited: (url: string, title?: string, incognito?: boolean) => void;
};

const SESSION_KEY = 'falcon.session';
const DEVICE_KEY = 'falcon.device';
const DEVICE_NAME = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android-Handy' : 'Handy';
const SessionContext = createContext<Ctx | null>(null);
const retryable = (e: unknown) => e instanceof FB.ApiError && /FAILED_PRECONDITION|ABORTED|ALREADY_EXISTS/.test(e.code);

// ---------- Hilfen ----------
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const fromFields = (f: Record<string, any> = {}) => Object.fromEntries(Object.entries(f).map(([k, v]) =>
  [k, v.stringValue ?? (v.integerValue != null ? Number(v.integerValue) : v.timestampValue ?? v.booleanValue ?? null)]));
const toFields = (obj: Record<string, unknown>) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => [k, typeof v === 'number' ? FB.int(v) : k === 'created' ? { timestampValue: v } : FB.str(String(v))]));
const originOf = (url: string) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; } };
export { originOf };

// Lesezeichen: rekursiv nach URL entfernen
function withoutUrl(list: Bookmark[], url: string): Bookmark[] {
  return list.filter((b) => b.folder || b.url !== url).map((b) => (b.folder ? { ...b, children: withoutUrl(b.children || [], url) } : b));
}
export function hasBookmark(list: Bookmark[], url: string): boolean {
  return list.some((b) => (b.folder ? hasBookmark(b.children || [], url) : b.url === url));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [passwords, setPasswords] = useState<Password[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [devices, setDevices] = useState<Device[]>([]);
  const [admin, setAdmin] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: randomId(), src: '', nonce: 0, url: '', title: '' }]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);

  const tokens = useRef<FB.Tokens | null>(null);
  const key = useRef<Uint8Array | null>(null);
  const lastVisit = useRef({ url: '', at: 0 });
  const pendingHistory = useRef<Map<string, HistoryEntry>>(new Map());
  const deviceId = useRef('');
  const lastTabsHash = useRef('');


  const locked = useUpdateRequired();

  // Gültiges ID-Token (wird bei Bedarf erneuert)
  const token = useCallback(async () => {
    if (isUpdateRequired()) throw new FB.ApiError('UPDATE_REQUIRED');
    const t = tokens.current;
    if (!t) throw new FB.ApiError('SIGNED_OUT');
    if (Date.now() < t.expiresAt - 60_000) return t.idToken;
    const fresh = await FB.refresh(t.refreshToken);
    tokens.current = fresh;
    return fresh.idToken;
  }, []);

  const persist = useCallback(async (u: User | null) => {
    if (!u || !tokens.current || !key.current) return save(SESSION_KEY, null);
    await save(SESSION_KEY, JSON.stringify({ ...u, refreshToken: tokens.current.refreshToken, key: toBase64(key.current) }));
  }, []);

  // ---------- Verschlüsselte Sync-Bereiche ----------
  const SETTERS = useMemo(() => ({
    bookmarks: (v: unknown) => setBookmarks(Array.isArray(v) ? v : []),
    passwords: (v: unknown) => setPasswords(Array.isArray(v) ? v : []),
    history: (v: unknown) => setHistory(Array.isArray(v) ? v : []),
    settings: (v: unknown) => setSettings(v && typeof v === 'object' ? v as Record<string, unknown> : {})
  }), []);
  const EMPTY: Record<Kind, unknown> = useMemo(() => ({ bookmarks: [], passwords: [], history: [], settings: {} }), []);

  /** Bereich laden, ändern und verschlüsselt hochladen – nur wenn ihn inzwischen kein anderes Gerät geändert hat. */
  const mutateKind = useCallback(async <T,>(kind: Kind, fn: (cur: T) => T) => {
    const u = user;
    if (!u || !key.current) throw new FB.ApiError('SIGNED_OUT');
    const aad = `${u.uid}:${kind}`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = await token();
      const doc = await FB.getDoc(`users/${u.uid}/sync/${kind}`, t);
      const cur = (doc?.fields?.data ? decryptJson<T>(key.current, doc.fields.data.stringValue, aad) : EMPTY[kind]) as T;
      const next = fn(cur);
      try {
        await FB.putDoc(`users/${u.uid}/sync/${kind}`, {
          data: FB.str(encryptJson(key.current, next, aad)), device: FB.str(DEVICE_NAME), at: FB.int(Date.now()), v: FB.int(1)
        }, t, doc ? { updateTime: doc.updateTime } : { exists: false });
        SETTERS[kind](next);
        return;
      } catch (e) {
        if (!retryable(e) || attempt === 2) throw e;
      }
    }
  }, [user, token, SETTERS, EMPTY]);

  // ---------- Daten laden ----------
  const checkAdmin = useCallback(async () => {
    try { await FB.query('reports', 'pageSize=1', await token()); setAdmin(true); } catch { setAdmin(false); }
  }, [token]);

  const reloadFor = useCallback(async (u: User) => {
    if (!key.current) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const t = await token();
      const kinds: Kind[] = ['bookmarks', 'passwords', 'history', 'settings'];
      const [docs, devs] = await Promise.all([
        Promise.all(kinds.map((k) => FB.getDoc(`users/${u.uid}/sync/${k}`, t).catch(() => null))),
        FB.listDocs(`users/${u.uid}/devices`, t).catch(() => [] as FB.Doc[])
      ]);
      kinds.forEach((k, i) => {
        const d = docs[i];
        try { SETTERS[k](d?.fields?.data ? decryptJson(key.current as Uint8Array, d.fields.data.stringValue, `${u.uid}:${k}`) : EMPTY[k]); } catch { SETTERS[k](EMPTY[k]); }
      });
      const list: Device[] = [];
      for (const d of devs) {
        const id = d.name.split('/').pop() as string;
        if (id === deviceId.current) continue;
        const at = FB.num(d.fields?.at);
        if (Date.now() - at > 30 * 86400_000) continue;
        try {
          const x = decryptJson<{ name: string; kind?: string; tabs: Device['tabs'] }>(key.current, d.fields?.data?.stringValue, `${u.uid}:device:${id}`);
          list.push({ id, name: x.name || 'PC', kind: x.kind, at, tabs: Array.isArray(x.tabs) ? x.tabs : [] });
        } catch { /* anderer Schlüssel */ }
      }
      setDevices(list.sort((a, b) => b.at - a.at));
      FB.lookup(t).then((p) => setUser((cur) => (cur ? { ...cur, name: p.displayName || cur.name, emailVerified: p.emailVerified } : cur))).catch(() => {});
      checkAdmin();
    } catch (e) {
      setDataError(e instanceof FB.ApiError ? e.code : 'UNKNOWN');
    } finally {
      setLoadingData(false);
    }
  }, [token, SETTERS, EMPTY, checkAdmin]);

  // ---------- Gespeicherte Sitzung beim Start ----------
  useEffect(() => {
    (async () => {
      try {
        deviceId.current = (await load(DEVICE_KEY)) || '';
        if (!deviceId.current) { deviceId.current = randomId(); await save(DEVICE_KEY, deviceId.current); }
        save('falcon.missions', null).catch(() => {}); // seit 2.7.0 ohne Missionen
      } catch { /* egal */ }
      await restoreUpdateRequired(APP_VERSION);
      try {
        const raw = await load(SESSION_KEY);
        if (!raw) { setStatus('signedOut'); return; }
        const s = JSON.parse(raw);
        tokens.current = { idToken: '', refreshToken: s.refreshToken, expiresAt: 0, uid: s.uid };
        key.current = fromBase64(s.key);
        const u = { uid: s.uid, email: s.email, name: s.name || '', emailVerified: !!s.emailVerified };
        setUser(u);
        setStatus('signedIn');
        reloadFor(u);
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [reloadFor]);

  // ---------- Anmelden / Registrieren / Abmelden ----------
  // Sync-Schlüssel holen – oder beim ersten Mal anlegen (wie Falcon auf dem PC)
  const setupKey = useCallback(async function setup(uid: string, password: string, idToken: string): Promise<Uint8Array> {
    const keyDoc = await FB.getDoc(`users/${uid}/meta/key`, idToken);
    if (keyDoc?.fields) {
      const f = keyDoc.fields;
      try { return await unwrapKey({ salt: FB.text(f.salt), iter: FB.num(f.iter), wrapped: FB.text(f.wrapped) }, password, uid); }
      catch { throw new FB.ApiError('NO_KEY'); }
    }
    const dataKey = newDataKey();
    const w = await wrapKey(dataKey, password, uid);
    try {
      await FB.createDoc(`users/${uid}/meta/key`, { salt: FB.str(w.salt), iter: FB.int(w.iter), wrapped: FB.str(w.wrapped), v: FB.int(1) }, idToken);
      return dataKey;
    } catch (e) {
      // Ein anderes Gerät war schneller → dessen Schlüssel verwenden
      if (e instanceof FB.ApiError && /ALREADY_EXISTS|FAILED_PRECONDITION/.test(e.code)) return setup(uid, password, idToken);
      throw e;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isUpdateRequired()) throw new FB.ApiError('UPDATE_REQUIRED');
    const r = await FB.signIn(email.trim(), password);
    tokens.current = r.tokens;
    setStatus('unlocking');
    try {
      key.current = await setupKey(r.tokens.uid, password, r.tokens.idToken);
      const u = { uid: r.tokens.uid, email: r.email, name: r.displayName, emailVerified: false };
      setUser(u);
      await persist(u);
      setStatus('signedIn');
      reloadFor(u);
    } catch (e) {
      tokens.current = null; key.current = null;
      setStatus('signedOut');
      throw e;
    }
  }, [persist, reloadFor, setupKey]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (isUpdateRequired()) throw new FB.ApiError('UPDATE_REQUIRED');
    let t = await FB.signUp(email.trim(), password);
    tokens.current = t;
    setStatus('unlocking');
    try {
      if (name.trim()) { t = await FB.setDisplayName(t.idToken, name.trim().slice(0, 60)); tokens.current = t; }
      FB.sendVerification(t.idToken).catch(() => {});
      key.current = await setupKey(t.uid, password, t.idToken);
      const u = { uid: t.uid, email: email.trim(), name: name.trim().slice(0, 60), emailVerified: false };
      setUser(u);
      await persist(u);
      setStatus('signedIn');
      reloadFor(u);
    } catch (e) {
      tokens.current = null; key.current = null;
      setStatus('signedOut');
      throw e;
    }
  }, [persist, reloadFor, setupKey]);

  // Verlauf vom Handy mit dem Konto zusammenführen (wie der PC: neueste zuerst, höchstens 3000)
  const flushHistory = useCallback(async () => {
    if (!user || !key.current || !pendingHistory.current.size) return;
    const add = [...pendingHistory.current.values()];
    pendingHistory.current = new Map();
    try {
      await mutateKind<HistoryEntry[]>('history', (cur) => {
        const map = new Map((cur || []).map((e) => [e.url, { ...e }]));
        for (const e of add) {
          const x = map.get(e.url);
          if (!x) { map.set(e.url, e); continue; }
          x.visits = (x.visits || 0) + (e.visits || 1);
          if ((e.last || 0) > (x.last || 0)) { x.last = e.last; if (e.title) x.title = e.title; }
        }
        return [...map.values()].sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, 3000);
      });
    } catch {
      for (const e of add) if (!pendingHistory.current.has(e.url)) pendingHistory.current.set(e.url, e);
    }
  }, [user, mutateKind]);

  // Offene Tabs dieses Handys für die PCs bereitstellen (wie ein weiterer PC, mit kind: 'phone')
  const pushTabs = useCallback(async (force = false) => {
    const u = user;
    if (!u || !key.current || !deviceId.current) return;
    const list = tabs.filter((t) => !t.incognito && /^https?:/.test(t.url)).map((t) => ({ url: t.url, title: t.title || hostOf(t.url) })).slice(0, 60);
    const hash = JSON.stringify(list);
    if (!force && hash === lastTabsHash.current) return;
    try {
      const id = deviceId.current;
      await FB.putDoc(`users/${u.uid}/devices/${id}`, {
        data: FB.str(encryptJson(key.current, { name: DEVICE_NAME, kind: 'phone', tabs: list }, `${u.uid}:device:${id}`)), at: FB.int(Date.now()), v: FB.int(1)
      }, await token());
      lastTabsHash.current = hash;
    } catch { /* später erneut */ }
  }, [user, tabs, token]);

  const forget = useCallback(async () => {
    tokens.current = null; key.current = null; pendingHistory.current = new Map(); lastTabsHash.current = '';
    setUser(null); setBookmarks([]); setPasswords([]); setHistory([]); setSettings({}); setDevices([]); setAdmin(false);
    await save(SESSION_KEY, null);
    setStatus('signedOut');
  }, []);

  const signOut = useCallback(async () => {
    await flushHistory();
    try { if (user && deviceId.current) await FB.deleteDoc(`users/${user.uid}/devices/${deviceId.current}`, await token()); } catch { /* offline */ }
    await forget();
  }, [flushHistory, forget, user, token]);

  // Verlauf alle 2 Minuten, Tabs jede Minute – und alles beim Wechsel in den Hintergrund
  useEffect(() => {
    const b = setInterval(flushHistory, 120_000);
    const c = setInterval(() => pushTabs(), 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') { flushHistory(); pushTabs(); } });
    return () => { clearInterval(b); clearInterval(c); sub.remove(); };
  }, [flushHistory, pushTabs]);
  // Spätestens alle 6 Stunden neu melden, damit das Handy bei den PCs als aktiv gilt
  useEffect(() => { if (user) { const iv = setInterval(() => pushTabs(true), 6 * 3600_000); return () => clearInterval(iv); } }, [user, pushTabs]);

  // ---------- Konto bearbeiten ----------
  const updateName = useCallback(async (name: string) => {
    if (!user) throw new FB.ApiError('SIGNED_OUT');
    const clean = name.trim().slice(0, 60);
    tokens.current = await FB.setDisplayName(await token(), clean);
    const u = { ...user, name: clean };
    setUser(u);
    await persist(u);

  }, [user, token, persist]);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!user || !key.current) throw new FB.ApiError('SIGNED_OUT');
    const r = await FB.signIn(user.email, current);
    tokens.current = await FB.changePassword(r.tokens.idToken, next);
    const w = await wrapKey(key.current, next, user.uid);
    await FB.putDoc(`users/${user.uid}/meta/key`, { salt: FB.str(w.salt), iter: FB.int(w.iter), wrapped: FB.str(w.wrapped), v: FB.int(1) }, tokens.current.idToken);
    await persist(user);
  }, [user, persist]);

  const deleteAccount = useCallback(async (password: string) => {
    if (!user) throw new FB.ApiError('SIGNED_OUT');
    const r = await FB.signIn(user.email, password);
    const t = r.tokens.idToken;
    for (const k of ['bookmarks', 'passwords', 'history', 'settings']) await FB.deleteDoc(`users/${user.uid}/sync/${k}`, t);
    try { for (const d of await FB.listDocs(`users/${user.uid}/devices`, t)) await FB.deleteDoc(`users/${user.uid}/devices/${d.name.split('/').pop()}`, t); } catch { /* keine Geräte */ }
    await FB.deleteDoc(`users/${user.uid}/meta/key`, t);
    await FB.deleteUser(t);
    await forget();
  }, [user, forget]);

  const resendVerification = useCallback(async () => { await FB.sendVerification(await token()); }, [token]);

  // ---------- Lesezeichen, Passwörter, Verlauf ----------
  const addBookmark = useCallback((url: string, title: string) =>
    mutateKind<Bookmark[]>('bookmarks', (cur) => (hasBookmark(cur, url) ? cur : [...cur, { title: title || hostOf(url), url }])), [mutateKind]);
  const removeBookmark = useCallback((url: string) => mutateKind<Bookmark[]>('bookmarks', (cur) => withoutUrl(cur, url)), [mutateKind]);
  const savePassword = useCallback((p: { origin: string; username: string; password: string; id?: string }) =>
    mutateKind<Password[]>('passwords', (cur) => {
      const list = [...(cur || [])];
      const i = list.findIndex((e) => (p.id ? e.id === p.id : e.origin === p.origin && e.username === p.username));
      if (i >= 0) list[i] = { ...list[i], origin: p.origin, username: p.username, password: p.password, updated: Date.now() };
      else list.push({ id: randomId(), origin: p.origin, username: p.username, password: p.password, created: Date.now() });
      return list;
    }), [mutateKind]);
  const deletePassword = useCallback((id: string) => mutateKind<Password[]>('passwords', (cur) => (cur || []).filter((e) => e.id !== id)), [mutateKind]);
  const clearHistory = useCallback(async () => { pendingHistory.current = new Map(); await mutateKind<HistoryEntry[]>('history', () => []); }, [mutateKind]);
  const neverSave = useCallback((origin: string) => mutateKind<Record<string, unknown>>('settings', (cur) => {
    const list = Array.isArray(cur?.pwNever) ? (cur.pwNever as string[]) : [];
    return { ...(cur || {}), pwNever: list.includes(origin) ? list : [...list, origin] };
  }), [mutateKind]);
  const removeHistory = useCallback((url: string) => mutateKind<HistoryEntry[]>('history', (cur) => (cur || []).filter((e) => e.url !== url)), [mutateKind]);

  // ---------- Fehler melden & Admin ----------
  const submitReport = useCallback(async (r: { text: string; category: string; url?: string; email?: string }) => {
    const text = r.text.trim().slice(0, 5000);
    if (!text) throw new FB.ApiError('EMPTY');
    const u = isUpdateRequired() ? null : user; // gesperrt: ohne Konto melden
    const t = u ? await token() : undefined;
    const body = {
      text, category: r.category.slice(0, 40), version: `Mobile ${APP_VERSION}`, os: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
      url: r.url ? r.url.slice(0, 1000) : undefined, email: r.email ? r.email.trim().slice(0, 200) : undefined,
      uid: u?.uid, created: new Date().toISOString(), status: 'new'
    };
    const res = await FB.addDoc('reports', toFields(body), t);
    const id = String(res.name || '').split('/').pop();
    if (id) {
      const pub = { text: body.text, category: body.category, version: body.version, created: body.created, status: 'new' };
      await FB.putDoc(`reportsPublic/${id}`, toFields(pub), t, { exists: false }).catch(() => {});
    }
  }, [user, token]);
  const listReports = useCallback(async (path: string) => {
    const docs = await FB.query(path, 'pageSize=200', user && !isUpdateRequired() ? await token() : undefined);
    return docs.map((d) => ({ id: d.name.split('/').pop() as string, ...fromFields(d.fields) }) as Report)
      .sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }, [user, token]);
  const publicReports = useCallback(() => listReports('reportsPublic'), [listReports]);
  const adminReports = useCallback(() => listReports('reports'), [listReports]);
  const updateReport = useCallback(async (id: string, st: string) => {
    if (!/^[\w-]{10,40}$/.test(id) || !['new', 'progress', 'done'].includes(st)) throw new FB.ApiError('INVALID');
    const t = await token();
    await FB.putDoc(`reports/${id}`, { status: FB.str(st) }, t, undefined, ['status']);
    await FB.putDoc(`reportsPublic/${id}`, { status: FB.str(st) }, t, { exists: true }, ['status']).catch(() => {});
  }, [token]);
  const deleteReport = useCallback(async (id: string) => {
    if (!/^[\w-]{10,40}$/.test(id)) throw new FB.ApiError('INVALID');
    const t = await token();
    await FB.deleteDoc(`reports/${id}`, t);
    await FB.deleteDoc(`reportsPublic/${id}`, t).catch(() => {});
  }, [token]);
  // Benachrichtigungen: notices/{id} – lesen dürfen alle mit Konto, schreiben nur der Admin (Firestore-Regeln)
  const notices = useCallback(async () => {
    if (!user || isUpdateRequired()) return [];
    const docs = await FB.query('notices', 'pageSize=20&orderBy=created%20desc', await token());
    return docs.map((d) => ({ id: d.name.split('/').pop() as string, title: FB.text(d.fields?.title), text: FB.text(d.fields?.text), created: FB.num(d.fields?.created) }))
      .filter((n) => n.text && Date.now() - n.created < 60 * 86400_000);
  }, [user, token]);
  const sendNotice = useCallback(async (title: string, text: string) => {
    const body = text.trim().slice(0, 1000);
    if (!body) throw new FB.ApiError('EMPTY');
    await FB.addDoc('notices', { title: FB.str(title.trim().slice(0, 80)), text: FB.str(body), created: FB.int(Date.now()) }, await token());
  }, [token]);
  const deleteNotice = useCallback(async (id: string) => {
    if (!/^[\w-]{10,40}$/.test(id)) throw new FB.ApiError('INVALID');
    await FB.deleteDoc(`notices/${id}`, await token());
  }, [token]);


  // ---------- Browser-Tabs ----------
  const blank = (incognito = false): Tab => ({ id: randomId(), src: '', nonce: 0, url: '', title: '', ...(incognito ? { incognito: true } : {}) });
  const navigate = useCallback((url: string) => {
    setTabs((list) => list.map((t) => (t.id === activeId ? { ...t, src: url, nonce: t.nonce + 1, url, title: '' } : t)));
  }, [activeId]);
  const openUrl = useCallback((url: string) => {
    const current = tabs.find((t) => t.id === activeId);
    if (current && !current.src && !current.url && !current.incognito) { navigate(url); return; }
    const t = { ...blank(), src: url, nonce: 1, url };
    setTabs((list) => [...list, t]);
    setActiveId(t.id);
  }, [tabs, activeId, navigate]);
  const newTab = useCallback((incognito = false) => {
    const t = blank(incognito);
    setTabs((list) => [...list, t]);
    setActiveId(t.id);
  }, []);
  const closeTab = useCallback((id: string) => {
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    if (!rest.length) { const t = blank(); setTabs([t]); setActiveId(t.id); return; }
    setTabs(rest);
    if (id === activeId) setActiveId(rest[Math.min(i, rest.length - 1)].id);
  }, [tabs, activeId]);
  const closeAllTabs = useCallback(() => { const t = blank(); setTabs([t]); setActiveId(t.id); }, []);

  // Tabs nach dem Neustart wiederherstellen (seit 2.4.0) – Inkognito-Tabs werden nie gespeichert
  const tabsRestored = useRef(false);
  const [tabsReady, setTabsReady] = useState(false);
  const tabSnapshot = useCallback(() => {
    const keep = tabs.filter((t) => !t.incognito && /^https?:/i.test(t.url));
    return { activeId, tabs: keep.map((t) => ({ id: t.id, url: t.url, title: t.title })) };
  }, [tabs, activeId]);
  useEffect(() => {
    let cancelled = false;
    loadTabs().then((saved) => {
      if (cancelled) return;
      if (saved?.tabs.length) {
        setTabs((current) => {
          // Schon etwas geöffnet (z. B. per Link), bevor die Datei gelesen war? Dann hinten anhängen.
          const opened = current.filter((t) => t.src || t.url || t.incognito);
          const restored = saved.tabs.map((t) => ({ id: t.id, src: t.url, nonce: 1, url: t.url, title: t.title }));
          return [...restored, ...opened];
        });
        setActiveId((cur) => (saved.tabs.some((t) => t.id === saved.activeId) ? saved.activeId : saved.tabs[saved.tabs.length - 1].id) || cur);
      }
      tabsRestored.current = true;
      setTabsReady(true);
    }).catch(() => { tabsRestored.current = true; setTabsReady(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!tabsRestored.current) return;
    const t = setTimeout(() => { saveTabs(tabSnapshot()); }, 400);
    return () => clearTimeout(t);
  }, [tabSnapshot]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st !== 'active' && tabsRestored.current) saveTabs(tabSnapshot(), true); });
    return () => sub.remove();
  }, [tabSnapshot]);

  // Links aus anderen Apps (Falcon als Standardbrowser, seit 2.5.1) – erst öffnen, wenn die Tabs geladen sind
  const [incoming, setIncoming] = useState(0);
  useEffect(() => onIncoming(() => setIncoming((n) => n + 1)), []);
  useEffect(() => {
    if (!tabsReady) return;
    const url = takeIncoming();
    if (url) openUrl(url);
  }, [tabsReady, incoming, openUrl]);
  const switchTab = useCallback((id: string) => setActiveId(id), []);
  const updateTab = useCallback((id: string, patch: Partial<Pick<Tab, 'url' | 'title'>>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  // Verlauf (nicht in Inkognito)
  const visited = useCallback((url: string, title?: string, incognito?: boolean) => {
    if (!user || !/^https?:/i.test(url)) return;
    const clean = url.replace(/#.*$/, '');
    if (!incognito) {
      const e = pendingHistory.current.get(clean);
      if (e) { if (title) e.title = title; if (clean !== lastVisit.current.url) { e.visits = (e.visits || 0) + 1; e.last = Date.now(); } }
      else if (clean !== lastVisit.current.url) pendingHistory.current.set(clean, { url: clean, title: title || '', visits: 1, last: Date.now() });
    }
    lastVisit.current = { url: clean, at: Date.now() };
  }, [user]);

  const value: Ctx = {
    status, user, bookmarks, passwords, history, devices, admin, loadingData, tabsReady, dataError, tabs, activeId,
    searchEngine: typeof settings.searchEngine === 'string' ? settings.searchEngine : 'google',
    pwNever: Array.isArray(settings.pwNever) ? settings.pwNever as string[] : [],
    signIn, signUp, signOut, reload: async () => { if (user) { await flushHistory(); await reloadFor(user); pushTabs(true); } },
    updateName, changePassword, deleteAccount, resendVerification,
    addBookmark, removeBookmark, savePassword, deletePassword, clearHistory, removeHistory, neverSave,
    submitReport, publicReports, adminReports, updateReport, deleteReport, notices, sendNotice, deleteNotice,
    openUrl, navigate, newTab, closeTab, closeAllTabs, switchTab, updateTab, visited
  };
  // Pflicht-Update: Das Konto ruht (Anmeldung und Daten bleiben gespeichert und kommen nach dem Update zurück)
  const shown: Ctx = locked ? {
    ...value, status: 'signedOut', user: null, bookmarks: [], passwords: [], history: [], devices: [],
    admin: false, loadingData: false, dataError: null
  } : value;
  return <SessionContext.Provider value={shown}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession außerhalb von SessionProvider');
  return c;
}

export const ERRORS: Record<string, string> = {
  UPDATE_REQUIRED: 'Falcon ist zu alt. Aktualisiere Falcon, um dein Konto wieder zu nutzen. Danach bist du automatisch wieder angemeldet.',
  INVALID_LOGIN_CREDENTIALS: 'E-Mail-Adresse oder Passwort ist falsch.',
  INVALID_PASSWORD: 'E-Mail-Adresse oder Passwort ist falsch.',
  EMAIL_NOT_FOUND: 'E-Mail-Adresse oder Passwort ist falsch.',
  INVALID_EMAIL: 'Bitte gib eine gültige E-Mail-Adresse ein.',
  MISSING_PASSWORD: 'Bitte gib dein Passwort ein.',
  USER_DISABLED: 'Dieses Konto wurde deaktiviert.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Zu viele Versuche. Bitte warte kurz.',
  NETWORK: 'Keine Verbindung. Bist du online?',
  NO_KEY: 'Deine Sync-Daten konnten nicht entschlüsselt werden. Melde dich einmal in Falcon auf dem PC an.',
  EMAIL_EXISTS: 'Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich stattdessen an.',
  WEAK_PASSWORD: 'Das Passwort muss mindestens 8 Zeichen lang sein.',
  OPERATION_NOT_ALLOWED: 'Registrieren ist gerade nicht möglich.',
  EMPTY: 'Bitte beschreib kurz, was passiert ist.',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Bitte melde dich ab und wieder an.',
  PERMISSION_DENIED: 'Der Server hat den Zugriff verweigert.',
  SIGNED_OUT: 'Bitte melde dich zuerst an.'
};
export const errorText = (e: unknown) => {
  const code = e instanceof FB.ApiError ? e.code : 'UNKNOWN';
  return ERRORS[code] || `Das hat nicht geklappt (${code}).`;
};
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
