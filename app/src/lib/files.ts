/*
 * 로그인해야 볼 수 있는 사진 · 파일 받기
 *  서버의 avatar.php, download.php 는 로그인 쿠키가 있어야 열림
 *  휴대폰의 기본 사진 표시 기능(특히 안드로이드)은 앱의 로그인 쿠키를 보내지 않으므로
 *  앱이 쿠키를 붙여 직접 받아 휴대폰 임시 폴더에 저장한 뒤 그 파일을 보여줌
 */
import { useEffect, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { abs } from './api';

const done = new Map<string, string>(); // 주소 → 저장한 파일
const working = new Map<string, Promise<string>>();
let dir: Directory | null = null;
const folder = () => {
  if (!dir) {
    dir = new Directory(Paths.cache, 'authed');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
};

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const extOf = (type: string) => (/png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : /gif/.test(type) ? 'gif' : /pdf/.test(type) ? 'pdf' : 'jpg');

/**
 * 로그인 쿠키를 붙여 바이트 그대로 받기
 * (fetch().blob()은 데이터를 한 번 더 복사해서 느리므로 XMLHttpRequest의 arraybuffer를 씀)
 */
function getBytes(url: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.withCredentials = true;
    x.responseType = 'arraybuffer';
    x.onload = () => {
      const type = x.getResponseHeader('content-type') || '';
      if (x.status !== 200 || /text\/html/.test(type)) return reject(new Error('파일을 받지 못했어요. (' + x.status + ')'));
      resolve({ bytes: x.response as ArrayBuffer, type });
    };
    x.onerror = () => reject(new Error('인터넷 연결을 확인해 주세요.'));
    x.send();
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
    const d = folder();
    // 이미 받아둔 파일이 있으면 그대로 (주소에 버전 · 번호가 들어 있어 내용이 바뀌지 않음)
    const base = hash(full) + (name ? '-' + name.replace(/[^\w.-]+/g, '_').slice(-60) : '');
    for (const ext of name ? [''] : ['.jpg', '.png', '.webp', '.gif']) {
      const f = new File(d, base + ext);
      if (f.exists && f.size) return f.uri;
    }
    const { bytes, type } = await getBytes(full);
    const f = new File(d, name ? base : base + '.' + extOf(type));
    if (!f.exists) f.create({ overwrite: true });
    await f.write(bytes);
    return f.uri;
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
