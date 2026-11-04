import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { upload } from './api';
import { useStore } from './store';
import { err } from '../ui/overlay';

/**
 * 화면 데이터 불러오기. refresh()가 불리면(웹의 A.refresh) 화면은 그대로 둔 채 다시 받음
 *  const { data, error, reload, setData } = useLoad(() => api('home'), [])
 */
export function useLoad<T = any>(fn: () => Promise<T>, deps: any[]) {
  const refreshKey = useStore((s) => s.refreshKey);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const run = useCallback(async (pull?: boolean) => {
    const n = ++seq.current;
    if (pull) setRefreshing(true);
    try {
      const d = await fn();
      if (n !== seq.current) return;
      setData(d);
      setError('');
    } catch (e: any) {
      if (n !== seq.current) return;
      setError(e?.message || '화면을 불러오지 못했어요.');
    } finally {
      if (n === seq.current) setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setData(null);
    setError('');
    run();
  }, [run]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    run();
  }, [refreshKey]);
  return { data, error, setData, reload: () => run(), pull: () => run(true), refreshing, alive: () => true };
}

export type UpItem = { name: string; id: number | null };

/** 파일 고르기 → 올리기 → 목록 관리 (웹의 uploadInto) */
export function useUploads(initial: UpItem[] = []) {
  const [list, setList] = useState<UpItem[]>(initial);
  const ref = useRef(list);
  ref.current = list;
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
