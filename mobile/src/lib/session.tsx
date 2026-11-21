// App-Zustand: Falcon-Konto, Sync-Daten (Ende-zu-Ende-verschlüsselt), FalCoins, Shop, Missionen und Browser-Tabs.
// Alle Formate entsprechen Falcon auf dem PC (src/account.js), damit beide Seiten dieselben Daten lesen und schreiben.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as FB from './firebase';
import { decryptJson, encryptJson, fromBase64, newDataKey, randomId, toBase64, unwrapKey, wrapKey } from './crypto';
import { load, save } from './storage';
import { hostOf } from './theme';

// Muss zu app.json → expo.version passen (Update-Hinweis vergleicht damit die APKs im GitHub-Release)
export const APP_VERSION = '2.3.8';

export type Bookmark = { title?: string; url?: string; folder?: boolean; children?: Bookmark[] };
export type Password = { id: string; origin: string; username: string; password: string; created?: number; updated?: number; lastUsed?: number };
export type HistoryEntry = { url: string; title?: string; visits?: number; last?: number };
export type Device = { id: string; name: string; at: number; kind?: string; tabs: { url: string; title?: string }[] };
export type Tab = { id: string; src: string; nonce: number; url: string; title: string; incognito?: boolean };
export type Wallet = { balance: number; pending: number; betaUntil: number; gameModeUntil: number; lastDaily: string; streak: number };
export type Mission = { id: string; goal: number; reward: number; progress: number; done: boolean; claimed: boolean; pcOnly?: boolean };
export type LogEntry = { type: string; amount: number; label: string; at: number };
export type Purchase = { id: string; item: string; price: number; at: number; until: number; refund: string | null };
export type Refund = { id: string; uid: string; email: string; name: string; purchaseId: string; item: string; price: number; reason: string; created: number; status: string; note: string; decidedAt: number; seen: boolean };
export const ITEM_NAME = (id: string) => (id === 'beta14' ? 'Beta-Zugriff' : id === 'gameMode' ? 'Game Mode' : id);
const SHOP_FIELDS: Record<string, string> = { beta14: 'betaUntil', gameMode: 'gameModeUntil' };
const fromRefund = (d: FB.Doc): Refund => {
  const f = d.fields || {};
  return {
    id: d.name.split('/').pop() as string, uid: FB.text(f.uid), email: FB.text(f.email), name: FB.text(f.name), purchaseId: FB.text(f.purchaseId),
    item: FB.text(f.item), price: FB.num(f.price), reason: FB.text(f.reason), created: FB.num(f.created), status: FB.text(f.status) || 'pending',
    note: FB.text(f.note), decidedAt: FB.num(f.decidedAt), seen: !!f.seen?.booleanValue
  };
};
export type Report = { id: string; text?: string; category?: string; version?: string; created?: string; status?: string; url?: string; email?: string; os?: string };
export type AdminWallet = { uid: string; email: string; name: string; balance: number; betaUntil: number; gameModeUntil: number };
type User = { uid: string; email: string; name: string; emailVerified: boolean };
type Status = 'loading' | 'signedOut' | 'unlocking' | 'signedIn';
type Kind = 'bookmarks' | 'passwords' | 'history' | 'settings';
type MissionState = { date: string; visits: number; domains: string[]; claimed: string[] };

// ---------- FalCoin-Shop (wie auf dem PC) ----------
export const SHOP = [
  // Game Mode gibt es seit 2.1.8 nur noch als Beta-Funktion (wirkt in Falcon auf dem PC)
  {
    id: 'beta14', price: 350, icon: 'flask-outline', field: 'betaUntil', days: 30, title: 'Beta-Zugriff · 30 Tage', extendLabel: 'Um 30 Tage verlängern',
    text: 'Teste neue Funktionen vor allen anderen – dazu gehört der Game Mode. Dein Zugriff gilt ab dem Kauf 30 Tage lang.',
    perks: ['Game Mode – gibt CPU und Arbeitsspeicher für Spiele frei: Hintergrund-Tabs werden pausiert und schlafen gelegt (wirkt in Falcon auf dem PC)', 'RGB-Modus – die Akzentfarbe läuft durch alle Farben, Tabs und Knöpfe leuchten (in Falcon auf dem PC)', 'Angebots-Wunschliste – Falcon meldet sich, wenn ein Spiel kostenlos oder reduziert ist (in Falcon auf dem PC)', 'Seite übersetzen – Websites direkt in deine Sprache übersetzen', 'Alle weiteren Beta-Funktionen, sobald sie erscheinen']
  }
] as const;
export type ShopItem = (typeof SHOP)[number];
const MISSIONS = [
  { id: 'visits20', metric: 'visits', goal: 20, reward: 20 },
  { id: 'sites5', metric: 'domains', goal: 5, reward: 10 },
  { id: 'gamemode30', metric: 'gmMinutes', goal: 30, reward: 15 }
] as const;
export const MISSION_TEXT: Record<string, string> = {
  visits20: 'Besuche heute {goal} Seiten',
  sites5: 'Besuche {goal} verschiedene Websites',
  gamemode30: 'Nutze {goal} Minuten den Game Mode'
};

type Ctx = {
  status: Status;
  user: User | null;
  bookmarks: Bookmark[];
  passwords: Password[];
  history: HistoryEntry[];
  devices: Device[];
  wallet: Wallet;
  daily: { available: boolean; streak: number; next: number };
  missions: Mission[];
  searchEngine: string;
  pwNever: string[];
  admin: boolean;
  betaActive: boolean;
  loadingData: boolean;
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
  // FalCoins
  claimDaily: () => Promise<{ reward: number; streak: number }>;
  claimMission: (id: string) => Promise<{ reward: number }>;
  purchase: (item: string) => Promise<{ until: number }>;
  refreshCoins: () => Promise<void>;
  coinLog: () => Promise<LogEntry[]>;
  // Rückerstattungen
  listPurchases: () => Promise<Purchase[]>;
  requestRefund: (r: { purchaseId: string; email: string; reason: string }) => Promise<void>;
  refundNotices: () => Promise<Refund[]>;
  markRefundSeen: (id: string) => Promise<void>;
  adminRefunds: () => Promise<Refund[]>;
  adminDecideRefund: (r: Refund, approve: boolean, note?: string) => Promise<void>;
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
  adminWallets: () => Promise<AdminWallet[]>;
  adminUpdateWallet: (uid: string, patch: { balance?: number; gameModeUntil?: number; betaUntil?: number }) => Promise<void>;
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
const MISSIONS_KEY = 'falcon.missions';
const DEVICE_KEY = 'falcon.device';
const EMPTY_WALLET: Wallet = { balance: 0, pending: 0, betaUntil: 0, gameModeUntil: 0, lastDaily: '', streak: 0 };
const DEVICE_NAME = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android-Handy' : 'Handy';
const SessionContext = createContext<Ctx | null>(null);
const retryable = (e: unknown) => e instanceof FB.ApiError && /FAILED_PRECONDITION|ABORTED|ALREADY_EXISTS/.test(e.code);

// ---------- Hilfen ----------
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const DAILY = 10, STREAK_BONUS = 50, STREAK_DAYS = 7;
const dailyReward = (streak: number) => DAILY + (streak % STREAK_DAYS === 0 ? STREAK_BONUS : 0);
function nextStreak(w: Wallet) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return w.lastDaily === today(y) ? w.streak + 1 : 1;
}
function walletFrom(doc: FB.Doc | null, pending = 0): Wallet {
  const f = doc?.fields || {};
  return {
    balance: FB.num(f.balance), pending, betaUntil: FB.num(f.betaUntil), gameModeUntil: FB.num(f.gameModeUntil),
    lastDaily: FB.text(f.lastDaily), streak: FB.num(f.streak)
  };
}
function extend(from: number, it: { months?: number; days?: number }) {
  const d = new Date(Math.max(Date.now(), from || 0));
  if (it.months) d.setMonth(d.getMonth() + it.months);
  if (it.days) d.setDate(d.getDate() + it.days);
  return d.getTime();
}
function logWrites(uid: string, { id = randomId(), type, amount, label = '', increment = false }:
  { id?: string; type: string; amount: number; label?: string; increment?: boolean }) {
  const name = FB.docName(`users/${uid}/coinlog/${id}`);
  if (!increment) return [{ update: { name, fields: { type: FB.str(type), amount: FB.int(amount), label: FB.str(label), at: FB.int(Date.now()) } }, currentDocument: { exists: false } }];
  return [
    { update: { name, fields: { type: FB.str(type), label: FB.str(label), at: FB.int(Date.now()) } }, updateMask: { fieldPaths: ['type', 'label', 'at'] } },
    { transform: { document: name, fieldTransforms: [{ fieldPath: 'amount', increment: { integerValue: String(amount) } }] } }
  ];
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
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [mstate, setMstate] = useState<MissionState>({ date: today(), visits: 0, domains: [], claimed: [] });
  const [admin, setAdmin] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: randomId(), src: '', nonce: 0, url: '', title: '' }]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const [clock, setClock] = useState(() => Date.now());

  const tokens = useRef<FB.Tokens | null>(null);
  const key = useRef<Uint8Array | null>(null);
  const pending = useRef(0);
  const lastVisit = useRef({ url: '', at: 0 });
  const pendingHistory = useRef<Map<string, HistoryEntry>>(new Map());
  const deviceId = useRef('');
  const lastTabsHash = useRef('');

  // Uhr für „aktiv bis“-Anzeigen und den Tageswechsel der Missionen
  useEffect(() => { const iv = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(iv); }, []);

  // Gültiges ID-Token (wird bei Bedarf erneuert)
  const token = useCallback(async () => {
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
  const ensureWallet = useCallback(async (u: User) => {
    const t = await token();
    let doc = await FB.getDoc(`wallets/${u.uid}`, t);
    if (!doc) {
      try {
        doc = await FB.createDoc(`wallets/${u.uid}`, { balance: FB.int(0), betaUntil: FB.int(0), gameModeUntil: FB.int(0), email: FB.str(u.email), name: FB.str(u.name), created: FB.int(Date.now()) }, t);
      } catch { doc = await FB.getDoc(`wallets/${u.uid}`, t); }
    }
    return doc;
  }, [token]);

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
      const [docs, devs, w] = await Promise.all([
        Promise.all(kinds.map((k) => FB.getDoc(`users/${u.uid}/sync/${k}`, t).catch(() => null))),
        FB.listDocs(`users/${u.uid}/devices`, t).catch(() => [] as FB.Doc[]),
        ensureWallet(u)
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
      setWallet(walletFrom(w, pending.current));
      FB.lookup(t).then((p) => setUser((cur) => (cur ? { ...cur, name: p.displayName || cur.name, emailVerified: p.emailVerified } : cur))).catch(() => {});
      checkAdmin();
    } catch (e) {
      setDataError(e instanceof FB.ApiError ? e.code : 'UNKNOWN');
    } finally {
      setLoadingData(false);
    }
  }, [token, ensureWallet, SETTERS, EMPTY, checkAdmin]);

  // ---------- Gespeicherte Sitzung beim Start ----------
  useEffect(() => {
    (async () => {
      try {
        deviceId.current = (await load(DEVICE_KEY)) || '';
        if (!deviceId.current) { deviceId.current = randomId(); await save(DEVICE_KEY, deviceId.current); }
        const m = await load(MISSIONS_KEY);
        if (m) { const x = JSON.parse(m); if (x.date === today()) setMstate(x); }
      } catch { /* egal */ }
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

  const flushCoins = useCallback(async () => {
    const u = user;
    const n = pending.current;
    if (!u || !n || !key.current) return;
    try {
      const t = await token();
      await ensureWallet(u);
      const res = await FB.commit([
        { update: { name: FB.docName(`wallets/${u.uid}`), fields: { email: FB.str(u.email), name: FB.str(u.name) } }, updateMask: { fieldPaths: ['email', 'name'] }, currentDocument: { exists: true } },
        { transform: { document: FB.docName(`wallets/${u.uid}`), fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(n) } }] } },
        ...logWrites(u.uid, { id: `visits-${today()}`, type: 'visits', amount: n, label: today(), increment: true })
      ], t);
      pending.current -= n;
      const balance = Number(res.writeResults?.[1]?.transformResults?.[0]?.integerValue);
      setWallet((w) => ({ ...w, balance: Number.isFinite(balance) ? balance : w.balance, pending: pending.current }));
    } catch { /* später erneut */ }
  }, [user, token, ensureWallet]);

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
    tokens.current = null; key.current = null; pending.current = 0; pendingHistory.current = new Map(); lastTabsHash.current = '';
    setUser(null); setBookmarks([]); setPasswords([]); setHistory([]); setSettings({}); setDevices([]); setWallet(EMPTY_WALLET); setAdmin(false);
    await save(SESSION_KEY, null);
    setStatus('signedOut');
  }, []);

  const signOut = useCallback(async () => {
    await flushCoins();
    await flushHistory();
    try { if (user && deviceId.current) await FB.deleteDoc(`users/${user.uid}/devices/${deviceId.current}`, await token()); } catch { /* offline */ }
    await forget();
  }, [flushCoins, flushHistory, forget, user, token]);

  // FalCoins alle 30 Sekunden, Verlauf alle 2 Minuten, Tabs jede Minute – und alles beim Wechsel in den Hintergrund
  useEffect(() => {
    const a = setInterval(flushCoins, 30_000);
    const b = setInterval(flushHistory, 120_000);
    const c = setInterval(() => pushTabs(), 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') { flushCoins(); flushHistory(); pushTabs(); } });
    return () => { clearInterval(a); clearInterval(b); clearInterval(c); sub.remove(); };
  }, [flushCoins, flushHistory, pushTabs]);
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

  // ---------- Tägliche Belohnung ----------
  const claimDaily = useCallback(async () => {
    const u = user;
    if (!u) throw new FB.ApiError('SIGNED_OUT');
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = await token();
      const doc = await ensureWallet(u);
      const w = walletFrom(doc, pending.current);
      if (w.lastDaily === today()) { setWallet(w); throw new FB.ApiError('ALREADY_CLAIMED'); }
      const streak = nextStreak(w);
      const reward = dailyReward(streak);
      try {
        await FB.commit([
          {
            update: { name: FB.docName(`wallets/${u.uid}`), fields: { balance: FB.int(w.balance + reward), lastDaily: FB.str(today()), streak: FB.int(streak) } },
            updateMask: { fieldPaths: ['balance', 'lastDaily', 'streak'] },
            currentDocument: { updateTime: doc?.updateTime }
          },
          ...logWrites(u.uid, { type: 'daily', amount: reward, label: String(streak) })
        ], t);
        setWallet({ ...w, balance: w.balance + reward, lastDaily: today(), streak });
        return { reward, streak };
      } catch (e) {
        if (!retryable(e) || attempt === 2) throw e;
      }
    }
    throw new FB.ApiError('UNKNOWN');
  }, [user, token, ensureWallet]);

  // ---------- Shop ----------
  const refreshCoins = useCallback(async () => {
    if (!user) return;
    await flushCoins();
    try { setWallet(walletFrom(await ensureWallet(user), pending.current)); } catch { /* offline */ }
  }, [user, flushCoins, ensureWallet]);

  const purchase = useCallback(async (itemId: string) => {
    const u = user;
    const it = SHOP.find((x) => x.id === itemId);
    if (!it) throw new FB.ApiError('INVALID');
    if ((it as { available?: boolean }).available === false) throw new FB.ApiError('UNAVAILABLE');
    if (!u) throw new FB.ApiError('SIGNED_OUT');
    // Erst offene FalCoins gutschreiben, damit der Kontostand stimmt
    await flushCoins();
    if (pending.current) throw new FB.ApiError('NETWORK');
    for (let attempt = 0; attempt < 3; attempt++) {
      const t = await token();
      const doc = await ensureWallet(u);
      const w = walletFrom(doc, 0);
      if (w[it.field] > Date.now()) { setWallet(w); throw new FB.ApiError('ALREADY_OWNED'); }
      if (w.balance < it.price) { setWallet(w); throw new FB.ApiError('NOT_ENOUGH'); }
      const until = extend(w[it.field], it as { months?: number; days?: number });
      const fields = { balance: FB.int(w.balance - it.price), [it.field]: FB.int(until) };
      try {
        await FB.commit([
          { update: { name: FB.docName(`wallets/${u.uid}`), fields }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: doc?.updateTime } },
          {
            update: { name: FB.docName(`users/${u.uid}/purchases/${randomId()}`), fields: { item: FB.str(it.id), price: FB.int(it.price), at: FB.int(Date.now()), until: FB.int(until) } },
            currentDocument: { exists: false }
          },
          ...logWrites(u.uid, { type: 'purchase', amount: -it.price, label: it.id })
        ], t);
        setWallet({ ...w, balance: w.balance - it.price, [it.field]: until });
        return { until };
      } catch (e) {
        if (!retryable(e) || attempt === 2) throw e;
      }
    }
    throw new FB.ApiError('UNKNOWN');
  }, [user, token, flushCoins, ensureWallet]);

  const coinLog = useCallback(async () => {
    if (!user) throw new FB.ApiError('SIGNED_OUT');
    await flushCoins();
    const docs = await FB.query(`users/${user.uid}/coinlog`, 'pageSize=100&orderBy=at%20desc', await token());
    return docs.map((d) => {
      const f = d.fields || {};
      return { type: FB.text(f.type), amount: FB.num(f.amount), label: FB.text(f.label), at: FB.num(f.at) };
    }).sort((a, b) => b.at - a.at);
  }, [user, token, flushCoins]);

  // ---------- Rückerstattungen (Antrag → Admin entscheidet → Hinweis beim nächsten Start) ----------
  const listPurchases = useCallback(async () => {
    if (!user) throw new FB.ApiError('SIGNED_OUT');
    const t = await token();
    const [docs, mine] = await Promise.all([
      FB.listDocs(`users/${user.uid}/purchases`, t),
      FB.runQuery('refunds', 'uid', user.uid, t).catch(() => [] as FB.Doc[])
    ]);
    const refunds = mine.map(fromRefund);
    return docs.map((d) => {
      const f = d.fields || {};
      const id = d.name.split('/').pop() as string;
      return { id, item: FB.text(f.item), price: FB.num(f.price), at: FB.num(f.at), until: FB.num(f.until), refund: refunds.find((r) => r.purchaseId === id)?.status || null };
    }).sort((a, b) => b.at - a.at);
  }, [user, token]);
  const requestRefund = useCallback(async ({ purchaseId, email, reason }: { purchaseId: string; email: string; reason: string }) => {
    if (!user) throw new FB.ApiError('SIGNED_OUT');
    const text = reason.trim().slice(0, 1000);
    const mail = email.trim().slice(0, 200);
    if (!text) throw new FB.ApiError('EMPTY_REASON');
    if (!/^\S+@\S+\.\S+$/.test(mail)) throw new FB.ApiError('INVALID_EMAIL');
    if (!/^[\w-]{6,64}$/.test(purchaseId)) throw new FB.ApiError('INVALID');
    const t = await token();
    const p = await FB.getDoc(`users/${user.uid}/purchases/${purchaseId}`, t);
    if (!p) throw new FB.ApiError('INVALID');
    const mine = (await FB.runQuery('refunds', 'uid', user.uid, t).catch(() => [] as FB.Doc[])).map(fromRefund);
    if (mine.some((r) => r.purchaseId === purchaseId)) throw new FB.ApiError('ALREADY_REQUESTED');
    await FB.addDoc('refunds', {
      uid: FB.str(user.uid), email: FB.str(mail), name: FB.str(user.name || ''), purchaseId: FB.str(purchaseId),
      item: FB.str(FB.text(p.fields?.item)), price: FB.int(FB.num(p.fields?.price)), reason: FB.str(text), created: FB.int(Date.now()), status: FB.str('pending')
    }, t);
  }, [user, token]);
  const refundNotices = useCallback(async () => {
    if (!user) return [];
    return (await FB.runQuery('refunds', 'uid', user.uid, await token())).map(fromRefund).filter((r) => r.status !== 'pending' && !r.seen);
  }, [user, token]);
  const markRefundSeen = useCallback(async (id: string) => {
    if (!/^[\w-]{6,64}$/.test(id)) throw new FB.ApiError('INVALID');
    await FB.putDoc(`refunds/${id}`, { seen: { booleanValue: true } }, await token(), { exists: true }, ['seen']);
  }, [token]);
  const adminRefunds = useCallback(async () => {
    const docs = await FB.query('refunds', 'pageSize=200', await token());
    return docs.map(fromRefund).sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.created - a.created);
  }, [token]);
  const adminDecideRefund = useCallback(async (r: Refund, approve: boolean, note = '') => {
    const t = await token();
    const doc = await FB.getDoc(`refunds/${r.id}`, t);
    if (!doc) throw new FB.ApiError('INVALID');
    if (fromRefund(doc).status !== 'pending') throw new FB.ApiError('ALREADY_DECIDED');
    const decided = { status: FB.str(approve ? 'approved' : 'denied'), decidedAt: FB.int(Date.now()), note: FB.str(note.trim().slice(0, 500)) };
    const writes: unknown[] = [{ update: { name: FB.docName(`refunds/${r.id}`), fields: decided }, updateMask: { fieldPaths: Object.keys(decided) }, currentDocument: { updateTime: doc.updateTime } }];
    if (approve) {
      writes.push({ transform: { document: FB.docName(`wallets/${r.uid}`), fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(r.price) } }] } });
      const field = SHOP_FIELDS[r.item];
      if (field) writes.push({ update: { name: FB.docName(`wallets/${r.uid}`), fields: { [field]: FB.int(0) } }, updateMask: { fieldPaths: [field] }, currentDocument: { exists: true } });
      writes.push(...logWrites(r.uid, { type: 'refund', amount: r.price, label: r.item }));
    }
    await FB.commit(writes, t);
    if (approve && user && r.uid === user.uid) await refreshCoins();
  }, [token, user, refreshCoins]);

  // ---------- Missionen (Fortschritt wird auf diesem Handy gezählt, wie auf jedem PC) ----------
  const mcur = mstate.date === today(new Date(clock)) ? mstate : { date: today(new Date(clock)), visits: 0, domains: [], claimed: [] };
  const missions: Mission[] = MISSIONS.map((x) => {
    const value = x.metric === 'domains' ? mcur.domains.length : x.metric === 'visits' ? mcur.visits : 0;
    return { id: x.id, goal: x.goal, reward: x.reward, progress: Math.min(value, x.goal), done: value >= x.goal, claimed: mcur.claimed.includes(x.id), pcOnly: x.metric === 'gmMinutes' };
  });
  const updateMissions = useCallback((fn: (m: MissionState) => MissionState) => {
    setMstate((prev) => {
      const base = prev.date === today() ? prev : { date: today(), visits: 0, domains: [], claimed: [] };
      const next = fn(base);
      save(MISSIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  const claimMission = useCallback(async (id: string) => {
    const u = user;
    if (!u) throw new FB.ApiError('SIGNED_OUT');
    const m = missions.find((x) => x.id === id);
    if (!m) throw new FB.ApiError('INVALID');
    if (m.claimed) throw new FB.ApiError('ALREADY_CLAIMED');
    if (!m.done) throw new FB.ApiError('NOT_DONE');
    await ensureWallet(u);
    const res = await FB.commit([
      { transform: { document: FB.docName(`wallets/${u.uid}`), fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(m.reward) } }] } },
      ...logWrites(u.uid, { type: 'mission', amount: m.reward, label: id })
    ], await token());
    const balance = Number(res.writeResults?.[0]?.transformResults?.[0]?.integerValue);
    if (Number.isFinite(balance)) setWallet((w) => ({ ...w, balance }));
    updateMissions((s) => ({ ...s, claimed: [...s.claimed, id] }));
    return { reward: m.reward };
  }, [user, missions, ensureWallet, token, updateMissions]);

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
    const t = user ? await token() : undefined;
    const body = {
      text, category: r.category.slice(0, 40), version: `Mobile ${APP_VERSION}`, os: `${Platform.OS} ${Platform.Version ?? ''}`.trim(),
      url: r.url ? r.url.slice(0, 1000) : undefined, email: r.email ? r.email.trim().slice(0, 200) : undefined,
      uid: user?.uid, created: new Date().toISOString(), status: 'new'
    };
    const res = await FB.addDoc('reports', toFields(body), t);
    const id = String(res.name || '').split('/').pop();
    if (id) {
      const pub = { text: body.text, category: body.category, version: body.version, created: body.created, status: 'new' };
      await FB.putDoc(`reportsPublic/${id}`, toFields(pub), t, { exists: false }).catch(() => {});
    }
  }, [user, token]);
  const listReports = useCallback(async (path: string) => {
    const docs = await FB.query(path, 'pageSize=200', user ? await token() : undefined);
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
  const adminWallets = useCallback(async () => {
    const docs = await FB.query('wallets', 'pageSize=300', await token());
    return docs.map((d) => {
      const f = d.fields || {};
      return { uid: d.name.split('/').pop() as string, email: FB.text(f.email), name: FB.text(f.name), balance: FB.num(f.balance), betaUntil: FB.num(f.betaUntil), gameModeUntil: FB.num(f.gameModeUntil) };
    }).sort((a, b) => b.balance - a.balance);
  }, [token]);
  const adminUpdateWallet = useCallback(async (uid: string, patch: { balance?: number; gameModeUntil?: number; betaUntil?: number }) => {
    if (!/^[\w-]{6,128}$/.test(uid)) throw new FB.ApiError('INVALID');
    const fields: Record<string, unknown> = {};
    if (patch.balance !== undefined) {
      const n = Math.round(Number(patch.balance));
      if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new FB.ApiError('INVALID');
      fields.balance = FB.int(n);
    }
    if (patch.gameModeUntil !== undefined) fields.gameModeUntil = FB.int(Math.max(0, Math.round(patch.gameModeUntil)));
    if (patch.betaUntil !== undefined) fields.betaUntil = FB.int(Math.max(0, Math.round(patch.betaUntil)));
    if (!Object.keys(fields).length) throw new FB.ApiError('INVALID');
    await FB.putDoc(`wallets/${uid}`, fields, await token(), { exists: true }, Object.keys(fields));
    if (user && uid === user.uid) await refreshCoins();
  }, [token, user, refreshCoins]);

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
  const switchTab = useCallback((id: string) => setActiveId(id), []);
  const updateTab = useCallback((id: string, patch: Partial<Pick<Tab, 'url' | 'title'>>) => {
    setTabs((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  // 1 FalCoin pro neuer Seite (kein Neuladen, höchstens alle 5 Sekunden); Verlauf nur außerhalb von Inkognito
  const visited = useCallback((url: string, title?: string, incognito?: boolean) => {
    if (!user || !/^https?:/i.test(url)) return;
    const clean = url.replace(/#.*$/, '');
    if (!incognito) {
      const e = pendingHistory.current.get(clean);
      if (e) { if (title) e.title = title; if (clean !== lastVisit.current.url) { e.visits = (e.visits || 0) + 1; e.last = Date.now(); } }
      else if (clean !== lastVisit.current.url) pendingHistory.current.set(clean, { url: clean, title: title || '', visits: 1, last: Date.now() });
    }
    const last = lastVisit.current;
    if (clean === last.url || Date.now() - last.at < 5000) { last.url = clean; return; }
    lastVisit.current = { url: clean, at: Date.now() };
    pending.current += 1;
    setWallet((w) => ({ ...w, pending: pending.current }));
    const host = hostOf(clean);
    updateMissions((m) => ({ ...m, visits: m.visits + 1, domains: host && !m.domains.includes(host) && m.domains.length < 50 ? [...m.domains, host] : m.domains }));
  }, [user, updateMissions]);

  const daily = useMemo(() => {
    const claimed = wallet.lastDaily === today();
    const next = claimed ? wallet.streak + 1 : nextStreak(wallet);
    return { available: !claimed, streak: claimed ? wallet.streak : next - 1, next: dailyReward(next) };
  }, [wallet]);

  const value: Ctx = {
    status, user, bookmarks, passwords, history, devices, wallet, daily, missions, admin, loadingData, dataError, tabs, activeId,
    searchEngine: typeof settings.searchEngine === 'string' ? settings.searchEngine : 'google',
    betaActive: wallet.betaUntil > clock,
    pwNever: Array.isArray(settings.pwNever) ? settings.pwNever as string[] : [],
    signIn, signUp, signOut, reload: async () => { if (user) { await flushCoins(); await flushHistory(); await reloadFor(user); pushTabs(true); } },
    updateName, changePassword, deleteAccount, resendVerification,
    claimDaily, claimMission, purchase, refreshCoins, coinLog,
    listPurchases, requestRefund, refundNotices, markRefundSeen, adminRefunds, adminDecideRefund,
    addBookmark, removeBookmark, savePassword, deletePassword, clearHistory, removeHistory, neverSave,
    submitReport, publicReports, adminReports, updateReport, deleteReport, adminWallets, adminUpdateWallet,
    openUrl, navigate, newTab, closeTab, closeAllTabs, switchTab, updateTab, visited
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const c = useContext(SessionContext);
  if (!c) throw new Error('useSession außerhalb von SessionProvider');
  return c;
}

export const ERRORS: Record<string, string> = {
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
  ALREADY_CLAIMED: 'Heute schon abgeholt – komm morgen wieder!',
  NOT_ENOUGH: 'Nicht genug FalCoins.',
  NOT_DONE: 'Die Mission ist noch nicht geschafft.',
  UNAVAILABLE: 'Das gibt es zurzeit nicht zu kaufen.',
  ALREADY_OWNED: 'Bereits erworben – du kannst erst nach Ablauf erneut kaufen.',
  EMPTY: 'Bitte beschreib kurz, was passiert ist.',
  EMPTY_REASON: 'Bitte gib einen Grund an.',
  ALREADY_REQUESTED: 'Für diesen Kauf läuft schon eine Rückerstattung.',
  ALREADY_DECIDED: 'Über diesen Antrag wurde schon entschieden.',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Bitte melde dich ab und wieder an.',
  PERMISSION_DENIED: 'Der Server hat den Zugriff verweigert.',
  SIGNED_OUT: 'Bitte melde dich zuerst an.'
};
export const errorText = (e: unknown) => {
  const code = e instanceof FB.ApiError ? e.code : 'UNKNOWN';
  return ERRORS[code] || `Das hat nicht geklappt (${code}).`;
};
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
