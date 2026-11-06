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
        ['구내식당', 'meal', 'c-ok', 'act:meal'],
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
        ...(me().can_manage ? [['사원증 리더기', 'qr', 'c-gray', 'act:open-reader']] : []),
        ['로그아웃', 'logout', 'c-danger', 'act:logout'],
      ])}`;
  };
  // ==================================================================
  // 모바일 사원증 (전체 > 맨 위 프로필)
  //  아래에서 화면 끝까지 올라오는 시트. 아래로 끌어내리거나 뒤로가기로 닫힘
  //  바코드: 서버가 30초마다 새로 주는 코드(Code128). reader.php 에서 찍으면 서버가 확인
  //  시계 · 흐르는 문구 · 남은 초가 움직여서 캡처한 화면이 아니라는 걸 보여줌
  // ==================================================================

  /** Code128 막대 폭 (값 0~106). 106은 끝 표시 */
  const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
  /** 숫자(짝수 자리)를 Code128-C 바코드 SVG로. 양옆에 10칸 여백 */
  A.code128 = (digits) => {
    if (!/^(\d\d)+$/.test(digits)) return '';
    const vals = [105];
    for (let i = 0; i < digits.length; i += 2) vals.push(Number(digits.slice(i, i + 2)));
    vals.push(vals.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103); // 검사 값
    vals.push(106);
    let x = 10;
    let rects = '';
    for (const v of vals) {
      [...C128[v]].forEach((w, i) => {
        if (i % 2 === 0) rects += `<rect x="${x}" width="${w}" height="40"/>`;
        x += Number(w);
      });
    }
    return `<svg class="bc" viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="사원증 바코드">${rects}</svg>`;
  };

  A.acts['id-card'] = () => {
    const m = me();
    const mark = `${A.BASE}/assets/conas-mark.svg`;
    const dept = m.role === 'ceo' ? '대표이사' : [m.team || '소속 없음', m.role === 'lead' ? '팀장' : m.position].filter(Boolean).join(' · ');
    const photo = m.av
      ? `<img src="${esc(m.av)}" alt="">`
      : `<span class="idc-noimg" style="--av:${A.avatarColor(m.name)}">${esc([...(m.name || '?')][0])}</span>`;
    const notice = `<span class="idc-mk"><img src="${mark}" alt="">CONAS</span><span>정상 발급된 모바일 사원증입니다.</span>`;
    const st = { timer: null, refetch: null, expires: 0, code: '' };
    A.sheet.show(
      '',
      `<div class="idc">
        <div class="idc-stage"><div class="idc-flip">
          <section class="idc-face">
            <img class="idc-deco" src="${mark}" alt="">
            <div class="idc-logo"><img src="${mark}" alt="">CONAS</div>
            <div class="idc-photo">${photo}</div>
            <b class="idc-name">${esc(m.name)}</b>
            <p class="idc-dept">${esc(dept)}</p>
            <p class="idc-no"><span>사번</span>${m.employee_no ? `<b>${esc(m.employee_no)}</b>` : '<em>미등록</em>'}</p>
            <div class="idc-bottom">
              <p class="idc-left" id="idcLeft">바코드 받는 중…</p>
              <div class="idc-bar" id="idcBar"></div>
            </div>
          </section>
          <section class="idc-face idc-back"><img src="${mark}" alt=""><b>CONAS</b></section>
        </div></div>
        <time class="idc-clock" id="idcClock"></time>
        <div class="idc-ticker" aria-hidden="true"><div>${notice.repeat(4)}${notice.repeat(4)}</div></div>
      </div>`,
      {
        cls: 'sheet-idcard',
        swipe: true,
        onClose: () => {
          clearInterval(st.timer);
          clearTimeout(st.refetch);
        },
      }
    );
    // 바코드: 서버에서 받고, 남은 초가 끝나면 다시 받음
    const fetchCode = async () => {
      clearTimeout(st.refetch);
      try {
        const r = await A.api('idcard.code');
        if (!A.$('#idcBar')) return;
        st.code = r.code;
        st.expires = Date.now() + r.ttl * 1000;
        A.$('#idcBar').innerHTML = A.code128(r.code) + `<span class="idc-digits">${r.code.replace(/(\d{4})(?=\d)/g, '$1 ')}</span>`;
        A.$('#idcBar').classList.remove('off');
        st.refetch = setTimeout(fetchCode, r.ttl * 1000 + 300);
      } catch (e) {
        if (!A.$('#idcBar')) return;
        st.expires = 0;
        A.$('#idcBar').classList.add('off');
        A.$('#idcLeft').textContent = '인터넷 연결을 확인해 주세요';
        st.refetch = setTimeout(fetchCode, 5000);
      }
    };
    const tick = () => {
      const el = A.$('#idcClock');
      if (!el) return clearInterval(st.timer);
      const d = new Date();
      const h = d.getHours();
      el.textContent = `${d.getFullYear()}.${A.pad(d.getMonth() + 1)}.${A.pad(d.getDate())} (${A.DOW[d.getDay()]}) ${h < 12 ? '오전' : '오후'} ${A.pad(h % 12 || 12)}시 ${A.pad(d.getMinutes())}분 ${A.pad(d.getSeconds())}초`;
      if (st.expires) A.$('#idcLeft').textContent = `${Math.max(0, Math.ceil((st.expires - Date.now()) / 1000))}초 후 갱신`;
    };
    fetchCode();
    tick();
    st.timer = setInterval(tick, 1000);
  };

  // 사원증 리더기 (대표 · 관리자): 따로 된 페이지
  A.acts['open-reader'] = () => (location.href = A.BASE + '/reader.php');
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
              <span class="t13 muted ellipsis block">${m.employee_no ? `사번 ${esc(m.employee_no)} · ` : ''}${esc(m.username)} · ${esc(m.email)}</span>
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
      <form data-form="admin-empno" data-id="${m.id}" class="empno-form">
        <div class="field"><label>사원번호 <span class="t13 muted">모바일 사원증에 보여요</span></label>
          <div class="row" style="gap:8px"><input name="employee_no" maxlength="20" value="${esc(m.employee_no || '')}" placeholder="예: CN-2024-001" autocomplete="off" class="grow"><button class="btn sm" type="submit">저장</button></div></div>
      </form>
      ${acts || '<p class="t13 muted">바꿀 수 있는 항목이 없어요.</p>'}
      ${m.status === 'pending' ? '<p class="t13 muted" style="margin-top:6px">승인해도 채널에는 자동으로 들어가지 않아요. 팀과 직책은 대표가 임직원 화면에서 정해요.</p>' : ''}`
    );
  };
  const ADMIN_MSG = { approve: '승인했어요', enable: '다시 이용할 수 있게 했어요', disable: '이용을 중지했어요', make_admin: '관리자로 지정했어요', revoke_admin: '관리자 권한을 해제했어요' };
  A.forms['admin-empno'] = async (f, d) => {
    const no = (d.employee_no || '').trim();
    await A.post('admin.member', { user_id: Number(f.dataset.id), action: 'employee_no', employee_no: no });
    A.sheet.close();
    A.toast(no ? `사원번호를 ${no}(으)로 저장했어요` : '사원번호를 지웠어요');
    await A.loadData();
    A.refresh();
  };
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
