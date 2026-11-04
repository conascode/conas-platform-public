/*
 * 공통 스크립트
 *  - 앱 안 페이지 전환 (전체 새로고침 없이 화면만 교체 → 상단 로딩 바가 뜨지 않음)
 *  - 사진 뷰어 (확대/축소, 넘기기, 아래로 밀어 닫기)
 *  - API 호출, 배지, 서비스 워커, 알림, 설치 안내, 폼 도우미
 */
(() => {
  'use strict';

  const BASE = document.documentElement.dataset.base || '/in';
  const csrfMeta = () => document.querySelector('meta[name="csrf-token"]');

  const IN = (window.IN = {
    base: BASE,
    url: (p) => BASE + '/' + String(p).replace(/^\//, ''),
    csrf: () => (csrfMeta() ? csrfMeta().content : ''),
    setCsrf(t) {
      const m = csrfMeta();
      if (m && t) m.content = t;
    },
    isTouch: matchMedia('(pointer: coarse)').matches,
    isIOS:
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    isStandalone:
      matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });

  // ==================================================================
  // 페이지 생명주기: 화면이 바뀔 때마다 각 기능을 다시 연결/정리
  // ==================================================================
  const inits = [];
  let cleanups = [];

  function runInit(fn) {
    try {
      const c = fn();
      if (typeof c === 'function') cleanups.push(c);
    } catch (e) {
      console.error(e);
    }
  }
  /** 현재 화면과 이후 바뀌는 모든 화면에서 실행. 정리 함수를 돌려주면 화면을 떠날 때 실행 */
  IN.onPage = (fn) => {
    inits.push(fn);
    runInit(fn);
  };
  function leavePage() {
    const list = cleanups;
    cleanups = [];
    list.forEach((c) => {
      try {
        c();
      } catch (e) {
        console.error(e);
      }
    });
  }
  function enterPage() {
    inits.forEach(runInit);
  }

  // ==================================================================
  // API
  // ==================================================================
  function goLogin() {
    location.href = IN.url('login.php?next=' + encodeURIComponent(location.pathname + location.search));
  }

  IN.api = async function api(path, opts = {}) {
    const { method = 'GET', json, form, retried } = opts;
    const headers = { Accept: 'application/json', 'X-CSRF-Token': IN.csrf() };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    let res;
    try {
      res = await fetch(IN.url('api/' + path), { method, headers, body, credentials: 'same-origin', cache: 'no-store' });
    } catch (e) {
      const err = new Error('인터넷 연결을 확인해 주세요.');
      err.network = true;
      throw err;
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* JSON이 아닌 응답 */
    }
    if (data && data.csrf) IN.setCsrf(data.csrf);
    if (res.status === 419 && !retried) return api(path, { ...opts, retried: true });
    if (res.status === 401) {
      goLogin();
      throw new Error('다시 로그인해 주세요.');
    }
    if (res.status === 403 && data && data.pending) {
      location.href = IN.url('pending.php');
      throw new Error('승인을 기다리는 중이에요.');
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || '요청을 처리하지 못했어요. (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return data || {};
  };

  IN.upload = function upload(file, onProgress, retried) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', IN.url('api/upload.php'));
      xhr.setRequestHeader('X-CSRF-Token', IN.csrf());
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let d = null;
        try {
          d = JSON.parse(xhr.responseText);
        } catch (e) {
          /* ignore */
        }
        if (d && d.csrf) IN.setCsrf(d.csrf);
        if (xhr.status === 200 && d && d.file) return resolve(d.file);
        if (xhr.status === 419 && !retried) return resolve(IN.upload(file, onProgress, true));
        if (xhr.status === 401) {
          goLogin();
          return reject(new Error('다시 로그인해 주세요.'));
        }
        reject(new Error((d && d.error) || '파일을 올리지 못했어요. (' + xhr.status + ')'));
      };
      xhr.onerror = () => reject(new Error('인터넷 연결이 끊겨 파일을 올리지 못했어요.'));
      const fd = new FormData();
      fd.append('file', file, file.name || 'file');
      xhr.send(fd);
    });
  };

  let toastTimer;
  IN.toast = function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return alert(msg);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  };

  IN.setBadges = function setBadges(d) {
    if (!d) return;
    if (typeof d.unread === 'number') {
      IN.lastUnread = d.unread;
      document.querySelectorAll('[data-badge="chat"]').forEach((b) => {
        b.textContent = d.unread > 99 ? '99+' : String(d.unread);
        b.hidden = d.unread <= 0;
      });
      if ('setAppBadge' in navigator) {
        (d.unread > 0 ? navigator.setAppBadge(d.unread) : navigator.clearAppBadge()).catch(() => {});
      }
    }
    if (typeof d.pending === 'number') {
      document.querySelectorAll('[data-badge="pending"]').forEach((b) => {
        b.textContent = String(d.pending);
        b.hidden = d.pending <= 0;
      });
    }
  };

  /** 화면이 보일 때만 반복 실행. stop()으로 완전히 정리 */
  IN.poller = function poller(fn, interval) {
    let timer = null;
    let delay = interval;
    let running = false;
    let stopped = false;

    async function tick() {
      timer = null;
      if (document.hidden || stopped) return;
      running = true;
      try {
        await fn();
        delay = interval;
      } catch (e) {
        delay = Math.min(delay * 2, 30000);
      }
      running = false;
      schedule();
    }
    function schedule() {
      clearTimeout(timer);
      if (!document.hidden && !stopped) timer = setTimeout(tick, delay);
    }
    function now() {
      if (running || stopped) return;
      clearTimeout(timer);
      tick();
    }
    const onVis = () => {
      if (!document.hidden) now();
      else {
        clearTimeout(timer);
        timer = null;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', now);
    return {
      start: now,
      now,
      stop() {
        stopped = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('online', now);
      },
    };
  };

  // ==================================================================
  // 사진 뷰어
  // ==================================================================
  const Viewer = (IN.viewer = (() => {
    let root, stage, img, counter, dlBtn, prevBtn, nextBtn;
    let items = [];
    let idx = 0;
    let isOpen = false;
    let pushed = false;
    // 확대 상태
    let s = 1, x = 0, y = 0, dragX = 0, dragY = 0;
    const pointers = new Map();
    let g = null; // 현재 제스처
    let lastTap = 0;
    let tapTimer = null;

    const svg = (d) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

    function build() {
      root = document.createElement('div');
      root.className = 'viewer';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', '사진 보기');
      root.innerHTML =
        '<div class="viewer-bg"></div>' +
        '<div class="viewer-stage"><img class="viewer-img" alt="" draggable="false"></div>' +
        '<div class="viewer-bar">' +
        `<button type="button" class="viewer-btn" data-v="close" aria-label="닫기">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button>` +
        '<span class="viewer-count" aria-live="polite"></span>' +
        `<a class="viewer-btn" data-v="download" data-no-swap aria-label="원본 저장">${svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>')}</a>` +
        '</div>' +
        `<button type="button" class="viewer-nav prev" data-v="prev" aria-label="이전 사진">${svg('<path d="M15 5l-7 7 7 7"/>')}</button>` +
        `<button type="button" class="viewer-nav next" data-v="next" aria-label="다음 사진">${svg('<path d="M9 5l7 7-7 7"/>')}</button>`;
      stage = root.querySelector('.viewer-stage');
      img = root.querySelector('.viewer-img');
      counter = root.querySelector('.viewer-count');
      dlBtn = root.querySelector('[data-v="download"]');
      prevBtn = root.querySelector('[data-v="prev"]');
      nextBtn = root.querySelector('[data-v="next"]');

      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const v = b.dataset.v;
        if (v === 'close') close();
        else if (v === 'prev') go(-1);
        else if (v === 'next') go(1);
      });
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);
      stage.addEventListener('wheel', onWheel, { passive: false });
      img.addEventListener('load', () => root.classList.remove('loading'));
    }

    function apply(animate) {
      img.style.transition = animate ? 'transform .22s ease' : 'none';
      img.style.transform = `translate3d(${x + dragX}px, ${y + dragY}px, 0) scale(${s})`;
      const fade = s === 1 ? Math.min(Math.abs(dragY) / 400, 0.7) : 0;
      root.style.setProperty('--bg-o', String(1 - fade));
    }
    function clamp() {
      const mx = Math.max(0, (img.offsetWidth * s - stage.clientWidth) / 2);
      const my = Math.max(0, (img.offsetHeight * s - stage.clientHeight) / 2);
      x = Math.max(-mx, Math.min(mx, x));
      y = Math.max(-my, Math.min(my, y));
    }
    function reset(animate) {
      s = 1;
      x = y = dragX = dragY = 0;
      apply(animate);
    }
    function zoomAt(newScale, px, py) {
      // px, py: 화면 중심 기준 좌표. 그 점이 손가락 아래 그대로 있도록 이동
      const ns = Math.max(1, Math.min(4, newScale));
      x = px - ((px - x) * ns) / s;
      y = py - ((py - y) * ns) / s;
      s = ns;
      if (s <= 1.02) {
        s = 1;
        x = y = 0;
      }
      clamp();
    }
    const center = (cx, cy) => {
      const r = stage.getBoundingClientRect();
      return [cx - r.left - r.width / 2, cy - r.top - r.height / 2];
    };

    function show(i, dir) {
      idx = Math.max(0, Math.min(items.length - 1, i));
      const it = items[idx];
      reset(false);
      root.classList.add('loading');
      img.src = it.src;
      img.alt = it.name || '';
      counter.textContent = items.length > 1 ? `${idx + 1} / ${items.length}` : '';
      dlBtn.hidden = !it.download;
      if (it.download) dlBtn.href = it.download;
      prevBtn.hidden = idx === 0;
      nextBtn.hidden = idx === items.length - 1;
      if (dir && !IN.reduceMotion && img.animate) {
        img.animate(
          [{ opacity: 0, translate: `${dir * 24}% 0` }, { opacity: 1, translate: '0 0' }],
          { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
      [idx - 1, idx + 1].forEach((n) => {
        if (items[n]) new Image().src = items[n].src;
      });
    }
    function go(d) {
      const n = idx + d;
      if (n < 0 || n >= items.length) {
        reset(true);
        return;
      }
      show(n, d);
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    }

    function open(list, start) {
      if (!list.length) return;
      if (!root) build();
      items = list;
      document.body.appendChild(root);
      document.documentElement.classList.add('viewer-open');
      isOpen = true;
      show(start || 0);
      root.classList.remove('ui-hidden');
      requestAnimationFrame(() => root.classList.add('open'));
      document.addEventListener('keydown', onKey);
      history.pushState({ ...(history.state || {}), viewer: true }, '');
      pushed = true;
      root.querySelector('[data-v="close"]').focus({ preventScroll: true });
    }
    /** fromHistory: 뒤로가기로 닫힌 경우 */
    function close(fromHistory) {
      if (!isOpen) return;
      isOpen = false;
      document.removeEventListener('keydown', onKey);
      root.classList.remove('open');
      document.documentElement.classList.remove('viewer-open');
      const r = root;
      setTimeout(() => {
        if (!isOpen) r.remove();
      }, 220);
      if (pushed && !fromHistory) {
        pushed = false;
        ignorePop = true;
        history.back();
      }
      pushed = false;
    }

    // ---------- 제스처 ----------
    function onDown(e) {
      if (e.target.closest('button, a')) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        g = { mode: s > 1 ? 'pan' : 'swipe', sx: e.clientX, sy: e.clientY, x0: x, y0: y, t: Date.now(), moved: false, axis: null };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const [mx, my] = center((a.x + b.x) / 2, (a.y + b.y) / 2);
        g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: s, x0: x, y0: y, mx0: mx, my0: my, moved: true };
        dragX = dragY = 0;
      }
    }
    function onMove(e) {
      if (!pointers.has(e.pointerId) || !g) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const [mx, my] = center((a.x + b.x) / 2, (a.y + b.y) / 2);
        const ns = Math.max(1, Math.min(4, (g.s0 * d) / g.d0));
        x = mx - ((g.mx0 - g.x0) * ns) / g.s0;
        y = my - ((g.my0 - g.y0) * ns) / g.s0;
        s = ns;
        apply(false);
        return;
      }
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) g.moved = true;
      if (g.mode === 'pan') {
        x = g.x0 + dx;
        y = g.y0 + dy;
        clamp();
        apply(false);
      } else if (g.mode === 'swipe' && g.moved) {
        if (!g.axis) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'x') dragX = dx;
        else dragY = dy;
        apply(false);
      }
    }
    function onUp(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!g) return;
      if (g.mode === 'pinch') {
        if (pointers.size === 0) {
          if (s <= 1.02) reset(true);
          else {
            clamp();
            apply(true);
          }
          g = null;
        } else {
          // 손가락 하나만 남으면 이동으로 전환
          const p = [...pointers.values()][0];
          g = { mode: 'pan', sx: p.x, sy: p.y, x0: x, y0: y, t: Date.now(), moved: true };
        }
        return;
      }
      const gesture = g;
      g = null;
      if (!gesture.moved && Date.now() - gesture.t < 300) {
        onTap(e.clientX, e.clientY);
        return;
      }
      if (gesture.mode === 'swipe') {
        if (gesture.axis === 'x' && Math.abs(dragX) > 60) {
          const d = dragX < 0 ? 1 : -1;
          dragX = 0;
          go(d);
        } else if (gesture.axis === 'y' && Math.abs(dragY) > 110) {
          close();
        } else {
          dragX = dragY = 0;
          apply(true);
        }
      }
    }
    function onTap(cx, cy) {
      const now = Date.now();
      if (now - lastTap < 280) {
        clearTimeout(tapTimer);
        lastTap = 0;
        if (s > 1) reset(true);
        else {
          const [px, py] = center(cx, cy);
          zoomAt(2.5, px, py);
          apply(true);
        }
        return;
      }
      lastTap = now;
      tapTimer = setTimeout(() => root.classList.toggle('ui-hidden'), 280);
    }
    function onWheel(e) {
      e.preventDefault();
      const [px, py] = center(e.clientX, e.clientY);
      zoomAt(s * Math.exp(-e.deltaY * 0.0022), px, py);
      apply(false);
    }

    return { open, close, get isOpen() { return isOpen; } };
  })());

  // [data-viewer] 링크를 누르면 같은 그룹 사진들로 뷰어 열기
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-viewer]');
    if (!a || e.defaultPrevented || e.button !== 0) return;
    e.preventDefault();
    const group = a.dataset.viewer;
    const els = [...document.querySelectorAll('[data-viewer]')].filter((x) => x.dataset.viewer === group);
    const list = els.map((x) => ({
      src: x.dataset.src || x.getAttribute('href'),
      download: x.dataset.download || '',
      name: (x.querySelector('img') || {}).alt || '',
    }));
    Viewer.open(list, Math.max(0, els.indexOf(a)));
  });

  // ==================================================================
  // 앱 안 페이지 전환
  // ==================================================================
  history.scrollRestoration = 'manual';
  if (!history.state || !history.state.in) history.replaceState({ in: true, scroll: 0 }, '');

  let ignorePop = false;
  let navSeq = 0;
  const prefetched = new Map(); // url -> { at, promise }

  /** 새 앱(한 페이지 앱) 주소: 화면 교체 대신 일반 이동 */
  function isSpa(url) {
    return url.pathname === BASE || url.pathname === BASE + '/' || url.pathname === BASE + '/index.php';
  }

  function swappable(url) {
    if (url.origin !== location.origin) return false;
    if (isSpa(url)) return false;
    if (!(url.pathname === BASE || url.pathname.startsWith(BASE + '/'))) return false;
    if (/\/(api\/|download\.php|sw\.php|manifest\.php)/.test(url.pathname)) return false;
    if (/\.(png|jpe?g|gif|webp|svg|css|js|pdf|zip|json|html)$/i.test(url.pathname)) return false;
    return true;
  }

  function fetchPage(href, init) {
    return fetch(href, {
      credentials: 'same-origin',
      headers: { 'X-In-Nav': '1' },
      ...init,
    }).then(async (res) => ({
      url: res.url,
      ok: res.ok,
      html: (res.headers.get('content-type') || '').includes('text/html') ? await res.text() : null,
    }));
  }

  function prefetch(href) {
    const hit = prefetched.get(href);
    if (hit && Date.now() - hit.at < 10000) return;
    const promise = fetchPage(href).catch(() => null);
    prefetched.set(href, { at: Date.now(), promise });
  }

  // 작성 중인 내용이 있으면 이동 전에 확인
  const dirtyChecks = new Set();
  function confirmLeave() {
    for (const check of dirtyChecks) {
      if (check()) return confirm('작성 중인 내용이 사라져요. 이 화면을 나갈까요?');
    }
    return true;
  }

  function saveScroll() {
    history.replaceState({ ...(history.state || {}), in: true, scroll: window.scrollY }, '');
  }

  /** 화면 교체 */
  function render(doc, finalUrl, opts) {
    leavePage();
    if (Viewer.isOpen) Viewer.close(true);

    const newBody = doc.body;
    let swapped = false;
    const swap = () => {
      if (swapped) return;
      swapped = true;
      document.title = doc.title;
      const token = doc.querySelector('meta[name="csrf-token"]');
      if (token) IN.setCsrf(token.content);
      document.body.replaceWith(document.adoptNode(newBody));

      if (!opts.fromPop) {
        const state = { in: true, scroll: 0 };
        if (opts.replace || finalUrl === location.href) history.replaceState(state, '', finalUrl);
        else history.pushState(state, '', finalUrl);
      }
      const hash = new URL(finalUrl).hash || opts.after;
      const target = hash && document.querySelector(hash);
      if (target) target.scrollIntoView({ block: opts.after ? 'center' : 'start' });
      else window.scrollTo(0, opts.fromPop ? opts.scroll || 0 : 0);
    };

    swap();
    enterPage();

    // 이 화면에만 있는 스크립트 불러오기 (처음 한 번만)
    const have = new Set([...document.querySelectorAll('script[src]')].map((s) => new URL(s.src, location.href).pathname));
    doc.head.querySelectorAll('script[src]').forEach((s) => {
      const path = new URL(s.getAttribute('src'), location.href).pathname;
      if (have.has(path)) return;
      const n = document.createElement('script');
      n.src = s.getAttribute('src');
      document.head.appendChild(n);
    });
    const af = document.querySelector('[autofocus]');
    if (af) af.focus();
  }

  /**
   * 페이지 이동
   * opts: { method, body, fromPop, scroll, replace, after, form }
   */
  IN.go = async function go(href, opts = {}) {
    const seq = ++navSeq;
    if (!opts.fromPop) saveScroll();
    document.documentElement.classList.add('nav-busy');
    let page = null;
    try {
      if (!opts.method) {
        const hit = prefetched.get(href);
        prefetched.clear();
        page = hit && Date.now() - hit.at < 10000 ? await hit.promise : null;
      }
      if (!page) page = await fetchPage(href, opts.method ? { method: opts.method, body: opts.body } : {});
    } catch (e) {
      page = null;
    }
    document.documentElement.classList.remove('nav-busy');
    if (seq !== navSeq) return;

    // 로그인 후 새 앱으로 넘어가는 경우 등: 일반 이동
    if (page && page.url && isSpa(new URL(page.url, location.href))) {
      location.href = page.url;
      return;
    }
    if (!page || page.html === null) {
      if (opts.method) {
        IN.toast('인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
        if (opts.form) unlockForm(opts.form);
        return;
      }
      location.href = href; // 페이지가 아닌 응답이거나 오프라인 → 일반 이동
      return;
    }
    const doc = new DOMParser().parseFromString(page.html, 'text/html');
    let finalUrl = page.url || href;
    const wanted = new URL(href, location.href);
    if (wanted.hash && !opts.method && new URL(finalUrl).pathname === wanted.pathname) {
      finalUrl = finalUrl.split('#')[0] + wanted.hash;
    }
    render(doc, finalUrl, opts);
  };

  // 전체 화면 창(사진 자르기 등): 휴대폰 뒤로가기로 닫히도록
  let overlayClose = null;
  IN.pushOverlay = (closeFn) => {
    history.pushState({ ...(history.state || {}), overlay: true }, '');
    overlayClose = closeFn;
  };
  /** 화면이 바뀌면서 강제로 닫을 때 (기록은 그대로 둠) */
  IN.dropOverlay = () => {
    overlayClose = null;
  };
  /** 화면의 버튼으로 닫았을 때 호출 (추가했던 기록을 되돌림) */
  IN.popOverlay = () => {
    if (!overlayClose) return;
    overlayClose = null;
    ignorePop = true;
    history.back();
  };

  window.addEventListener('popstate', (e) => {
    if (ignorePop) {
      ignorePop = false;
      return;
    }
    if (overlayClose) {
      const f = overlayClose;
      overlayClose = null;
      f();
      return;
    }
    if (Viewer.isOpen) {
      Viewer.close(true);
      return;
    }
    const st = e.state || {};
    IN.go(location.href, { fromPop: true, scroll: st.scroll || 0 });
  });

  // 링크 클릭 → 앱 안 이동
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || 'noSwap' in a.dataset) return;
    const url = new URL(a.href, location.href);
    if (!swappable(url)) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    e.preventDefault();
    if (!confirmLeave()) return;
    dirtyChecks.clear();
    IN.go(url.href);
  });

  // 손가락이 닿는 순간 미리 받아두기 (누르고 떼는 사이에 대부분 도착)
  document.addEventListener(
    'pointerdown',
    (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || a.target || 'noSwap' in a.dataset || a.dataset.viewer !== undefined) return;
      const url = new URL(a.href, location.href);
      if (swappable(url) && !(url.pathname === location.pathname && url.search === location.search)) prefetch(url.href);
    },
    { passive: true }
  );

  // ==================================================================
  // 폼: 확인 창, 중복 제출 방지, 앱 안 제출
  // ==================================================================
  function submitButtons(form) {
    return [...form.elements].filter((el) => el.type === 'submit');
  }
  function unlockForm(form) {
    delete form.dataset.sent;
    submitButtons(form).forEach((b) => (b.disabled = false));
  }

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (e.defaultPrevented) return;
    if (form.dataset.confirm && !confirm(form.dataset.confirm)) {
      e.preventDefault();
      return;
    }
    if (form.hasAttribute('data-once')) {
      if (form.dataset.sent) {
        e.preventDefault();
        return;
      }
      form.dataset.sent = '1';
    }

    const action = new URL(form.getAttribute('action') || location.href, location.href);
    if ('noSwap' in form.dataset || form.target || !swappable(action)) {
      submitButtons(form).forEach((b) => (b.disabled = true));
      return; // 일반 제출
    }
    e.preventDefault();
    const method = (form.getAttribute('method') || 'get').toLowerCase();
    let fd;
    try {
      fd = new FormData(form, e.submitter || undefined);
    } catch (err) {
      fd = new FormData(form);
    }
    submitButtons(form).forEach((b) => (b.disabled = true));
    dirtyChecks.clear();
    if (method === 'get') {
      action.search = new URLSearchParams(fd).toString();
      IN.go(action.href);
    } else {
      IN.go(action.href, { method: 'POST', body: fd, form, after: form.dataset.after });
    }
  });

  // 바깥을 누르면 드롭다운 메뉴 닫기
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  // 실제로 앱을 떠날 때(새로고침, 닫기)도 경고
  window.addEventListener('beforeunload', (e) => {
    for (const check of dirtyChecks) {
      if (check()) {
        e.preventDefault();
        e.returnValue = '';
        return;
      }
    }
  });

  // ==================================================================
  // 서비스 워커
  // ==================================================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(IN.url('sw.php'), { scope: BASE + '/' }).catch(() => {});
  }

  // ==================================================================
  // 푸시 알림
  // ==================================================================
  const Push = (IN.push = {
    supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    async subscription() {
      const reg = await navigator.serviceWorker.ready;
      return reg.pushManager.getSubscription();
    },
    async enable() {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        throw new Error('알림 권한이 꺼져 있어요. 휴대폰(브라우저) 설정에서 이 앱의 알림을 허용해 주세요.');
      }
      const { key } = await IN.api('push-subscribe.php');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
      await IN.api('push-subscribe.php', { method: 'POST', json: sub.toJSON() });
      try {
        localStorage.setItem('in_push_sync', String(Date.now()));
      } catch (e) {
        /* ignore */
      }
    },
    async disable() {
      const sub = await Push.subscription();
      if (!sub) return;
      await IN.api('push-subscribe.php', { method: 'POST', json: { action: 'unsubscribe', endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    },
    async sync() {
      if (!Push.supported || Notification.permission !== 'granted') return;
      let last = 0;
      try {
        last = Number(localStorage.getItem('in_push_sync') || 0);
      } catch (e) {
        /* ignore */
      }
      if (Date.now() - last < 86400000) return;
      const sub = await Push.subscription();
      if (!sub) return;
      await IN.api('push-subscribe.php', { method: 'POST', json: sub.toJSON() });
      try {
        localStorage.setItem('in_push_sync', String(Date.now()));
      } catch (e) {
        /* ignore */
      }
    },
  });
  function b64uToBytes(s) {
    const pad = '='.repeat((4 - (s.length % 4)) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  if (document.querySelector('.tabbar')) Push.sync().catch(() => {});

  // ==================================================================
  // 설치 안내
  // ==================================================================
  let installEvent = null;
  const showInstall = () => {
    document.querySelectorAll('[data-install]').forEach((x) => (x.hidden = !installEvent));
    if (IN.isIOS && !IN.isStandalone) document.querySelectorAll('[data-ios-install]').forEach((x) => (x.hidden = false));
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    showInstall();
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    showInstall();
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-install-btn]') || !installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    installEvent = null;
    showInstall();
  });

  // ==================================================================
  // 화면별 기능 (화면이 바뀔 때마다 다시 연결)
  // ==================================================================

  // 하단 탭 배지용 가벼운 폴링
  IN.onPage(() => {
    if (document.body.dataset.poll !== 'lite') return;
    if (typeof IN.lastUnread === 'number') IN.setBadges({ unread: IN.lastUnread });
    const p = IN.poller(async () => IN.setBadges(await IN.api('poll.php')), 20000);
    p.start();
    return () => p.stop();
  });

  IN.onPage(showInstall);

  // 입력창 높이 자동 조절
  IN.onPage(() => {
    document.querySelectorAll('textarea[data-autosize]').forEach((t) => {
      const fit = () => {
        if (!t.offsetParent) return; // 숨겨진 입력칸(답글 등)은 열릴 때 맞춤
        t.style.height = 'auto';
        t.style.height = t.scrollHeight + 2 + 'px';
      };
      fit();
      t.addEventListener('input', fit);
      t.addEventListener('focus', fit);
    });
  });

  // 작성 중 나가기 경고
  IN.onPage(() => {
    const forms = document.querySelectorAll('form[data-leave-warning]');
    if (!forms.length) return;
    const checks = [];
    forms.forEach((form) => {
      let dirty = false;
      form.addEventListener('input', () => (dirty = true));
      form.addEventListener('submit', () => (dirty = false));
      const check = () => dirty && !form.dataset.sent;
      checks.push(check);
      dirtyChecks.add(check);
    });
    return () => checks.forEach((c) => dirtyChecks.delete(c));
  });

  // 숫자가 0부터 올라가는 효과 (Number Ticker)
  IN.onPage(() => {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length || IN.reduceMotion) return;
    let raf = 0;
    const start = performance.now();
    const targets = [...els].map((el) => ({ el, to: Number(el.dataset.count) || 0 }));
    targets.forEach((t) => (t.el.textContent = '0'));
    const step = (now) => {
      const p = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(2, -10 * p);
      targets.forEach((t) => (t.el.textContent = Math.round(t.to * (p === 1 ? 1 : eased)).toLocaleString('ko-KR')));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  // 내 정보: 알림 켜기/끄기
  IN.onPage(() => {
    const status = document.querySelector('[data-push-status]');
    const btn = document.querySelector('[data-push-toggle]');
    if (!status || !btn) return;
    async function refresh() {
      if (!Push.supported) {
        status.textContent =
          IN.isIOS && !IN.isStandalone
            ? '홈 화면에 추가한 앱에서 알림을 켤 수 있어요. (iOS 16.4 이상)'
            : '이 브라우저는 알림을 지원하지 않아요.';
        btn.hidden = true;
        return;
      }
      if (Notification.permission === 'denied') {
        status.textContent = '알림이 차단되어 있어요. 휴대폰(브라우저) 설정에서 허용해 주세요.';
        btn.hidden = true;
        return;
      }
      const sub = await Push.subscription().catch(() => null);
      const on = !!sub && Notification.permission === 'granted';
      status.textContent = on ? '이 기기에서 알림을 받고 있어요.' : '꺼져 있어요.';
      btn.textContent = on ? '끄기' : '켜기';
      btn.classList.toggle('btn-primary', !on);
      btn.hidden = false;
      btn.dataset.on = on ? '1' : '';
    }
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (btn.dataset.on) {
          await Push.disable();
          IN.toast('알림을 껐어요.');
        } else {
          await Push.enable();
          IN.toast('알림을 켰어요.');
        }
      } catch (e) {
        IN.toast(e.message || '알림 설정을 바꾸지 못했어요.');
      }
      btn.disabled = false;
      refresh();
    });
    refresh();
  });

  // 게시글 좋아요: 누르는 즉시 바뀌고, 서버 결과로 숫자를 맞춤
  IN.onPage(() => {
    const btn = document.querySelector('[data-like]');
    if (!btn) return;
    const countEl = btn.querySelector('[data-like-count]');
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const on = btn.getAttribute('aria-pressed') !== 'true';
      const prev = Number(countEl.textContent) || 0;
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('on', on);
      countEl.textContent = String(Math.max(0, prev + (on ? 1 : -1)));
      if (on && !IN.reduceMotion) {
        btn.classList.remove('pop');
        void btn.offsetWidth;
        btn.classList.add('pop');
      }
      try {
        const d = await IN.api('like.php', { method: 'POST', json: { post_id: Number(btn.dataset.like), like: on } });
        btn.setAttribute('aria-pressed', String(d.liked));
        btn.classList.toggle('on', d.liked);
        countEl.textContent = String(d.count);
      } catch (e) {
        btn.setAttribute('aria-pressed', String(!on));
        btn.classList.toggle('on', !on);
        countEl.textContent = String(prev);
        IN.toast(e.message);
      }
      busy = false;
    });
  });

  // 하단 댓글 입력칸: 💬를 누르면 그 댓글에 답글 쓰는 모드로 전환
  IN.onPage(() => {
    const bar = document.querySelector('[data-cbar]');
    if (!bar) return;
    const input = bar.querySelector('[data-cbar-input]');
    const parent = bar.querySelector('[data-cbar-parent]');
    const replyBox = bar.querySelector('[data-cbar-reply]');
    const nameEl = bar.querySelector('[data-cbar-name]');
    const fit = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    };
    const setReply = (id, name) => {
      parent.value = id || '';
      replyBox.hidden = !id;
      nameEl.textContent = name || '';
      input.placeholder = id ? '답글을 입력하세요' : '댓글을 입력하세요';
      bar.dataset.after = id ? '#t' + id : '#comments-end';
      document.querySelectorAll('.thread.replying').forEach((t) => t.classList.remove('replying'));
      if (id) {
        const t = document.getElementById('t' + id);
        if (t) t.classList.add('replying');
      }
    };
    input.addEventListener('input', fit);
    bar.querySelector('[data-cbar-cancel]').addEventListener('click', () => {
      setReply(null);
      input.focus();
    });
    // PC: Enter 등록, Shift+Enter 줄바꿈
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229 || IN.isTouch) return;
      e.preventDefault();
      if (input.value.trim()) bar.requestSubmit ? bar.requestSubmit() : bar.submit();
    });
    const onReply = (e) => {
      const b = e.target.closest('[data-reply]');
      if (!b) return;
      setReply(b.dataset.reply, b.dataset.replyName);
      input.focus();
    };
    document.addEventListener('click', onReply);
    return () => document.removeEventListener('click', onReply);
  });

  // 댓글 좋아요
  IN.onPage(() => {
    const list = document.querySelector('.comment-list');
    if (!list) return;
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-clike]');
      if (!btn || btn.dataset.busy) return;
      btn.dataset.busy = '1';
      const id = btn.dataset.clike;
      const countBox = list.querySelector(`[data-clike-count="${id}"]`);
      const countEl = countBox.querySelector('b');
      const on = btn.getAttribute('aria-pressed') !== 'true';
      const prev = Number(countEl.textContent) || 0;
      const show = (liked, n) => {
        btn.setAttribute('aria-pressed', String(liked));
        btn.classList.toggle('on', liked);
        countEl.textContent = String(n);
        countBox.hidden = n <= 0;
      };
      show(on, Math.max(0, prev + (on ? 1 : -1)));
      if (on && !IN.reduceMotion) {
        btn.classList.remove('pop');
        void btn.offsetWidth;
        btn.classList.add('pop');
      }
      try {
        const d = await IN.api('comment-like.php', { method: 'POST', json: { comment_id: Number(id), like: on } });
        show(d.liked, d.count);
      } catch (err) {
        show(!on, prev);
        IN.toast(err.message);
      }
      delete btn.dataset.busy;
    });
  });

  // 새 채팅: 사람 선택
  IN.onPage(() => {
    const picker = document.querySelector('[data-picker]');
    if (!picker) return;
    const search = picker.querySelector('[data-picker-search]');
    const submit = picker.querySelector('[data-picker-submit]');
    const nameInput = picker.querySelector('[data-picker-name]');
    const baseLabel = submit.textContent.trim();
    const update = () => {
      const n = picker.querySelectorAll('input[name="user_ids[]"]:checked').length;
      submit.disabled = n === 0;
      submit.textContent = n > 0 ? `${baseLabel} (${n}명)` : baseLabel;
      if (nameInput) nameInput.hidden = n < 2;
    };
    picker.addEventListener('change', update);
    if (search) {
      search.addEventListener('input', () => {
        const qv = search.value.trim().toLowerCase();
        picker.querySelectorAll('li[data-name]').forEach((li) => {
          li.hidden = qv !== '' && !li.dataset.name.includes(qv);
        });
      });
    }
    update();
  });
})();
