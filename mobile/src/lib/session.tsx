// App-Zustand: Falcon-Konto, entschlüsselte Sync-Daten, FalCoins und der Browser-Tab
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as FB from './firebase';
import { decryptJson, fromBase64, randomId, toBase64, unwrapKey } from './crypto';
import { load, save } from './storage';

export type Bookmark = { title?: string; url?: string; folder?: boolean; children?: Bookmark[] };
export type Device = { id: string; name: string; at: number; tabs: { url: string; title?: string }[] };
export type Wallet = { balance: number; pending: number; betaUntil: number; gameModeUntil: number; lastDaily: string; streak: number };
type User = { uid: string; email: string; name: string };
type Status = 'loading' | 'signedOut' | 'unlocking' | 'signedIn';

type Ctx = {
  status: Status;
  user: User | null;
  bookmarks: Bookmark[];
  devices: Device[];
  wallet: Wallet;
  daily: { available: boolean; streak: number; next: number };
  loadingData: boolean;
  dataError: string | null;
  browser: { url: string; nonce: number };
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  claimDaily: () => Promise<{ reward: number; streak: number }>;
  openUrl: (url: string) => void;
  visited: (url: string) => void;
};

const SESSION_KEY = 'falcon.session';
const EMPTY_WALLET: Wallet = { balance: 0, pending: 0, betaUntil: 0, gameModeUntil: 0, lastDaily: '', streak: 0 };
const SessionContext = createContext<Ctx | null>(null);

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
function logWrites(uid: string, { id = randomId(), type, amount, label = '', increment = false }:
  { id?: string; type: string; amount: number; label?: string; increment?: boolean }) {
  const name = FB.docName(`users/${uid}/coinlog/${id}`);
  if (!increment) return [{ update: { name, fields: { type: FB.str(type), amount: FB.int(amount), label: FB.str(label), at: FB.int(Date.now()) } }, currentDocument: { exists: false } }];
  return [
    { update: { name, fields: { type: FB.str(type), label: FB.str(label), at: FB.int(Date.now()) } }, updateMask: { fieldPaths: ['type', 'label', 'at'] } },
    { transform: { document: name, fieldTransforms: [{ fieldPath: 'amount', increment: { integerValue: String(amount) } }] } }
  ];
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [browser, setBrowser] = useState({ url: '', nonce: 0 });

  const tokens = useRef<FB.Tokens | null>(null);
  const key = useRef<Uint8Array | null>(null);
  const pending = useRef(0);
  const lastVisit = useRef({ url: '', at: 0 });

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

  const reloadFor = useCallback(async (u: User) => {
    if (!key.current) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const t = await token();
      const [bm, devs, w] = await Promise.all([
        FB.getDoc(`users/${u.uid}/sync/bookmarks`, t),
        FB.listDocs(`users/${u.uid}/devices`, t).catch(() => [] as FB.Doc[]),
        ensureWallet(u)
      ]);
      setBookmarks(bm?.fields?.data ? decryptJson<Bookmark[]>(key.current, bm.fields.data.stringValue, `${u.uid}:bookmarks`) : []);
      const list: Device[] = [];
      for (const d of devs) {
        const id = d.name.split('/').pop() as string;
        try {
          const x = decryptJson<{ name: string; tabs: Device['tabs'] }>(key.current, d.fields?.data?.stringValue, `${u.uid}:device:${id}`);
          list.push({ id, name: x.name || 'PC', at: FB.num(d.fields?.at), tabs: Array.isArray(x.tabs) ? x.tabs : [] });
        } catch { /* anderer Schlüssel */ }
      }
      setDevices(list.sort((a, b) => b.at - a.at));
      setWallet(walletFrom(w, pending.current));
    } catch (e) {
      setDataError(e instanceof FB.ApiError ? e.code : 'UNKNOWN');
    } finally {
      setLoadingData(false);
    }
  }, [token, ensureWallet]);

  // ---------- Gespeicherte Sitzung beim Start ----------
  useEffect(() => {
    (async () => {
      try {
        const raw = await load(SESSION_KEY);
        if (!raw) { setStatus('signedOut'); return; }
        const s = JSON.parse(raw);
        tokens.current = { idToken: '', refreshToken: s.refreshToken, expiresAt: 0, uid: s.uid };
        key.current = fromBase64(s.key);
        const u = { uid: s.uid, email: s.email, name: s.name || '' };
        setUser(u);
        setStatus('signedIn');
        reloadFor(u);
      } catch {
        setStatus('signedOut');
      }
    })();
  }, [reloadFor]);

  // ---------- Anmelden / Abmelden ----------
  const signIn = useCallback(async (email: string, password: string) => {
    const r = await FB.signIn(email.trim(), password);
    tokens.current = r.tokens;
    setStatus('unlocking');
    try {
      const keyDoc = await FB.getDoc(`users/${r.tokens.uid}/meta/key`, r.tokens.idToken);
      if (!keyDoc?.fields) throw new FB.ApiError('NO_KEY');
      const f = keyDoc.fields;
      try {
        key.current = await unwrapKey({ salt: FB.text(f.salt), iter: FB.num(f.iter), wrapped: FB.text(f.wrapped) }, password, r.tokens.uid);
      } catch { throw new FB.ApiError('NO_KEY'); }
      const u = { uid: r.tokens.uid, email: r.email, name: r.displayName };
      setUser(u);
      await persist(u);
      setStatus('signedIn');
      reloadFor(u);
    } catch (e) {
      tokens.current = null; key.current = null;
      setStatus('signedOut');
      throw e;
    }
  }, [persist, reloadFor]);

  const flushCoins = useCallback(async () => {
    const u = user;
    const n = pending.current;
    if (!u || !n || !key.current) return;
    try {
      const t = await token();
      const res = await FB.commit([
        { update: { name: FB.docName(`wallets/${u.uid}`), fields: { email: FB.str(u.email), name: FB.str(u.name) } }, updateMask: { fieldPaths: ['email', 'name'] }, currentDocument: { exists: true } },
        { transform: { document: FB.docName(`wallets/${u.uid}`), fieldTransforms: [{ fieldPath: 'balance', increment: { integerValue: String(n) } }] } },
        ...logWrites(u.uid, { id: `visits-${today()}`, type: 'visits', amount: n, label: today(), increment: true })
      ], t);
      pending.current -= n;
      const balance = Number(res.writeResults?.[1]?.transformResults?.[0]?.integerValue);
      setWallet((w) => ({ ...w, balance: Number.isFinite(balance) ? balance : w.balance, pending: pending.current }));
    } catch { /* später erneut */ }
  }, [user, token]);

  const signOut = useCallback(async () => {
    await flushCoins();
    tokens.current = null; key.current = null; pending.current = 0;
    setUser(null); setBookmarks([]); setDevices([]); setWallet(EMPTY_WALLET);
    await save(SESSION_KEY, null);
    setStatus('signedOut');
  }, [flushCoins]);

  // FalCoins alle 30 Sekunden und beim Wechsel in den Hintergrund gutschreiben
  useEffect(() => {
    const iv = setInterval(flushCoins, 30_000);
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') flushCoins(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [flushCoins]);

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
        if (!(e instanceof FB.ApiError) || !/FAILED_PRECONDITION|ABORTED/.test(e.code) || attempt === 2) throw e;
      }
    }
    throw new FB.ApiError('UNKNOWN');
  }, [user, token, ensureWallet]);

  // ---------- Browser ----------
  const openUrl = useCallback((url: string) => setBrowser((b) => ({ url, nonce: b.nonce + 1 })), []);
  // 1 FalCoin pro neuer Seite (kein Neuladen, höchstens alle 5 Sekunden)
  const visited = useCallback((url: string) => {
    if (!user || !/^https?:/i.test(url)) return;
    const clean = url.replace(/#.*$/, '');
    const last = lastVisit.current;
    if (clean === last.url || Date.now() - last.at < 5000) { last.url = clean; return; }
    lastVisit.current = { url: clean, at: Date.now() };
    pending.current += 1;
    setWallet((w) => ({ ...w, pending: pending.current }));
  }, [user]);

  const daily = useMemo(() => {
    const claimed = wallet.lastDaily === today();
    const next = claimed ? wallet.streak + 1 : nextStreak(wallet);
    return { available: !claimed, streak: claimed ? wallet.streak : next - 1, next: dailyReward(next) };
  }, [wallet]);

  const value: Ctx = {
    status, user, bookmarks, devices, wallet, daily, loadingData, dataError, browser,
    signIn, signOut, reload: async () => { if (user) { await flushCoins(); await reloadFor(user); } },
    claimDaily, openUrl, visited
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
  ALREADY_CLAIMED: 'Heute schon abgeholt – komm morgen wieder!',
  PERMISSION_DENIED: 'Der Server hat den Zugriff verweigert.'
};
export const errorText = (e: unknown) => {
  const code = e instanceof FB.ApiError ? e.code : 'UNKNOWN';
  return ERRORS[code] || `Das hat nicht geklappt (${code}).`;
};
