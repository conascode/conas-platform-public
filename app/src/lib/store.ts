/*
 * 앱 전체 상태 (웹의 A.data, A.badges, 화면 주소 역할)
 *  - data: 나 · 임직원 · 팀 · 게시판 (bootstrap)
 *  - main: 하단바가 있는 화면 중 지금 보이는 것 (웹의 #/home, #/ws/task …)
 *  - go('ws/notice/3') 처럼 웹과 같은 주소로 화면 이동
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { api } from './api';
import { DARK, LIGHT, Colors } from './theme';

export type Sec = 'home' | 'ws' | 'cm' | 'dm' | 'all';
/** nonce: 이동할 때마다 늘어남 (같은 공지 링크를 다시 눌러도 열리도록) */
export type MainRoute = { sec: Sec; tab: string; id: number | null; nonce?: number };
export type Auth = 'loading' | 'login' | 'pending' | 'ready' | 'error';

type State = {
  auth: Auth;
  authError: string;
  data: any | null;
  badges: Record<string, number>;
  theme: 'light' | 'dark';
  main: MainRoute;
  /** 늘어나면 지금 화면이 다시 데이터를 받음 (웹의 A.refresh) */
  refreshKey: number;
  /** 대화방 종류 (채널이면 하단바를 CM으로) */
  convType: Record<number, string>;
};

let state: State = {
  auth: 'loading',
  authError: '',
  data: null,
  badges: {},
  theme: 'light',
  main: { sec: 'home', tab: 'home', id: null },
  refreshKey: 0,
  convType: {},
};
const subs = new Set<() => void>();
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
export const getState = () => state;
export const setState = (p: Partial<State>) => {
  state = { ...state, ...p };
  subs.forEach((f) => f());
};
/** 상태 일부를 화면에서 쓰기: useStore(s => s.badges) */
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

/** 로그인하고 기본 정보(bootstrap)를 받은 뒤인지 */
export const useReady = () => useStore((s) => s.auth === 'ready' && !!s.data);
export const useColors = (): Colors => (useStore((s) => s.theme) === 'dark' ? DARK : LIGHT);
export const colorsNow = (): Colors => (state.theme === 'dark' ? DARK : LIGHT);

// ------------------------------------------------------------------
// 사람
// ------------------------------------------------------------------
export const me = () => state.data.me;
export const mem = (id: number) => (state.data && state.data.memberMap[id]) || null;
export const isCeo = () => !!state.data && state.data.me.role === 'ceo';

/** 나 · 사람 · 팀 · 게시판 정보 다시 받기 (인사 변경 뒤 등) */
export async function loadData() {
  const d = await api('bootstrap');
  d.memberMap = Object.fromEntries(d.members.map((m: any) => [m.id, m]));
  setState({ data: d, badges: d.badges || {} });
  return d;
}
export const setBadges = (b?: any) => {
  if (b) setState({ badges: b });
};
export const refresh = () => setState({ refreshKey: state.refreshKey + 1 });
export const rememberConv = (id: number, type: string) => setState({ convType: { ...state.convType, [id]: type } });

// ------------------------------------------------------------------
// 화면 모드
// ------------------------------------------------------------------
const THEME_KEY = 'in_theme';
export async function loadTheme() {
  try {
    const t = await AsyncStorage.getItem(THEME_KEY);
    if (t === 'dark') setState({ theme: 'dark' });
  } catch {
    /* 기본: 밝은 화면 */
  }
}
export function setTheme(t: 'light' | 'dark') {
  setState({ theme: t });
  AsyncStorage.setItem(THEME_KEY, t).catch(() => {});
}

// ------------------------------------------------------------------
// 주소 → 화면 (웹과 같은 주소)
//  home  all  admin(/boards)  dm  chat/12
//  ws/task|att|doc|notice|me   ws/notice/3   ws/project/3
//  cm/board(/2)  cm/post/5  cm/write/2  cm/edit/5  cm/chan  cm/people
// ------------------------------------------------------------------
let closeOverlays: () => void = () => {};
/** 시트가 열려 있으면 화면을 옮길 때 닫음 (sheet.tsx 가 등록) */
export const setCloseOverlays = (f: () => void) => {
  closeOverlays = f;
};

let nonce = 0;
function showMain(m: MainRoute) {
  if (router.canDismiss()) router.dismissAll();
  const same = state.main.sec === m.sec && state.main.tab === m.tab && state.main.id === m.id;
  // 같은 화면을 다시 누르면 새로 받기만 (id가 있으면 nonce로 다시 열기)
  if (same && !m.id) refresh();
  else setState({ main: { ...m, nonce: ++nonce } });
}

export function go(path: string) {
  closeOverlays();
  const [p] = String(path).replace(/^[#/]+/, '').split('?');
  const [a, b, c] = p.split('/').filter(Boolean).map(decodeURIComponent);
  const n = (x?: string) => (x ? Number(x) : null);
  if (!a || a === 'home') return showMain({ sec: 'home', tab: 'home', id: null });
  if (a === 'all') return showMain({ sec: 'all', tab: 'all', id: null });
  if (a === 'dm') return showMain({ sec: 'dm', tab: 'dm', id: null });
  if (a === 'admin') return router.push({ pathname: '/admin', params: { sub: b || 'members' } });
  if (a === 'chat') return router.push({ pathname: '/chat/[id]', params: { id: String(b) } });
  if (a === 'ws') {
    if (b === 'project') return router.push({ pathname: '/project/[id]', params: { id: String(c) } });
    const tab = ['task', 'att', 'doc', 'notice', 'me'].includes(b) ? b : 'task';
    return showMain({ sec: 'ws', tab, id: n(c) });
  }
  if (a === 'cm') {
    if (b === 'post') return router.push({ pathname: '/post/[id]', params: { id: String(c) } });
    if (b === 'write') return router.push({ pathname: '/write', params: { board: String(c) } });
    if (b === 'edit') return router.push({ pathname: '/write', params: { id: String(c) } });
    const tab = ['board', 'chan', 'people'].includes(b) ? b : 'board';
    return showMain({ sec: 'cm', tab, id: n(c) });
  }
  showMain({ sec: 'home', tab: 'home', id: null });
}

/** 뒤로 (쌓인 화면이 없으면 fallback 주소로) */
export function back(fallback?: string) {
  closeOverlays();
  if (router.canGoBack()) router.back();
  else go(fallback || 'home');
}
