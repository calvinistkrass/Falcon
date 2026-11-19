// Firebase Authentication + Firestore über die REST-Schnittstellen (wie Falcon auf dem PC)
export const CONFIG = {
  apiKey: 'AIzaSyCIvT5YqYTYUJuFp89qDxbF1IImYjyes7U',
  projectId: 'falcon-browser-d4976'
};

// Nur für Tests: lokaler Firebase-Nachbau (EXPO_PUBLIC_FIREBASE_EMULATOR=http://…)
const EMU = __DEV__ ? process.env.EXPO_PUBLIC_FIREBASE_EMULATOR : undefined;
const AUTH = EMU ? `${EMU}/identitytoolkit.googleapis.com/v1` : 'https://identitytoolkit.googleapis.com/v1';
const TOKEN = EMU ? `${EMU}/securetoken.googleapis.com/v1` : 'https://securetoken.googleapis.com/v1';
const ROOT = `${EMU ? `${EMU}/v1` : 'https://firestore.googleapis.com/v1'}/projects/${CONFIG.projectId}/databases/(default)/documents`;
export const docName = (path: string) => `projects/${CONFIG.projectId}/databases/(default)/documents/${path}`;

export class ApiError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

type Opts = { method?: string; body?: unknown; token?: string; form?: Record<string, string> };
async function request<T = any>(url: string, { method = 'GET', body, token, form }: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: form ? Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('NETWORK');
  }
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { /* leer */ }
  if (!res.ok) {
    const msg = String(json?.error?.message || '');
    const m = msg.match(/^([A-Z_]{2,})(?=$|\s|:)/);
    throw new ApiError((m && m[1]) || json?.error?.status || `HTTP_${res.status}`, res.status);
  }
  return json as T;
}

// ---------- Anmeldung ----------
export type Tokens = { idToken: string; refreshToken: string; expiresAt: number; uid: string };
export async function signIn(email: string, password: string) {
  const r = await request<any>(`${AUTH}/accounts:signInWithPassword?key=${CONFIG.apiKey}`, {
    method: 'POST', body: { email, password, returnSecureToken: true }
  });
  return {
    tokens: { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000, uid: r.localId } as Tokens,
    email: r.email as string,
    displayName: (r.displayName as string) || ''
  };
}
export async function signUp(email: string, password: string) {
  const r = await request<any>(`${AUTH}/accounts:signUp?key=${CONFIG.apiKey}`, {
    method: 'POST', body: { email, password, returnSecureToken: true }
  });
  return { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000, uid: r.localId } as Tokens;
}
export async function setDisplayName(idToken: string, displayName: string): Promise<Tokens> {
  const r = await request<any>(`${AUTH}/accounts:update?key=${CONFIG.apiKey}`, {
    method: 'POST', body: { idToken, displayName, returnSecureToken: true }
  });
  return { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000, uid: r.localId } as Tokens;
}
export async function sendVerification(idToken: string) {
  await request(`${AUTH}/accounts:sendOobCode?key=${CONFIG.apiKey}`, { method: 'POST', body: { requestType: 'VERIFY_EMAIL', idToken } });
}
export async function refresh(refreshToken: string): Promise<Tokens> {
  const r = await request<any>(`${TOKEN}/token?key=${CONFIG.apiKey}`, {
    method: 'POST', form: { grant_type: 'refresh_token', refresh_token: refreshToken }
  });
  return { idToken: r.id_token, refreshToken: r.refresh_token, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000, uid: r.user_id };
}
export async function lookup(idToken: string) {
  const r = await request<any>(`${AUTH}/accounts:lookup?key=${CONFIG.apiKey}`, { method: 'POST', body: { idToken } });
  const u = r.users?.[0] || {};
  return { displayName: (u.displayName as string) || '', emailVerified: !!u.emailVerified };
}
export async function changePassword(idToken: string, password: string): Promise<Tokens> {
  const r = await request<any>(`${AUTH}/accounts:update?key=${CONFIG.apiKey}`, { method: 'POST', body: { idToken, password, returnSecureToken: true } });
  return { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000, uid: r.localId } as Tokens;
}
export async function deleteUser(idToken: string) {
  await request(`${AUTH}/accounts:delete?key=${CONFIG.apiKey}`, { method: 'POST', body: { idToken } });
}
export async function resetPassword(email: string) {
  await request(`${AUTH}/accounts:sendOobCode?key=${CONFIG.apiKey}`, { method: 'POST', body: { requestType: 'PASSWORD_RESET', email } });
}

// ---------- Firestore ----------
export type Doc = { name: string; fields?: Record<string, any>; updateTime?: string };
export async function getDoc(path: string, token: string): Promise<Doc | null> {
  try { return await request<Doc>(`${ROOT}/${path}`, { token }); } catch (e) {
    if (e instanceof ApiError && (e.code === 'NOT_FOUND' || e.status === 404)) return null;
    throw e;
  }
}
export async function listDocs(path: string, token: string): Promise<Doc[]> {
  const r = await request<{ documents?: Doc[] }>(`${ROOT}/${path}?pageSize=100`, { token });
  return r.documents || [];
}
export async function createDoc(path: string, fields: Record<string, any>, token: string) {
  return request<Doc>(`${ROOT}/${path}?currentDocument.exists=false`, { method: 'PATCH', token, body: { fields } });
}
export async function commit(writes: unknown[], token: string) {
  return request<{ writeResults?: { transformResults?: { integerValue?: string }[] }[] }>(
    `${ROOT.replace(/\/documents$/, '')}/documents:commit`, { method: 'POST', token, body: { writes } });
}
/** Einfache Abfrage: alle Dokumente einer Sammlung mit feld == wert */
export async function runQuery(collection: string, field: string, value: string, token: string): Promise<Doc[]> {
  const r = await request<{ document?: Doc }[]>(`${ROOT}:runQuery`, {
    method: 'POST', token,
    body: { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }
  });
  return (Array.isArray(r) ? r : []).filter((x) => x.document).map((x) => x.document as Doc);
}
/** Dokument schreiben – optional nur, wenn es (nicht) existiert bzw. sich seit updateTime nicht geändert hat. */
export async function putDoc(path: string, fields: Record<string, any>, token: string | undefined, pre?: { exists?: boolean; updateTime?: string }, mask?: string[]) {
  const q: string[] = [];
  if (pre?.exists !== undefined) q.push(`currentDocument.exists=${pre.exists}`);
  if (pre?.updateTime) q.push(`currentDocument.updateTime=${encodeURIComponent(pre.updateTime)}`);
  for (const m of mask || []) q.push(`updateMask.fieldPaths=${m}`);
  if (!token) q.push(`key=${CONFIG.apiKey}`);
  return request<Doc>(`${ROOT}/${path}${q.length ? `?${q.join('&')}` : ''}`, { method: 'PATCH', token, body: { fields } });
}
export async function addDoc(collection: string, fields: Record<string, any>, token?: string) {
  return request<Doc>(`${ROOT}/${collection}${token ? '' : `?key=${CONFIG.apiKey}`}`, { method: 'POST', token, body: { fields } });
}
export async function deleteDoc(path: string, token: string) {
  try { await request(`${ROOT}/${path}`, { method: 'DELETE', token }); } catch (e) {
    if (!(e instanceof ApiError && (e.code === 'NOT_FOUND' || e.status === 404))) throw e;
  }
}
/** Liste mit Sortierung/Seitengröße; ohne Token öffentlich (mit API-Schlüssel). */
export async function query(path: string, params: string, token?: string): Promise<Doc[]> {
  const r = await request<{ documents?: Doc[] }>(`${ROOT}/${path}?${params}${token ? '' : `&key=${CONFIG.apiKey}`}`, { token });
  return r.documents || [];
}
export async function fetchJson<T = any>(url: string): Promise<T> { return request<T>(url); }

export const str = (v: string) => ({ stringValue: v });
export const int = (v: number) => ({ integerValue: String(Math.round(v)) });
export const num = (f: any) => Number(f?.integerValue) || 0;
export const text = (f: any) => (f?.stringValue as string) || '';
