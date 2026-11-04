/*
 * 로그인해야 볼 수 있는 사진 · 파일 받기
 *  서버의 avatar.php, download.php 는 로그인 쿠키가 있어야 열림
 *  휴대폰의 기본 사진 표시 기능(특히 안드로이드)은 앱의 로그인 쿠키를 보내지 않으므로
 *  앱이 직접 받아(fetch, 쿠키 포함) 휴대폰 임시 폴더에 저장한 뒤 그 파일을 보여줌
 */
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { abs } from './api';

const DIR = (FileSystem.cacheDirectory || '') + 'authed/';
const done = new Map<string, string>(); // 주소 → 저장한 파일
const working = new Map<string, Promise<string>>();
let dirReady: Promise<void> | null = null;

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const extOf = (type: string, name?: string) => {
  const fromName = name && /\.([a-z0-9]{1,5})$/i.exec(name);
  if (fromName) return fromName[1].toLowerCase();
  if (/png/.test(type)) return 'png';
  if (/webp/.test(type)) return 'webp';
  if (/gif/.test(type)) return 'gif';
  if (/pdf/.test(type)) return 'pdf';
  return 'jpg';
};

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
    r.readAsDataURL(b);
  });
}

/** 로그인 쿠키를 붙여 받아서 임시 폴더에 저장 → 휴대폰 파일 주소 */
export function fetchAuthed(url: string, name?: string): Promise<string> {
  const full = abs(url);
  const hit = done.get(full);
  if (hit) return Promise.resolve(hit);
  const cur = working.get(full);
  if (cur) return cur;
  const p = (async () => {
    if (!dirReady) dirReady = FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    await dirReady;
    // 이미 받아둔 파일이 있으면 그대로 (주소에 버전 · 번호가 들어 있어 내용이 바뀌지 않음)
    const base = DIR + hash(full) + (name ? '-' + name.replace(/[^\w.-]+/g, '_').slice(-60) : '');
    for (const ext of name ? [''] : ['.jpg', '.png', '.webp', '.gif']) {
      const info = await FileSystem.getInfoAsync(base + ext);
      if (info.exists && info.size) return base + ext;
    }
    const res = await fetch(full, { credentials: 'include' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || /text\/html/.test(type)) throw new Error('파일을 받지 못했어요. (' + res.status + ')');
    const b64 = await blobToBase64(await res.blob());
    const path = name ? base : base + '.' + extOf(type);
    await FileSystem.writeAsStringAsync(path, b64, { encoding: FileSystem.EncodingType.Base64 });
    return path;
  })();
  working.set(full, p);
  p.then((f) => done.set(full, f))
    .catch(() => {})
    .finally(() => working.delete(full));
  return p;
}

/** 사진 주소 → 보여줄 수 있는 주소 (받는 동안은 null) */
export function useAuthedUri(url?: string | null): string | null {
  const full = url ? abs(url) : '';
  const [st, setSt] = useState<{ url: string; uri: string | null }>(() => ({ url: full, uri: full ? done.get(full) || null : null }));
  const uri = st.url === full ? st.uri : full ? done.get(full) || null : null;
  useEffect(() => {
    if (!full || done.has(full)) return;
    let alive = true;
    fetchAuthed(full)
      .then((f) => alive && setSt({ url: full, uri: f }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [full]);
  return uri;
}
