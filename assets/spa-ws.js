/* 워크스페이스: 업무 · 근태 · 서류(결재) · 공지 · 내 정보 */
(() => {
  'use strict';
  const { esc, ic } = A;
  const me = () => A.data.me;
  const reload = () => A.refresh();
  const done = (msg) => {
    A.sheet.close();
    if (msg) A.toast(msg);
    reload();
  };

  // ==================================================================
  // 근태
  // ==================================================================
  const AT = { view: 'month', off: 0, sel: null, cache: {} };
  const ST_LABEL = { ok: '정상', late: '지각', leave: '연차', half: '반차', no: '결근' };
  const monthKey = (d) => `${d.getFullYear()}-${A.pad(d.getMonth() + 1)}`;
  async function attMonth(key) {
    if (!AT.cache[key]) AT.cache[key] = await A.api('att', { month: key });
    return AT.cache[key];
  }

  A.views['ws-att'] = async (main, r, alive) => {
    AT.cache = {};
    await drawAtt(main, alive);
  };

  async function drawAtt(main, alive = () => true) {
    const today = A.today();
    const base = new Date(today.getFullYear(), today.getMonth() + (AT.view === 'month' ? AT.off : 0), 1);
    const cur = await attMonth(monthKey(today));
    const data = AT.view === 'month' ? await attMonth(monthKey(base)) : cur;
    let body;
    let title;
    if (AT.view === 'month') {
      const y = base.getFullYear();
      const m = base.getMonth();
      const dim = new Date(y, m + 1, 0).getDate();
      if (!AT.sel || AT.sel.slice(0, 7) !== monthKey(base)) AT.sel = monthKey(base) === monthKey(today) ? A.iso(today) : `${monthKey(base)}-01`;
      let cells = A.DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('');
      for (let i = 0; i < base.getDay(); i++) cells += '<div></div>';
      for (let i = 1; i <= dim; i++) {
        const d = new Date(y, m, i);
        const iso = A.iso(d);
        const rec = data.days[iso];
        const wd = d.getDay();
        const cls = [wd === 0 ? 'sun' : wd === 6 ? 'sat' : '', d > today ? 'future' : '', iso === A.iso(today) ? 'today' : '', iso === AT.sel ? 'sel' : ''].join(' ');
        cells += `<button class="cal-cell ${cls}" data-act="att-day" data-d="${iso}"><span>${i}</span><i class="dot ${rec ? rec.status : ''}"></i></button>`;
      }
      const rec = data.days[AT.sel];
      body = `<div class="cal-grid">${cells}</div>
        <div class="legend"><span><i style="background:var(--ok)"></i>정상</span><span><i style="background:var(--warn)"></i>지각</span><span><i style="background:var(--leave)"></i>연차·반차</span><span><i style="background:var(--danger)"></i>결근</span></div>
        <div class="cal-detail"><b>${A.md(AT.sel)}</b>${
          rec ? `<span class="row" style="gap:8px">${rec.in ? `<span class="muted t13">${rec.in} – ${rec.out || '근무 중'}</span>` : ''}<span class="st ${rec.status}">${ST_LABEL[rec.status]}</span></span>` : '<span class="muted t13">기록 없음</span>'
        }</div>`;
      title = `${y}년 ${m + 1}월`;
    } else {
      const mon = A.addDays(today, -((today.getDay() + 6) % 7) + AT.off * 7);
      const days = [...Array(5)].map((_, i) => A.addDays(mon, i));
      for (const d of days) await attMonth(monthKey(d));
      body = days
        .map((d) => {
          const rec = AT.cache[monthKey(d)].days[A.iso(d)];
          const time = rec && rec.in ? `${rec.in} – ${rec.out || '근무 중'}<small>${rec.out ? '근무 ' + diffH(rec.in, rec.out) : '출근 완료'}</small>` : rec && ['leave', 'half'].includes(rec.status) ? esc(rec.note || ST_LABEL[rec.status]) : d > today ? '<span class="muted">예정</span>' : '<span class="muted">기록 없음</span>';
          return `<div class="wk-row"><div class="wk-date"><b>${d.getDate()}</b><span>${A.DOW[d.getDay()]}</span></div><div class="wk-time">${time}</div>${rec ? `<span class="st ${rec.status}">${ST_LABEL[rec.status]}</span>` : '<span class="st off">-</span>'}</div>`;
        })
        .join('');
      const end = A.addDays(mon, 4);
      title = `${mon.getMonth() + 1}.${mon.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
    }
    if (!alive()) return;
    main.innerHTML = `
      <div class="page-h"><div><h2>근태</h2><p>${esc(me().team || '소속 없음')} · ${cur.work_start} – ${cur.work_end} 근무</p></div></div>
      <div class="stats">
        <div class="stat"><span>이번 달 근무</span><b>${cur.work_days}<small>일</small></b></div>
        <div class="stat"><span>지각</span><b style="color:${cur.late ? 'var(--warn)' : 'inherit'}">${cur.late}<small>회</small></b></div>
        <div class="stat"><span>남은 연차</span><b style="color:var(--leave)">${cur.leave_left === null ? '-' : cur.leave_left}<small>${cur.leave_left === null ? '' : '일'}</small></b></div>
      </div>
      <section class="card">
        <div class="card-h">
          <div class="cal-nav"><button class="icon-btn" data-act="att-move" data-d="-1" aria-label="이전">${ic('chevL', 20)}</button><b>${title}</b><button class="icon-btn" data-act="att-move" data-d="1" aria-label="다음">${ic('chevR', 20)}</button></div>
          <div class="seg"><button class="${AT.view === 'month' ? 'on' : ''}" data-act="att-view" data-v="month">월간</button><button class="${AT.view === 'week' ? 'on' : ''}" data-act="att-view" data-v="week">주간</button></div>
        </div>
        ${body}
      </section>
      ${cur.leave_total === null ? '<p class="t13 muted" style="margin:0 4px 12px">연차 일수는 대표가 임직원 화면에서 정해요.</p>' : ''}
      <button class="btn ghost" data-go="ws/doc">${ic('file', 18)}근태 사유서 · 연차 신청하기</button>`;
  }
  function diffH(a, b) {
    const [h1, m1] = a.split(':').map(Number);
    const [h2, m2] = b.split(':').map(Number);
    const t = Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1) - 60);
    return `${Math.floor(t / 60)}시간 ${t % 60}분`;
  }
  A.acts['att-day'] = (el) => {
    AT.sel = el.dataset.d;
    drawAtt(A.$('#view')).catch(A.err);
  };
  A.acts['att-move'] = (el) => {
    AT.off += Number(el.dataset.d);
    drawAtt(A.$('#view')).catch(A.err);
  };
  A.acts['att-view'] = (el) => {
    AT.view = el.dataset.v;
    AT.off = 0;
    drawAtt(A.$('#view')).catch(A.err);
  };

  // ==================================================================
  // 서류 (결재)
  // ==================================================================
  const DOC_TYPES = [
    { id: 'reason', name: '근태 사유서', desc: '지각·조퇴·결근', ic: 'clock', c: 'c-warn', fields: [['date', '날짜', 'date'], ['kind', '유형', 'select:지각,조퇴,결근,외출'], ['reason', '사유', 'textarea']] },
    { id: 'leave', name: '연차·반차 신청', desc: '휴가 신청', ic: 'calendar', c: 'c-leave', fields: [['kind', '종류', 'select:연차,오전 반차,오후 반차,경조 휴가'], ['date', '시작일', 'date'], ['to', '종료일 (연차만)', 'date?'], ['reason', '사유 (선택)', 'textarea?']] },
    { id: 'ot', name: '연장근무 신청', desc: '야근·휴일근무', ic: 'moon', c: 'c-primary', fields: [['date', '날짜', 'date'], ['from', '시작 시간', 'time:18:00'], ['until', '종료 시간', 'time:21:00'], ['reason', '업무 내용', 'textarea']] },
    { id: 'exp', name: '지출결의서', desc: '경비·법인카드 정산', ic: 'card', c: 'c-ok', fields: [['date', '사용일', 'date'], ['item', '항목', 'select:식대,교통비,도서구입,장비구입,기타'], ['amount', '금액 (원)', 'number'], ['reason', '내용', 'textarea']], files: true },
    { id: 'cert', name: '증명서 발급', desc: '재직·경력증명서', ic: 'award', c: 'c-cyan', fields: [['kind', '종류', 'select:재직증명서,경력증명서,원천징수영수증'], ['purpose', '용도', 'text'], ['count', '매수', 'number:1']] },
    { id: 'supply', name: '비품 신청', desc: '사무용품·장비', ic: 'box', c: 'c-pink', fields: [['item', '품목', 'text'], ['count', '수량', 'number:1'], ['reason', '사유', 'textarea']] },
    // 업무 문서: 받을 사람(대표·팀장·관리자)을 한 명 골라 제출 → 승인 · 반려
    { id: 'propose', pick: true, name: '제안서', desc: '새 아이디어·개선 제안', ic: 'flag', c: 'c-primary', fields: [['subject', '제목', 'text'], ['background', '제안 배경', 'textarea'], ['content', '제안 내용', 'textarea'], ['effect', '기대 효과 (선택)', 'textarea?']], files: '참고 자료' },
    { id: 'suggest', pick: true, name: '건의서', desc: '불편한 점·바라는 점', ic: 'megaphone', c: 'c-warn', fields: [['subject', '제목', 'text'], ['content', '건의 내용', 'textarea'], ['solution', '개선 방안 (선택)', 'textarea?']], files: '참고 자료' },
    { id: 'request', pick: true, name: '품의서', desc: '구매·계약 등 사전 승인', ic: 'checkSq', c: 'c-ok', fields: [['subject', '제목', 'text'], ['content', '품의 내용', 'textarea'], ['amount', '금액 (원, 선택)', 'number?'], ['reason', '필요한 이유', 'textarea']], files: '견적서 · 참고 자료' },
  ];
  const FIELD_LABEL = { date: '날짜', kind: '종류', reason: '사유', to: '종료일', from: '시작', until: '종료', item: '항목', amount: '금액', purpose: '용도', count: '수량', subject: '제목', background: '제안 배경', content: '내용', effect: '기대 효과', solution: '개선 방안' };
  const LONG_FIELDS = ['background', 'content', 'effect', 'solution'];
  const AP_ST = { pending: ['wait', '대기'], approved: ['ok', '승인'], rejected: ['no', '반려'], canceled: ['off', '취소'] };
  const D = { filter: '전체', data: null, files: [] };

  A.views['ws-doc'] = async (main, r, alive) => {
    const d = await A.api('approvals');
    if (!alive()) return;
    D.data = d;
    drawDocs(main);
  };
  const docType = (id) => DOC_TYPES.find((t) => t.id === id) || DOC_TYPES[0];
  function apRow(a, showUser) {
    const t = docType(a.type);
    const [cls, label] = AP_ST[a.status];
    return `<button class="list-item" data-act="doc" data-id="${a.id}"><span class="doc-ic ${t.c}">${ic(t.ic, 18, 2)}</span>
      <span class="grow"><span class="t15 ellipsis block">${esc(a.title)}</span><span class="t13 muted">${showUser ? esc(a.user) + ' · ' : ''}${A.ago(a.ts)} 제출</span></span>
      <span class="st ${cls}">${label}</span></button>`;
  }
  function drawDocs(main) {
    const d = D.data;
    const map = { 대기: 'pending', 승인: 'approved', 반려: 'rejected' };
    const list = d.mine.filter((a) => D.filter === '전체' || a.status === map[D.filter]);
    main.innerHTML = `
      <div class="page-h"><div><h2>서류</h2><p>작성할 서류를 고르세요</p></div></div>
      <p class="doc-group-h">업무 문서 <span>받을 사람을 골라 제출해요</span></p>
      <div class="doc-grid">${DOC_TYPES.filter((t) => t.pick).map(docTile).join('')}</div>
      <p class="doc-group-h">신청 서류 <span>결재선을 따라 올라가요</span></p>
      <div class="doc-grid">${DOC_TYPES.filter((t) => !t.pick).map(docTile).join('')}</div>
      ${d.inbox.length ? `<section class="card review-card"><div class="card-h"><h3>결재할 서류 <span style="color:var(--leave)">${d.inbox.length}</span></h3><span class="t13 muted">승인하거나 반려해 주세요</span></div>${d.inbox.map((a) => apRow(a, true)).join('')}</section>` : ''}
      <section class="card">
        <div class="card-h"><h3>내 결재 현황</h3><span class="t13 muted">대기 ${d.mine.filter((a) => a.status === 'pending').length}건</span></div>
        <div class="chips">${['전체', '대기', '승인', '반려'].map((c) => `<button class="chip ${c === D.filter ? 'on' : ''}" data-act="doc-filter" data-f="${c}">${c}</button>`).join('')}</div>
        ${list.map((a) => apRow(a)).join('') || '<div class="empty">서류가 없어요</div>'}
      </section>
      ${d.handled.length ? `<section class="card"><div class="card-h"><h3>내가 처리한 서류</h3></div>${d.handled.slice(0, 10).map((a) => apRow(a, true)).join('')}</section>` : ''}`;
  }
  function docTile(t) {
    const d = D.data;
    return `<button class="doc-tile" data-act="doc-new" data-type="${t.id}"><span class="doc-ic ${t.c}">${ic(t.ic, 20, 2)}</span><b>${t.name}</b><span>${t.id === 'leave' && d.leave_left !== null ? '남은 연차 ' + d.leave_left + '일' : t.desc}</span></button>`;
  }
  A.acts['doc-filter'] = (el) => {
    D.filter = el.dataset.f;
    drawDocs(A.$('#view'));
  };

  A.acts['doc-new'] = (el) => {
    const t = docType(el.dataset.type);
    D.files = [];
    const today = A.iso(A.today());
    const fields = t.fields
      .map(([n, l, type]) => {
        const opt = type.endsWith('?');
        const ty = type.replace('?', '');
        let input;
        if (ty.startsWith('select:')) input = `<select name="${n}">${ty.slice(7).split(',').map((o) => `<option>${o}</option>`).join('')}</select>`;
        else if (ty === 'textarea') input = `<textarea name="${n}" ${opt ? '' : 'required'} placeholder="내용을 입력하세요"></textarea>`;
        else if (ty === 'date') input = `<input type="date" name="${n}" ${opt ? '' : `value="${today}" required`}>`;
        else if (ty.startsWith('time')) input = `<input type="time" name="${n}" value="${ty.split(':').slice(1).join(':')}" required>`;
        else if (ty.startsWith('number')) input = `<input type="number" name="${n}" inputmode="numeric" min="1" ${opt ? '' : 'required'} value="${ty.split(':')[1] || ''}" placeholder="0">`;
        else input = `<input type="text" name="${n}" required maxlength="${n === 'subject' ? 100 : 200}" ${n === 'subject' ? 'placeholder="한 줄로 요약해 주세요"' : ''}>`;
        return `<div class="field"><label>${l}</label>${input}</div>`;
      })
      .join('');
    const ap = D.data.approvers;
    // 업무 문서: 받을 사람 고르기 (대표 · 팀장 · 관리자 중 한 명)
    const picks = (D.data.pick_ids || []).map((id) => A.mem(id)).filter(Boolean);
    const myLead = ap[0] ? ap[0].id : null;
    const line = t.pick
      ? `<div class="field"><span class="lbl">받을 사람</span>
          <div class="to-pick">${
            picks
              .map((m) => `<label class="to-opt"><input type="radio" name="approver_id" value="${m.id}" ${m.id === myLead ? 'checked' : ''} required>${A.avatar(m)}<span><b>${esc(m.name)}</b><small>${esc(m.role === 'ceo' ? '대표' : A.roleLabel(m))}${m.is_admin && m.role === 'member' ? ' · 관리자' : ''}</small></span></label>`)
              .join('') || '<p class="t13 muted">받을 수 있는 사람이 없어요</p>'
          }</div>
          <small>고른 사람이 승인하거나 반려해요</small></div>`
      : `<div class="field"><span class="lbl">결재선</span></div>
        <div class="approval-line" style="margin-top:-8px">
          <span class="who">${A.avatar(me())}<span>나</span><small>기안</small></span>
          ${ap.map((a) => `<span class="arrow">${ic('chevR', 18)}</span><span class="who">${A.avatar(A.mem(a.id) || { name: a.name })}<span>${esc(a.name)}</span><small>${esc(a.role)}</small></span>`).join('') || '<span class="t13 muted" style="margin-left:6px">대표 전결로 바로 승인돼요</span>'}
        </div>`;
    const fileLabel = typeof t.files === 'string' ? t.files + ' (선택)' : '영수증';
    A.sheet.show(
      t.name,
      `<form data-form="doc-new" data-type="${t.id}">
        ${fields}
        ${t.files ? `<div class="field"><label>${fileLabel}</label><input type="file" accept="image/*,.pdf${t.pick ? ',.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.zip' : ''}" multiple data-act-change="doc-file"><small>${t.pick ? '사진, PDF, 문서 파일' : '사진이나 PDF를 올려주세요'}</small></div><div class="up-list" id="docFiles"></div>` : ''}
        ${line}
        <button class="btn" type="submit">${t.pick ? '제출하기' : '결재 요청'}</button>
      </form>`
    );
    const fi = A.$('[data-act-change="doc-file"]');
    if (fi) fi.addEventListener('change', () => uploadInto(fi, D.files, A.$('#docFiles')));
  };
  A.forms['doc-new'] = async (f, d) => {
    if (D.files.some((x) => !x.id)) throw new Error('파일을 올리는 중이에요. 잠시만 기다려 주세요.');
    const t = docType(f.dataset.type);
    const { approver_id: to, ...fields } = d;
    const r = await A.post('approval.create', { type: t.id, fields, approver_id: Number(to) || 0, files: D.files.map((x) => x.id) });
    D.filter = '전체';
    done(r.auto ? '바로 승인됐어요 (전결)' : t.pick ? `${t.name}를 제출했어요` : '결재를 요청했어요');
  };

  /** 파일 선택 → 올리기 → 목록 표시. list: [{name, id?}] */
  async function uploadInto(input, list, box) {
    const files = [...input.files];
    input.value = '';
    for (const file of files) {
      const item = { name: file.name, id: null };
      list.push(item);
      drawUploads(list, box);
      try {
        const r = await A.upload(file);
        item.id = r.id;
      } catch (e) {
        list.splice(list.indexOf(item), 1);
        A.err(e);
      }
      drawUploads(list, box);
    }
  }
  A.uploadInto = uploadInto;
  function drawUploads(list, box) {
    if (!box) return;
    box.innerHTML = list
      .map((x, i) => `<span class="up-item ${x.id ? '' : 'busy'}"><span>${esc(x.name)}${x.id ? '' : ' (올리는 중…)'}</span><button type="button" data-up-del="${i}" aria-label="빼기">${ic('x', 14)}</button></span>`)
      .join('');
    box.onclick = (e) => {
      const b = e.target.closest('[data-up-del]');
      if (!b) return;
      list.splice(Number(b.dataset.upDel), 1);
      drawUploads(list, box);
    };
  }
  A.drawUploads = drawUploads;

  A.acts.doc = async (el) => {
    A.sheet.show('결재 상세', '<div class="loading"><div class="spinner"></div></div>');
    const { approval: a } = await A.api('approval', { id: Number(el.dataset.id) });
    if (!A.sheet.open) return;
    drawDocDetail(a);
  };
  function drawDocDetail(a) {
    const [cls, label] = AP_ST[a.status];
    const t = docType(a.type);
    // 제목은 머리글에 이미 있으니 빼고, 긴 글은 문단으로
    // DB(JSON)는 칸 순서를 바꿔 저장하므로 서류 양식 순서대로 다시 정렬
    const order = (k) => {
      const i = t.fields.findIndex((f) => f[0] === k);
      return i < 0 ? 99 : i;
    };
    const entries = Object.entries(a.fields)
      .filter(([k, v]) => v !== '' && v !== null && !(t.pick && k === 'subject'))
      .sort((x, y) => order(x[0]) - order(y[0]));
    const long = (k) => LONG_FIELDS.includes(k) || (t.pick && k === 'reason');
    const fields =
      entries
        .filter(([k]) => !long(k))
        .map(([k, v]) => `<div class="kv"><span>${FIELD_LABEL[k] || k}</span><b>${k === 'amount' ? A.won(v) : ['date', 'to'].includes(k) ? A.md(v) : esc(v)}</b></div>`)
        .join('') +
      entries
        .filter(([k]) => long(k))
        .map(([k, v]) => `<div class="doc-long"><span>${k === 'reason' ? '필요한 이유' : FIELD_LABEL[k] || k}</span><p>${A.linkify(String(v))}</p></div>`)
        .join('');
    const files = (a.files || [])
      .map((f) => (f.is_image ? `<button type="button" class="img" data-view="${esc(f.view_url)}" data-dl="${esc(f.url)}" data-name="${esc(f.name)}"><img src="${esc(f.view_url)}" alt="${esc(f.name)}"></button>` : `<a class="file-row" href="${esc(f.url)}">${ic('file', 18)}<b>${esc(f.name)}</b><span class="muted t13">${esc(f.size_text)}</span></a>`))
      .join('');
    const steps = a.steps.length
      ? a.steps
          .map((s) => {
            const c = { approved: 'done', rejected: 'rej', pending: 'now' }[s.status] || '';
            const msg = { approved: '승인했어요', rejected: '반려 · ' + (s.note || ''), pending: '검토 중이에요', waiting: '이전 단계 대기 중', skipped: '진행 안 됨' }[s.status];
            return `<div class="tl ${c}"><i></i><b>${esc(s.role)} · ${esc(s.approver)}</b><p>${esc(msg)}${s.status === 'approved' && s.note ? ' · ' + esc(s.note) : ''}</p></div>`;
          })
          .join('')
      : '<div class="tl done"><i></i><b>대표 전결</b><p>바로 승인됐어요</p></div>';
    let actions = '';
    if (a.my_turn) {
      actions = `<div class="field" id="apRejWrap" hidden><label>반려 사유</label><textarea id="apNote" placeholder="반려하는 이유를 적어주세요"></textarea></div>
        <div class="btn-row"><button class="btn ghost" data-act="doc-reject" data-id="${a.id}">반려</button><button class="btn" style="flex:2" data-act="doc-approve" data-id="${a.id}">${ic('check', 20, 2.4)}승인</button></div>`;
    } else if (a.can_cancel) {
      actions = `<button class="btn ghost" data-act="doc-cancel" data-id="${a.id}">요청 취소</button>`;
    } else if (a.status === 'rejected' && a.user_id === me().id) {
      actions = `<button class="btn" data-act="doc-new" data-type="${a.type}">다시 작성하기</button>`;
    }
    A.sheet.show(
      t.pick ? t.name : '결재 상세',
      `<div class="row" style="justify-content:space-between;align-items:flex-start"><p style="font-weight:800;font-size:17px">${esc(a.title)}</p><span class="st ${cls}">${label}</span></div>
      <p class="t13 muted" style="margin:4px 0 14px">${esc(a.user)} · ${A.ago(a.ts)} 제출</p>
      ${fields}
      ${files ? `<div class="files">${files}</div>` : ''}
      <div class="timeline" style="margin-top:18px"><div class="tl done"><i></i><b>기안 · ${esc(a.user)}</b><p>제출 완료</p></div>${steps}</div>
      <div style="margin-top:20px">${actions}</div>`
    );
  }
  A.acts['doc-approve'] = async (el) => {
    el.disabled = true;
    try {
      await A.post('approval.act', { id: Number(el.dataset.id), action: 'approve' });
      done('승인했어요');
    } catch (e) {
      el.disabled = false;
      A.err(e);
    }
  };
  A.acts['doc-reject'] = async (el) => {
    const wrap = A.$('#apRejWrap');
    if (wrap.hidden) {
      wrap.hidden = false;
      el.textContent = '반려 보내기';
      A.$('#apNote').focus();
      return;
    }
    const note = A.$('#apNote').value.trim();
    if (!note) return A.toast('반려 사유를 적어주세요');
    await A.post('approval.act', { id: Number(el.dataset.id), action: 'reject', note });
    done('반려했어요');
  };
  A.acts['doc-cancel'] = async (el) => {
    if (!(await A.ask({ title: '요청 취소', body: '결재 요청을 취소할까요?', ok: '요청 취소', danger: true }))) return;
    await A.post('approval.act', { id: Number(el.dataset.id), action: 'cancel' });
    done('요청을 취소했어요');
  };

  // ==================================================================
  // 공지
  // ==================================================================
  const N = { cat: '전체', data: null };
  A.views['ws-notice'] = async (main, r, alive) => {
    const d = await A.api('notices');
    if (!alive()) return;
    N.data = d;
    A.setBadges(d.badges);
    drawNotices(main);
    if (d.can_write) A.$('#fab').innerHTML = `<button class="fab" data-act="notice-edit">${ic('pen', 18, 2.2)}공지 쓰기</button>`;
    if (r.id) openNotice(r.id);
  };
  function drawNotices(main) {
    const d = N.data;
    const cats = ['전체', '필독', ...d.categories];
    const list = d.notices.filter((n) => N.cat === '전체' || (N.cat === '필독' ? n.must : n.category === N.cat));
    const pending = d.notices.filter((n) => n.need_confirm).length;
    main.innerHTML = `
      <div class="page-h"><div><h2>공지</h2><p>${pending ? `<span style="color:var(--warn);font-weight:600">확인이 필요한 필독 공지 ${pending}건</span>` : '모든 필독 공지를 확인했어요'}</p></div></div>
      <div class="chips">${cats.map((c) => `<button class="chip ${c === N.cat ? 'on' : ''}" data-act="notice-cat" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <section class="card">
        ${
          list
            .map(
              (n) => `<button class="post ${n.read ? '' : 'unread'}" data-act="notice" data-id="${n.id}">
            <span class="row" style="gap:6px">${n.must ? '<span class="tag danger">필독</span>' : ''}<span class="tag primary">${esc(n.category)}</span>${n.need_confirm ? '<span class="st late" style="height:20px">확인 필요</span>' : ''}</span>
            <h4>${esc(n.title)}</h4><p class="ellipsis">${esc(n.preview)}</p>
            <div class="meta"><span>${esc(n.author)} · ${A.ago(n.ts)}</span>${n.must ? `<span>확인 ${n.confirm_count}/${n.staff_count}명</span>` : ''}</div>
          </button>`
            )
            .join('') || '<div class="empty">공지가 없어요</div>'
        }
      </section>`;
  }
  A.acts['notice-cat'] = (el) => {
    N.cat = el.dataset.c;
    drawNotices(A.$('#view'));
  };
  A.acts.notice = (el) => openNotice(Number(el.dataset.id));
  async function openNotice(id) {
    A.sheet.show('공지', '<div class="loading"><div class="spinner"></div></div>');
    let d;
    try {
      d = await A.api('notice', { id });
    } catch (e) {
      A.sheet.close();
      return A.err(e);
    }
    if (!A.sheet.open) return;
    A.setBadges(d.badges);
    const n = d.notice;
    const local = N.data && N.data.notices.find((x) => x.id === id);
    if (local) local.read = true;
    A.sheet.show(
      '공지',
      `<span class="row" style="gap:6px">${n.must ? '<span class="tag danger">필독</span>' : ''}<span class="tag primary">${esc(n.category)}</span></span>
      <h3 style="font-size:19px;font-weight:800;margin:8px 0 4px">${esc(n.title)}</h3>
      <p class="t13 muted" style="margin-bottom:16px">${esc(n.author)} · ${A.ago(n.ts)}</p>
      <p class="post-body" style="margin-top:0">${A.linkify(n.body)}</p>
      ${
        !n.must
          ? ''
          : n.need_confirm
            ? `<div style="margin-top:22px"><button class="btn" data-act="notice-confirm" data-id="${n.id}">${ic('check', 20, 2.4)}확인했어요</button></div>`
            : `<div class="confirm-box">${ic('check', 16, 2.6)} ${n.confirm_count}/${n.staff_count}명 확인<p>${n.pending_names.length ? '아직 확인 안 함: ' + n.pending_names.map(esc).join(', ') : '전원 확인했어요'}</p></div>`
      }
      ${n.can_edit ? `<div class="btn-row" style="margin-top:14px"><button class="btn ghost" data-act="notice-edit" data-id="${n.id}">${ic('pen', 18)}수정</button><button class="btn danger" data-act="notice-del" data-id="${n.id}">${ic('trash', 18)}삭제</button></div>` : ''}`
    );
    N.current = n;
    if (A.isCurrent('ws-notice') && N.data) drawNotices(A.$('#view'));
  }
  A.acts['notice-confirm'] = async (el) => {
    el.disabled = true;
    await A.post('notice.confirm', { id: Number(el.dataset.id) });
    A.toast('확인했어요');
    const d = await A.api('notices');
    N.data = d;
    if (A.isCurrent('ws-notice')) drawNotices(A.$('#view'));
    openNotice(Number(el.dataset.id));
  };
  A.acts['notice-edit'] = (el) => {
    const n = el.dataset.id ? N.current : null;
    const cats = (N.data && N.data.categories) || ['일반'];
    A.sheet.show(
      n ? '공지 수정' : '공지 쓰기',
      `<form data-form="notice-save">
        ${n ? `<input type="hidden" name="id" value="${n.id}">` : ''}
        <div class="field"><label>분류</label><select name="category">${cats.map((c) => `<option ${n && n.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>제목</label><input name="title" required maxlength="200" value="${esc(n ? n.title : '')}"></div>
        <div class="field"><label>내용</label><textarea name="body" class="tall" required>${esc(n ? n.body : '')}</textarea></div>
        <div class="switch-row" style="border:0;padding-top:0"><div><b>필독 공지</b><small>직원마다 '확인했어요'를 눌러야 해요</small></div><label class="switch"><input type="checkbox" name="must" ${n && n.must ? 'checked' : ''}><i></i></label></div>
        <p class="hint">${n ? '수정해도 알림은 다시 가지 않아요.' : '올리면 전 직원에게 알림이 가요.'}</p>
        <button class="btn" type="submit">${n ? '저장' : '올리기'}</button>
      </form>`
    );
  };
  A.forms['notice-save'] = async (f, d) => {
    await A.post('notice.save', d);
    done(d.id ? '공지를 수정했어요' : '공지를 올렸어요');
  };
  A.acts['notice-del'] = async (el) => {
    if (!(await A.ask({ title: '공지 삭제', body: '이 공지를 지울까요?', ok: '삭제', danger: true }))) return;
    await A.post('notice.delete', { id: Number(el.dataset.id) });
    A.go('ws/notice');
    A.toast('공지를 지웠어요');
  };

  // ==================================================================
  // 내 정보
  // ==================================================================
  const P = { idx: 0 };
  A.views['ws-me'] = async (main, r, alive) => {
    const pay = await A.api('pay');
    if (!alive()) return;
    drawMe(main, pay);
  };

  /** 급여 명세 카드 (내 정보, 임직원 화면에서 같이 씀) */
  A.payCard = (pay, idx, act = 'pay-month') => {
    if (!pay.slips.length) return '<div class="empty">아직 올라온 급여 명세가 없어요</div>';
    const s = pay.slips[Math.min(idx, pay.slips.length - 1)];
    const lines = (kind) =>
      s.items
        .filter((i) => i.kind === kind)
        .map((i) => `<div class="pay-line ${kind === 'deduct' ? 'minus' : ''}"><span>${esc(i.label)}</span><b>${kind === 'deduct' ? '−' : ''}${A.won(i.amount)}</b></div>`)
        .join('');
    return `<div class="chips">${pay.slips.map((x, i) => `<button class="chip ${i === idx ? 'on' : ''}" data-act="${act}" data-i="${i}">${Number(x.month.slice(5))}월</button>`).join('')}</div>
      <p class="t13 muted">${s.month.slice(0, 4)}년 ${Number(s.month.slice(5))}월 실수령액</p>
      <div class="pay-big">${A.won(s.net)}</div>
      <p class="t13 muted">지급 ${A.won(s.gross)} − 공제 ${A.won(s.deduct)}</p>
      <div class="pay-sec"><h4><span>지급</span><span>${A.won(s.gross)}</span></h4>${lines('pay')}</div>
      <div class="pay-sec"><h4><span>공제</span><span>${A.won(s.deduct)}</span></h4>${lines('deduct') || '<div class="pay-line"><span>공제 없음</span><b>0원</b></div>'}</div>
      ${s.memo ? `<p class="desc-box">${esc(s.memo)}</p>` : ''}`;
  };
  /** 근로계약서 내용 */
  A.contractHtml = (c) =>
    `<div class="kv"><span>계약 형태</span><b>${esc(c.type || '-')}</b></div>
    <div class="kv"><span>계약 기간</span><b>${c.start ? A.md(c.start) : '-'}${c.end ? ' ~ ' + A.md(c.end) : ' ~'}</b></div>
    <div class="kv"><span>근무 시간</span><b>${esc(c.hours || '-')}</b></div>
    <div class="kv"><span>급여</span><b>${esc(c.salary || '-')}</b></div>
    ${c.file ? `<a class="btn" style="margin-top:18px" href="${esc(c.file.url)}">${ic('download', 18)}계약서 파일 받기</a>` : '<p class="t13 muted" style="margin-top:14px">계약서 파일은 아직 올라오지 않았어요.</p>'}`;

  function drawMe(main, pay) {
    const m = me();
    main.innerHTML = `
      <section class="card">
        <div class="profile">
          <button class="av-edit" data-act="avatar-menu" aria-label="프로필 사진 바꾸기">${A.avatar(m)}<span class="av-cam">${ic('camera', 13, 2.2)}</span></button>
          <input type="file" accept="image/*" hidden id="avatarInput">
          <div class="grow"><b>${esc(m.name)}</b><p>${esc(A.roleLabel(m))}${m.is_admin ? ' · 관리자' : ''}</p></div>
          <button class="btn sm ghost" data-act="me-edit">수정</button>
        </div>
      </section>
      <section class="card" style="padding-top:12px;padding-bottom:6px">
        <div class="kv"><span>이메일</span><b>${esc(m.email)}</b></div>
        <div class="kv"><span>연락처</span><b>${esc(m.phone || '없음')}</b></div>
        <div class="kv"><span>입사일</span><b>${m.joined_on ? A.md(m.joined_on) : '-'}</b></div>
        <div class="kv"><span>결재 담당</span><b>${m.approvers.map((id) => esc((A.mem(id) || {}).name || '')).join(' → ') || '전결'}</b></div>
      </section>
      <section class="card" style="padding-top:12px;padding-bottom:6px">
        <button class="menu-row" data-act="contract"><span class="doc-ic c-primary">${ic('file', 18, 2)}</span><span class="grow">내 계약서 확인하기</span>${pay.contract ? '' : '<small>없음</small>'}${ic('chevR', 18)}</button>
      </section>
      <section class="card"><div class="card-h"><h3>급여 명세</h3></div><div id="payBox">${A.payCard(pay, P.idx)}</div></section>
      <section class="card">
        <div class="card-h"><h3>화면 모드</h3></div>
        <div class="theme-pick">
          <button class="${A.theme.get() === 'light' ? 'on' : ''}" data-act="theme" data-t="light"><span class="sw light"><i></i><i></i></span>${ic('sun', 16)} 밝은 화면</button>
          <button class="${A.theme.get() === 'dark' ? 'on' : ''}" data-act="theme" data-t="dark"><span class="sw dark"><i></i><i></i></span>${ic('moon', 16)} 어두운 화면</button>
        </div>
      </section>
      <section class="card" style="padding-top:12px;padding-bottom:6px">
        <div class="switch-row"><div><b>알림 받기</b><small id="pushStatus">확인 중…</small></div><label class="switch" id="pushSwitch" hidden><input type="checkbox" id="pushToggle"><i></i></label></div>
        ${A.installEvent ? `<button class="menu-row" data-act="install"><span class="doc-ic c-ok">${ic('install', 18, 2)}</span><span class="grow">앱으로 설치하기</span>${ic('chevR', 18)}</button>` : ''}
        ${A.isIOS && !A.isStandalone ? `<div class="menu-row" style="font-weight:500"><span class="doc-ic c-ok">${ic('install', 18, 2)}</span><span class="grow t13">아이폰은 Safari 아래 <b>공유</b> → <b>홈 화면에 추가</b>로 설치해야 알림을 받을 수 있어요.</span></div>` : ''}
        <button class="menu-row" data-act="password"><span class="doc-ic c-gray">${ic('lock', 18, 2)}</span><span class="grow">비밀번호 바꾸기</span>${ic('chevR', 18)}</button>
        <button class="menu-row" data-act="logout" style="color:var(--danger)"><span class="doc-ic c-danger">${ic('logout', 18, 2)}</span><span class="grow">로그아웃</span></button>
      </section>`;
    P.pay = pay;
    A.$('#avatarInput').addEventListener('change', onAvatar);
    initPush();
  }
  A.acts['pay-month'] = (el) => {
    P.idx = Number(el.dataset.i);
    A.$('#payBox').innerHTML = A.payCard(P.pay, P.idx);
  };
  A.acts.contract = () => {
    const c = P.pay.contract;
    A.sheet.show(c ? c.title : '근로계약서', c ? A.contractHtml(c) : '<div class="empty">아직 등록된 계약서가 없어요.<br>대표가 임직원 화면에서 등록할 수 있어요.</div>');
  };
  A.acts.theme = (el) => {
    A.theme.set(el.dataset.t);
    A.$$('.theme-pick button').forEach((b) => b.classList.toggle('on', b.dataset.t === el.dataset.t));
  };
  A.acts['me-edit'] = () => {
    const m = me();
    A.sheet.show(
      '내 정보 수정',
      `<form data-form="me-save">
        <div class="field"><label>이름</label><input name="display_name" required maxlength="50" value="${esc(m.name)}"></div>
        <div class="field"><label>연락처 (선택)</label><input name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(m.phone || '')}" placeholder="010-1234-5678"><small>비워두면 다른 사람에게 보이지 않아요</small></div>
        <button class="btn" type="submit">저장</button>
      </form>`
    );
  };
  A.forms['me-save'] = async (f, d) => {
    await A.post('me.update', d);
    await A.loadData();
    done('저장했어요');
  };
  // ------------------------------------------------------------------
  // 프로필 사진 편집: 원형 미리보기 · 확대/축소 · 위치 이동 → 원에 맞춰 잘라 저장
  // 잘라낸 정사각형(512px)을 올리고, 화면에서는 동그랗게 보여줌
  // ------------------------------------------------------------------
  const CROP = { img: null, url: '', s: 1, base: 1, x: 0, y: 0, S: 280 };

  A.acts['avatar-menu'] = () => {
    const has = !!me().av;
    if (!has) return A.$('#avatarInput').click();
    A.sheet.show(
      '프로필 사진',
      `<button class="menu-row" data-act="avatar-pick"><span class="doc-ic c-primary">${ic('image', 18, 2)}</span><span class="grow">새 사진 고르기</span>${ic('chevR', 18)}</button>
      <button class="menu-row" data-act="avatar-del" style="color:var(--danger)"><span class="doc-ic c-danger">${ic('trash', 18, 2)}</span><span class="grow">사진 지우기</span></button>`
    );
  };
  A.acts['avatar-pick'] = () => {
    A.sheet.close();
    A.$('#avatarInput').click();
  };
  A.acts['avatar-del'] = async () => {
    if (!(await A.ask({ title: '사진 지우기', body: '프로필 사진을 지울까요?', ok: '지우기', danger: true }))) return;
    const fd = new FormData();
    fd.append('action', 'delete');
    await avatarPost(fd);
    done('프로필 사진을 지웠어요');
  };

  async function avatarPost(fd) {
    const res = await fetch(`${A.BASE}/api/avatar.php`, { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': A.csrf(), Accept: 'application/json' } });
    const d = await res.json().catch(() => ({}));
    if (d.csrf) A.setCsrf(d.csrf);
    if (!res.ok) throw new Error(d.error || '사진을 바꾸지 못했어요.');
    await A.loadData();
    return d;
  }

  function onAvatar(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) return A.toast('사진 파일만 고를 수 있어요.');
    if (CROP.url) URL.revokeObjectURL(CROP.url);
    CROP.url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => openCropper(img);
    img.onerror = () => A.toast('이 사진은 열 수 없어요. JPG나 PNG로 다시 골라 주세요.');
    img.src = CROP.url;
  }

  function openCropper(img) {
    CROP.img = img;
    A.sheet.show(
      '프로필 사진 편집',
      `<div class="crop-stage" id="cropStage"><img src="${CROP.url}" alt="" draggable="false" id="cropImg"><div class="crop-ring"></div></div>
      <p class="crop-tip">끌어서 위치를 옮기고, 두 손가락이나 아래 막대로 크기를 맞춰요</p>
      <div class="crop-zoom">${ic('zoomOut', 18, 2)}<input type="range" id="cropZoom" min="100" max="400" value="100" aria-label="확대"><span>${ic('zoomIn', 18, 2)}</span></div>
      <div class="crop-preview"><span class="avatar"><canvas id="cropPrev" width="96" height="96"></canvas></span><span class="t13 muted">이렇게 보여요</span></div>
      <div class="btn-row" style="margin-top:16px"><button class="btn ghost" data-sheet-close>취소</button><button class="btn" data-act="crop-save">저장</button></div>`
    );
    const stage = A.$('#cropStage');
    CROP.S = stage.clientWidth;
    CROP.base = CROP.S / Math.min(img.naturalWidth, img.naturalHeight);
    CROP.s = 1;
    CROP.x = 0;
    CROP.y = 0;
    cropApply();
    const zoom = A.$('#cropZoom');
    zoom.addEventListener('input', () => cropZoomTo(zoom.value / 100));
    // 끌기 · 두 손가락 확대
    const pts = new Map();
    let drag = null;
    let pinch = null;
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) drag = { x: e.clientX - CROP.x, y: e.clientY - CROP.y };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: CROP.s };
        drag = null;
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        cropZoomTo(pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
      } else if (drag) {
        CROP.x = e.clientX - drag.x;
        CROP.y = e.clientY - drag.y;
        cropApply();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 1) {
        const p = [...pts.values()][0];
        drag = { x: p.x - CROP.x, y: p.y - CROP.y };
      }
      if (!pts.size) drag = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        cropZoomTo(CROP.s * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
      },
      { passive: false }
    );
  }

  function cropZoomTo(s) {
    const ns = Math.min(4, Math.max(1, s));
    // 가운데를 기준으로 확대
    CROP.x *= ns / CROP.s;
    CROP.y *= ns / CROP.s;
    CROP.s = ns;
    const z = A.$('#cropZoom');
    if (z && Math.round(ns * 100) !== Number(z.value)) z.value = Math.round(ns * 100);
    cropApply();
  }

  /** 사진이 원을 항상 다 덮도록 위치를 제한하고 화면에 반영 */
  function cropApply() {
    const { img, S } = CROP;
    const k = CROP.base * CROP.s;
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    const mx = (w - S) / 2;
    const my = (h - S) / 2;
    CROP.x = Math.min(mx, Math.max(-mx, CROP.x));
    CROP.y = Math.min(my, Math.max(-my, CROP.y));
    const el = A.$('#cropImg');
    if (!el) return;
    el.style.transform = `translate(${S / 2 + CROP.x - w / 2}px, ${S / 2 + CROP.y - h / 2}px) scale(${k})`;
    drawCrop(A.$('#cropPrev'));
  }

  /** 원 안의 영역(정사각형)을 캔버스에 그리기 */
  function drawCrop(canvas) {
    if (!canvas) return;
    const { img, S } = CROP;
    const k = CROP.base * CROP.s;
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    const tx = S / 2 + CROP.x - w / 2;
    const ty = S / 2 + CROP.y - h / 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -tx / k, -ty / k, S / k, S / k, 0, 0, canvas.width, canvas.height);
  }

  A.acts['crop-save'] = async (el) => {
    el.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      drawCrop(canvas);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('사진을 만들지 못했어요. 다시 시도해 주세요.');
      const fd = new FormData();
      fd.append('file', blob, 'avatar.jpg');
      await avatarPost(fd);
      done('프로필 사진을 바꿨어요');
    } catch (err) {
      el.disabled = false;
      A.err(err);
    }
  };
  A.acts.password = () => {
    A.sheet.show(
      '비밀번호 바꾸기',
      `<form data-form="password">
        <p class="t13 muted" style="margin-bottom:14px">conas.kr 메인 사이트 비밀번호도 함께 바뀌어요.</p>
        <div class="field"><label>현재 비밀번호</label><input type="password" name="current" autocomplete="current-password" required></div>
        <div class="field"><label>새 비밀번호 (8자 이상)</label><input type="password" name="new" autocomplete="new-password" minlength="8" maxlength="72" required></div>
        <div class="field"><label>새 비밀번호 확인</label><input type="password" name="new2" autocomplete="new-password" minlength="8" maxlength="72" required></div>
        <button class="btn" type="submit">바꾸기</button>
      </form>`
    );
  };
  A.forms.password = async (f, d) => {
    if (d.new !== d.new2) throw new Error('새 비밀번호 확인이 일치하지 않아요.');
    await A.post('me.password', d);
    done('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.');
  };
  A.acts.logout = async () => {
    if (!(await A.ask({ title: '로그아웃', body: '이 기기에서 로그아웃할까요?', ok: '로그아웃' }))) return;
    const f = document.createElement('form');
    f.method = 'post';
    f.action = `${A.BASE}/logout.php`;
    f.innerHTML = `<input type="hidden" name="_csrf" value="${esc(A.csrf())}">`;
    document.body.appendChild(f);
    f.submit();
  };
  A.acts.install = async () => {
    if (!A.installEvent) return;
    A.installEvent.prompt();
    await A.installEvent.userChoice.catch(() => {});
    A.installEvent = null;
    reload();
  };
  async function initPush() {
    const st = A.$('#pushStatus');
    const sw = A.$('#pushSwitch');
    const tg = A.$('#pushToggle');
    if (!st) return;
    if (!A.push.supported) {
      st.textContent = A.isIOS && !A.isStandalone ? '홈 화면에 추가한 앱에서 켤 수 있어요 (iOS 16.4 이상)' : '이 브라우저는 알림을 지원하지 않아요';
      return;
    }
    if (Notification.permission === 'denied') {
      st.textContent = '알림이 차단되어 있어요. 휴대폰(브라우저) 설정에서 허용해 주세요';
      return;
    }
    const sub = await A.push.subscription().catch(() => null);
    const on = !!sub && Notification.permission === 'granted';
    st.textContent = on ? '업무 배정, 결재, 새 메시지를 알려드려요' : '꺼져 있어요';
    sw.hidden = false;
    tg.checked = on;
    tg.onchange = async () => {
      tg.disabled = true;
      try {
        if (tg.checked) {
          await A.push.enable();
          A.toast('알림을 켰어요');
        } else {
          await A.push.disable();
          A.toast('알림을 껐어요');
        }
      } catch (e) {
        tg.checked = !tg.checked;
        A.err(e);
      }
      tg.disabled = false;
      initPush();
    };
  }
})();
