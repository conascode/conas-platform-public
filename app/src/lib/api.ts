/*
 * 서버 연결
 *  - 웹(index.php)과 같은 API를 그대로 씀: api/app.php, api/messages.php 등
 *  - 로그인은 세션 쿠키 방식. 쿠키는 휴대폰 네트워크 기능이 알아서 저장하고 보냄
 *  - 변경 요청(POST)에는 CSRF 토큰이 필요. 만료되면(419) 새 토큰을 받아 한 번 더 시도
 */
import Constants from 'expo-constants';

const SERVER = String((Constants.expoConfig?.extra as any)?.serverUrl || 'https://conas.kr/in').replace(/\/+$/, '');
/** 예: https://conas.kr/in */
export const BASE = SERVER;
/** 예: https://conas.kr */
export const ORIGIN = SERVER.replace(/^(https?:\/\/[^/]+).*$/, '$1');

/** 서버가 주는 주소(/in/download.php?id=1)를 전체 주소로 */
export const abs = (u?: string | null) => (!u ? '' : /^https?:\/\//.test(u) ? u : ORIGIN + (u.startsWith('/') ? u : '/' + u));

let csrf = '';
export const getCsrf = () => csrf;
export const setCsrf = (t?: string) => {
  if (t) csrf = t;
};

/** 로그인이 풀렸거나(401) 승인 대기(403 pending)일 때 앱이 알 수 있도록 */
type AuthListener = (state: 'login' | 'pending') => void;
let authListener: AuthListener | null = null;
export const onAuthLost = (fn: AuthListener) => {
  authListener = fn;
};

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) {
    super(msg);
    this.status = status;
  }
}

async function fetchJson(url: string, init: RequestInit, retry?: (() => Promise<any>) | null): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', ...init });
  } catch {
    throw new ApiError('인터넷 연결을 확인해 주세요.', 0);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* JSON이 아닌 응답 */
  }
  if (data && data.csrf) setCsrf(data.csrf);
  if (res.status === 419 && retry) return retry();
  if (res.status === 401) {
    authListener?.('login');
    throw new ApiError('다시 로그인해 주세요.', 401);
  }
  if (res.status === 403 && data && data.pending) {
    authListener?.('pending');
    throw new ApiError('승인을 기다리는 중이에요.', 403);
  }
  if (!res.ok) throw new ApiError((data && data.error) || `요청을 처리하지 못했어요. (${res.status})`, res.status);
  if (!data) throw new ApiError('서버 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.', res.status);
  return data;
}

function headers(json?: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', 'X-CSRF-Token': csrf, 'Cache-Control': 'no-store' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

const qs = (params?: Record<string, any>) => {
  if (!params) return '';
  const p = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? p.join('&') : '';
};

/** 조회: api('tasks', {view: 'team'}) */
export function api(action: string, params?: Record<string, any>, retried?: boolean): Promise<any> {
  const q = qs(params);
  const url = `${BASE}/api/app.php?a=${encodeURIComponent(action)}${q ? '&' + q : ''}`;
  return fetchJson(url, { headers: headers() }, retried ? null : () => api(action, params, true));
}

/** 변경: post('task.act', {id, action}) */
export async function post(action: string, data?: any, retried?: boolean): Promise<any> {
  await ensureCsrf();
  return fetchJson(
    `${BASE}/api/app.php?a=${encodeURIComponent(action)}`,
    { method: 'POST', headers: headers(true), body: JSON.stringify(data || {}) },
    retried ? null : () => post(action, data, true)
  );
}

/** 기존 API (채팅 메시지 등): legacy('messages.php', {c}) / legacy('send.php', data, true) */
export async function legacy(path: string, data?: any, isPost?: boolean, retried?: boolean): Promise<any> {
  let url = `${BASE}/api/${path}`;
  const init: RequestInit = { headers: headers(isPost) };
  if (isPost) {
    await ensureCsrf();
    init.method = 'POST';
    init.body = JSON.stringify(data || {});
    init.headers = headers(true);
  } else if (data) {
    const q = qs(data);
    if (q) url += '?' + q;
  }
  return fetchJson(url, init, retried ? null : () => legacy(path, data, isPost, true));
}

/** CSRF 토큰이 없으면 받아오기 (poll.php가 토큰을 돌려줌) */
async function ensureCsrf() {
  if (csrf) return;
  try {
    await fetchJson(`${BASE}/api/poll.php`, { headers: headers() });
  } catch {
    /* 토큰 없이 시도하면 419 → 다시 시도 */
  }
}

export type PickedFile = { uri: string; name: string; type?: string | null };

/** 파일 올리기. 결과: {id, name, size_text, is_image, url, view_url} */
export async function upload(file: PickedFile, retried?: boolean): Promise<any> {
  await ensureCsrf();
  const fd = new FormData();
  fd.append('file', { uri: file.uri, name: file.name || 'file', type: file.type || 'application/octet-stream' } as any);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/upload.php`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: fd });
  } catch {
    throw new ApiError('인터넷 연결이 끊겨 파일을 올리지 못했어요.', 0);
  }
  const d: any = await res.json().catch(() => null);
  if (d && d.csrf) setCsrf(d.csrf);
  if (res.status === 200 && d && d.file) return d.file;
  if (res.status === 419 && !retried) return upload(file, true);
  throw new ApiError((d && d.error) || `파일을 올리지 못했어요. (${res.status})`, res.status);
}

/** 프로필 사진 저장(file) 또는 삭제(remove) */
export async function avatarPost(file: PickedFile | null, retried?: boolean): Promise<any> {
  await ensureCsrf();
  const fd = new FormData();
  if (file) fd.append('file', { uri: file.uri, name: file.name || 'avatar.jpg', type: file.type || 'image/jpeg' } as any);
  else fd.append('action', 'delete');
  const res = await fetch(`${BASE}/api/avatar.php`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: fd });
  const d: any = await res.json().catch(() => ({}));
  if (d.csrf) setCsrf(d.csrf);
  if (res.status === 419 && !retried) return avatarPost(file, true);
  if (!res.ok) throw new ApiError(d.error || '사진을 바꾸지 못했어요.', res.status);
  return d;
}

// ------------------------------------------------------------------
// 로그인 · 로그아웃 (웹의 login.php 폼을 그대로 사용)
// ------------------------------------------------------------------
const formBody = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** 로그인 폼에서 쓰는 토큰 읽기 */
async function formToken(path: string): Promise<string> {
  const res = await fetch(`${BASE}/${path}`, { credentials: 'include', headers: { Accept: 'text/html' } });
  const html = await res.text();
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/) || html.match(/name="csrf-token"\s+content="([^"]+)"/);
  return m ? m[1] : '';
}

/** 성공하면 아무것도 돌려주지 않고, 실패하면 오류 메시지와 함께 던짐 */
export async function login(id: string, password: string): Promise<void> {
  let token: string;
  try {
    token = await formToken('login.php');
  } catch {
    throw new ApiError('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 0);
  }
  const res = await fetch(`${BASE}/login.php`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
    body: formBody({ _csrf: token, next: '', login: id, password, remember: '1' }),
  });
  const html = await res.text();
  const err = html.match(/class="flash flash-error"[^>]*>([\s\S]*?)<\/div>/);
  if (err) throw new ApiError(decodeHtml(err[1]), 400);
  csrf = '';
}

export async function logout(): Promise<void> {
  try {
    await ensureCsrf();
    await fetch(`${BASE}/logout.php`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: formBody({ _csrf: csrf }),
    });
  } finally {
    csrf = '';
  }
}

export const registerUrl = () => `${BASE}/register.php`;
