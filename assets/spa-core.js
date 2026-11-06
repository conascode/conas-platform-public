/*
 * CONAS 사내 2.0 — 공통
 *  - API 호출, 파일 올리기, 알림 토스트, 아래에서 올라오는 창(시트), 확인 창
 *  - 주소(#/ws/task 등)에 따라 화면 그리기, 상단바 · 하단바
 *  - 화면 모드(밝게/어둡게), 배지 숫자 갱신, 푸시 알림, 앱 설치
 * 화면별 코드는 spa-home.js, spa-ws.js, spa-cm.js, spa-more.js 에서 A.views 에 등록
 */
(() => {
  'use strict';

  const root = document.documentElement;
  const BASE = root.dataset.base || '/in';
  const A = (window.A = { BASE, views: {}, acts: {}, forms: {}, data: null, badges: {}, cache: {} });
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  A.$ = $;
  A.$$ = $$;

  // ==================================================================
  // 글자 · 날짜 도우미
  // ==================================================================
  A.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** 글자를 안전하게 바꾸고 주소는 링크로 */
  A.linkify = (s) =>
    A.esc(s).replace(/\bhttps?:\/\/[^\s<]+/g, (u) => {
      const t = u.replace(/[.,);!?]+$/, '');
      return `<a href="${t}" target="_blank" rel="noopener noreferrer">${t}</a>${u.slice(t.length)}`;
    });
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  A.DOW = DOW;
  const pad = (n) => String(n).padStart(2, '0');
  A.pad = pad;
  A.iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  A.date = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  A.today = () => A.date(A.iso(new Date()));
  A.addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  A.md = (d) => {
    const x = typeof d === 'string' ? A.date(d) : d;
    return `${x.getMonth() + 1}월 ${x.getDate()}일 (${DOW[x.getDay()]})`;
  };
  A.ddayLabel = (n) => (n < 0 ? `D+${-n}` : n === 0 ? 'D-Day' : `D-${n}`);
  A.ddayCls = (n, done) => (done ? 'off' : n < 0 ? 'no' : n === 0 ? 'late' : n <= 3 ? 'pri' : 'off');
  A.hm = (ts) => {
    const d = new Date(ts * 1000);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  A.ago = (ts) => {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    const d = new Date(ts * 1000);
    if (A.iso(d) === A.iso(new Date())) return Math.floor(s / 3600) + '시간 전';
    if (A.iso(d) === A.iso(A.addDays(new Date(), -1))) return '어제';
    return d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}.${d.getDate()}` : `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  };
  A.won = (n) => Number(n || 0).toLocaleString('ko-KR') + '원';

  // ==================================================================
  // 아이콘
  // ==================================================================
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    briefcase: '<rect x="2.5" y="7" width="19" height="13.5" rx="2.5"/><path d="M8 7V5.5A2 2 0 0 1 10 3.5h4a2 2 0 0 1 2 2V7M2.5 12.5h19"/>',
    users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7.5" r="3.5"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.85M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.6-4.6A8.3 8.3 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/>',
    bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 7-3 8.5-3 8.5h18s-3-1.5-3-8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M15.5 13h-7M15.5 17h-7"/>',
    user: '<path d="M20 21v-1.5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4V21"/><circle cx="12" cy="7.5" r="4"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    board: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 12h8M8 16h5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    arrowL: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    send: '<path d="M21.5 2.5 10.5 13.5M21.5 2.5l-7 19-4-8-8-4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.5 2"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20M6 15h4"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8.5a5 5 0 0 1 0 7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkSq: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 12 3 3 5-6"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20v1M20 14v1"/>',
    flag: '<path d="M4 22V4M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 6 9 7 9-7"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    install: '<path d="M12 3v12M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1.5"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    reply: '<path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    userPlus: '<path d="M16 21v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21"/><circle cx="9" cy="7.5" r="4"/><path d="M19 8v6M22 11h-6"/>',
    more: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
    zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
    zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
    meal: '<path d="M3 12h18a9 9 0 0 1-18 0z"/><path d="M7.5 21h9M13 3.5 10 9M18.5 3.5 14.5 9"/>',
    camera: '<path d="M14.5 4h-5L7.5 6.5H4a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.5a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>',
  };
  const SURF = 'style="stroke:var(--surface)"';
  const FILLED = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>',
    briefcase: `<path d="M8 7V5.5A2 2 0 0 1 10 3.5h4a2 2 0 0 1 2 2V7"/><rect x="2.5" y="7" width="19" height="13.5" rx="2.5" fill="currentColor"/><path d="M2.5 12.5h19" ${SURF}/>`,
    users: '<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20z" fill="currentColor"/><circle cx="9" cy="7.5" r="3.5" fill="currentColor"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.85M15.5 4.2a3.5 3.5 0 0 1 0 6.6"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 20.5l1.6-4.6A8.3 8.3 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" fill="currentColor"/>',
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor"/>',
    calendar: `<rect x="3" y="4.5" width="18" height="16.5" rx="2.5" fill="currentColor"/><path d="M16 2.5v4M8 2.5v4"/><path d="M3 10h18" ${SURF}/>`,
    file: `<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" fill="currentColor"/><path d="M15.5 13h-7M15.5 17h-7" ${SURF}/>`,
    board: `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2z" fill="currentColor"/><rect x="8" y="2" width="8" height="4" rx="1" fill="currentColor"/><path d="M8 12h8M8 16h5" ${SURF}/>`,
    checkSq: `<rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor"/><path d="m8 12 3 3 5-6" ${SURF}/>`,
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" fill="currentColor"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
  };
  A.ic = (n, s = 22, w = 1.9) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  A.icF = (n, s = 24) =>
    FILLED[n]
      ? `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FILLED[n]}</svg>`
      : A.ic(n, s, 2.7);

  // ==================================================================
  // 사람
  // ==================================================================
  const AV_COLORS = ['#2f5bea', '#7b3ff2', '#0ca678', '#f08c00', '#e64980', '#1098ad', '#495057'];
  /** 이름으로 정해지는 프로필 기본 색 */
  A.avatarColor = (name) => AV_COLORS[[...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
  /** m: {name, av?, online?} / anon: true 면 익명 */
  A.avatar = (m, cls = '') => {
    if (!m || m.anon) return `<span class="avatar anon ${cls}" aria-hidden="true">${A.ic('user', 18)}</span>`;
    const name = m.name || '?';
    const color = A.avatarColor(name);
    const on = m.online ? ' on' : '';
    // data-uid: 접속 상태가 바뀌면 초록 점만 바로 바꿀 수 있게 (A.applyPresence)
    const uid = m.id ? ` data-uid="${Number(m.id)}"` : '';
    if (m.av) return `<span class="avatar${on} ${cls}"${uid} aria-hidden="true"><img src="${A.esc(m.av)}" alt="" loading="lazy"></span>`;
    return `<span class="avatar${on} ${cls}"${uid} style="--av:${color}" aria-hidden="true">${A.esc([...name][0])}</span>`;
  };
  /** '● 접속 중' / '오프라인' 글자 (접속 상태가 바뀌면 자동으로 바뀜) */
  A.presence = (m) =>
    `<span class="t13" data-presence="${Number(m.id)}" style="color:${m.online ? 'var(--ok)' : 'var(--sub)'}">${m.online ? '● 접속 중' : '오프라인'}</span>`;
  /**
   * 접속 중인 사람 목록을 받아 반영: 직원 정보 · 화면에 떠 있는 초록 점 · '접속 중' 글자
   * 바뀐 사람이 있으면 'a:presence' 이벤트 (대화방 머리글 등이 받아서 다시 그림)
   */
  A.applyPresence = (ids) => {
    if (!A.data || !Array.isArray(ids)) return;
    const set = new Set(ids.map(Number));
    const changed = [];
    for (const m of A.data.members) {
      const on = set.has(m.id);
      if (!!m.online !== on) {
        m.online = on;
        changed.push(m.id);
      }
    }
    if (A.data.me) A.data.me.online = set.has(A.data.me.id);
    $$('.avatar[data-uid]').forEach((el) => el.classList.toggle('on', set.has(Number(el.dataset.uid))));
    $$('[data-presence]').forEach((el) => {
      const on = set.has(Number(el.dataset.presence));
      el.textContent = on ? '● 접속 중' : '오프라인';
      el.style.color = on ? 'var(--ok)' : 'var(--sub)';
    });
    if (changed.length) document.dispatchEvent(new CustomEvent('a:presence', { detail: { changed, online: set } }));
  };
  A.mem = (id) => (A.data && A.data.memberMap[id]) || null;
  A.ROLE = { ceo: '대표', lead: '팀장', member: '팀원' };
  /** 예: '프로덕트팀 · 팀장', '프로덕트팀 · 사원', '대표' */
  A.roleLabel = (m) => {
    if (!m) return '';
    if (m.role === 'ceo') return '대표';
    const team = m.team || '소속 없음';
    return `${team} · ${m.role === 'lead' ? '팀장' : m.position || '팀원'}`;
  };
  A.isCeo = () => A.data.me.role === 'ceo';

  // ==================================================================
  // API
  // ==================================================================
  const csrfMeta = () => $('meta[name="csrf-token"]');
  A.csrf = () => (csrfMeta() ? csrfMeta().content : '');
  A.setCsrf = (t) => {
    if (t && csrfMeta()) csrfMeta().content = t;
  };

  async function fetchJson(url, init, retry) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      throw new Error('인터넷 연결을 확인해 주세요.');
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* JSON이 아닌 응답 */
    }
    if (data && data.csrf) A.setCsrf(data.csrf);
    if (res.status === 419 && retry) return retry();
    if (res.status === 401) {
      location.href = BASE + '/login.php?next=' + encodeURIComponent(location.pathname + location.hash);
      throw new Error('다시 로그인해 주세요.');
    }
    if (res.status === 403 && data && data.pending) {
      location.href = BASE + '/pending.php';
      throw new Error('승인을 기다리는 중이에요.');
    }
    if (!res.ok) throw new Error((data && data.error) || `요청을 처리하지 못했어요. (${res.status})`);
    if (!data) throw new Error('서버 응답을 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    return data;
  }
  function headers(json) {
    const h = { Accept: 'application/json', 'X-CSRF-Token': A.csrf() };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  /** 새 API 조회: A.api('tasks', {view:'team'}) */
  A.api = (action, params, retried) => {
    let url = `${BASE}/api/app.php?a=${encodeURIComponent(action)}`;
    if (params) url += '&' + new URLSearchParams(params).toString();
    return fetchJson(url, { credentials: 'same-origin', cache: 'no-store', headers: headers() }, retried ? null : () => A.api(action, params, true));
  };
  /** 새 API 변경: A.post('task.act', {id, action}) */
  A.post = (action, data, retried) =>
    fetchJson(
      `${BASE}/api/app.php?a=${encodeURIComponent(action)}`,
      { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: headers(true), body: JSON.stringify(data || {}) },
      retried ? null : () => A.post(action, data, true)
    );
  /** 기존 API (채팅 메시지 등): A.legacy('messages.php', {c}) / A.legacy('send.php', data, true) */
  A.legacy = (path, data, post, retried) => {
    let url = `${BASE}/api/${path}`;
    const init = { credentials: 'same-origin', cache: 'no-store', headers: headers(post) };
    if (post) {
      init.method = 'POST';
      init.body = JSON.stringify(data || {});
    } else if (data) url += '?' + new URLSearchParams(data).toString();
    return fetchJson(url, init, retried ? null : () => A.legacy(path, data, post, true));
  };

  /** 파일 올리기 (진행률 콜백). 결과: {id, name, size_text, is_image, url, view_url} */
  A.upload = (file, onProgress, retried) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/api/upload.php`);
      xhr.setRequestHeader('X-CSRF-Token', A.csrf());
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let d = null;
        try {
          d = JSON.parse(xhr.responseText);
        } catch (e) {
          /* ignore */
        }
        if (d && d.csrf) A.setCsrf(d.csrf);
        if (xhr.status === 200 && d && d.file) return resolve(d.file);
        if (xhr.status === 419 && !retried) return resolve(A.upload(file, onProgress, true));
        reject(new Error((d && d.error) || `파일을 올리지 못했어요. (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('인터넷 연결이 끊겨 파일을 올리지 못했어요.'));
      const fd = new FormData();
      fd.append('file', file, file.name || 'file');
      xhr.send(fd);
    });

  // ==================================================================
  // 토스트 · 시트 · 확인 창
  // ==================================================================
  let toastTimer;
  A.toast = (msg) => {
    $$('.toast').forEach((t) => t.remove());
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = msg;
    $('#app').appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2200);
  };
  A.err = (e) => A.toast((e && e.message) || '문제가 생겼어요. 다시 시도해 주세요.');

  let sheetEl = null;
  let sheetPushed = false;
  let sheetOnClose = null;
  let ignorePop = false;
  A.sheet = {
    get open() {
      return !!sheetEl;
    },
    /**
     * 이미 열려 있으면 내용만 바꿈
     * opt.onClose: 닫힐 때 실행 / opt.cls: 시트에 붙일 class / opt.swipe: 아래로 끌어내려 닫기
     */
    show(title, html, opt = {}) {
      if (!sheetEl) {
        sheetEl = document.createElement('div');
        sheetEl.innerHTML =
          '<div class="backdrop" data-sheet-close></div><div class="sheet" role="dialog" aria-modal="true">' +
          '<div class="sheet-grab" aria-hidden="true"></div>' +
          `<div class="sheet-head"><b></b><button class="icon-btn" data-sheet-close aria-label="닫기">${A.ic('x')}</button></div>` +
          '<div class="sheet-body"></div></div>';
        $('#app').appendChild(sheetEl);
        sheetSwipe(sheetEl);
        history.pushState({ ...(history.state || {}), sheet: true }, '');
        sheetPushed = true;
      }
      sheetEl.className = 'sheet-wrap' + (opt.swipe ? ' swipe' : '') + (opt.cls ? ' ' + opt.cls : '');
      sheetOnClose = opt.onClose || null;
      $('.sheet-head b', sheetEl).textContent = title || '';
      const body = $('.sheet-body', sheetEl);
      body.innerHTML = html;
      body.scrollTop = 0;
      const af = $('[autofocus]', body);
      if (af && !matchMedia('(pointer: coarse)').matches) af.focus();
      return body;
    },
    body: () => sheetEl && $('.sheet-body', sheetEl),
    /** fromHistory: 휴대폰 뒤로가기로 닫힌 경우 */
    close(fromHistory) {
      if (!sheetEl) return;
      const el = sheetEl;
      sheetEl = null;
      el.classList.add('closing');
      setTimeout(() => el.remove(), 220);
      const cb = sheetOnClose;
      sheetOnClose = null;
      if (sheetPushed && !fromHistory) {
        ignorePop = true;
        history.back();
      }
      sheetPushed = false;
      if (cb) cb();
    },
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sheet-close]')) A.sheet.close();
  });

  /**
   * 시트 끌어내려 닫기 (opt.swipe 일 때만)
   *  내용이 맨 위까지 올라가 있을 때 아래로 끌면 따라 내려오고,
   *  1/4 넘게 내리거나 빠르게 튕기면 닫힘. 덜 내리면 제자리로
   */
  function sheetSwipe(wrap) {
    const sheet = $('.sheet', wrap);
    const back = $('.backdrop', wrap);
    let y0 = null;
    let dy = 0;
    let t0 = 0;
    let dragging = false;
    let blockClick = false;
    const begin = (y, target) => {
      if (!wrap.classList.contains('swipe') || wrap.classList.contains('closing')) return;
      if (target.closest('input, textarea, select')) return;
      const body = $('.sheet-body', wrap);
      if (body.scrollTop > 0 && !target.closest('.sheet-grab, .sheet-head')) return;
      y0 = y;
      dy = 0;
      t0 = Date.now();
      dragging = false;
    };
    const move = (y, e) => {
      if (y0 === null) return;
      dy = Math.max(0, y - y0);
      if (!dragging) {
        if (y - y0 < -6) return (y0 = null); // 위로 밀면 그냥 스크롤
        if (dy < 8) return;
        dragging = true;
        sheet.style.animation = 'none';
        sheet.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      sheet.style.transform = `translateY(${dy}px)`;
      back.style.opacity = String(Math.max(0, 1 - dy / sheet.offsetHeight));
    };
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      if (!dragging) return;
      dragging = false;
      blockClick = true;
      setTimeout(() => (blockClick = false), 50);
      const fast = dy / Math.max(1, Date.now() - t0) > 0.6;
      sheet.style.animation = '';
      if (dy > sheet.offsetHeight / 4 || (fast && dy > 30)) {
        back.style.opacity = '';
        A.sheet.close(); // 지금 위치에서 그대로 내려가며 닫힘
      } else {
        sheet.style.transition = 'transform .25s cubic-bezier(.2,.7,.2,1)';
        sheet.style.transform = '';
        back.style.opacity = '';
      }
    };
    sheet.addEventListener('touchstart', (e) => begin(e.touches[0].clientY, e.target), { passive: true });
    sheet.addEventListener('touchmove', (e) => move(e.touches[0].clientY, e), { passive: false });
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
    // 컴퓨터: 마우스로 끌기
    const mm = (e) => move(e.clientY, e);
    sheet.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      begin(e.clientY, e.target);
      window.addEventListener('mousemove', mm);
      window.addEventListener('mouseup', () => (window.removeEventListener('mousemove', mm), end()), { once: true });
    });
    // 끌기를 마친 순간의 클릭(버튼 눌림)은 무시
    sheet.addEventListener('click', (e) => blockClick && (e.stopPropagation(), e.preventDefault()), true);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (A.viewer && A.viewer.open) A.viewer.close();
    else if (A.sheet.open) A.sheet.close();
  });

  /** 확인 창: await A.ask({title, body, ok, danger}) → true/false */
  A.ask = ({ title = '확인', body = '', ok = '확인', cancel = '취소', danger = false } = {}) =>
    new Promise((resolve) => {
      let answered = false;
      const done = (v) => {
        if (answered) return;
        answered = true;
        resolve(v);
      };
      const b = A.sheet.show(
        title,
        `<p class="ask-body">${A.esc(body)}</p><div class="btn-row"><button class="btn ghost" data-ask="0">${A.esc(cancel)}</button><button class="btn ${danger ? 'danger' : ''}" data-ask="1">${A.esc(ok)}</button></div>`,
        { onClose: () => done(false) }
      );
      b.addEventListener('click', (e) => {
        const x = e.target.closest('[data-ask]');
        if (!x) return;
        const v = x.dataset.ask === '1';
        done(v);
        A.sheet.close();
      });
    });

  // ==================================================================
  // 사진 크게 보기: data-view="이미지 주소" data-dl="다운로드 주소" data-name="파일 이름"
  //  닫기: X 버튼, 사진 바깥 누르기, 뒤로가기, Esc
  //  확대: 두 번 누르기, 두 손가락 벌리기, 마우스 휠 / 확대한 상태에서 끌어서 이동
  // ==================================================================
  let viewerEl = null;
  let viewerPushed = false;
  A.viewer = {
    get open() {
      return !!viewerEl;
    },
    show(src, dl, name) {
      if (viewerEl) A.viewer.close();
      const v = document.createElement('div');
      v.className = 'viewer';
      v.setAttribute('role', 'dialog');
      v.setAttribute('aria-modal', 'true');
      v.setAttribute('aria-label', '사진 보기');
      v.innerHTML = `
        <div class="viewer-top">
          <span class="viewer-name">${A.esc(name || '')}</span>
          ${dl ? `<a class="viewer-btn" href="${A.esc(dl)}" download="${A.esc(name || '')}" aria-label="다운로드">${A.ic('download', 22, 2)}</a>` : ''}
          <button class="viewer-btn" data-viewer-close aria-label="닫기">${A.ic('x', 24, 2.2)}</button>
        </div>
        <div class="viewer-stage"><img src="${A.esc(src)}" alt="${A.esc(name || '')}" draggable="false"></div>
        <div class="viewer-zoom"><button class="viewer-btn" data-zoom="-1" aria-label="축소">${A.ic('zoomOut', 20, 2)}</button><button class="viewer-btn" data-zoom="1" aria-label="확대">${A.ic('zoomIn', 20, 2)}</button></div>`;
      document.body.appendChild(v);
      viewerEl = v;
      history.pushState({ ...(history.state || {}), viewer: true }, '');
      viewerPushed = true;
      setupZoom(v);
    },
    close(fromHistory) {
      if (!viewerEl) return;
      const el = viewerEl;
      viewerEl = null;
      el.classList.add('closing');
      setTimeout(() => el.remove(), 200);
      if (viewerPushed && !fromHistory) {
        ignorePop = true;
        history.back();
      }
      viewerPushed = false;
    },
  };

  function setupZoom(v) {
    const stage = $('.viewer-stage', v);
    const img = $('img', stage);
    let s = 1;
    let x = 0;
    let y = 0;
    const pts = new Map();
    let pinch = null;
    let drag = null;
    let moved = false;
    let lastTap = 0;
    const apply = (anim) => {
      img.style.transition = anim ? 'transform .25s cubic-bezier(.2,.7,.2,1)' : 'none';
      img.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      v.classList.toggle('zoomed', s > 1.01);
    };
    const clamp = () => {
      s = Math.min(5, Math.max(1, s));
      if (s <= 1.01) {
        s = 1;
        x = 0;
        y = 0;
        return;
      }
      const r = stage.getBoundingClientRect();
      const w = img.offsetWidth * s;
      const h = img.offsetHeight * s;
      const mx = Math.max(0, (w - r.width) / 2);
      const my = Math.max(0, (h - r.height) / 2);
      x = Math.min(mx, Math.max(-mx, x));
      y = Math.min(my, Math.max(-my, y));
    };
    /** (cx, cy) 지점을 중심으로 배율 변경 */
    const zoomAt = (ns, cx, cy, anim) => {
      const r = stage.getBoundingClientRect();
      const ox = cx - (r.left + r.width / 2);
      const oy = cy - (r.top + r.height / 2);
      const k = Math.min(5, Math.max(1, ns)) / s;
      x = ox - (ox - x) * k;
      y = oy - (oy - y) * k;
      s *= k;
      clamp();
      apply(anim);
    };
    v.addEventListener('click', (e) => {
      const z = e.target.closest('[data-zoom]');
      if (z) {
        const r = stage.getBoundingClientRect();
        zoomAt(s * (z.dataset.zoom === '1' ? 1.6 : 1 / 1.6), r.left + r.width / 2, r.top + r.height / 2, true);
        return;
      }
      if (e.target.closest('[data-viewer-close]')) return A.viewer.close();
      // 사진 바깥(검은 영역)을 누르면 닫기
      if (!moved && (e.target === stage || e.target === v)) A.viewer.close();
    });
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        zoomAt(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, false);
      },
      { passive: false }
    );
    stage.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        drag = null;
      } else if (pts.size === 1 && e.target === img) {
        drag = { x: e.clientX - x, y: e.clientY - y, sx: e.clientX, sy: e.clientY };
        // 두 번 누르기: 2.5배 ↔ 원래 크기
        const now = Date.now();
        if (now - lastTap < 300) {
          zoomAt(s > 1.01 ? 1 : 2.5, e.clientX, e.clientY, true);
          lastTap = 0;
          drag = null;
        } else lastTap = now;
      }
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
        zoomAt(pinch.s * (d / pinch.d), pinch.cx, pinch.cy, false);
      } else if (drag && s > 1) {
        if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) moved = true;
        x = e.clientX - drag.x;
        y = e.clientY - drag.y;
        clamp();
        apply(false);
      } else if (drag && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) moved = true;
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) drag = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-view]');
    if (!t) return;
    e.preventDefault();
    A.viewer.show(t.dataset.view, t.dataset.dl, t.dataset.name);
  });

  // ==================================================================
  // 화면 모드 (기본: 밝은 화면)
  // ==================================================================
  A.theme = {
    get: () => (root.dataset.theme === 'dark' ? 'dark' : 'light'),
    set(t) {
      root.dataset.theme = t === 'dark' ? 'dark' : 'light';
      try {
        localStorage.setItem('in_theme', root.dataset.theme);
      } catch (e) {
        /* ignore */
      }
      const meta = $('meta[name="theme-color"]');
      if (meta) meta.content = t === 'dark' ? '#17191d' : '#ffffff';
    },
  };
  A.theme.set(A.theme.get());

  // ==================================================================
  // 주소 → 화면
  //  #/home  #/all  #/admin  #/dm  #/chat/12
  //  #/ws/task|att|doc|notice|me   #/ws/notice/3
  //  #/cm/board(/2)  #/cm/post/5  #/cm/write/2  #/cm/edit/5  #/cm/chan  #/cm/people
  // ==================================================================
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || '') };
  }

  function resolve({ parts, query }) {
    const [a, b, c] = parts;
    const r = { parts, query, sec: 'home', tab: 'home', view: 'home', full: false };
    if (!a || a === 'home') return r;
    if (a === 'all') return { ...r, sec: 'all', tab: 'all', view: 'all' };
    if (a === 'admin') return { ...r, sec: 'all', tab: 'all', view: 'admin', sub: b || 'members' };
    if (a === 'dm') return { ...r, sec: 'dm', tab: 'dm', view: 'dm' };
    if (a === 'chat') {
      const fromCm = query.get('from') === 'cm' || (A.cache.convType && A.cache.convType[b] === 'channel');
      return { ...r, sec: fromCm ? 'cm' : 'dm', tab: fromCm ? 'chan' : 'dm', view: 'chat', id: Number(b), full: true };
    }
    if (a === 'ws') {
      if (b === 'project') return { ...r, sec: 'ws', tab: 'task', view: 'project', id: Number(c), full: true };
      const tab = ['task', 'att', 'doc', 'notice', 'me'].includes(b) ? b : 'task';
      return { ...r, sec: 'ws', tab, view: 'ws-' + tab, id: c ? Number(c) : null };
    }
    if (a === 'cm') {
      if (b === 'post') return { ...r, sec: 'cm', tab: 'board', view: 'post', id: Number(c), full: true };
      if (b === 'write') return { ...r, sec: 'cm', tab: 'board', view: 'write', boardId: Number(c), full: true };
      if (b === 'edit') return { ...r, sec: 'cm', tab: 'board', view: 'write', id: Number(c), full: true };
      const tab = ['board', 'chan', 'people'].includes(b) ? b : 'board';
      return { ...r, sec: 'cm', tab, view: 'cm-' + tab, id: c ? Number(c) : null };
    }
    return r;
  }

  A.go = (path) => {
    const h = '#/' + String(path).replace(/^[#/]+/, '');
    if (A.sheet.open) {
      // 시트가 열려 있으면 시트용 기록을 새 주소로 바꿔치기 (뒤로가기 꼬임 방지)
      A.sheet.close(true);
      if (location.hash === h) {
        history.replaceState(null, '', h);
        A.refresh();
      } else location.replace(h);
      return;
    }
    if (location.hash === h) A.refresh();
    else location.hash = h;
  };
  A.back = (fallback) => {
    if (history.length > 1 && A.prevHash) history.back();
    else A.go(fallback || 'home');
  };

  let renderSeq = 0;
  let leaveFns = [];
  /** 화면을 떠날 때 실행할 정리 함수 등록 (폴링 중지 등) */
  A.onLeave = (fn) => leaveFns.push(fn);

  async function render(keepScroll) {
    const route = resolve(parseHash());
    const seq = ++renderSeq;
    if (A.sheet.open) A.sheet.close(true);
    leaveFns.forEach((f) => {
      try {
        f();
      } catch (e) {
        console.error(e);
      }
    });
    leaveFns = [];
    const prevView = A.route && A.route.view;
    A.route = route;
    const main = $('#view');
    const scroll = keepScroll && prevView === route.view ? main.scrollTop : 0;
    main.className = route.full ? 'full' + (route.view === 'chat' ? ' chat' : '') : '';
    $('#fab').innerHTML = '';
    renderTop();
    renderNav();
    if (!keepScroll || prevView !== route.view) main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const view = A.views[route.view] || A.views.home;
    try {
      await view(main, route, () => seq === renderSeq);
      if (seq === renderSeq && scroll) main.scrollTop = scroll;
    } catch (e) {
      console.error(e);
      if (seq !== renderSeq) return;
      main.innerHTML = `<div class="empty" style="padding:60px 16px">${A.esc(e.message || '화면을 불러오지 못했어요.')}<br><br><button class="btn sm ghost" data-act="retry">다시 시도</button></div>`;
    }
  }
  A.refresh = () => render(true);
  A.acts.retry = () => render();
  /** 이 화면이 아직 보이는지 (비동기 작업 뒤 확인용) */
  A.isCurrent = (view) => A.route && A.route.view === view;

  window.addEventListener('popstate', () => {
    if (ignorePop) {
      ignorePop = false;
      return;
    }
    if (A.viewer.open) return A.viewer.close(true);
    if (A.sheet.open) A.sheet.close(true);
  });
  window.addEventListener('hashchange', (e) => {
    A.prevHash = e.oldURL ? new URL(e.oldURL).hash : '';
    render();
  });

  // ==================================================================
  // 상단바 · 하단바
  // ==================================================================
  function renderTop() {
    const r = A.route;
    const top = $('#top');
    top.hidden = !!r.full;
    if (r.full) return;
    const label = { ws: 'WORKSPACE', cm: 'COMMUNITY' }[r.sec];
    const n = A.badges.noti || 0;
    top.innerHTML = `
      <button class="logo" data-go="home" aria-label="홈으로"><img src="${BASE}/assets/icons/icon-192.png" alt="">CONAS${label ? `<small>${label}</small>` : ''}</button>
      <div class="top-r">
        <button class="icon-btn" data-act="noti" aria-label="알림">${A.ic('bell')}${n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}</button>
        <button class="hdr-av" data-go="ws/me" aria-label="내 정보">${A.avatar(A.data.me)}</button>
      </div>`;
  }

  const NAV = {
    home: [['home', '홈', 'home', 'home'], ['ws', 'WS', 'briefcase', 'ws/task'], ['cm', 'CM', 'users', 'cm/board'], ['dm', 'DM', 'message', 'dm'], ['all', '전체', 'grid', 'all']],
    ws: [['task', '업무', 'checkSq'], ['att', '근태', 'calendar'], ['doc', '서류', 'file'], ['notice', '공지', 'megaphone']],
    cm: [['board', '게시판', 'board'], ['chan', '채널', 'hash'], ['people', '임직원', 'users']],
  };
  let navPrev = { group: null, active: null };

  function navDot(group, key) {
    const b = A.badges;
    if (group === 'home') {
      return (
        (key === 'ws' && (b.task || b.approval || b.notice)) ||
        (key === 'cm' && b.channel) ||
        (key === 'dm' && b.dm) ||
        (key === 'all' && b.pending)
      );
    }
    if (group === 'ws') return (key === 'task' && b.task) || (key === 'doc' && b.approval) || (key === 'notice' && b.notice);
    if (group === 'cm') return key === 'chan' && b.channel;
    return false;
  }

  function renderNav() {
    const r = A.route;
    const nav = $('#nav');
    nav.classList.toggle('hide', !!r.full);
    if (r.full) {
      navPrev = { group: null, active: null };
      return;
    }
    const group = ['home', 'dm', 'all'].includes(r.sec) ? 'home' : r.sec;
    const active = group === 'home' ? r.sec : r.tab;
    const changed = navPrev.group !== null && navPrev.group !== group;
    nav.className = 'nav' + (group === 'home' ? '' : ' sub') + (changed ? ' enter' : '');
    nav.innerHTML =
      (group === 'home' ? '' : `<button class="nav-back" data-go="home" aria-label="홈으로">${A.ic('arrowL', 24, 2.2)}</button>`) +
      NAV[group]
        .map(([k, l, i, to], n) => {
          const on = k === active;
          const pop = on && !changed && navPrev.active !== null && navPrev.active !== active;
          const href = to || `${group}/${k}`;
          return `<button class="nav-item ${on ? 'on' : ''} ${pop ? 'pop' : ''}" style="--i:${n}" data-go="${href}" ${on ? 'aria-current="page"' : ''}>
            <span class="ico">${on ? A.icF(i) : A.ic(i, 24, 1.9)}${navDot(group, k) ? '<i class="nav-dot"></i>' : ''}</span><span class="lbl">${l}</span></button>`;
        })
        .join('');
    navPrev = { group, active };
  }

  /** 배지 숫자 반영 (서버 응답에 badges가 있으면 호출) */
  A.setBadges = (b) => {
    if (!b) return;
    A.badges = b;
    if (A.route && !A.route.full) {
      renderTop();
      // 하단바는 애니메이션 없이 점만 갱신
      const prev = navPrev;
      navPrev = { group: null, active: null };
      renderNav();
      navPrev = prev;
      $('#nav').classList.remove('enter');
    }
    const total = (b.dm || 0) + (b.channel || 0) + (b.noti || 0);
    if ('setAppBadge' in navigator) (total > 0 ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => {});
  };

  // ==================================================================
  // 클릭 · 폼 처리 (data-go, data-act, data-form)
  // ==================================================================
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const g = e.target.closest('[data-go]');
    if (g) {
      e.preventDefault();
      A.go(g.dataset.go);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a && A.acts[a.dataset.act]) {
      e.preventDefault();
      Promise.resolve(A.acts[a.dataset.act](a, e)).catch(A.err);
    }
  });

  /** 폼 값 → 객체 (같은 이름 여러 개면 배열) */
  A.formData = (form) => {
    const o = {};
    for (const [k, v] of new FormData(form)) {
      if (v instanceof File) continue;
      if (k in o) o[k] = [].concat(o[k], v);
      else o[k] = v;
    }
    $$('input[type=checkbox][name]', form).forEach((c) => {
      if (!c.name.endsWith('[]')) o[c.name] = c.checked;
    });
    return o;
  };

  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const fn = A.forms[form.dataset.form];
    if (!fn || form.dataset.busy) return;
    form.dataset.busy = '1';
    const btns = $$('button[type=submit], button:not([type])', form);
    btns.forEach((b) => (b.disabled = true));
    try {
      await fn(form, A.formData(form), e);
    } catch (err) {
      A.err(err);
    } finally {
      delete form.dataset.busy;
      btns.forEach((b) => (b.disabled = false));
    }
  });

  // 입력창 높이 자동 조절
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches && t.matches('textarea[data-grow]')) {
      t.style.height = 'auto';
      t.style.height = Math.min(t.scrollHeight, 120) + 'px';
    }
  });

  // ==================================================================
  // 알림 목록 (상단 종)
  // ==================================================================
  const NOTI_IC = { task: ['checkSq', 'c-primary'], review: ['checkSq', 'c-leave'], approval: ['file', 'c-ok'], notice: ['megaphone', 'c-warn'], comment: ['comment', 'c-cyan'], org: ['user', 'c-leave'], pay: ['card', 'c-ok'], deadline: ['flag', 'c-danger'], post: ['board', 'c-primary'], chat: ['hash', 'c-gray'] };
  A.acts.noti = async () => {
    A.sheet.show('알림', '<div class="loading"><div class="spinner"></div></div>');
    const d = await A.api('noti.list');
    const html = d.items.length
      ? d.items
          .map((n) => {
            const [i, c] = NOTI_IC[n.kind] || ['bell', 'c-gray'];
            return `<button class="noti ${n.read ? '' : 'unread'}" ${n.link ? `data-go="${A.esc(n.link.replace(/^\//, ''))}"` : ''}>
              <span class="doc-ic ${c}">${A.ic(i, 18, 2)}</span>
              <div class="grow"><b>${A.esc(n.title)}</b><p>${A.esc(n.body || '')}${n.body ? ' · ' : ''}${A.ago(n.ts)}</p></div></button>`;
          })
          .join('')
      : '<div class="empty">새 알림이 없어요</div>';
    if (A.sheet.open) A.sheet.show('알림', html);
    if (d.items.some((n) => !n.read)) {
      const r = await A.post('noti.read');
      A.setBadges(r.badges);
    }
  };

  // ==================================================================
  // 배지 폴링 (화면이 보이는 동안 20초마다)
  // ==================================================================
  let pollTimer = null;
  async function pollBadges() {
    clearTimeout(pollTimer);
    if (document.hidden) return;
    try {
      const d = await A.api('badges');
      A.setBadges(d.badges);
      A.applyPresence(d.online);
      A.checkVersion(d.version);
    } catch (e) {
      /* 다음에 다시 */
    }
    pollTimer = setTimeout(pollBadges, 20000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollBadges();
    else clearTimeout(pollTimer);
  });

  // ==================================================================
  // 서비스 워커 · 푸시 알림 · 앱 설치
  // ==================================================================
  /*
   * 새 버전 알림: 서버의 APP_VERSION이 지금 화면과 다르면 위에 '새로고침' 띠를 보여줌
   * (설치한 앱을 오래 켜둔 경우에도 새 화면을 받도록)
   */
  const PAGE_VERSION = root.dataset.version || '';
  A.checkVersion = (v) => {
    if (!v || !PAGE_VERSION || v === PAGE_VERSION || $('.update-bar')) return;
    const bar = document.createElement('button');
    bar.className = 'update-bar';
    bar.innerHTML = `${A.ic('download', 18, 2.2)}<span>새 버전이 나왔어요. 눌러서 업데이트</span>`;
    bar.addEventListener('click', async () => {
      bar.disabled = true;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await reg.update();
      } catch (e) {
        /* 그래도 새로고침 */
      }
      location.reload();
    });
    $('#app').appendChild(bar);
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register(BASE + '/sw.php', { scope: BASE + '/' })
      .then((reg) => {
        // 앱을 켜둔 채로 있어도 1시간마다 새 버전 확인
        setInterval(() => reg.update().catch(() => {}), 3600000);
      })
      .catch(() => {});
  }
  const b64uToBytes = (s) => {
    const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  };
  A.isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  A.isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  A.push = {
    supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    async subscription() {
      const reg = await navigator.serviceWorker.ready;
      return reg.pushManager.getSubscription();
    },
    async enable() {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('알림 권한이 꺼져 있어요. 휴대폰(브라우저) 설정에서 이 앱의 알림을 허용해 주세요.');
      const { key } = await A.legacy('push-subscribe.php');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
      await A.legacy('push-subscribe.php', sub.toJSON(), true);
    },
    async disable() {
      const sub = await A.push.subscription();
      if (!sub) return;
      await A.legacy('push-subscribe.php', { action: 'unsubscribe', endpoint: sub.endpoint }, true).catch(() => {});
      await sub.unsubscribe();
    },
  };
  A.installEvent = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    A.installEvent = e;
  });

  // ==================================================================
  // 시작
  // ==================================================================
  /** 나 · 사람 · 팀 · 게시판 정보 다시 받기 (인사 변경 뒤 등) */
  A.loadData = async () => {
    const d = await A.api('bootstrap');
    d.memberMap = Object.fromEntries(d.members.map((m) => [m.id, m]));
    A.data = d;
    A.badges = d.badges || {};
    return d;
  };

  async function start() {
    try {
      await A.loadData();
    } catch (e) {
      $('#view').innerHTML = `<div class="empty" style="padding:80px 16px">${A.esc(e.message)}<br><br><button class="btn sm ghost" onclick="location.reload()">다시 시도</button></div>`;
      return;
    }
    if (!location.hash) history.replaceState(history.state, '', '#/home');
    render();
    A.checkVersion(A.data.version);
    pollTimer = setTimeout(pollBadges, 20000);
  }
  // 다른 화면 스크립트가 등록된 뒤 시작
  if (document.readyState === 'complete') setTimeout(start);
  else window.addEventListener('DOMContentLoaded', start);
})();
