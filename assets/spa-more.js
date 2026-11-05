/* 전체 메뉴 · 관리자(가입 승인, 게시판 설정) */
(() => {
  'use strict';
  const { esc, ic } = A;
  const me = () => A.data.me;

  // ==================================================================
  // 전체
  // ==================================================================
  A.views.all = async (main) => {
    const b = A.badges;
    const g = (title, items) => `<section class="card"><div class="card-h"><h3>${title}</h3></div><div class="all-grid">
      ${items.map(([n, i, c, to, cnt]) => `<button ${to.startsWith('act:') ? `data-act="${to.slice(4)}"` : `data-go="${to}"`}><span class="ai ${c}">${ic(i)}${cnt ? `<span class="count">${cnt > 99 ? '99+' : cnt}</span>` : ''}</span>${n}</button>`).join('')}</div></section>`;
    main.innerHTML = `
      <section class="card"><button class="profile" data-act="id-card">${A.avatar(me())}<div class="grow"><b>${esc(me().name)}</b><p>${esc(A.roleLabel(me()))}${me().is_admin ? ' · 관리자' : ''}</p></div><span class="idc-open">${ic('card', 16, 2)}사원증</span></button></section>
      ${g('워크스페이스', [
        ['업무', 'checkSq', 'c-primary', 'ws/task', b.task],
        ['근태', 'calendar', 'c-cyan', 'ws/att'],
        ['서류·결재', 'file', 'c-ok', 'ws/doc', b.approval],
        ['공지', 'megaphone', 'c-warn', 'ws/notice', b.notice],
        ['내 정보', 'user', 'c-leave', 'ws/me'],
      ])}
      ${g('커뮤니티', [
        ['게시판', 'board', 'c-warn', 'cm/board'],
        ['채널', 'hash', 'c-cyan', 'cm/chan', b.channel],
        ['임직원', 'users', 'c-pink', 'cm/people'],
        ['DM', 'message', 'c-primary', 'dm', b.dm],
      ])}
      ${g('기타', [
        [A.theme.get() === 'dark' ? '밝은 화면' : '어두운 화면', A.theme.get() === 'dark' ? 'sun' : 'moon', 'c-gray', 'act:theme-toggle'],
        ...(me().is_admin ? [['관리자', 'shield', 'c-leave', 'admin/members', b.pending]] : []),
        ['로그아웃', 'logout', 'c-danger', 'act:logout'],
      ])}`;
  };
  // ==================================================================
  // 모바일 사원증 (전체 > 맨 위 프로필)
  //  아래쪽 시계가 1초마다 움직여서 캡처한 화면이 아니라는 걸 보여줌
  // ==================================================================
  A.acts['id-card'] = () => {
    const m = me();
    const dot = (d) => (d ? d.replaceAll('-', '.') : '');
    const role = m.role === 'ceo' ? '대표이사' : [m.position, m.role === 'lead' ? '팀장' : ''].filter(Boolean).join(' · ') || '팀원';
    const rows = [
      ['소속', m.role === 'ceo' ? 'CONAS' : m.team || '소속 없음'],
      ['직급 · 직책', role],
      ['입사일', dot(m.joined_on)],
      ['이메일', m.email],
    ].filter(([, v]) => v);
    let timer = null;
    A.sheet.show(
      '모바일 사원증',
      `<div class="idc">
        <div class="idc-band"><img src="${A.BASE}/assets/icons/icon-192.png" alt=""><b>CONAS</b><span>EMPLOYEE ID</span></div>
        <div class="idc-photo">${A.avatar({ name: m.name, av: m.av })}</div>
        <div class="idc-name"><b>${esc(m.name)}</b><p>${esc(role)}</p></div>
        <dl class="idc-rows">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="idc-live"><i></i><span><b>재직 중</b> · <time id="idcClock"></time></span></div>
      </div>
      <button class="btn ghost" data-go="ws/me" style="margin-top:14px">${ic('user', 18)}내 정보 · 사진 바꾸기</button>`,
      { onClose: () => clearInterval(timer) }
    );
    const tick = () => {
      const el = A.$('#idcClock');
      if (!el) return clearInterval(timer);
      const d = new Date();
      el.textContent = `${d.getFullYear()}.${A.pad(d.getMonth() + 1)}.${A.pad(d.getDate())} (${A.DOW[d.getDay()]}) ${A.pad(d.getHours())}:${A.pad(d.getMinutes())}:${A.pad(d.getSeconds())}`;
    };
    tick();
    timer = setInterval(tick, 1000);
  };

  A.acts['theme-toggle'] = () => {
    A.theme.set(A.theme.get() === 'dark' ? 'light' : 'dark');
    A.refresh();
  };

  // ==================================================================
  // 관리자
  // ==================================================================
  const ST = { pending: ['wait', '승인 대기'], active: ['ok', '활성'], disabled: ['off', '중지됨'] };
  A.views.admin = async (main, r, alive) => {
    if (!me().is_admin) {
      main.innerHTML = '<div class="empty" style="padding:60px 0">관리자만 볼 수 있어요</div>';
      return;
    }
    const sub = r.sub === 'boards' ? 'boards' : 'members';
    const d = await A.api(sub === 'boards' ? 'admin.boards' : 'admin.members');
    if (!alive()) return;
    const head = `<div class="page-h"><div><h2>관리자</h2><p>가입 승인과 게시판 설정</p></div>
      <div class="seg"><button class="${sub === 'members' ? 'on' : ''}" data-go="admin/members">회원</button><button class="${sub === 'boards' ? 'on' : ''}" data-go="admin/boards">게시판</button></div></div>`;
    if (sub === 'members') drawMembers(main, head, d.members);
    else drawBoards(main, head, d.boards);
  };

  function drawMembers(main, head, list) {
    const groups = ['pending', 'active', 'disabled'];
    main.innerHTML =
      head +
      groups
        .map((s) => {
          const l = list.filter((m) => m.status === s);
          if (!l.length && s !== 'pending') return '';
          return `<section class="card"><div class="card-h"><h3>${ST[s][1]}</h3><span class="t13 muted">${l.length}명</span></div>
          ${
            l
              .map(
                (m) => `<div class="user-row">${A.avatar(m)}
            <div class="grow"><b class="t15">${esc(m.name)}</b> ${m.is_admin ? '<span class="tag leave">관리자</span>' : ''} ${m.role === 'ceo' ? '<span class="tag primary">대표</span>' : ''}
              <span class="t13 muted ellipsis block">${esc(m.username)} · ${esc(m.email)}</span>
              <span class="t13 muted block">가입 ${A.ago(m.created_ts)}${m.seen_ts ? ' · 최근 접속 ' + A.ago(m.seen_ts) : ''}</span></div>
            <button class="btn sm ghost" data-act="admin-member" data-id="${m.id}">관리</button></div>`
              )
              .join('') || '<div class="empty">승인을 기다리는 사람이 없어요</div>'
          }</section>`;
        })
        .join('');
    A.cache.adminMembers = list;
  }

  A.acts['admin-member'] = (el) => {
    const m = A.cache.adminMembers.find((x) => x.id === Number(el.dataset.id));
    const self = m.id === me().id;
    const btn = (a, label, cls = 'ghost') => `<button class="btn ${cls}" style="margin-bottom:8px" data-act="admin-do" data-id="${m.id}" data-a="${a}">${label}</button>`;
    let acts = '';
    if (m.status === 'pending') acts += btn('approve', '승인하기', '') + btn('disable', '거절하기', 'danger');
    else if (m.status === 'active' && !self && m.role !== 'ceo') acts += btn('disable', '이용 중지', 'danger');
    else if (m.status === 'disabled') acts += btn('enable', '다시 이용하게 하기', '');
    if (m.status === 'active' && !self) acts += m.is_admin ? btn('revoke_admin', '관리자 권한 해제') : btn('make_admin', '관리자로 지정');
    A.sheet.show(
      m.name,
      `<div class="person-h">${A.avatar(m)}<b>${esc(m.name)}</b><p>${esc(m.username)} · ${esc(m.email)}</p><span class="st ${ST[m.status][0]}">${ST[m.status][1]}</span></div>
      ${acts || '<p class="t13 muted">바꿀 수 있는 항목이 없어요.</p>'}
      ${m.status === 'pending' ? '<p class="t13 muted" style="margin-top:6px">승인하면 공개 채널에 자동으로 들어가요. 팀과 직책은 대표가 임직원 화면에서 정해요.</p>' : ''}`
    );
  };
  const ADMIN_MSG = { approve: '승인했어요', enable: '다시 이용할 수 있게 했어요', disable: '이용을 중지했어요', make_admin: '관리자로 지정했어요', revoke_admin: '관리자 권한을 해제했어요' };
  A.acts['admin-do'] = async (el) => {
    const a = el.dataset.a;
    if (['disable', 'revoke_admin'].includes(a) && !(await A.ask({ title: '확인', body: a === 'disable' ? '이 회원이 더 이상 로그인할 수 없게 돼요. 계속할까요?' : '관리자 권한을 해제할까요?', ok: '계속', danger: true }))) return;
    await A.post('admin.member', { user_id: Number(el.dataset.id), action: a });
    A.sheet.close();
    A.toast(ADMIN_MSG[a]);
    await A.loadData();
    A.refresh();
  };

  function drawBoards(main, head, boards) {
    A.cache.adminBoards = boards;
    main.innerHTML =
      head +
      `<section class="card"><div class="card-h"><h3>게시판</h3><button class="more" data-act="board-edit">${ic('plus', 14, 2.4)} 새 게시판</button></div>
      ${boards
        .map(
          (b) => `<button class="list-item" data-act="board-edit" data-id="${b.id}">
        <span class="doc-ic ${b.anonymous ? 'c-leave' : 'c-primary'}">${ic(b.anonymous ? 'eye' : 'board', 18, 2)}</span>
        <span class="grow"><span class="t15 block">${esc(b.name)} ${b.visible ? '' : '<span class="tag">숨김</span>'}</span>
          <span class="t13 muted">${b.anonymous ? '익명' : '실명'} · 글 ${b.post_count}개${b.write_role === 'admin' ? ' · 관리자만 글쓰기' : ''}</span></span>
        ${ic('chevR', 18)}</button>`
        )
        .join('')}
      </section>
      <p class="t13 muted" style="padding:0 4px;line-height:1.7">익명/실명을 바꾸면 새 글부터 적용돼요. 예전 익명 글의 작성자는 바꾼 뒤에도 드러나지 않아요.</p>`;
  }
  A.acts['board-edit'] = (el) => {
    const b = el.dataset.id ? A.cache.adminBoards.find((x) => x.id === Number(el.dataset.id)) : null;
    const sw = (name, label, sub, on) => `<div class="switch-row"><div><b>${label}</b><small>${sub}</small></div><label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i></label></div>`;
    A.sheet.show(
      b ? '게시판 설정' : '새 게시판',
      `<form data-form="board-save">
        ${b ? `<input type="hidden" name="id" value="${b.id}">` : ''}
        <div class="field"><label>이름</label><input name="name" required maxlength="50" value="${esc(b ? b.name : '')}"></div>
        <div class="field"><label>설명 (선택)</label><input name="description" maxlength="255" value="${esc(b ? b.description || '' : '')}"></div>
        <div class="field"><label>글쓰기</label><select name="write_role"><option value="user" ${!b || b.write_role === 'user' ? 'selected' : ''}>모든 직원</option><option value="admin" ${b && b.write_role === 'admin' ? 'selected' : ''}>관리자만</option></select></div>
        ${sw('anonymous', '익명 게시판', '글과 댓글에 이름이 보이지 않아요 (새 글부터 적용)', b ? b.anonymous : false)}
        ${sw('allow_comments', '댓글 허용', '글에 댓글을 달 수 있어요', b ? b.allow_comments : true)}
        ${sw('allow_attachments', '파일 첨부 허용', '사진, 문서를 올릴 수 있어요', b ? b.allow_attachments : true)}
        ${sw('visible', '게시판 보이기', '끄면 직원들에게 보이지 않아요', b ? b.visible : true)}
        <button class="btn" type="submit" style="margin-top:14px">${b ? '저장' : '만들기'}</button>
      </form>`
    );
  };
  A.forms['board-save'] = async (f, d) => {
    await A.post('admin.board', d);
    A.sheet.close();
    A.toast(d.id ? '게시판 설정을 저장했어요' : '게시판을 만들었어요');
    await A.loadData();
    A.refresh();
  };
})();
