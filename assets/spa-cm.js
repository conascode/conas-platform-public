/* 커뮤니티: 게시판 · 글 · 채널 · 임직원 / DM · 대화방 */
(() => {
  'use strict';
  const { esc, ic } = A;
  const me = () => A.data.me;

  // ==================================================================
  // 게시판 목록
  // ==================================================================
  const B = { board: null, posts: [], hasMore: false, info: null };

  A.views['cm-board'] = async (main, r, alive) => {
    const boards = A.data.boards;
    if (!boards.length) {
      main.innerHTML = '<div class="empty" style="padding:60px 0">아직 게시판이 없어요</div>';
      return;
    }
    if (r.id) B.board = r.id;
    if (!boards.find((b) => b.id === B.board)) B.board = boards[0].id;
    const d = await A.api('posts', { board_id: B.board });
    if (!alive()) return;
    B.info = d.board;
    B.posts = d.posts;
    B.hasMore = d.has_more;
    drawBoard(main);
    setFab();
  };

  /** 글쓰기 버튼: 이미 있으면 그대로 두고 주소만 바꿈 (게시판을 옮겨도 다시 그려지지 않게) */
  function setFab() {
    const fab = A.$('#fab');
    if (!B.info.can_write) {
      fab.innerHTML = '';
      return;
    }
    const btn = fab.querySelector('.fab');
    if (btn) btn.dataset.go = `cm/write/${B.board}`;
    else fab.innerHTML = `<button class="fab" data-go="cm/write/${B.board}">${ic('pen', 18, 2.2)}글쓰기</button>`;
  }

  /** 목록에는 제목만 (내용 · 사진 미리보기 없음: 목록을 볼 때 사진을 받지 않아 데이터를 아낌) */
  function postRow(p) {
    return `<button class="post" data-go="cm/post/${p.id}"><div class="post-in"><div class="grow">
      ${p.pinned ? '<span class="tag primary">고정</span>' : ''}
      <h4>${esc(p.title)}</h4>
      <div class="meta"><span>${esc(p.author)} · ${A.ago(p.ts)}</span>
        <span class="lk ${p.likes >= 10 ? 'hot' : ''}">${ic('heart', 13, 2.2)}${p.likes}</span>
        <span class="lk">${ic('comment', 13, 2.2)}${p.comments}</span>
        ${p.files ? `<span class="lk">${ic('clip', 13, 2.2)}${p.files}</span>` : ''}
      </div></div></div></button>`;
  }

  // 화면 틀(제목 · 게시판 버튼)은 처음 한 번만 그리고, 게시판을 옮기면 목록(#boardBody)만 바꿈
  function drawBoard(main) {
    main.innerHTML = `
      <div class="page-h"><div><h2>게시판</h2><p id="boardDesc">${esc(B.info.description || '')}</p></div></div>
      <div class="chips" id="boardTabs">${A.data.boards.map((x) => `<button class="chip ${x.id === B.board ? 'on' : ''}" data-act="board-tab" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
      <div id="boardBody">${boardBody()}</div>`;
  }
  function boardBody() {
    return `${B.info.anonymous ? `<p class="board-note">${ic('eye', 15)}익명 게시판이에요. 글과 댓글에 이름이 보이지 않아요.</p>` : ''}
      <section class="card">
        ${B.posts.map(postRow).join('') || '<div class="empty">아직 글이 없어요. 첫 글을 써보세요!</div>'}
        ${B.hasMore ? '<button class="done-toggle" data-act="posts-more">더 보기</button>' : ''}
      </section>`;
  }

  // 게시판 버튼: 주소만 바꾸고(기록은 남기지 않음) 목록만 새로 불러옴
  let tabSeq = 0;
  A.acts['board-tab'] = async (el) => {
    const id = Number(el.dataset.id);
    if (id === B.board) return;
    const seq = ++tabSeq;
    const prev = B.board;
    const pick = (bid) => {
      B.board = bid;
      A.$$('#boardTabs .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.id) === bid));
      history.replaceState(null, '', '#/cm/board/' + bid);
      if (A.route) A.route.id = bid;
    };
    pick(id);
    const body = A.$('#boardBody');
    body.classList.add('dim');
    let d;
    try {
      d = await A.api('posts', { board_id: id });
    } catch (e) {
      if (seq === tabSeq && A.isCurrent('cm-board')) pick(prev); // 못 불러오면 원래 게시판으로
      throw e;
    } finally {
      if (seq === tabSeq) body.classList.remove('dim');
    }
    if (seq !== tabSeq || !A.isCurrent('cm-board')) return;
    B.info = d.board;
    B.posts = d.posts;
    B.hasMore = d.has_more;
    A.$('#boardDesc').textContent = d.board.description || '';
    body.innerHTML = boardBody();
    setFab();
    A.$('#view').scrollTop = 0;
  };

  A.acts['posts-more'] = async (el) => {
    el.disabled = true;
    const d = await A.api('posts', { board_id: B.board, before: B.posts[B.posts.length - 1].id });
    B.posts = B.posts.concat(d.posts);
    B.hasMore = d.has_more;
    const main = A.$('#view');
    const s = main.scrollTop;
    A.$('#boardBody').innerHTML = boardBody();
    main.scrollTop = s;
  };

  // ==================================================================
  // 글 보기
  // ==================================================================
  const PV = { post: null, comments: [], replyTo: null };

  A.views.post = async (main, r, alive) => {
    const d = await A.api('post', { id: r.id });
    if (!alive()) return;
    PV.post = d.post;
    PV.comments = d.comments;
    PV.replyTo = null;
    const p = d.post;
    main.innerHTML = `
      <div class="sub-h">
        <button class="icon-btn" data-act="post-back" aria-label="뒤로">${ic('back', 24, 2)}</button>
        <div class="t"><b>${esc(p.board)}</b></div>
        ${p.can_edit || p.can_delete ? `<button class="icon-btn" data-act="post-menu" aria-label="더보기">${ic('settings', 20)}</button>` : ''}
      </div>
      <div class="scroll" id="postScroll">
        <article class="post-view">
          <div class="row" style="gap:10px">${A.avatar(p.anon ? { anon: true } : { name: p.author, av: p.av })}
            <div class="grow"><b class="t15">${esc(p.author)}</b><p class="t13 muted">${A.ago(p.ts)}${p.edited ? ' · 수정됨' : ''} · 조회 ${p.views}</p></div></div>
          <h1>${esc(p.title)}</h1>
          <div class="post-body">${A.linkify(p.body)}</div>
          ${filesHtml(p.files)}
          <button class="like-btn ${p.liked ? 'on' : ''}" data-act="post-like">${ic('heart', 16, 2.2)}공감 <span id="likeN">${p.likes}</span></button>
        </article>
        <section class="comments" id="cmts"></section>
      </div>
      ${
        p.allow_comments
          ? `<div class="reply-to" id="replyTo" hidden><span></span><button data-act="reply-cancel">${ic('x', 16)}</button></div>
        <form class="composer" data-form="comment" style="margin:0">
          <textarea name="body" rows="1" data-grow placeholder="${p.anon ? '익명으로 댓글 달기' : '댓글을 입력하세요'}" maxlength="3000" required></textarea>
          <button class="send" type="submit" aria-label="등록">${ic('send', 18, 2)}</button>
        </form>`
          : ''
      }`;
    drawComments();
    const ta = A.$('form[data-form="comment"] textarea');
    if (ta) ta.addEventListener('keydown', enterToSend);
  };

  function filesHtml(files) {
    if (!files || !files.length) return '';
    return `<div class="files">${files
      .map((f) =>
        f.is_image
          ? `<button type="button" class="img" data-view="${esc(f.view_url)}" data-dl="${esc(f.url)}" data-name="${esc(f.name)}"><img src="${esc(f.view_url)}" alt="${esc(f.name)}" loading="lazy"></button>`
          : `<a class="file-row" href="${esc(f.url)}">${ic('file', 18)}<b>${esc(f.name)}</b><span class="muted t13">${esc(f.size_text)}</span></a>`
      )
      .join('')}</div>`;
  }
  A.filesHtml = filesHtml;

  function drawComments() {
    const box = A.$('#cmts');
    if (!box) return;
    const top = PV.comments.filter((c) => !c.parent_id);
    const replies = (id) => PV.comments.filter((c) => c.parent_id === id);
    const one = (c, reply) => `<div class="cmt ${reply ? 'reply' : ''} ${PV.replyTo === c.id ? 'replying' : ''}" id="c${c.id}">
      ${c.deleted ? A.avatar({ anon: true }) : A.avatar(c.user_id ? { name: c.name, av: c.av } : { anon: true })}
      <div class="grow">
        ${c.deleted ? '<p class="del">삭제된 댓글이에요</p>' : `<div class="cmt-h"><b>${esc(c.name)}</b>${c.is_author && PV.post.anon ? '' : c.is_author ? '<span class="tag primary">글쓴이</span>' : ''}<span class="muted">${A.ago(c.ts)}</span></div>
        <p>${A.linkify(c.body)}</p>
        <div class="cmt-act">
          <button class="${c.liked ? 'on' : ''}" data-act="cmt-like" data-id="${c.id}">${ic('heart', 13, 2.2)}${c.likes || ''}</button>
          ${PV.post.allow_comments ? `<button data-act="cmt-reply" data-id="${c.id}">${ic('reply', 13, 2.2)}답글</button>` : ''}
          ${c.mine || me().is_admin ? `<button data-act="cmt-del" data-id="${c.id}">${ic('trash', 13, 2.2)}삭제</button>` : ''}
        </div>`}
      </div></div>`;
    box.innerHTML = PV.comments.length
      ? `<p class="t13 muted" style="padding:10px 0 2px;font-weight:700">댓글 ${PV.comments.filter((c) => !c.deleted).length}</p>` + top.map((c) => one(c) + replies(c.id).map((x) => one(x, true)).join('')).join('')
      : '<div class="empty">첫 댓글을 남겨보세요</div>';
  }

  function enterToSend(e) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229 || matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    if (e.target.value.trim()) e.target.form.requestSubmit();
  }

  A.acts['post-back'] = () => A.back('cm/board/' + PV.post.board_id);
  A.acts['post-like'] = async (el) => {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    const n = A.$('#likeN');
    n.textContent = Number(n.textContent) + (on ? 1 : -1);
    try {
      const d = await A.post('post.like', { id: PV.post.id, like: on });
      el.classList.toggle('on', d.liked);
      n.textContent = d.count;
    } catch (e) {
      el.classList.toggle('on', !on);
      A.err(e);
    }
  };
  A.acts['cmt-like'] = async (el) => {
    const c = PV.comments.find((x) => x.id === Number(el.dataset.id));
    const d = await A.post('comment.like', { id: c.id, like: !c.liked });
    c.liked = d.liked;
    c.likes = d.count;
    drawComments();
  };
  A.acts['cmt-reply'] = (el) => {
    const c = PV.comments.find((x) => x.id === Number(el.dataset.id));
    PV.replyTo = c.parent_id || c.id;
    const bar = A.$('#replyTo');
    bar.hidden = false;
    A.$('span', bar).textContent = `${c.name}님에게 답글`;
    drawComments();
    A.$('form[data-form="comment"] textarea').focus();
  };
  A.acts['reply-cancel'] = () => {
    PV.replyTo = null;
    A.$('#replyTo').hidden = true;
    drawComments();
  };
  A.acts['cmt-del'] = async (el) => {
    if (!(await A.ask({ title: '댓글 삭제', body: '이 댓글을 지울까요?', ok: '삭제', danger: true }))) return;
    const d = await A.post('comment.delete', { id: Number(el.dataset.id) });
    PV.comments = d.comments;
    drawComments();
  };
  A.forms.comment = async (f, d) => {
    const r = await A.post('comment.add', { post_id: PV.post.id, body: d.body, parent_id: PV.replyTo || 0 });
    PV.comments = r.comments;
    PV.replyTo = null;
    A.$('#replyTo').hidden = true;
    f.reset();
    const ta = A.$('textarea', f);
    ta.style.height = '';
    drawComments();
    const sc = A.$('#postScroll');
    sc.scrollTop = sc.scrollHeight;
  };
  A.acts['post-menu'] = () => {
    const p = PV.post;
    A.sheet.show(
      '글 관리',
      `${p.can_edit ? `<button class="menu-row" data-go="cm/edit/${p.id}">${ic('pen', 18)}<span class="grow">글 수정</span></button>` : ''}
      ${p.can_delete ? `<button class="menu-row" data-act="post-del" style="color:var(--danger)">${ic('trash', 18)}<span class="grow">글 삭제</span></button>` : ''}`
    );
  };
  A.acts['post-del'] = async () => {
    if (!(await A.ask({ title: '글 삭제', body: '이 글을 지울까요?', ok: '삭제', danger: true }))) return;
    await A.post('post.delete', { id: PV.post.id });
    A.toast('글을 지웠어요');
    A.go('cm/board/' + PV.post.board_id);
  };

  // ==================================================================
  // 글쓰기 · 수정
  // ==================================================================
  const W = { files: [], keep: [] };
  A.views.write = async (main, r, alive) => {
    let p = null;
    if (r.id) {
      p = (await A.api('post', { id: r.id, no_view: 1 })).post;
      if (!alive()) return;
    }
    const boardId = p ? p.board_id : r.boardId;
    const b = A.data.boards.find((x) => x.id === boardId);
    if (!b) throw new Error('게시판을 찾을 수 없어요.');
    W.files = [];
    W.keep = p ? p.files.map((f) => ({ id: f.id, name: f.name })) : [];
    main.innerHTML = `
      <div class="sub-h">
        <button class="icon-btn" data-act="write-back" data-to="${p ? 'cm/post/' + p.id : 'cm/board/' + boardId}" aria-label="뒤로">${ic('back', 24, 2)}</button>
        <div class="t"><b>${p ? '글 수정' : '글쓰기'}</b><small>${esc(b.name)}</small></div>
        <button class="btn sm" form="writeForm" type="submit">${p ? '저장' : '올리기'}</button>
      </div>
      <div class="scroll" style="padding:16px;background:var(--surface)">
        <form data-form="write" id="writeForm" data-board="${boardId}" ${p ? `data-id="${p.id}"` : ''}>
          ${b.anonymous ? `<p class="hint">${ic('eye', 14)} 익명으로 올라가요. 내 이름은 누구에게도 보이지 않아요.</p>` : ''}
          <div class="field"><input name="title" required maxlength="200" placeholder="제목" value="${esc(p ? p.title : '')}" style="font-size:17px;font-weight:700"></div>
          <div class="field"><textarea name="body" required class="tall" style="height:280px" placeholder="내용을 입력하세요">${esc(p ? p.body : '')}</textarea></div>
          ${
            b.allow_attachments
              ? `<div class="field"><label class="btn sm ghost" style="display:inline-flex;cursor:pointer">${ic('clip', 16)}파일 첨부<input type="file" multiple hidden id="writeFiles"></label><small>사진, 문서 최대 ${b.max_files}개</small></div>
            <div class="up-list" id="keepFiles"></div><div class="up-list" id="newFiles"></div>`
              : ''
          }
        </form>
      </div>`;
    const fi = A.$('#writeFiles');
    if (fi) {
      fi.addEventListener('change', () => A.uploadInto(fi, W.files, A.$('#newFiles')));
      A.drawUploads(W.keep.map((k) => ({ ...k, id: k.id })), A.$('#keepFiles'));
      A.$('#keepFiles').onclick = (e) => {
        const btn = e.target.closest('[data-up-del]');
        if (!btn) return;
        W.keep.splice(Number(btn.dataset.upDel), 1);
        A.drawUploads(W.keep, A.$('#keepFiles'));
      };
    }
  };
  A.acts['write-back'] = async (el) => {
    const f = A.$('#writeForm');
    const dirty = f && (f.title.value.trim() || f.body.value.trim()) && !f.dataset.id;
    if (dirty && !(await A.ask({ title: '나가기', body: '작성 중인 내용이 사라져요. 나갈까요?', ok: '나가기', danger: true }))) return;
    A.back(el.dataset.to);
  };
  A.forms.write = async (f, d) => {
    if (W.files.some((x) => !x.id)) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    const body = { board_id: Number(f.dataset.board), title: d.title, body: d.body, files: W.files.map((x) => x.id), keep_files: W.keep.map((x) => x.id) };
    if (f.dataset.id) body.id = Number(f.dataset.id);
    const r = await A.post('post.save', body);
    A.toast(f.dataset.id ? '글을 수정했어요' : '글을 올렸어요');
    history.replaceState(null, '', '#/cm/post/' + r.id);
    A.refresh();
  };

  // ==================================================================
  // 채널 · DM 목록
  // ==================================================================
  async function loadChats() {
    const d = await A.api('chats');
    A.cache.convType = A.cache.convType || {};
    d.channels.forEach((c) => (A.cache.convType[c.id] = 'channel'));
    d.dms.forEach((c) => (A.cache.convType[c.id] = c.type));
    return d;
  }

  A.views['cm-chan'] = async (main, r, alive) => {
    const d = await loadChats();
    if (!alive()) return;
    const joined = d.channels.filter((c) => c.joined);
    const others = d.channels.filter((c) => !c.joined);
    const row = (c) => `<button class="list-item" data-go="chat/${c.id}?from=cm">
      <span class="chan-ic">${ic('hash', 20, 2)}</span>
      <span class="grow"><span class="t15 block">${esc(c.name)} <span class="t13 muted" style="font-weight:500">${c.member_count}명</span></span>
        <span class="t13 muted ellipsis block">${c.joined && c.preview ? esc(c.last_name) + ': ' + esc(c.preview) : esc(c.description || '')}</span></span>
      ${c.unread ? `<span class="count">${c.unread > 99 ? '99+' : c.unread}</span>` : c.joined && c.preview ? `<span class="t13 muted">${A.ago(c.ts)}</span>` : c.joined ? '' : '<span class="st pri">참여하기</span>'}
    </button>`;
    main.innerHTML = `
      <div class="page-h"><div><h2>채널</h2><p>누구나 들어갈 수 있는 대화방이에요</p></div><button class="new-btn" data-act="chan-new">${ic('plus', 16, 2.2)}채널 만들기</button></div>
      <section class="card">${joined.map(row).join('') || '<div class="empty">참여 중인 채널이 없어요</div>'}</section>
      ${others.length ? `<section class="card"><div class="card-h"><h3>다른 채널</h3></div>${others.map(row).join('')}</section>` : ''}`;
  };
  A.acts['chan-new'] = (el) => {
    const c = el.dataset.id ? CH.info : null;
    A.sheet.show(
      c ? '채널 수정' : '채널 만들기',
      `<form data-form="chan-save">
        ${c ? `<input type="hidden" name="id" value="${c.id}">` : ''}
        <div class="field"><label>채널 이름</label><input name="name" required maxlength="50" value="${esc(c ? c.title : '')}" placeholder="예: 점심메뉴" autofocus></div>
        <div class="field"><label>설명 (선택)</label><input name="description" maxlength="255" value="${esc(c ? c.description || '' : '')}" placeholder="어떤 이야기를 나누는 곳인가요?"></div>
        <button class="btn" type="submit">${c ? '저장' : '만들기'}</button>
      </form>`
    );
  };
  A.forms['chan-save'] = async (f, d) => {
    const r = await A.post('channel.save', d);
    A.cache.convType = { ...(A.cache.convType || {}), [r.c]: 'channel' };
    A.toast(d.id ? '채널을 수정했어요' : '채널을 만들었어요');
    A.go(`chat/${r.c}?from=cm`);
  };

  // ==================================================================
  // DM 목록 (1:1 · 단체)
  // ==================================================================
  const DL = { q: '', list: [], timer: null };

  /** 단체방 사진: 참여자 최대 4명을 겹쳐서 */
  function groupAv(avs) {
    const list = (avs || []).slice(0, 4);
    if (!list.length) return `<span class="chan-ic">${ic('users', 20, 2)}</span>`;
    if (list.length === 1) return A.avatar(list[0]);
    return `<span class="av-group n${list.length}" aria-hidden="true">${list.map((a) => A.avatar(a)).join('')}</span>`;
  }
  A.groupAv = groupAv;

  function dmRow(c, i) {
    const av = c.type === 'dm' ? A.avatar({ name: c.title, av: c.av, online: c.online }) : groupAv(c.avs);
    const who = c.last_mine ? '나: ' : c.type === 'group' && c.last_name ? c.last_name + ': ' : '';
    return `<button class="dm-row ${c.unread ? 'unread' : ''}" data-go="chat/${c.id}" style="--i:${Math.min(i, 12)}">
      ${av}
      <span class="dm-main">
        <span class="dm-top"><b>${esc(c.title)}</b>${c.type === 'group' ? `<span class="dm-n">${c.member_count}</span>` : ''}<span class="dm-time">${c.preview ? A.ago(c.ts) : ''}</span></span>
        <span class="dm-bot"><span class="dm-prev">${c.preview ? esc(who + c.preview) : c.sub ? esc(c.sub) : '대화를 시작해 보세요'}</span>${c.unread ? `<span class="count">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</span>
      </span>
    </button>`;
  }

  function drawDmList(noAnim) {
    const box = A.$('#dmList');
    if (!box) return;
    const q = DL.q.trim().toLowerCase();
    const list = q ? DL.list.filter((c) => (c.title + ' ' + (c.sub || '')).toLowerCase().includes(q)) : DL.list;
    box.classList.toggle('no-anim', !!noAnim);
    box.innerHTML = list.map(dmRow).join('') || `<div class="empty">${q ? '찾는 대화가 없어요' : '아직 대화가 없어요.<br>새 대화를 눌러 시작해 보세요.'}</div>`;
  }

  A.views.dm = async (main, r, alive) => {
    const d = await loadChats();
    if (!alive()) return;
    DL.list = d.dms;
    main.innerHTML = `
      <div class="page-h"><div><h2>DM</h2><p>1:1 · 단체 대화</p></div><button class="new-btn" data-act="dm-new">${ic('pen', 16, 2.2)}새 대화</button></div>
      <label class="search">${ic('search', 20)}<input id="dmQ" placeholder="이름, 대화방 검색" value="${esc(DL.q)}" autocomplete="off"></label>
      <section class="card dm-list" id="dmList"></section>`;
    drawDmList();
    A.$('#dmQ').addEventListener('input', (e) => {
      DL.q = e.target.value;
      drawDmList(true);
    });
    // 목록 새로고침 (5초마다, 화면이 보일 때만)
    const tick = async () => {
      clearTimeout(DL.timer);
      if (!A.isCurrent('dm')) return;
      if (!document.hidden && !A.sheet.open) {
        try {
          const n = await loadChats();
          if (!A.isCurrent('dm')) return;
          if (JSON.stringify(n.dms) !== JSON.stringify(DL.list)) {
            DL.list = n.dms;
            drawDmList(true);
          }
        } catch (e) {
          /* 다음에 다시 */
        }
      }
      DL.timer = setTimeout(tick, 5000);
    };
    DL.timer = setTimeout(tick, 5000);
    A.onLeave(() => clearTimeout(DL.timer));
  };

  // ==================================================================
  // 대화 상대 고르기 (새 대화 · 초대)
  // ==================================================================
  const PK = { mode: 'new', sel: [], q: '', exclude: [] };

  function openPicker(mode) {
    PK.mode = mode;
    PK.sel = [];
    PK.q = '';
    PK.exclude = mode === 'invite' ? CH.info.members.map((m) => m.id) : [];
    const fromDm = mode === 'invite' && CH.info.type === 'dm';
    A.sheet.show(
      mode === 'invite' ? '대화 상대 초대' : '새 대화',
      `<label class="search pick-search">${ic('search', 20)}<input id="pkQ" placeholder="이름, 팀, 직급 검색" autocomplete="off"></label>
      <div class="pick-chips" id="pkChips"></div>
      <div id="pkList" class="pick-list2"></div>
      <div class="pick-foot">
        ${mode === 'new' ? `<div class="field" id="pkNameF" hidden><input id="pkName" maxlength="100" placeholder="단체방 이름 (선택)"></div>` : ''}
        ${fromDm ? `<p class="hint">지금 대화는 그대로 두고, 새 단체 대화방을 만들어요.</p>` : mode === 'invite' ? `<p class="hint">초대된 사람은 초대 전 대화를 볼 수 없어요.</p>` : ''}
        <button class="btn" id="pkGo" data-act="pk-go" disabled>대화 상대를 골라 주세요</button>
      </div>`
    );
    drawPickList();
    drawPickSel();
    A.$('#pkQ').addEventListener('input', (e) => {
      PK.q = e.target.value;
      drawPickList();
    });
  }

  function drawPickList() {
    const box = A.$('#pkList');
    if (!box) return;
    const q = PK.q.trim().toLowerCase();
    const people = A.data.members.filter((m) => m.id !== me().id && !PK.exclude.includes(m.id));
    const shown = q ? people.filter((m) => [m.name, m.team, m.position, A.ROLE[m.role]].join(' ').toLowerCase().includes(q)) : people;
    box.innerHTML =
      shown
        .map(
          (m) => `<button class="pick-row ${PK.sel.includes(m.id) ? 'on' : ''}" data-act="pk-toggle" data-id="${m.id}">
        ${A.avatar(m)}<span class="grow"><b class="t15">${esc(m.name)}</b><span class="t13 muted block">${esc(A.roleLabel(m))}</span></span>
        <span class="pick-check">${ic('check', 14, 3)}</span></button>`
        )
        .join('') || `<div class="empty">${people.length ? '찾는 사람이 없어요' : '초대할 수 있는 사람이 없어요'}</div>`;
  }

  function drawPickSel() {
    const chips = A.$('#pkChips');
    if (!chips) return;
    chips.innerHTML = PK.sel
      .map((id) => {
        const m = A.mem(id);
        return `<button class="pick-chip" data-act="pk-toggle" data-id="${id}">${A.avatar(m)}<span>${esc(m.name)}</span>${ic('x', 12, 3)}</button>`;
      })
      .join('');
    chips.classList.toggle('has', PK.sel.length > 0);
    const n = PK.sel.length;
    const go = A.$('#pkGo');
    const nameF = A.$('#pkNameF');
    if (nameF) nameF.hidden = n < 2;
    go.disabled = n === 0;
    if (!n) go.textContent = PK.mode === 'invite' ? '초대할 사람을 골라 주세요' : '대화 상대를 골라 주세요';
    else if (PK.mode === 'invite') go.textContent = `${n}명 초대하기`;
    else go.textContent = n === 1 ? `${A.mem(PK.sel[0]).name}님과 대화하기` : `${n + 1}명 단체 대화 만들기`;
  }

  A.acts['pk-toggle'] = (el) => {
    const id = Number(el.dataset.id);
    const i = PK.sel.indexOf(id);
    if (i >= 0) PK.sel.splice(i, 1);
    else PK.sel.push(id);
    A.$$('.pick-row[data-id="' + id + '"]').forEach((r) => r.classList.toggle('on', i < 0));
    drawPickSel();
  };

  A.acts['pk-go'] = async (el) => {
    if (!PK.sel.length) return;
    el.disabled = true;
    try {
      if (PK.mode === 'invite') {
        const r = await A.post('chat.invite', { c: CH.info.id, user_ids: PK.sel });
        if (r.new) {
          A.toast('새 단체 대화방을 만들었어요');
          A.cache.convType = { ...(A.cache.convType || {}), [r.c]: 'group' };
          A.go('chat/' + r.c);
        } else {
          A.sheet.close();
          A.toast('초대했어요');
          A.refresh();
        }
        return;
      }
      if (PK.sel.length === 1) return A.startDm(PK.sel[0]);
      const name = (A.$('#pkName') || {}).value || '';
      const r = await A.post('chat.group', { user_ids: PK.sel, name: name.trim() });
      A.cache.convType = { ...(A.cache.convType || {}), [r.c]: 'group' };
      A.go('chat/' + r.c);
    } catch (e) {
      el.disabled = false;
      A.err(e);
    }
  };

  A.acts['dm-new'] = () => openPicker('new');
  A.acts['dm-start'] = async (el) => {
    const r = await A.post('chat.dm', { user_id: Number(el.dataset.id) });
    A.cache.convType = { ...(A.cache.convType || {}), [r.c]: 'dm' };
    A.go('chat/' + r.c);
  };
  A.startDm = (uid) => A.acts['dm-start']({ dataset: { id: uid } });

  // ==================================================================
  // 대화방 (채널 · DM 공용)
  // ==================================================================
  const CH = { info: null, msgs: [], reads: {}, since: 0, changed: 0, hasMore: false, timer: null, pending: new Map() };

  /** 메시지 반응 (서버 MSG_REACTIONS 와 같은 순서) */
  const REACT = [
    ['heart', '❤️', '좋아요'],
    ['like', '👍', '최고예요'],
    ['check', '✅', '확인했어요'],
    ['laugh', '😆', '웃겨요'],
    ['wow', '😮', '놀라워요'],
    ['sad', '😥', '슬퍼요'],
  ];
  const REACT_EMOJI = Object.fromEntries(REACT.map(([k, e]) => [k, e]));
  /** 반응 중 내가 누른 것 */
  const myRx = (m) => Object.keys(m.rx || {}).find((k) => (m.rx[k] || []).includes(me().id)) || null;
  /** 반응 누르기: 같은 걸 누르면 취소, 다른 걸 누르면 바꿈 (한 사람당 하나) */
  function toggleRx(rx, key, uid) {
    const out = {};
    const had = (rx[key] || []).includes(uid);
    for (const k in rx) {
      const list = (rx[k] || []).filter((x) => x !== uid);
      if (list.length) out[k] = list;
    }
    if (!had) out[key] = (out[key] || []).concat(uid);
    return out;
  }

  function chatHead(info) {
    if (info.type === 'channel') {
      return `<button class="chat-who" data-act="chat-info"><span class="chan-ic" style="width:36px;height:36px">${ic('hash', 18, 2)}</span><span class="t"><b>${esc(info.title)}</b><small>${esc(info.description || info.members.length + '명 참여 중')}</small></span></button>`;
    }
    if (info.type === 'dm' && info.other) {
      const o = info.other;
      const status = o.left ? '대화방을 나갔어요 · 메시지를 보내면 다시 들어와요' : (o.online ? '● 접속 중' : '오프라인') + (o.team || o.role ? ' · ' + A.roleLabel(o) : '');
      return `<button class="chat-who" data-act="person" data-id="${o.id}">${A.avatar(o)}<span class="t"><b>${esc(info.title)}</b><small class="${o.online && !o.left ? 'on' : ''}">${esc(status)}</small></span></button>`;
    }
    const others = info.members.filter((m) => m.id !== me().id);
    return `<button class="chat-who" data-act="chat-info">${groupAv(others)}<span class="t"><b>${esc(info.title)}</b><small>${info.members.length}명</small></span></button>`;
  }

  A.views.chat = async (main, r, alive) => {
    const c = r.id;
    const info = await A.api('chat.info', { c });
    if (!alive()) return;
    CH.info = info;
    A.cache.convType = { ...(A.cache.convType || {}), [c]: info.type };
    const back = info.type === 'channel' ? 'cm/chan' : 'dm';
    main.innerHTML = `
      <div class="sub-h chat-h">
        <button class="icon-btn" data-act="chat-back" data-to="${back}" aria-label="뒤로">${ic('back', 24, 2)}</button>
        ${chatHead(info)}
        ${info.joined ? `<button class="icon-btn" data-act="chat-info" aria-label="대화방 정보">${ic('more', 22)}</button>` : ''}
      </div>
      <div class="msgs" id="msgs"></div>
      ${
        info.joined
          ? `<form class="composer chat-composer" data-form="chat-send" style="margin:0">
          <label class="attach" aria-label="파일 보내기">${ic('plus', 22, 2.2)}<input type="file" multiple hidden id="chatFiles"></label>
          <textarea name="body" rows="1" data-grow placeholder="메시지 입력" maxlength="5000"></textarea>
          <button class="send" type="submit" aria-label="보내기" disabled>${ic('send', 18, 2)}</button>
        </form>`
          : `<div class="join-bar"><button class="btn" data-act="chat-join">${ic('plus', 18, 2.4)}#${esc(info.title)} 채널 참여하기</button></div>`
      }`;
    if (!info.joined) {
      A.$('#msgs').innerHTML = `<div class="empty" style="margin:auto">${esc(info.description || '')}<br>참여하면 대화를 볼 수 있어요</div>`;
      return;
    }
    const d = await A.legacy('messages.php', { c });
    if (!alive()) return;
    CH.msgs = d.messages;
    CH.reads = d.reads || {};
    CH.since = d.since || 0;
    CH.changed = d.now || Math.floor(Date.now() / 1000);
    CH.hasMore = d.has_more;
    drawMsgs(true);
    bindMsgPress(A.$('#msgs'));
    markRead();
    const form = A.$('form[data-form="chat-send"]');
    const ta = A.$('textarea', form);
    const send = A.$('.send', form);
    ta.addEventListener('keydown', enterToSend);
    ta.addEventListener('input', () => (send.disabled = !ta.value.trim()));
    A.$('#chatFiles').addEventListener('change', onChatFiles);
    // 새 메시지 · 읽음 확인 (3초마다, 화면이 보일 때만)
    const tick = async () => {
      clearTimeout(CH.timer);
      if (!A.isCurrent('chat') || A.route.id !== c) return;
      if (!document.hidden) {
        try {
          const p = await A.legacy('poll.php', { since: CH.since, c, active: 1, changed: CH.changed });
          if (!A.isCurrent('chat') || A.route.id !== c) return;
          let changed = false;
          // 다른 사람이 누른 반응 · 삭제한 메시지 반영
          if (p.now) CH.changed = p.now - 1; // 같은 초에 바뀐 것을 놓치지 않게 1초 겹쳐서 확인
          if (p.changed && p.changed.length) {
            let diff = false;
            for (const nm of p.changed) {
              const i = CH.msgs.findIndex((x) => x.id === nm.id);
              if (i < 0) continue;
              const om = CH.msgs[i];
              if (om.deleted !== nm.deleted || JSON.stringify(om.rx || {}) !== JSON.stringify(nm.rx || {})) {
                CH.msgs[i] = { ...om, ...nm };
                diff = true;
              }
            }
            if (diff) redrawKeep();
          }
          if (p.messages && p.messages.length) {
            CH.since = Math.max(CH.since, ...p.messages.map((m) => m.id));
            const mine = p.messages.filter((m) => m.c === c && !CH.msgs.some((x) => x.id === m.id) && !(m.cid && CH.pending.has(m.cid)));
            if (mine.length) {
              mine.forEach((m) => (m.pop = true));
              CH.msgs = CH.msgs.concat(mine);
              // 누가 들어오거나 나가면 머리글 · 참여자 정보도 새로
              if (mine.some((m) => m.sys)) refreshInfo();
              drawMsgs(nearBottom());
              markRead();
              changed = true;
            }
          }
          if (p.reads) {
            const before = JSON.stringify(CH.reads);
            CH.reads = p.reads;
            if (!changed && JSON.stringify(CH.reads) !== before) updateCounts();
          }
        } catch (e) {
          /* 다음에 다시 */
        }
      }
      CH.timer = setTimeout(tick, 3000);
    };
    CH.timer = setTimeout(tick, 3000);
    A.onLeave(() => clearTimeout(CH.timer));
    // 1:1 대화방: 상대 접속 상태가 바뀌면 머리글 다시 그림
    const onPresence = (e) => {
      const o = CH.info && CH.info.other;
      if (!o || !A.isCurrent('chat') || !e.detail.changed.includes(o.id)) return;
      o.online = e.detail.online.has(o.id);
      const who = A.$('.chat-h .chat-who');
      if (who) who.outerHTML = chatHead(CH.info);
    };
    document.addEventListener('a:presence', onPresence);
    A.onLeave(() => document.removeEventListener('a:presence', onPresence));
  };

  async function refreshInfo() {
    try {
      const info = await A.api('chat.info', { c: CH.info.id });
      if (!A.isCurrent('chat') || A.route.id !== info.id) return;
      CH.info = info;
      const who = A.$('.chat-h .chat-who');
      if (who) who.outerHTML = chatHead(info);
    } catch (e) {
      /* ignore */
    }
  }

  const nearBottom = () => {
    const b = A.$('#msgs');
    return !b || b.scrollHeight - b.scrollTop - b.clientHeight < 120;
  };
  function markRead() {
    const last = CH.msgs.filter((m) => m.id > 0).pop();
    if (!last) return;
    CH.reads[me().id] = Math.max(CH.reads[me().id] || 0, last.id);
    A.legacy('read.php', { c: CH.info.id, last_id: last.id }, true).catch(() => {});
  }

  /** 이 메시지를 아직 안 읽은 사람 수 (보낸 사람 제외, 카카오톡처럼) */
  function unreadOf(m) {
    if (m.sys || m.id <= 0) return 0;
    let n = 0;
    for (const uid in CH.reads) {
      if (Number(uid) !== m.uid && CH.reads[uid] < m.id) n++;
    }
    return n;
  }
  function updateCounts() {
    A.$$('#msgs [data-mid]').forEach((el) => {
      const m = CH.msgs.find((x) => x.id === Number(el.dataset.mid));
      const rc = A.$('.rc', el);
      if (!m || !rc) return;
      const n = unreadOf(m);
      if (String(n || '') !== rc.textContent) {
        rc.textContent = n || '';
        rc.classList.remove('tick');
        void rc.offsetWidth;
        rc.classList.add('tick');
      }
    });
  }

  function fileHtml(f) {
    if (f.is_image) {
      return `<button type="button" class="imgs" data-view="${esc(f.view_url)}" data-dl="${esc(f.url)}" data-name="${esc(f.name)}"><img src="${esc(f.view_url)}" alt="${esc(f.name)}" loading="lazy"></button>`;
    }
    return `<a class="file-row" href="${esc(f.url)}">${ic('file', 16)}<b>${esc(f.name)}</b><span class="muted t13">${esc(f.size_text || '')}</span></a>`;
  }

  function drawMsgs(toBottom) {
    const box = A.$('#msgs');
    if (!box) return;
    let html = CH.hasMore ? '<button class="more-msgs" data-act="chat-more">이전 메시지 더 보기</button>' : '';
    let lastDay = '';
    const list = CH.msgs;
    list.forEach((m, i) => {
      const d = new Date(m.ts * 1000);
      const day = A.iso(d);
      const prev = list[i - 1];
      const next = list[i + 1];
      if (day !== lastDay) {
        html += `<div class="day-div"><span>${d.getFullYear()}년 ${A.md(d)}</span></div>`;
        lastDay = day;
      }
      const pop = m.pop ? ' pop' : '';
      delete m.pop;
      if (m.sys) {
        html += `<div class="sys-msg${pop}"><span>${esc(m.body)}</span></div>`;
        return;
      }
      const sameDay = (x) => x && A.iso(new Date(x.ts * 1000)) === day;
      // 같은 사람이 1분 안에 이어서 보낸 메시지는 묶음
      const cont = prev && !prev.sys && prev.uid === m.uid && sameDay(prev) && A.hm(prev.ts) === A.hm(m.ts);
      const showTime = !(next && !next.sys && next.uid === m.uid && sameDay(next) && A.hm(next.ts) === A.hm(m.ts));
      const mine = m.uid === me().id;
      const files = (m.files || []).map(fileHtml).join('');
      const rx = m.deleted ? '' : rxHtml(m);
      const body = m.deleted
        ? `<div class="bubble msg-del">${ic('x', 14, 2.4)}삭제된 메시지예요</div>`
        : `${m.body ? `<div class="bubble msg-body">${A.linkify(m.body)}</div>` : ''}${files}${rx}`;
      const n = unreadOf(m);
      const side = `<span class="msg-side"><span class="rc">${n || ''}</span>${m.sending ? '<span class="time">보내는 중</span>' : showTime ? `<span class="time">${A.hm(m.ts)}</span>` : ''}</span>`;
      const row = `<div class="bubble-row"><div class="bubble-stack">${body}</div>${side}</div>`;
      if (mine) {
        html += `<div class="msg me${cont ? ' cont' : ''}${m.sending ? ' sending' : ''}${pop}" data-mid="${m.id}">${row}</div>`;
      } else if (cont) {
        html += `<div class="msg cont${pop}" data-mid="${m.id}">${row}</div>`;
      } else {
        const who = A.mem(m.uid) || { name: m.name, av: m.av };
        html += `<div class="msg${pop}" data-mid="${m.id}">
          <button type="button" class="msg-av" data-act="person" data-id="${m.uid}" aria-label="${esc(m.name)} 프로필">${A.avatar(who)}</button>
          <div class="msg-col"><button type="button" class="name" data-act="person" data-id="${m.uid}">${esc(m.name)}</button>${row}</div></div>`;
      }
    });
    if (!CH.msgs.length) html += '<div class="empty chat-empty">아직 메시지가 없어요<br>먼저 인사해 보세요 👋</div>';
    box.innerHTML = html;
    if (toBottom) box.scrollTop = box.scrollHeight;
  }

  /** 말풍선 아래 반응 (❤️ 2  😥 1). 누르면 나도 같은 반응 / 다시 누르면 취소 */
  function rxHtml(m) {
    const rx = m.rx || {};
    const mine = myRx(m);
    const pills = REACT.filter(([k]) => (rx[k] || []).length)
      .map(([k, e]) => `<button type="button" class="rx-pill ${mine === k ? 'on' : ''}" data-act="msg-rx" data-mid="${m.id}" data-r="${k}">${e}<b>${rx[k].length}</b></button>`)
      .join('');
    return pills ? `<div class="rx-row">${pills}</div>` : '';
  }

  /** 다시 그리되 보던 위치는 그대로 (맨 아래를 보고 있었으면 맨 아래로) */
  function redrawKeep() {
    const box = A.$('#msgs');
    if (!box) return;
    const bottom = nearBottom();
    const st = box.scrollTop;
    drawMsgs(false);
    box.scrollTop = bottom ? box.scrollHeight : st;
  }

  /**
   * 메시지 길게 누르기(휴대폰) · 오른쪽 클릭(컴퓨터) → 반응 · 복사 · 삭제 메뉴
   */
  function bindMsgPress(box) {
    if (!box) return;
    let timer = null;
    let sx = 0;
    let sy = 0;
    let fired = false;
    let lastOpen = 0;
    const hit = (e) => {
      const row = e.target.closest('[data-mid]');
      if (!row || !e.target.closest('.bubble, .imgs, .file-row')) return null;
      return Number(row.dataset.mid);
    };
    const open = (id) => {
      if (Date.now() - lastOpen < 700) return;
      lastOpen = Date.now();
      openMsgMenu(id);
    };
    box.addEventListener(
      'touchstart',
      (e) => {
        const id = hit(e);
        fired = false;
        if (!id) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        clearTimeout(timer);
        timer = setTimeout(() => {
          fired = true;
          if (navigator.vibrate) navigator.vibrate(12);
          open(id);
        }, 450);
      },
      { passive: true }
    );
    box.addEventListener(
      'touchmove',
      (e) => {
        if (timer && (Math.abs(e.touches[0].clientX - sx) > 10 || Math.abs(e.touches[0].clientY - sy) > 10)) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { passive: true }
    );
    box.addEventListener('touchend', (e) => {
      clearTimeout(timer);
      timer = null;
      if (fired && e.cancelable) e.preventDefault(); // 길게 누른 뒤 손을 떼도 사진 열기 등이 눌리지 않게
    });
    box.addEventListener('contextmenu', (e) => {
      const id = hit(e);
      if (!id) return;
      e.preventDefault();
      open(id);
    });
  }

  function openMsgMenu(id) {
    const m = CH.msgs.find((x) => x.id === id);
    if (!m || m.id <= 0 || m.sys || m.deleted) return;
    const mine = myRx(m);
    const who = REACT.filter(([k]) => (m.rx && m.rx[k] || []).length)
      .map(([k, e]) => `<p class="rx-who"><span>${e}</span>${esc(m.rx[k].map((uid) => (uid === me().id ? '나' : (A.mem(uid) || {}).name || '(알 수 없음)')).join(', '))}</p>`)
      .join('');
    A.sheet.show(
      '',
      `<div class="rx-bar">${REACT.map(([k, e, label]) => `<button type="button" class="${mine === k ? 'on' : ''}" data-act="msg-rx" data-mid="${m.id}" data-r="${k}" aria-label="${label}">${e}</button>`).join('')}</div>
      ${who ? `<div class="rx-whos">${who}</div>` : ''}
      <div class="msg-menu">
        ${m.body ? `<button class="menu-row" data-act="msg-copy" data-mid="${m.id}">${ic('file', 18)}<span class="grow">복사</span></button>` : ''}
        ${m.uid === me().id ? `<button class="menu-row danger-row" data-act="msg-del" data-mid="${m.id}">${ic('trash', 18)}<span class="grow">삭제</span></button>` : ''}
      </div>`
    );
  }

  A.acts['msg-rx'] = async (el) => {
    const id = Number(el.dataset.mid);
    const key = el.dataset.r;
    const m = CH.msgs.find((x) => x.id === id);
    if (!m || m.deleted) return;
    if (A.sheet.open) A.sheet.close();
    const before = m.rx || {};
    m.rx = toggleRx(before, key, me().id); // 먼저 화면에 반영
    redrawKeep();
    try {
      const r = await A.post('msg.react', { id, reaction: key });
      m.rx = r.rx || {};
    } catch (e) {
      m.rx = before;
      A.err(e);
    }
    if (A.isCurrent('chat')) redrawKeep();
  };
  A.acts['msg-copy'] = async (el) => {
    const m = CH.msgs.find((x) => x.id === Number(el.dataset.mid));
    A.sheet.close();
    if (!m) return;
    try {
      await navigator.clipboard.writeText(m.body);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = m.body;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    A.toast('복사했어요');
  };
  A.acts['msg-del'] = async (el) => {
    const id = Number(el.dataset.mid);
    if (!(await A.ask({ title: '메시지 삭제', body: '이 메시지를 삭제할까요?\n대화 상대 모두에게 "삭제된 메시지예요"로 보여요.', ok: '삭제', danger: true }))) return;
    await A.post('msg.delete', { id });
    const m = CH.msgs.find((x) => x.id === id);
    if (m) Object.assign(m, { deleted: true, body: '', files: [], rx: {} });
    if (A.isCurrent('chat')) redrawKeep();
    A.toast('메시지를 삭제했어요');
  };

  A.acts['chat-more'] = async (el) => {
    el.disabled = true;
    const box = A.$('#msgs');
    const h = box.scrollHeight;
    const first = CH.msgs.find((m) => m.id > 0);
    const d = await A.legacy('messages.php', { c: CH.info.id, before: first ? first.id : 0 });
    CH.msgs = d.messages.concat(CH.msgs);
    CH.hasMore = d.has_more;
    drawMsgs(false);
    box.scrollTop = box.scrollHeight - h;
  };

  async function sendMsg(body, files) {
    const cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const temp = { id: -Date.now(), uid: me().id, body, files: [], ts: Math.floor(Date.now() / 1000), sending: true, cid, pop: true };
    CH.pending.set(cid, temp);
    CH.msgs.push(temp);
    drawMsgs(true);
    try {
      const r = await A.legacy('send.php', { c: CH.info.id, body, cid, files }, true);
      const i = CH.msgs.indexOf(temp);
      if (r.message && !CH.msgs.some((m) => m.id === r.message.id)) CH.msgs[i] = r.message;
      else CH.msgs.splice(i, 1);
      if (r.message) {
        CH.since = Math.max(CH.since, r.message.id);
        CH.reads[me().id] = r.message.id;
      }
      // 나간 상대가 다시 들어왔으면 머리글 새로
      if (CH.info.other && CH.info.other.left) refreshInfo();
    } catch (e) {
      CH.msgs.splice(CH.msgs.indexOf(temp), 1);
      A.err(e);
    }
    CH.pending.delete(cid);
    if (A.isCurrent('chat')) drawMsgs(true);
  }
  A.forms['chat-send'] = async (f, d) => {
    const body = (d.body || '').trim();
    if (!body) return;
    f.reset();
    const ta = A.$('textarea', f);
    ta.style.height = '';
    ta.focus();
    A.$('.send', f).disabled = true;
    sendMsg(body, []);
  };
  async function onChatFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    for (const file of files) {
      A.toast(`${file.name} 올리는 중…`);
      try {
        const r = await A.upload(file);
        await sendMsg('', [r.id]);
      } catch (err) {
        A.err(err);
      }
    }
  }
  A.acts['chat-back'] = (el) => A.back(el.dataset.to);
  A.acts['chat-join'] = async () => {
    await A.post('chat.join', { c: CH.info.id });
    A.toast('채널에 참여했어요');
    A.refresh();
  };

  // 대화방 정보 시트: 참여자(누르면 프로필) · 초대 · 이름 바꾸기 · 나가기
  A.acts['chat-info'] = () => {
    const c = CH.info;
    const title = c.type === 'channel' ? '#' + c.title : c.type === 'dm' ? '대화 정보' : c.title;
    const kickable = (m) => c.can_kick && m.id !== me().id;
    const memRow = (m) => {
      const row = `<button class="list-item" data-act="person" data-id="${m.id}">${A.avatar(m)}<span class="grow"><b class="t15">${esc(m.name)}</b>${m.id === me().id ? ' <span class="tag">나</span>' : ''}<span class="t13 muted block">${esc(m.gone ? '퇴사 · 정지된 계정' : A.roleLabel(m))}</span></span>${kickable(m) ? '' : ic('chevR', 18)}</button>`;
      // 관리자: 채널 참여자 옆에 내보내기 버튼
      return kickable(m)
        ? `<div class="mem-line">${row}<button class="btn sm danger" data-act="chan-kick" data-id="${m.id}">내보내기</button></div>`
        : row;
    };
    const people = c.type === 'dm' && c.other && c.other.left ? c.members.concat([c.other]) : c.members;
    A.sheet.show(
      title,
      `${c.description ? `<p class="desc-box" style="margin-top:0">${esc(c.description)}</p>` : ''}
      ${c.can_invite ? `<button class="list-item invite-row" data-act="chat-invite"><span class="chan-ic c-primary">${ic('userPlus', 20, 2)}</span><span class="grow t15"><b>대화 상대 초대</b>${c.type === 'dm' ? '<span class="t13 muted block">새 단체 대화방이 만들어져요</span>' : ''}</span></button>` : ''}
      <p class="t13 muted" style="margin:14px 0 4px;font-weight:700">대화 상대 ${people.length}명</p>
      ${people.map(memRow).join('')}
      <div class="btn-row" style="margin-top:16px">
        ${c.can_edit && c.type === 'channel' ? `<button class="btn ghost" data-act="chan-new" data-id="${c.id}">${ic('pen', 18)}수정</button>` : ''}
        ${c.can_edit && c.type === 'group' ? `<button class="btn ghost" data-act="chat-rename">${ic('pen', 18)}방 이름</button>` : ''}
        ${c.joined ? `<button class="btn danger" data-act="chat-leave">${ic('logout', 18)}나가기</button>` : ''}
      </div>`
    );
  };
  A.acts['chan-kick'] = async (el) => {
    const id = Number(el.dataset.id);
    const m = CH.info.members.find((x) => x.id === id);
    const name = m ? m.name : '이 사람';
    if (!(await A.ask({ title: '내보내기', body: `${name}님을 #${CH.info.title} 채널에서 내보낼까요?\n본인이 원하면 다시 참여할 수 있어요.`, ok: '내보내기', danger: true }))) return;
    try {
      await A.post('chat.kick', { c: CH.info.id, user_id: id });
    } catch (e) {
      return A.err(e);
    }
    A.toast(`${name}님을 내보냈어요`);
    await refreshInfo();
    A.acts['chat-info']();
  };
  A.acts['chat-invite'] = () => openPicker('invite');
  A.acts['chat-rename'] = () => {
    A.sheet.show(
      '방 이름',
      `<form data-form="chat-rename">
        <div class="field"><input name="name" maxlength="100" value="${esc(CH.info.name || '')}" placeholder="비워두면 참여자 이름으로 보여요" autofocus></div>
        <button class="btn" type="submit">저장</button>
      </form>`
    );
  };
  A.forms['chat-rename'] = async (f, d) => {
    await A.post('chat.rename', { c: CH.info.id, name: d.name });
    A.sheet.close();
    A.toast('방 이름을 바꿨어요');
    A.refresh();
  };
  A.acts['chat-leave'] = async () => {
    const t = CH.info.type;
    const body =
      t === 'channel'
        ? '이 채널에서 나갈까요? 언제든 다시 참여할 수 있어요.'
        : t === 'dm'
          ? '내 대화 목록에서 사라지고 대화 내용도 더 볼 수 없어요.\n상대방의 대화방은 그대로 남아요.\n다시 대화하면 그 뒤 메시지부터 보여요.'
          : '나가면 이 방의 대화를 더 볼 수 없어요.\n다시 초대받으면 그 뒤 대화부터 보여요.';
    if (!(await A.ask({ title: '나가기', body, ok: '나가기', danger: true }))) return;
    await A.post('chat.leave', { c: CH.info.id });
    A.toast('대화방에서 나왔어요');
    A.go(t === 'channel' ? 'cm/chan' : 'dm');
  };

  // ==================================================================
  // 임직원: 조직도 · 검색 · 대표 인사 변경
  // ==================================================================
  const PP = { q: '' };
  A.views['cm-people'] = async (main) => {
    await A.loadData();
    drawPeople(main);
  };
  function personRow(m) {
    return `<button class="list-item" data-act="person" data-id="${m.id}">
      ${A.avatar(m)}
      <span class="grow"><b class="t15">${esc(m.name)}</b> <span class="t13 muted">${esc(m.position || '')}</span>${m.id === me().id ? ' <span class="tag">나</span>' : ''}
        <span class="t13 muted ellipsis block">${esc(m.team || (m.role === 'ceo' ? '대표' : '소속 없음'))}${m.phone ? ' · ' + esc(m.phone) : ''}</span></span>
      ${m.role !== 'member' ? `<span class="tag primary">${A.ROLE[m.role]}</span>` : ''}
    </button>`;
  }
  /**
   * 임직원 화면에 보일 사람
   *  팀에 배정되지 않은 사람(대표 제외)은 대표 · 관리자에게만 보임. 본인은 항상 보임
   */
  function peopleVisible() {
    const all = A.data.members;
    if (me().can_manage) return all;
    return all.filter((m) => m.role === 'ceo' || m.team_id || m.id === me().id);
  }
  function peopleRes() {
    const q = PP.q.trim().toLowerCase();
    const all = peopleVisible();
    if (q) {
      const r = all.filter((m) => [m.name, m.team, A.ROLE[m.role], m.position, m.email, m.phone, m.username].join(' ').toLowerCase().includes(q));
      return `<section class="card"><div class="card-h"><h3>검색 결과</h3><span class="t13 muted">${r.length}명</span></div>${r.map(personRow).join('') || '<div class="empty">찾는 사람이 없어요</div>'}</section>`;
    }
    const ceo = all.filter((m) => m.role === 'ceo');
    const noTeam = all.filter((m) => m.role !== 'ceo' && !m.team_id);
    const teams = A.data.teams.map((t) => ({ ...t, ms: all.filter((m) => m.team_id === t.id && m.role !== 'ceo') }));
    return `<section class="card">
      <div class="card-h"><h3>조직도</h3><span class="t13 muted">팀 ${teams.length}개</span></div>
      ${ceo.map((c) => `<button class="org-top" data-act="person" data-id="${c.id}">${A.avatar(c)}<div class="grow"><b class="t15">CONAS</b><p class="t13 muted">대표 ${esc(c.name)}</p></div>${ic('chevR', 18)}</button>`).join('')}
      <div class="org-tree">
        ${teams.map((t) => `<div class="org-team"><div class="org-team-h"><span>${esc(t.name)}</span><span class="t13 muted">${t.ms.length}명</span></div>${t.ms.map(personRow).join('') || '<div class="empty" style="padding:10px 0">아직 팀원이 없어요</div>'}</div>`).join('')}
        ${noTeam.length ? `<div class="org-team"><div class="org-team-h"><span>소속 없음</span><span class="t13 muted">${noTeam.length}명</span></div>${noTeam.map(personRow).join('')}</div>` : ''}
      </div>
    </section>
    <p class="t13 muted" style="padding:0 4px;line-height:1.7">업무 배정은 대표 → 전원, 팀장 → 자기 팀원 · 결재는 팀장 → 대표</p>`;
  }
  function drawPeople(main) {
    main.innerHTML = `
      <div class="page-h"><div><h2>임직원</h2><p>CONAS · ${peopleVisible().length}명${A.isCeo() ? ' · 직원을 누르면 직책을 바꿀 수 있어요' : ''}</p></div>
        ${A.isCeo() ? `<button class="new-btn" data-act="teams">${ic('settings', 16)}팀 관리</button>` : ''}</div>
      <label class="search">${ic('search', 20)}<input id="peopleQ" placeholder="이름, 팀, 직책, 연락처로 검색" value="${esc(PP.q)}" autocomplete="off">
        <button type="button" class="search-x" id="peopleX" ${PP.q ? '' : 'hidden'} aria-label="지우기">${ic('x', 16, 2.4)}</button></label>
      <div id="peopleRes">${peopleRes()}</div>`;
    const q = A.$('#peopleQ');
    q.addEventListener('input', () => {
      PP.q = q.value;
      A.$('#peopleX').hidden = !q.value;
      A.$('#peopleRes').innerHTML = peopleRes();
    });
    A.$('#peopleX').addEventListener('click', () => {
      PP.q = '';
      q.value = '';
      A.$('#peopleX').hidden = true;
      A.$('#peopleRes').innerHTML = peopleRes();
      q.focus();
    });
  }

  A.acts.person = (el) => openPerson(Number(el.dataset.id));
  function openPerson(id) {
    const m = A.mem(id);
    if (!m) return;
    const ceo = A.isCeo() && m.role !== 'ceo';
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
    A.sheet.show(
      '',
      `<div class="person-h">${A.avatar(m)}<b>${esc(m.name)}</b><p>${esc(A.roleLabel(m))}</p>
        ${A.presence(m)}</div>
      <div class="kv"><span>소속</span><b>${esc(m.team || (m.role === 'ceo' ? 'CONAS' : '소속 없음'))}</b></div>
      <div class="kv"><span>직급 · 직책</span><b>${esc(m.position || '-')} · ${A.ROLE[m.role]}</b></div>
      <div class="kv"><span>이메일</span><b><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></b></div>
      <div class="kv"><span>연락처</span><b>${m.phone ? `<a href="tel:${esc(m.phone.replace(/[^0-9+]/g, ''))}">${esc(m.phone)}</a>` : '<span class="muted">없음</span>'}</b></div>
      ${m.joined_on ? `<div class="kv"><span>입사일</span><b>${A.md(m.joined_on)}</b></div>` : ''}
      ${m.id === me().id ? '' : `<div class="btn-row" style="margin-top:18px"><button class="btn" data-act="dm-start" data-id="${m.id}">${ic('message', 18, 2.2)}DM 보내기</button>${m.phone ? `<a class="btn ghost" href="tel:${esc(m.phone.replace(/[^0-9+]/g, ''))}">${ic('phone', 18)}전화</a>` : ''}</div>`}
      ${
        ceo
          ? `<div class="admin-box">
        <div class="admin-h">${ic('settings', 16, 2)}대표 전용 · 인사 변경</div>
        <form data-form="member-save" data-id="${m.id}" id="memberForm">
          <div class="field"><label>소속 팀</label><select name="team_id">${opt('', '소속 없음', m.team_id)}${A.data.teams.map((t) => opt(t.id, t.name, m.team_id)).join('')}</select></div>
          <div class="field-row">
            <div class="field"><label>직책 (권한)</label><select name="role">${opt('member', '팀원', m.role)}${opt('lead', '팀장', m.role)}</select></div>
            <div class="field"><label>직급</label><select name="position">${opt('', '없음', m.position)}${A.data.positions.filter((p) => p !== '대표이사').map((p) => opt(p, p, m.position)).join('')}</select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>입사일</label><input type="date" name="joined_on" value="${esc(m.joined_on || '')}"></div>
            <div class="field"><label>올해 연차 (일)</label><input type="number" name="annual_leave" step="0.5" min="0" max="99" value="${m.annual_leave ?? ''}" placeholder="예: 15"></div>
          </div>
          <p class="hint" id="roleHint">직책을 바꾸면 업무 배정과 결재 권한이 바로 바뀌어요.</p>
          <button class="btn" type="submit">변경 저장</button>
        </form>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost" data-act="pay-admin" data-id="${m.id}">${ic('card', 18)}급여 명세</button>
          <button class="btn ghost" data-act="contract-admin" data-id="${m.id}">${ic('file', 18)}계약서</button>
        </div>
      </div>`
          : ''
      }`
    );
    if (!ceo) return;
    const f = A.$('#memberForm');
    f.addEventListener('change', () => {
      const h = A.$('#roleHint');
      const team = Number(f.team_id.value) || null;
      const prev = f.role.value === 'lead' ? A.data.members.find((x) => x.team_id === team && x.role === 'lead' && x.id !== m.id) : null;
      if (f.role.value === 'lead' && !team) {
        h.className = 'hint warn';
        h.textContent = '팀장은 소속 팀이 있어야 해요.';
      } else if (prev) {
        h.className = 'hint warn';
        h.textContent = `기존 팀장 ${prev.name}님은 팀원으로 바뀌어요. 팀장은 팀에 한 명이에요.`;
      } else if (m.role === 'lead' && (f.role.value === 'member' || team !== m.team_id)) {
        h.className = 'hint warn';
        h.textContent = `${m.team || '팀'}에 팀장이 없어져요. 결재와 검토는 대표에게 바로 가요.`;
      } else {
        h.className = 'hint';
        h.textContent = f.role.value === 'lead' ? '팀원에게 업무를 배정하고, 결재와 완료 검토를 맡게 돼요.' : '직책을 바꾸면 업무 배정과 결재 권한이 바로 바뀌어요.';
      }
    });
  }
  A.openPerson = openPerson;
  A.forms['member-save'] = async (f, d) => {
    const body = { user_id: Number(f.dataset.id), team_id: Number(d.team_id) || 0, role: d.role, position: d.position, joined_on: d.joined_on, annual_leave: d.annual_leave };
    const r = await A.post('member.update', body);
    await A.loadData();
    const m = A.mem(body.user_id);
    A.toast(`${m.name}님을 ${A.roleLabel(m)}(으)로 바꿨어요${r.demoted ? ` · ${A.mem(r.demoted).name}님은 팀원` : ''}`);
    if (A.isCurrent('cm-people')) drawPeople(A.$('#view'));
    openPerson(body.user_id);
  };

  // 팀 관리 (대표)
  A.acts.teams = () => {
    A.sheet.show(
      '팀 관리',
      `${A.data.teams
        .map(
          (t) => `<form class="field-row" data-form="team-save" style="align-items:center;margin-bottom:8px"><input type="hidden" name="id" value="${t.id}">
        <div class="field" style="margin:0"><input name="name" value="${esc(t.name)}" maxlength="50" required></div>
        <button class="btn sm ghost" type="submit">저장</button><button class="btn sm danger" type="button" data-act="team-del" data-id="${t.id}">삭제</button></form>`
        )
        .join('')}
      <form data-form="team-save" class="field-row" style="align-items:center;margin-top:16px"><div class="field" style="margin:0"><input name="name" maxlength="50" required placeholder="새 팀 이름"></div><button class="btn sm" type="submit">${ic('plus', 16, 2.4)}추가</button></form>
      <p class="t13 muted" style="margin-top:14px">사람이 있는 팀은 지울 수 없어요. 먼저 다른 팀으로 옮겨 주세요.</p>`
    );
  };
  A.forms['team-save'] = async (f, d) => {
    await A.post('team.save', d);
    await A.loadData();
    A.toast(d.id ? '팀 이름을 바꿨어요' : '팀을 추가했어요');
    A.acts.teams();
    if (A.isCurrent('cm-people')) drawPeople(A.$('#view'));
  };
  A.acts['team-del'] = async (el) => {
    if (!(await A.ask({ title: '팀 삭제', body: '이 팀을 지울까요?', ok: '삭제', danger: true }))) return;
    await A.post('team.delete', { id: Number(el.dataset.id) });
    await A.loadData();
    A.toast('팀을 지웠어요');
    if (A.isCurrent('cm-people')) drawPeople(A.$('#view'));
  };

  // 급여 명세 · 계약서 입력 (대표)
  const PAY_TEMPLATE = [
    ['기본급', 'pay'], ['식대 (비과세)', 'pay'], ['국민연금', 'deduct'], ['건강보험', 'deduct'], ['장기요양보험', 'deduct'], ['고용보험', 'deduct'], ['소득세', 'deduct'], ['지방소득세', 'deduct'],
  ];
  const PA = { uid: 0, pay: null, idx: 0 };
  A.acts['pay-admin'] = async (el) => {
    PA.uid = Number(el.dataset.id);
    PA.idx = 0;
    A.sheet.show('급여 명세', '<div class="loading"><div class="spinner"></div></div>');
    PA.pay = await A.api('pay', { user_id: PA.uid });
    drawPayAdmin();
  };
  function drawPayAdmin() {
    const m = A.mem(PA.uid);
    const last = PA.pay.slips[0];
    const items = last ? last.items : PAY_TEMPLATE.map(([label, kind]) => ({ label, kind, amount: '' }));
    const now = new Date();
    const month = `${now.getFullYear()}-${A.pad(now.getMonth() + 1)}`;
    const row = (it) => `<div class="pay-edit-row">
      <input name="label[]" value="${esc(it.label)}" placeholder="항목" maxlength="50">
      <input name="amount[]" type="number" inputmode="numeric" min="0" value="${esc(it.amount)}" placeholder="금액">
      <select name="kind[]"><option value="pay" ${it.kind === 'pay' ? 'selected' : ''}>지급</option><option value="deduct" ${it.kind === 'deduct' ? 'selected' : ''}>공제</option></select>
      <button type="button" class="icon-btn" style="width:32px;height:42px" data-act="pay-row-del" aria-label="줄 삭제">${ic('x', 16)}</button></div>`;
    A.sheet.show(
      `${m.name} · 급여 명세`,
      `<div id="payAdminCard">${A.payCard(PA.pay, PA.idx, 'pay-admin-month')}</div>
      <div class="admin-box">
        <div class="admin-h">${ic('pen', 16, 2)}명세 입력 · 같은 달이 있으면 덮어써요</div>
        <form data-form="pay-save">
          <div class="field"><label>지급 월</label><input type="month" name="month" value="${month}" required></div>
          <p class="t13 muted" style="margin-bottom:8px">급여 프로그램이나 세무사가 계산한 금액을 그대로 옮겨 적어 주세요.</p>
          <div id="payRows">${items.map(row).join('')}</div>
          <button type="button" class="btn sm ghost" data-act="pay-row-add" style="margin:4px 0 14px">${ic('plus', 16, 2.4)}항목 추가</button>
          <div class="field"><label>메모 (선택)</label><input name="memo" maxlength="255"></div>
          <button class="btn" type="submit">저장하고 알리기</button>
        </form>
      </div>`
    );
    A.payRow = row;
  }
  A.acts['pay-admin-month'] = (el) => {
    PA.idx = Number(el.dataset.i);
    A.$('#payAdminCard').innerHTML = A.payCard(PA.pay, PA.idx, 'pay-admin-month');
  };
  A.acts['pay-row-add'] = () => A.$('#payRows').insertAdjacentHTML('beforeend', A.payRow({ label: '', amount: '', kind: 'pay' }));
  A.acts['pay-row-del'] = (el) => el.closest('.pay-edit-row').remove();
  A.forms['pay-save'] = async (f, d) => {
    const L = [].concat(d['label[]'] || []);
    const M = [].concat(d['amount[]'] || []);
    const K = [].concat(d['kind[]'] || []);
    const items = L.map((label, i) => ({ label, amount: Number(M[i]) || 0, kind: K[i] })).filter((x) => x.label && x.amount > 0);
    PA.pay = await A.post('pay.save', { user_id: PA.uid, month: d.month, memo: d.memo, items });
    PA.idx = Math.max(0, PA.pay.slips.findIndex((s) => s.month === d.month));
    A.toast('급여 명세를 저장했어요');
    drawPayAdmin();
  };

  const CT = { uid: 0, files: [] };
  A.acts['contract-admin'] = async (el) => {
    CT.uid = Number(el.dataset.id);
    CT.files = [];
    A.sheet.show('근로계약서', '<div class="loading"><div class="spinner"></div></div>');
    const pay = await A.api('pay', { user_id: CT.uid });
    const c = pay.contract;
    const m = A.mem(CT.uid);
    A.sheet.show(
      `${m.name} · 근로계약서`,
      `${c ? A.contractHtml(c) : '<p class="t13 muted">아직 등록된 계약서가 없어요.</p>'}
      <div class="admin-box">
        <div class="admin-h">${ic('pen', 16, 2)}${c ? '새로 등록 (가장 최근 계약서가 보여요)' : '계약서 등록'}</div>
        <form data-form="contract-save">
          <div class="field-row">
            <div class="field"><label>계약 형태</label><select name="type">${['정규직', '계약직', '인턴', '파트타임'].map((t) => `<option ${c && c.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
            <div class="field"><label>제목</label><input name="title" value="${esc(c ? c.title : '근로계약서')}" maxlength="100"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>시작일</label><input type="date" name="start" value="${esc(c && c.start ? c.start : m.joined_on || '')}"></div>
            <div class="field"><label>종료일 (선택)</label><input type="date" name="end" value="${esc(c && c.end ? c.end : '')}"></div>
          </div>
          <div class="field"><label>근무 시간</label><input name="hours" maxlength="50" value="${esc(c ? c.hours || '' : '09:00 – 18:00 (휴게 1시간)')}"></div>
          <div class="field"><label>급여</label><input name="salary" maxlength="100" value="${esc(c ? c.salary || '' : '')}" placeholder="예: 연봉 40,000,000원"></div>
          <div class="field"><label class="btn sm ghost" style="display:inline-flex;cursor:pointer">${ic('clip', 16)}계약서 파일 (PDF)<input type="file" accept=".pdf,image/*" hidden id="ctFile"></label></div>
          <div class="up-list" id="ctFiles"></div>
          <button class="btn" type="submit">등록하고 알리기</button>
        </form>
      </div>`
    );
    const fi = A.$('#ctFile');
    fi.addEventListener('change', () => {
      CT.files.length = 0;
      A.uploadInto(fi, CT.files, A.$('#ctFiles'));
    });
  };
  A.forms['contract-save'] = async (f, d) => {
    if (CT.files.some((x) => !x.id)) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    await A.post('contract.save', { user_id: CT.uid, ...d, file_id: CT.files[0] ? CT.files[0].id : 0 });
    A.sheet.close();
    A.toast('계약서를 등록했어요');
  };
})();
