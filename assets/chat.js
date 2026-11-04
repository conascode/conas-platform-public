/* 채팅: 목록 화면(#chat-list)과 채팅방 화면(#chat-room) */
(() => {
  'use strict';
  const IN = window.IN;
  const POLL_MS = 3000;

  // ------------------------------------------------------------------
  // 도우미
  // ------------------------------------------------------------------
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  /** 텍스트 안의 주소를 링크로 (innerHTML 사용 안 함) */
  function linkify(text) {
    const frag = document.createDocumentFragment();
    const re = /https?:\/\/[^\s<>"]+/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      let link = m[0];
      const trail = (link.match(/[.,);!?]+$/) || [''])[0];
      if (trail) link = link.slice(0, -trail.length);
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = h('a', null, link);
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      frag.appendChild(a);
      last = m.index + link.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function fmtTime(ts) {
    const d = new Date(ts * 1000);
    const hr = d.getHours();
    return `${hr < 12 ? '오전' : '오후'} ${hr % 12 || 12}:${pad(d.getMinutes())}`;
  }
  function dayKey(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  function fmtDay(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  }
  function fmtListTime(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const now = new Date();
    if (dayKey(ts) === dayKey(now / 1000)) return fmtTime(ts);
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (dayKey(ts) === dayKey(y / 1000)) return '어제';
    if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }
  function fmtBytes(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(1) + 'MB';
    if (b >= 1024) return Math.round(b / 1024) + 'KB';
    return b + 'B';
  }
  /** 동그란 프로필: 사진 주소가 있으면 사진, 없으면 이름 첫 글자 */
  function avatarEl(url, name, cls) {
    const span = h('span', 'avatar' + (cls ? ' ' + cls : '') + (url ? ' has-img' : ''));
    span.setAttribute('aria-hidden', 'true');
    if (url) {
      const im = h('img');
      im.src = url;
      im.alt = '';
      im.loading = 'lazy';
      im.decoding = 'async';
      span.appendChild(im);
    } else {
      span.textContent = (name || '?').slice(0, 1);
    }
    return span;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  // ------------------------------------------------------------------
  // 채팅 목록
  // ------------------------------------------------------------------
  IN.onPage(() => {
    const el = document.getElementById('chat-list');
    return el ? initList(el) : undefined;
  });

  function initList(rootEl) {
    const ul = rootEl.querySelector('[data-conv-list]');
    const empty = rootEl.querySelector('[data-conv-empty]');
    let since = 0;

    async function load() {
      const d = await IN.api('conversations.php');
      render(d.conversations || []);
      IN.setBadges({ unread: d.unread });
    }

    function render(list) {
      ul.replaceChildren(
        ...list.map((c) => {
          const li = h('li');
          const a = h('a', 'list-item conv-item' + (c.unread ? ' unread' : ''));
          a.href = IN.url('room.php?c=' + c.id);
          const av = avatarEl(c.av, c.title, c.type === 'group' ? 'avatar-group' : '');
          const main = h('div', 'list-main');
          const title = h('div', 'list-title');
          title.appendChild(h('span', 'ellipsis', c.title));
          if (c.type === 'group') title.appendChild(h('small', 'muted', String(c.member_count)));
          const sub = h('div', 'list-sub ellipsis', c.preview || (c.type === 'group' ? '그룹 채팅방이 만들어졌어요.' : '대화를 시작해 보세요.'));
          main.append(title, sub);
          const side = h('div', 'list-side');
          side.appendChild(h('small', 'muted', fmtListTime(c.ts)));
          if (c.unread) side.appendChild(h('span', 'badge', c.unread > 99 ? '99+' : String(c.unread)));
          a.append(av, main, side);
          li.appendChild(a);
          return li;
        })
      );
      empty.hidden = list.length > 0;
      ul.hidden = list.length === 0;
    }

    const poller = IN.poller(async () => {
      const d = await IN.api('poll.php?since=' + since);
      if (d.max_id !== undefined) {
        // 첫 호출: 기준점을 잡은 뒤 목록을 불러옴
        since = d.max_id;
        await load();
        return;
      }
      if (d.messages && d.messages.length) {
        since = d.messages[d.messages.length - 1].id;
        await load();
      } else {
        IN.setBadges(d);
      }
    }, POLL_MS);
    poller.start();
    return () => poller.stop();
  }

  // ------------------------------------------------------------------
  // 채팅방
  // ------------------------------------------------------------------
  IN.onPage(() => {
    const el = document.getElementById('chat-room');
    return el ? initRoom(el) : undefined;
  });

  function initRoom(rootEl) {
    const S = {
      c: Number(rootEl.dataset.c),
      me: Number(rootEl.dataset.me),
      group: rootEl.dataset.group === '1',
      maxBytes: Number(rootEl.dataset.maxBytes) || 0,
      since: 0,
      msgs: [], // 서버에 저장된 메시지 (id 오름차순)
      ids: new Set(),
      pending: [], // 보내는 중/실패한 메시지
      nodes: new Map(), // key -> element
      reads: {}, // user_id -> 마지막으로 읽은 메시지 id
      readsSig: '',
      hasMore: false,
      loadingOlder: false,
      lastReadSent: 0,
      stick: true, // 맨 아래에 붙어 있는지
      ready: false,
      animate: false,
      animated: new Set(), // 이미 등장 효과를 보여준 메시지
    };

    const scroller = rootEl.querySelector('[data-msgs]');
    const listEl = rootEl.querySelector('[data-msgs-list]');
    const topEl = rootEl.querySelector('[data-msgs-top]');
    const jumpBtn = rootEl.querySelector('[data-jump]');
    const form = rootEl.querySelector('[data-composer]');
    const input = rootEl.querySelector('[data-input]');
    const sendBtn = rootEl.querySelector('[data-send]');
    const fileInput = rootEl.querySelector('[data-file]');

    // ---------- 화면 높이 (모바일 키보드 대응) ----------
    const vv = window.visualViewport;
    function fit() {
      const height = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-h', height + 'px');
      document.documentElement.style.setProperty('--app-top', (vv ? vv.offsetTop : 0) + 'px');
      // iOS: 키보드가 올라오면 아래 안전 여백(홈 바 자리)을 없앰
      document.body.classList.toggle('kb-open', !!vv && window.innerHeight - vv.height > 120);
      if (S.stick) scrollBottom();
    }
    if (vv) {
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
    }
    window.addEventListener('resize', fit);
    fit();
    const onVisible = () => {
      if (!document.hidden) markRead();
    };
    document.addEventListener('visibilitychange', onVisible);

    // ---------- 스크롤 ----------
    const nearBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    function scrollBottom() {
      scroller.scrollTop = scroller.scrollHeight;
    }
    scroller.addEventListener(
      'scroll',
      () => {
        S.stick = nearBottom();
        if (S.stick) {
          jumpBtn.hidden = true;
          markRead();
        }
      },
      { passive: true }
    );
    jumpBtn.addEventListener('click', () => {
      scrollBottom();
      jumpBtn.hidden = true;
    });

    // 위로 스크롤하면 이전 메시지 불러오기
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) loadOlder();
        },
        { root: scroller, rootMargin: '300px 0px 0px 0px' }
      ).observe(topEl);
    }

    // ---------- 메시지 노드 ----------
    function keyOf(m) {
      return m.pending ? 'p:' + m.cid : 'm:' + m.id;
    }

    function fileNodes(m) {
      const out = [];
      for (const f of m.files || []) {
        if (f.is_image && (f.view_url || f.local_url)) {
          const a = h('a', 'msg-img');
          a.href = f.view_url || f.local_url;
          a.dataset.viewer = 'chat';
          if (f.url) a.dataset.download = f.url;
          const img = h('img');
          img.src = f.view_url || f.local_url;
          img.alt = f.name;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.addEventListener('load', () => S.stick && scrollBottom());
          a.appendChild(img);
          if (m.pending && m.state === 'uploading') {
            const bar = h('span', 'progress');
            bar.appendChild(h('span'));
            a.appendChild(bar);
          }
          out.push(a);
        } else {
          const a = h('a', 'file-chip');
          if (f.url) a.href = f.url;
          a.dataset.noSwap = '';
          a.appendChild(h('span', 'file-ic', '📄'));
          a.appendChild(h('span', 'ellipsis', f.name));
          a.appendChild(h('small', null, f.size_text || ''));
          if (m.pending && m.state === 'uploading') {
            const bar = h('span', 'progress');
            bar.appendChild(h('span'));
            a.appendChild(bar);
          }
          out.push(a);
        }
      }
      return out;
    }

    function buildNode(m) {
      const mine = m.uid === S.me;
      const n = h('div', 'msg' + (mine ? ' mine' : '') + (m.pending ? ' pending' : '') + (m.state === 'failed' ? ' failed' : ''));
      // 처음 불러온 뒤 새로 들어온 메시지만 톡 튀어나오는 효과 (Animated List)
      const ident = m.cid || 'm' + m.id;
      if (S.animate && !S.animated.has(ident)) {
        S.animated.add(ident);
        n.classList.add('enter');
        n.addEventListener('animationend', () => n.classList.remove('enter'), { once: true });
      }
      if (!mine) {
        n.appendChild(avatarEl(m.av, m.name, 'avatar-sm msg-av'));
      }
      const col = h('div', 'msg-col');
      if (!mine) col.appendChild(h('div', 'msg-name', m.name));
      const row = h('div', 'msg-row');
      const content = h('div', 'msg-content');
      fileNodes(m).forEach((x) => content.appendChild(x));
      if (m.body) {
        const b = h('div', 'bubble');
        b.appendChild(linkify(m.body));
        content.appendChild(b);
      }
      const meta = h('div', 'msg-meta');
      if (m.pending) {
        if (m.state === 'failed') {
          const retry = h('button', 'msg-retry', '재전송');
          retry.type = 'button';
          retry.addEventListener('click', () => m.retry && m.retry());
          const del = h('button', 'msg-retry', '삭제');
          del.type = 'button';
          del.addEventListener('click', () => removePending(m.cid, true));
          meta.append(retry, del);
          if (m.error) meta.title = m.error;
        } else {
          meta.appendChild(h('span', 'msg-status', '전송 중'));
        }
      } else {
        meta.appendChild(h('span', 'msg-unread'));
        meta.appendChild(h('span', 'msg-time', fmtTime(m.ts)));
      }
      row.append(content, meta);
      col.appendChild(row);
      n.appendChild(col);
      return n;
    }

    function nodeFor(m) {
      const k = keyOf(m);
      let n = S.nodes.get(k);
      if (!n) {
        n = buildNode(m);
        S.nodes.set(k, n);
      }
      return n;
    }

    function unreadCount(m) {
      let n = 0;
      for (const [uid, last] of Object.entries(S.reads)) {
        if (Number(uid) !== m.uid && last < m.id) n++;
      }
      return n;
    }

    function refreshUnread() {
      for (const m of S.msgs) {
        const n = S.nodes.get('m:' + m.id);
        if (!n) continue;
        const el = n.querySelector('.msg-unread');
        if (!el) continue;
        const cnt = unreadCount(m);
        el.textContent = cnt > 0 ? String(cnt) : '';
      }
    }

    const dayNodes = new Map();
    function dayNode(ts) {
      const k = dayKey(ts);
      let n = dayNodes.get(k);
      if (!n) {
        n = h('div', 'day-sep');
        n.appendChild(h('span', null, fmtDay(ts)));
        dayNodes.set(k, n);
      }
      return n;
    }

    /** 전체 다시 배치 (노드는 재사용) */
    function render(opts = {}) {
      const wasBottom = S.stick || nearBottom();
      const prevHeight = scroller.scrollHeight;
      const prevTop = scroller.scrollTop;

      const items = S.msgs.concat(S.pending);
      const out = [];
      let prev = null;
      items.forEach((m, i) => {
        const next = items[i + 1];
        const dk = dayKey(m.ts);
        if (!prev || dayKey(prev.ts) !== dk) out.push(dayNode(m.ts));
        const n = nodeFor(m);
        const cont = !!prev && prev.uid === m.uid && dayKey(prev.ts) === dk && m.ts - prev.ts < 300;
        n.classList.toggle('cont', cont);
        const lastOfGroup =
          !next || next.uid !== m.uid || dayKey(next.ts) !== dk || fmtTime(next.ts) !== fmtTime(m.ts);
        n.classList.toggle('show-time', lastOfGroup);
        out.push(n);
        prev = m;
      });
      if (!items.length) {
        out.push(h('div', 'msgs-empty', '첫 메시지를 보내보세요.'));
      }
      listEl.replaceChildren(...out);
      refreshUnread();

      if (opts.prepend) {
        scroller.scrollTop = scroller.scrollHeight - prevHeight + prevTop;
      } else if (opts.bottom || wasBottom) {
        scrollBottom();
        S.stick = true;
      } else if (opts.newFromOthers) {
        jumpBtn.hidden = false;
      }
    }

    // ---------- 데이터 ----------
    /** 서버 메시지 추가. 이 방의 새 메시지 수를 반환 */
    function addMessages(arr, fromOthersCounter) {
      let added = 0;
      let others = 0;
      for (const m of arr) {
        if (m.c !== S.c || S.ids.has(m.id)) continue;
        if (m.cid) removePending(m.cid, false);
        S.ids.add(m.id);
        if (S.msgs.length && S.msgs[S.msgs.length - 1].id > m.id) {
          S.msgs.push(m);
          S.msgs.sort((a, b) => a.id - b.id);
        } else {
          S.msgs.push(m);
        }
        added++;
        if (m.uid !== S.me) others++;
      }
      if (fromOthersCounter) fromOthersCounter.others = others;
      return added;
    }

    function removePending(cid, rerender) {
      const i = S.pending.findIndex((p) => p.cid === cid);
      if (i < 0) return;
      const p = S.pending[i];
      (p.files || []).forEach((f) => f.local_url && URL.revokeObjectURL(f.local_url));
      S.pending.splice(i, 1);
      S.nodes.delete('p:' + cid);
      if (rerender) render();
    }

    function refreshPending(p) {
      S.nodes.delete('p:' + p.cid);
      render();
    }

    function markRead() {
      if (document.hidden || !S.ready || !S.stick) return;
      const last = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
      if (last <= S.lastReadSent) return;
      S.lastReadSent = last;
      IN.api('read.php', { method: 'POST', json: { c: S.c, last_id: last } })
        .then((d) => IN.setBadges(d))
        .catch(() => (S.lastReadSent = 0));
    }

    async function loadInitial() {
      const d = await IN.api('messages.php?c=' + S.c);
      addMessages(d.messages || []);
      S.hasMore = !!d.has_more;
      const lastId = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
      S.since = Math.max(d.since || 0, lastId);
      S.ready = true;
      render({ bottom: true });
      S.animate = true;
      markRead();
    }

    async function loadOlder() {
      if (!S.ready || !S.hasMore || S.loadingOlder || !S.msgs.length) return;
      S.loadingOlder = true;
      topEl.classList.add('loading');
      try {
        const d = await IN.api('messages.php?c=' + S.c + '&before=' + S.msgs[0].id);
        addMessages(d.messages || []);
        S.hasMore = !!d.has_more;
        render({ prepend: true });
      } catch (e) {
        IN.toast(e.message);
      }
      topEl.classList.remove('loading');
      S.loadingOlder = false;
    }

    const poller = IN.poller(async () => {
      if (!S.ready) {
        // 처음 불러오기 (실패하면 폴러가 간격을 늘려가며 다시 시도)
        try {
          await loadInitial();
        } catch (e) {
          listEl.replaceChildren(h('div', 'msgs-empty', e.message || '메시지를 불러오지 못했어요.'));
          throw e;
        }
        return;
      }
      const d = await IN.api(`poll.php?since=${S.since}&c=${S.c}&active=1`);
      IN.setBadges(d);
      let changed = false;
      const info = {};
      if (d.messages && d.messages.length) {
        S.since = Math.max(S.since, d.messages[d.messages.length - 1].id);
        changed = addMessages(d.messages, info) > 0;
      }
      if (d.reads) {
        const sig = JSON.stringify(d.reads);
        if (sig !== S.readsSig) {
          S.readsSig = sig;
          S.reads = d.reads;
          if (!changed) refreshUnread();
        }
      }
      if (changed) {
        render({ newFromOthers: info.others > 0 });
        markRead();
      }
    }, POLL_MS);

    // ---------- 보내기 ----------
    async function send(p, payload) {
      p.state = 'sending';
      refreshPending(p);
      try {
        const d = await IN.api('send.php', { method: 'POST', json: { c: S.c, cid: p.cid, ...payload } });
        removePending(p.cid, false);
        // 폴링 기준점(S.since)은 바꾸지 않음: 그 사이 다른 사람 메시지를 놓치지 않도록
        if (d.message) addMessages([d.message]);
        S.lastReadSent = Math.max(S.lastReadSent, d.message ? d.message.id : 0);
        render({ bottom: true });
      } catch (e) {
        p.state = 'failed';
        p.error = e.message;
        refreshPending(p);
        IN.toast(e.message);
      }
    }

    function sendText(text) {
      const p = {
        pending: true,
        cid: newId(),
        uid: S.me,
        name: '',
        body: text,
        ts: Math.floor(Date.now() / 1000),
        files: [],
        state: 'sending',
      };
      p.retry = () => send(p, { body: p.body });
      S.pending.push(p);
      render({ bottom: true });
      send(p, { body: text });
    }

    function sendFile(file) {
      const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.type);
      const p = {
        pending: true,
        cid: newId(),
        uid: S.me,
        name: '',
        body: '',
        ts: Math.floor(Date.now() / 1000),
        files: [
          {
            name: file.name,
            size_text: fmtBytes(file.size),
            is_image: isImage,
            local_url: isImage ? URL.createObjectURL(file) : null,
          },
        ],
        state: 'uploading',
        uploaded: null,
      };
      const upload = async () => {
        p.state = 'uploading';
        refreshPending(p);
        try {
          p.uploaded = await IN.upload(file, (pct) => {
            const fill = S.nodes.get('p:' + p.cid)?.querySelector('.progress > span');
            if (fill) fill.style.width = pct + '%';
          });
        } catch (e) {
          p.state = 'failed';
          p.error = e.message;
          refreshPending(p);
          IN.toast(e.message);
          return;
        }
        await send(p, { body: '', files: [p.uploaded.id] });
      };
      p.retry = () => (p.uploaded ? send(p, { body: '', files: [p.uploaded.id] }) : upload());
      S.pending.push(p);
      render({ bottom: true });
      upload();
    }

    function updateSendBtn() {
      sendBtn.disabled = input.value.trim() === '';
    }
    function autosize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
    }
    input.addEventListener('input', () => {
      updateSendBtn();
      autosize();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      autosize();
      updateSendBtn();
      sendText(text);
    });

    // PC: Enter 보내기, Shift+Enter 줄바꿈 / 모바일: Enter는 줄바꿈
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      if (IN.isTouch) return;
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // 보내기 버튼을 눌러도 키보드가 내려가지 않도록
    sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());

    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []).slice(0, 10);
      fileInput.value = '';
      for (const f of files) {
        if (S.maxBytes && f.size > S.maxBytes) {
          IN.toast(`${f.name}: 파일이 너무 커요. (최대 ${fmtBytes(S.maxBytes)})`);
          continue;
        }
        sendFile(f);
      }
    });

    // ---------- 채팅방 메뉴 ----------
    const sheet = document.querySelector('[data-room-sheet]');
    const menuBtn = document.querySelector('[data-room-menu]');
    if (sheet && menuBtn) {
      menuBtn.addEventListener('click', () => (sheet.showModal ? sheet.showModal() : sheet.setAttribute('open', '')));
      sheet.addEventListener('click', (e) => {
        if (e.target === sheet || e.target.closest('[data-close]')) sheet.close ? sheet.close() : sheet.removeAttribute('open');
      });
      const leave = sheet.querySelector('[data-leave]');
      if (leave) {
        leave.addEventListener('click', async () => {
          if (!confirm('채팅방을 나갈까요? 대화 내용을 더 이상 볼 수 없어요.')) return;
          try {
            await IN.api('leave.php', { method: 'POST', json: { c: S.c } });
            location.href = IN.url('chat.php');
          } catch (e) {
            IN.toast(e.message);
          }
        });
      }
    }

    // ---------- 시작 / 정리 ----------
    poller.start();
    return () => {
      poller.stop();
      if (vv) {
        vv.removeEventListener('resize', fit);
        vv.removeEventListener('scroll', fit);
      }
      window.removeEventListener('resize', fit);
      document.removeEventListener('visibilitychange', onVisible);
      S.pending.forEach((p) => (p.files || []).forEach((f) => f.local_url && URL.revokeObjectURL(f.local_url)));
      document.documentElement.style.removeProperty('--app-h');
      document.documentElement.style.removeProperty('--app-top');
    };
  }
})();
