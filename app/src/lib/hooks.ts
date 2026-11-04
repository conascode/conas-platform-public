import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { upload } from './api';
import { useStore } from './store';
import { err } from '../ui/overlay';

// ------------------------------------------------------------------
// 받은 데이터 기억 (화면을 다시 열면 바로 보여주고, 뒤에서 새로 받음)
// ------------------------------------------------------------------
const cache = new Map<string, any>();
const inflight = new Map<string, Promise<any>>();
export const cacheGet = (key: string) => cache.get(key);
export const cacheSet = (key: string, v: any) => cache.set(key, v);
/** 로그아웃할 때 */
export const cacheClear = () => {
  cache.clear();
  inflight.clear();
};
/** 'posts:' 처럼 시작하는 기억들 */
export const cacheEntries = (prefix: string) => [...cache.entries()].filter(([k]) => k.startsWith(prefix));

/** 같은 데이터를 동시에 두 번 받지 않도록 묶음 */
function fetchOnce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key);
  if (cur) return cur;
  const p = fn()
    .then((d) => {
      cache.set(key, d);
      return d;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** 아직 없는 데이터만 뒤에서 미리 받아둠 (실패해도 조용히 넘어감) */
export function prefetch(key: string, fn: () => Promise<any>) {
  if (cache.has(key) || inflight.has(key)) return;
  fetchOnce(key, fn).catch(() => {});
}

/** 하단바 화면 중 지금 보이는 화면인지 (안 보이는 화면은 새로 받지 않음) */
export const ActiveContext = createContext(true);
export const useActive = () => useContext(ActiveContext);

/**
 * 화면 데이터 불러오기
 *  const q = useLoad('posts:2', () => api('posts', { board_id: 2 }))
 *
 *  - 기억해 둔 데이터가 있으면 바로 보여주고, 뒤에서 새로 받아 바꿈
 *  - key가 바뀌었는데 기억이 없으면, 새 데이터가 올 때까지 이전 내용을 그대로 둠 (stale: true)
 *  - 화면이 보이게 될 때 · refresh()가 불릴 때 다시 받음 (안 보이는 화면은 보일 때 받음)
 *  - key가 null이면 받지 않음
 */
export function useLoad<T = any>(key: string | null, fn: () => Promise<T>) {
  const active = useActive();
  const refreshKey = useStore((s) => s.refreshKey);
  // 가장 최근의 key · 받는 방법 (그리는 중이 아니라 그린 직후에 바꿈)
  const fnRef = useRef(fn);
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    fnRef.current = fn;
    keyRef.current = key;
  });
  const [st, setSt] = useState<{ key: string | null; data: T | null; error: string }>(() => ({ key, data: key ? (cache.get(key) ?? null) : null, error: '' }));
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const run = async (pull?: boolean) => {
    const k = keyRef.current;
    if (!k) return;
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const d = await (pull ? fnRef.current().then((x) => (cache.set(k, x), x)) : fetchOnce(k, fnRef.current));
      if (n === seq.current && keyRef.current === k) setSt({ key: k, data: d, error: '' });
    } catch (e: any) {
      if (n === seq.current && keyRef.current === k) setSt((s) => ({ key: k, data: cache.get(k) ?? (s.key === k ? s.data : null), error: e?.message || '화면을 불러오지 못했어요.' }));
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    if (active) run();
  }, [key, active, refreshKey]);

  // 보여줄 데이터: 이 key의 것 → 기억해 둔 것 → (아직 없으면) 이전 key의 것
  const cached = key ? cache.get(key) : undefined;
  const mine = st.key === key;
  const data = (mine ? st.data : (cached ?? st.data)) as T | null;
  const stale = !mine && cached === undefined && data !== null;
  return {
    data,
    error: mine && !st.data ? st.error : '',
    stale,
    refreshing,
    setData: (d: T) => {
      if (key) cache.set(key, d);
      setSt({ key, data: d, error: '' });
    },
    reload: () => run(),
    pull: () => run(true),
  };
}
export type Loaded<T = any> = ReturnType<typeof useLoad<T>>;

export type UpItem = { name: string; id: number | null };

/** 파일 고르기 → 올리기 → 목록 관리 (웹의 uploadInto) */
export function useUploads(initial: UpItem[] = []) {
  const [list, setList] = useState<UpItem[]>(initial);
  // 올리는 도중에도 최신 목록을 보도록 (목록은 update로만 바뀜)
  const ref = useRef(list);
  const update = (l: UpItem[]) => {
    ref.current = l;
    setList(l);
  };
  const pick = async (opt: { images?: boolean; multiple?: boolean; types?: string[]; max?: number } = {}) => {
    let files: { uri: string; name: string; type?: string | null }[] = [];
    if (opt.images) {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: opt.multiple !== false, quality: 0.9 });
      if (r.canceled) return;
      files = r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName || `photo-${Date.now()}-${i}.jpg`, type: a.mimeType || 'image/jpeg' }));
    } else {
      const r = await DocumentPicker.getDocumentAsync({ multiple: opt.multiple !== false, copyToCacheDirectory: true, type: opt.types || '*/*' });
      if (r.canceled) return;
      files = r.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType }));
    }
    if (opt.max) files = files.slice(0, Math.max(0, opt.max - ref.current.length));
    for (const f of files) {
      const item: UpItem = { name: f.name, id: null };
      update([...ref.current, item]);
      try {
        const r = await upload(f);
        update(ref.current.map((x) => (x === item ? { ...x, id: r.id } : x)));
      } catch (e) {
        update(ref.current.filter((x) => x !== item));
        err(e);
      }
    }
  };
  return {
    list,
    pick,
    set: update,
    remove: (i: number) => update(ref.current.filter((_, k) => k !== i)),
    busy: () => ref.current.some((x) => !x.id),
    ids: () => ref.current.filter((x) => x.id).map((x) => x.id as number),
  };
}
