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
export async function refresh(refreshToken: string): Promise<Tokens> {
  const r = await request<any>(`${TOKEN}/token?key=${CONFIG.apiKey}`, {
    method: 'POST', form: { grant_type: 'refresh_token', refresh_token: refreshToken }
  });
  return { idToken: r.id_token, refreshToken: r.refresh_token, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000, uid: r.user_id };
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
export async function fetchJson<T = any>(url: string): Promise<T> { return request<T>(url); }

export const str = (v: string) => ({ stringValue: v });
export const int = (v: number) => ({ integerValue: String(Math.round(v)) });
export const num = (f: any) => Number(f?.integerValue) || 0;
export const text = (f: any) => (f?.stringValue as string) || '';
