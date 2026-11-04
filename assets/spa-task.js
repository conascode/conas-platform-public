/*
 * 워크스페이스 > 업무 · 프로젝트
 *  - 업무 탭: 검토 요청, 내 할 일(지연/오늘/이번 주/나중에), 프로젝트 카드, 회사 마감
 *  - 프로젝트 화면(#/ws/project/3): 위쪽 단계 줄(옆으로 밀기, 현재 단계가 가운데), 단계별 업무
 *  - 업무는 프로젝트의 특정 단계에 추가할 수 있음
 */
(() => {
  'use strict';
  const { esc, ic } = A;
  const me = () => A.data.me;
  const done = (msg) => {
    A.sheet.close();
    if (msg) A.toast(msg);
    A.refresh();
  };

  const T = { view: 'mine', showDone: false, data: null };
  /** 완료한 업무 수정 규칙: [선택지 이름, 프로젝트 화면 표시, 설명] */
  const EDIT_DONE = [
    ['수정 불가', '', '완료된 업무는 배정한 사람만 고칠 수 있어요'],
    ['자기 업무만', '완료한 자기 업무 수정 가능', '담당자가 이미 완료한 자기 업무를 고칠 수 있어요'],
    ['누구나', '완료한 업무 누구나 수정 가능', '이 프로젝트를 볼 수 있는 사람이면 완료된 업무를 누구 것이든 고칠 수 있어요'],
  ];
  const PJ = { id: null, data: null, filter: null };

  // ==================================================================
  // 업무 탭
  // ==================================================================
  A.views['ws-task'] = async (main, r, alive) => {
    const leader = me().role !== 'member';
    if (!leader) T.view = 'mine';
    const d = await A.api('tasks', { view: T.view });
    if (!alive()) return;
    T.data = d;
    A.setBadges(d.badges);
    drawTasks(main);
    A.$('#fab').innerHTML = `<button class="fab" data-act="task-new">${ic('plus', 18, 2.4)}${me().assignable.length ? '업무 추가' : '할 일 추가'}</button>`;
  };

  function stateChip(t) {
    if (t.status === 'done') return '<span class="st ok">완료</span>';
    if (t.status === 'review') return '<span class="st rv">검토 중</span>';
    return `<span class="st ${A.ddayCls(t.dday)}">${A.ddayLabel(t.dday)}</span>`;
  }

  /** opt.noProject: 프로젝트 화면 안에서는 프로젝트 이름 대신 단계만 */
  function taskRow(t, opt = {}) {
    const sub = !t.mine ? `${esc(t.assignee)} 담당` : t.assigner_id === me().id ? '직접 등록' : `${esc(t.assigner || '')} 배정`;
    const tag = opt.noProject ? '' : `<span class="tag">${esc(t.project_short || t.project || '개인')}${t.stage && !opt.noStage ? ' · ' + esc(t.stage) : ''}</span>`;
    return `<div class="task ${t.status === 'done' ? 'done' : ''}">
      <button class="tchk ${t.status === 'done' ? 'on' : t.status === 'review' ? 'rv' : ''}" data-act="task" data-id="${t.id}" aria-label="업무 상세">${t.status === 'review' ? ic('clock', 14, 2.6) : ic('check', 14, 3)}</button>
      <button class="task-main" data-act="task" data-id="${t.id}">
        <span class="t15 ellipsis block">${esc(t.title)}</span>
        <span class="task-meta">${tag}${t.reject_note && t.status === 'todo' ? '<span class="tag danger">반려됨</span>' : ''}<span class="who">${sub}</span></span>
      </button>
      ${stateChip(t)}
    </div>`;
  }

  function projectCard(p) {
    const st = p.stages[p.current_index] || p.stages[0];
    return `<button class="proj" data-go="ws/project/${p.id}">
      <div class="row" style="justify-content:space-between"><b class="t15">${esc(p.name)}</b><span class="st ${{ late: 'no', warn: 'late', ok: 'ok' }[p.state]}">${{ late: '지연', warn: '주의', ok: '순조' }[p.state]}</span></div>
      <p class="t13 muted" style="margin:4px 0 12px">${esc(st.name)} 단계 (${p.current_index + 1}/${p.stages.length})${p.due ? ' · 마감 ' + A.ddayLabel(p.dday) : ''}${p.team ? ' · ' + esc(p.team) : ''}</p>
      <div class="bar"><i class="${p.state}" style="width:${p.pct}%"></i></div>
      <div class="row" style="justify-content:space-between;margin-top:10px">
        <span class="t13"><b>${p.pct}%</b> <span class="muted">· 업무 ${p.done}/${p.total}</span></span>
        <span class="avs">${p.people.slice(0, 6).map((id) => A.avatar(A.mem(id) || { name: '?' })).join('')}</span>
      </div></button>`;
  }

  function drawTasks(main) {
    const d = T.data;
    const leader = me().role !== 'member';
    const open = d.tasks.filter((t) => t.status !== 'done');
    const finished = d.tasks.filter((t) => t.status === 'done');
    const active = open.filter((t) => t.status === 'todo');
    const reviewIds = new Set(d.reviews.map((t) => t.id));
    const waiting = open.filter((t) => t.status === 'review' && !reviewIds.has(t.id));
    const endWeek = 6 - new Date().getDay();
    const groups = [
      ['지연', (t) => t.dday < 0],
      ['오늘', (t) => t.dday === 0],
      ['이번 주', (t) => t.dday > 0 && t.dday <= endWeek],
      ['나중에', (t) => t.dday > endWeek],
    ];
    const cnt = (i) => active.filter(groups[i][1]).length;
    const list =
      groups
        .map(([g, f]) => {
          const l = active.filter(f);
          return l.length ? `<div class="grp">${g}<span>${l.length}</span></div>${l.map((t) => taskRow(t)).join('')}` : '';
        })
        .join('') + (waiting.length ? `<div class="grp">검토 기다리는 중<span>${waiting.length}</span></div>${waiting.map((t) => taskRow(t)).join('')}` : '');

    main.innerHTML = `
      <div class="page-h"><div><h2>업무</h2><p>${A.isCeo() ? '전체 프로젝트' : esc(me().team || '소속 없음') + ' · 참여 프로젝트'}</p></div>
        ${leader ? `<div class="seg"><button class="${T.view === 'mine' ? 'on' : ''}" data-act="task-view" data-v="mine">내 업무</button><button class="${T.view === 'team' ? 'on' : ''}" data-act="task-view" data-v="team">${A.isCeo() ? '전체' : '팀 전체'}</button></div>` : ''}
      </div>
      <div class="stats">
        <div class="stat"><span>지연</span><b style="color:${cnt(0) ? 'var(--danger)' : 'inherit'}">${cnt(0)}<small>건</small></b></div>
        <div class="stat"><span>오늘 마감</span><b style="color:${cnt(1) ? 'var(--warn)' : 'inherit'}">${cnt(1)}<small>건</small></b></div>
        <div class="stat"><span>이번 주</span><b>${cnt(2)}<small>건</small></b></div>
      </div>
      ${d.reviews.length ? `<section class="card review-card"><div class="card-h"><h3>검토 요청 <span style="color:var(--leave)">${d.reviews.length}</span></h3><span class="t13 muted">확정하거나 반려해 주세요</span></div>${d.reviews.map((t) => taskRow(t)).join('')}</section>` : ''}
      <section class="card">
        <div class="card-h"><h3>${T.view === 'mine' ? '내 할 일' : '팀 업무'}</h3><span class="t13 muted">남은 ${open.length}건</span></div>
        ${list || '<div class="empty">남은 업무가 없어요 🎉</div>'}
        ${finished.length ? `<button class="done-toggle" data-act="task-done-toggle">완료한 업무 ${finished.length}건 ${T.showDone ? '접기' : '보기'}</button>${T.showDone ? finished.map((t) => taskRow(t)).join('') : ''}` : ''}
      </section>
      <section class="card">
        <div class="card-h"><h3>프로젝트</h3>${leader ? `<button class="more" data-act="project-edit">${ic('plus', 14, 2.4)} 새 프로젝트</button>` : `<span class="t13 muted">${d.projects.length}개</span>`}</div>
        ${d.projects.map(projectCard).join('') || '<div class="empty">볼 수 있는 프로젝트가 없어요</div>'}
      </section>
      <section class="card">
        <div class="card-h"><h3>회사 전체 마감</h3>${d.can_manage ? `<button class="more" data-act="deadline-new">${ic('plus', 14, 2.4)} 추가</button>` : ''}</div>
        ${
          d.deadlines
            .map(
              (x) => `<div class="list-item">
            <span class="doc-ic c-leave">${ic('flag', 18, 2)}</span>
            <span class="grow"><span class="t15 block">${esc(x.title)}</span><span class="t13 muted">${A.md(x.due)}${x.description ? ' · ' + esc(x.description) : ''}</span></span>
            <span class="st ${A.ddayCls(x.dday)}">${A.ddayLabel(x.dday)}</span>
            ${d.can_manage ? `<button class="icon-btn" data-act="deadline-del" data-id="${x.id}" aria-label="삭제">${ic('x', 16)}</button>` : ''}
          </div>`
            )
            .join('') || '<div class="empty">등록된 마감이 없어요</div>'
        }
      </section>`;
  }

  A.acts['task-view'] = (el) => {
    T.view = el.dataset.v;
    A.refresh();
  };
  A.acts['task-done-toggle'] = () => {
    T.showDone = !T.showDone;
    drawTasks(A.$('#view'));
  };

  // ==================================================================
  // 프로젝트 화면
  // ==================================================================
  A.views.project = async (main, r, alive) => {
    const d = await A.api('project', { id: r.id });
    if (!alive()) return;
    if (PJ.id !== r.id) PJ.filter = null;
    PJ.id = r.id;
    PJ.data = d;
    drawProject(main);
  };

  function drawProject(main) {
    const { project: p, tasks } = PJ.data;
    const cur = p.current_index;
    const sel = PJ.filter;
    const selStage = sel ? p.stages.find((s) => s.id === sel) : null;
    const ids = new Set(p.stages.map((s) => s.id));
    const noStage = tasks.filter((t) => !t.stage_id || !ids.has(t.stage_id));
    const rowOpt = { noProject: true };

    // 단계별 업무: 전체 보기면 업무가 있는 단계 + 현재 단계만, 단계를 고르면 그 단계만
    const shown = sel ? p.stages.filter((s) => s.id === sel) : p.stages.filter((s, i) => s.total > 0 || i === cur);
    const groups =
      shown
        .map((s) => {
          const i = p.stages.indexOf(s);
          const list = tasks.filter((t) => t.stage_id === s.id);
          return `<div class="stage-grp ${i === cur ? 'now' : ''}">
          <div class="stage-grp-h"><span class="stage-no">${i + 1}</span><b>${esc(s.name)}</b>${i === cur ? '<span class="tag primary">현재</span>' : i < cur ? '<span class="tag">지난 단계</span>' : ''}
            <span class="grow"></span><span class="t13 muted">${s.done}/${s.total}</span>
            <button class="icon-btn" data-act="task-new" data-project="${p.id}" data-stage="${esc(s.id)}" aria-label="이 단계에 업무 추가">${ic('plus', 18, 2.2)}</button></div>
          ${list.map((t) => taskRow(t, rowOpt)).join('') || '<p class="t13 muted" style="padding:6px 0 10px">이 단계에는 아직 업무가 없어요</p>'}
        </div>`;
        })
        .join('') +
      (!sel && noStage.length ? `<div class="stage-grp"><div class="stage-grp-h"><b>단계 없음</b><span class="grow"></span><span class="t13 muted">${noStage.length}</span></div>${noStage.map((t) => taskRow(t, rowOpt)).join('')}</div>` : '');

    main.innerHTML = `
      <div class="sub-h">
        <button class="icon-btn" data-act="project-back" aria-label="뒤로">${ic('back', 24, 2)}</button>
        <div class="t"><b>${esc(p.name)}</b><small>${esc(p.team || '팀 없음')}${p.due ? ` · 마감 ${A.md(p.due)} (${A.ddayLabel(p.dday)})` : ''}</small></div>
        ${p.can_edit ? `<button class="icon-btn" data-act="project-edit" data-id="${p.id}" aria-label="프로젝트 설정">${ic('settings', 20)}</button>` : ''}
      </div>
      <div class="stage-bar" id="stageBar" role="tablist" aria-label="프로젝트 단계">
        <div class="stage-track">${p.stages
          .map(
            (s, i) => `<button class="stage-pill ${i < cur ? 'done' : i === cur ? 'now' : ''} ${sel === s.id ? 'sel' : ''}" data-act="stage-filter" data-id="${esc(s.id)}" role="tab" aria-selected="${sel === s.id}">
              <i></i><b>${esc(s.name)}</b><small>${s.total ? `${s.done}/${s.total}` : '-'}</small></button>`
          )
          .join('')}</div>
      </div>
      <div class="scroll" style="padding:12px 16px 100px">
        ${sel ? `<div class="filter-bar"><span>${esc(selStage.name)} 단계만 보는 중</span><button data-act="stage-filter" data-id="">전체 보기</button></div>` : ''}
        <section class="card">
          <div class="stats" style="margin-bottom:12px">
            <div class="stat flat"><span>진행률</span><b>${p.pct}<small>%</small></b></div>
            <div class="stat flat"><span>남은 업무</span><b>${p.total - p.done}<small>건</small></b></div>
            <div class="stat flat"><span>지연</span><b style="color:${p.late ? 'var(--danger)' : 'inherit'}">${p.late}<small>건</small></b></div>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="tag ${p.require_review ? 'leave' : 'primary'}">${p.require_review ? '완료할 때 승인 필요' : '승인 없이 바로 완료'}</span>
            ${p.edit_done ? `<span class="tag">${EDIT_DONE[p.edit_done][1]}</span>` : ''}
            <span class="tag">단계 ${cur + 1}/${p.stages.length}</span>
          </div>
          <div class="grp">참여 인원<span>${p.members.length}</span></div>
          <div class="member-chips">${p.members.map((id) => A.mem(id)).filter(Boolean).map((m) => `<button class="member-chip" data-act="person" data-id="${m.id}">${A.avatar(m)}<span>${esc(m.name)}</span></button>`).join('') || '<span class="t13 muted">아직 정하지 않았어요</span>'}</div>
        </section>
        <section class="card">${groups || '<div class="empty">아직 업무가 없어요</div>'}</section>
      </div>`;
    A.$('#fab').innerHTML = `<button class="fab low" data-act="task-new" data-project="${p.id}" data-stage="${esc(sel || p.current)}">${ic('plus', 18, 2.4)}${sel ? esc(selStage.name) + '에 ' : ''}업무 추가</button>`;
    centerStage(sel || p.current, false);
  }

  /** 단계 줄에서 해당 단계를 가운데로 */
  function centerStage(id, smooth) {
    requestAnimationFrame(() => {
      const bar = A.$('#stageBar');
      if (!bar) return;
      const el = A.$$('.stage-pill', bar).find((x) => x.dataset.id === id);
      if (!el) return;
      bar.scrollTo({ left: el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'instant' });
    });
  }

  A.acts['stage-filter'] = (el) => {
    const id = el.dataset.id;
    PJ.filter = !id || PJ.filter === id ? null : id;
    const main = A.$('#view');
    const bar = A.$('#stageBar');
    const left = bar ? bar.scrollLeft : 0;
    drawProject(main);
    // 다시 그려도 단계 줄 위치를 유지한 채 부드럽게 이동
    const nb = A.$('#stageBar');
    if (nb) nb.scrollLeft = left;
    centerStage(PJ.filter || PJ.data.project.current, true);
  };
  A.acts['project-back'] = () => A.back('ws/task');

  // ==================================================================
  // 업무 상세 · 완료 흐름
  // ==================================================================
  const allTasks = () => [...((T.data && T.data.tasks) || []), ...((T.data && T.data.reviews) || []), ...((PJ.data && PJ.data.tasks) || [])];
  const findTask = (id) => allTasks().find((t) => t.id === id);

  A.acts.task = (el) => openTask(Number(el.dataset.id));
  function openTask(id) {
    const t = findTask(id);
    if (!t) return;
    const s = t.status;
    const rvName = t.reviewer ? esc(t.reviewer) : '';
    const flow = t.self
      ? `<div class="tl done"><i></i><b>${t.assigner_id === t.assignee_id ? '등록 · ' + esc(t.assignee) : '배정 · ' + esc(t.assigner || '')}</b><p>${t.no_review_project ? '이 프로젝트는 승인 없이 완료해요' : '직접 등록한 할 일이에요'}</p></div>
         <div class="tl ${s === 'done' ? 'done' : 'now'}"><i></i><b>${s === 'done' ? '완료' : '진행 중'}</b><p>검토 없이 바로 완료할 수 있어요</p></div>`
      : `<div class="tl done"><i></i><b>${t.assigner_id === t.assignee_id ? '직접 추가 · ' + esc(t.assignee) : '배정 · ' + esc(t.assigner || '')}</b><p>${t.assigner_id === t.assignee_id ? '프로젝트 업무라 완료할 때 확인을 받아요' : esc(t.assignee) + '님에게 배정'}</p></div>
         <div class="tl ${s === 'todo' ? 'now' : 'done'}"><i></i><b>완료 요청 · ${esc(t.assignee)}</b><p>${s === 'todo' ? (t.reject_note ? '반려돼서 다시 진행 중이에요' : '진행 중이에요') : esc(t.submit_note || '메모 없이 요청했어요')}</p></div>
         <div class="tl ${s === 'done' ? 'done' : s === 'review' ? 'now' : ''}"><i></i><b>검토 · ${rvName}</b><p>${s === 'done' ? '확정했어요' : s === 'review' ? '검토를 기다리는 중이에요' : '완료 요청이 오면 검토해요'}</p></div>`;
    let actions = '';
    if (t.self && t.mine) {
      actions = s === 'done' ? `<button class="btn ghost" data-act="task-do" data-id="${id}" data-a="reopen">완료 취소</button>` : `<button class="btn" data-act="task-do" data-id="${id}" data-a="done">${ic('check', 20, 2.4)}완료로 표시</button>`;
    } else if (t.mine && s === 'todo') {
      actions = `<div class="field"><label>완료 메모 (선택)</label><textarea id="tNote" placeholder="결과물 링크나 작업 내용을 적어주세요"></textarea></div>
        <button class="btn" data-act="task-do" data-id="${id}" data-a="submit">${ic('send', 18, 2.2)}${rvName}님께 완료 요청</button>`;
    } else if (t.mine && s === 'review') {
      actions = `<button class="btn ghost" data-act="task-do" data-id="${id}" data-a="cancel">완료 요청 취소</button>`;
    } else if (t.can_review && s === 'review') {
      actions = `<div class="field" id="rejWrap" hidden><label>반려 사유</label><textarea id="rejNote" placeholder="무엇을 고치면 되는지 적어주세요"></textarea></div>
        <div class="btn-row"><button class="btn ghost" id="rejBtn" data-act="task-reject" data-id="${id}">반려</button><button class="btn" style="flex:2" data-act="task-do" data-id="${id}" data-a="approve">${ic('check', 20, 2.4)}확정</button></div>`;
    } else if ((t.can_review || t.can_edit_due) && s === 'done') {
      actions = `<button class="btn ghost" data-act="task-do" data-id="${id}" data-a="reopen">완료 취소</button>`;
    }
    const tools = [
      t.can_edit ? `<button class="btn ghost" data-act="task-edit" data-id="${id}">${ic('pen', 18)}수정</button>` : '',
      t.can_delete ? `<button class="btn ghost" style="color:var(--danger)" data-act="task-do" data-id="${id}" data-a="delete">${ic('trash', 18)}삭제</button>` : '',
    ].join('');
    A.sheet.show(
      '업무 상세',
      `${t.project_id ? `<button class="tag primary" data-go="ws/project/${t.project_id}">${esc(t.project)}${t.stage ? ' · ' + esc(t.stage) : ''} ›</button>` : '<span class="tag">개인 할 일</span>'}
      <h3 style="font-size:19px;font-weight:800;margin:8px 0 14px">${esc(t.title)}</h3>
      <div class="kv"><span>담당</span><b>${esc(t.assignee)}</b></div>
      ${t.project_id ? `<div class="kv"><span>단계</span><b>${esc(t.stage || '단계 없음')}</b></div>` : ''}
      <div class="kv"><span>마감</span><b>${A.md(t.due)} <span style="margin-left:4px">${stateChip(t)}</span></b></div>
      ${t.description ? `<p class="desc-box">${A.linkify(t.description)}</p>` : ''}
      ${t.reject_note && s === 'todo' ? `<div class="reject-box"><b>반려 사유 · ${rvName}</b><p>${esc(t.reject_note)}</p></div>` : ''}
      <div class="timeline" style="margin-top:18px">${flow}</div>
      <div style="margin-top:20px">${actions}</div>
      ${tools ? `<div class="btn-row" style="margin-top:8px">${tools}</div>` : ''}
      ${s === 'done' && !t.can_edit && t.project_id ? '<p class="t13 muted" style="margin-top:10px;text-align:center">이 프로젝트는 완료한 업무를 고칠 수 없게 되어 있어요.</p>' : ''}
      ${s === 'done' && t.can_edit && !t.mine && !t.can_edit_due ? '<p class="t13 muted" style="margin-top:10px;text-align:center">이 프로젝트는 완료된 업무를 누구나 고칠 수 있어요.</p>' : ''}`
    );
  }

  const ACT_MSG = { submit: '완료를 요청했어요', cancel: '완료 요청을 취소했어요', approve: '업무를 확정했어요 👏', reject: '반려했어요', reopen: '다시 진행 중으로 바꿨어요', done: '업무를 완료했어요 👏', delete: '업무를 지웠어요' };
  A.acts['task-do'] = async (el) => {
    const a = el.dataset.a;
    const id = Number(el.dataset.id);
    if (a === 'delete' && !(await A.ask({ title: '업무 삭제', body: '이 업무를 지울까요? 되돌릴 수 없어요.', ok: '삭제', danger: true }))) return;
    const body = { id, action: a };
    const noteEl = A.$('#tNote');
    if (a === 'submit' && noteEl) body.note = noteEl.value;
    el.disabled = true;
    try {
      await A.post('task.act', body);
      done(ACT_MSG[a]);
    } catch (e) {
      el.disabled = false;
      A.err(e);
    }
  };
  A.acts['task-reject'] = async (el) => {
    const wrap = A.$('#rejWrap');
    if (wrap.hidden) {
      wrap.hidden = false;
      el.textContent = '반려 보내기';
      A.$('#rejNote').focus();
      return;
    }
    const note = A.$('#rejNote').value.trim();
    if (!note) return A.toast('반려 사유를 적어주세요');
    el.disabled = true;
    try {
      await A.post('task.act', { id: Number(el.dataset.id), action: 'reject', note });
      done('반려했어요');
    } catch (e) {
      el.disabled = false;
      A.err(e);
    }
  };

  // ==================================================================
  // 업무 추가 · 수정 (프로젝트 + 단계 선택)
  // ==================================================================
  /** 고를 수 있는 프로젝트 목록 (업무 탭 + 지금 보고 있는 프로젝트) */
  function projectChoices() {
    const map = new Map();
    if (PJ.data && A.isCurrent('project')) map.set(PJ.data.project.id, PJ.data.project);
    ((T.data && T.data.projects) || []).forEach((p) => map.set(p.id, p));
    return [...map.values()];
  }
  function stageOptions(p, selId) {
    const cur = selId && p.stages.some((s) => s.id === selId) ? selId : p.current;
    return p.stages.map((s, i) => `<option value="${esc(s.id)}" ${s.id === cur ? 'selected' : ''}>${i + 1}. ${esc(s.name)}${i === p.current_index ? ' (현재)' : ''}</option>`).join('');
  }
  /** 프로젝트를 바꾸면 단계 목록도 바꿈 */
  function bindProjectStage(form, projs) {
    const sync = () => {
      const p = projs.find((x) => x.id === Number(form.project_id.value));
      const box = A.$('#stageField', form);
      box.hidden = !p;
      if (p) A.$('select', box).innerHTML = stageOptions(p, A.$('select', box).value);
    };
    form.project_id.addEventListener('change', sync);
    return sync;
  }

  A.acts['task-new'] = (el) => {
    const projs = projectChoices();
    const pid = el && el.dataset && el.dataset.project ? Number(el.dataset.project) : null;
    const sid = el && el.dataset ? el.dataset.stage || '' : '';
    const people = me().assignable.map(A.mem).filter(Boolean);
    const rv = me().approvers[0] ? A.mem(me().approvers[0]) : null;
    const pre = projs.find((p) => p.id === pid);
    A.sheet.show(
      people.length ? '업무 추가' : '할 일 추가',
      `<form data-form="task-new" id="taskForm">
        ${people.length ? `<div class="field"><label>담당자</label><select name="assignee_id"><option value="${me().id}">나 (내 할 일)</option>${people.map((m) => `<option value="${m.id}">${esc(m.name)} (${esc(A.roleLabel(m))})</option>`).join('')}</select></div>` : ''}
        <div class="field-row">
          <div class="field"><label>프로젝트</label><select name="project_id"><option value="">개인 할 일</option>${projs.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
          <div class="field" id="stageField" ${pre ? '' : 'hidden'}><label>단계</label><select name="stage_id">${pre ? stageOptions(pre, sid) : ''}</select></div>
        </div>
        <p class="hint" id="taskHint" data-rv="${rv ? esc(rv.name + ' ' + A.ROLE[rv.role]) : ''}"></p>
        <div class="field"><label>업무명</label><input name="title" required maxlength="200" placeholder="예: 로그인 화면 개발"></div>
        <div class="field"><label>마감일</label><input type="date" name="due" value="${A.iso(A.addDays(A.today(), 3))}" required></div>
        <div class="field"><label>설명 (선택)</label><textarea name="description" placeholder="무엇을, 어디까지 하면 되는지 적어주세요"></textarea></div>
        <button class="btn" type="submit" id="taskBtn">추가하기</button>
      </form>`
    );
    const f = A.$('#taskForm');
    bindProjectStage(f, projs);
    const hint = () => {
      const h = A.$('#taskHint');
      const to = f.assignee_id ? Number(f.assignee_id.value) : me().id;
      const p = projs.find((x) => x.id === Number(f.project_id.value));
      A.$('#taskBtn').textContent = to !== me().id ? '배정하기' : '추가하기';
      if (p && !p.require_review) h.textContent = '이 프로젝트는 승인 없이 담당자가 바로 완료해요.';
      else if (to !== me().id) h.textContent = `${A.mem(to).name}님이 완료를 요청하면 내가 확정하거나 반려해요.`;
      else if (!p) h.textContent = '개인 할 일은 검토 없이 바로 완료할 수 있어요.';
      else h.textContent = h.dataset.rv ? `프로젝트 업무는 완료할 때 ${h.dataset.rv}님이 확인해요.` : '검토 없이 바로 완료할 수 있어요.';
    };
    f.addEventListener('change', hint);
    hint();
  };
  A.forms['task-new'] = async (f, d) => {
    await A.post('task.save', d);
    const to = Number(d.assignee_id || me().id);
    if (to !== me().id && A.isCurrent('ws-task')) T.view = 'team';
    done(to === me().id ? '할 일을 추가했어요' : `${A.mem(to).name}님에게 업무를 배정했어요`);
  };

  A.acts['task-edit'] = (el) => {
    const t = findTask(Number(el.dataset.id));
    if (!t) return;
    const projs = projectChoices();
    const p = projs.find((x) => x.id === t.project_id);
    A.sheet.show(
      '업무 수정',
      `<form data-form="task-edit" id="taskEdit" data-id="${t.id}">
        <div class="field"><label>업무명</label><input name="title" required maxlength="200" value="${esc(t.title)}"></div>
        ${
          t.can_move
            ? `<div class="field-row">
          <div class="field"><label>프로젝트</label><select name="project_id"><option value="">개인 할 일</option>${projs.map((x) => `<option value="${x.id}" ${x.id === t.project_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
          <div class="field" id="stageField" ${p ? '' : 'hidden'}><label>단계</label><select name="stage_id">${p ? stageOptions(p, t.stage_id) : ''}</select></div></div>`
            : p
              ? `<div class="field"><label>단계</label><select name="stage_id">${stageOptions(p, t.stage_id)}</select></div>`
              : ''
        }
        ${t.can_edit_due ? `<div class="field"><label>마감일</label><input type="date" name="due" value="${t.due}" required></div>` : `<p class="t13 muted" style="margin-bottom:14px">마감일은 배정한 사람만 바꿀 수 있어요. (${A.md(t.due)})</p>`}
        <div class="field"><label>설명</label><textarea name="description">${esc(t.description || '')}</textarea></div>
        ${t.status === 'done' ? '<p class="hint">완료 상태는 그대로 두고 내용만 고쳐요.</p>' : ''}
        <button class="btn" type="submit">저장</button>
      </form>`
    );
    if (t.can_move) bindProjectStage(A.$('#taskEdit'), projs);
  };
  A.forms['task-edit'] = async (f, d) => {
    await A.post('task.save', { id: Number(f.dataset.id), ...d });
    done('업무를 고쳤어요');
  };

  // ==================================================================
  // 프로젝트 만들기 · 설정 (단계, 참여 인원, 승인 · 수정 규칙)
  // ==================================================================
  const MAX_STAGES = 50;
  function stageRow(s) {
    return `<div class="stage-row" data-id="${esc(s.id || '')}"><span class="stage-no"></span><input value="${esc(s.name)}" maxlength="20" placeholder="단계 이름" required>
      <button type="button" class="icon-btn" data-act="stage-up" aria-label="위로">${ic('chevL', 16)}</button>
      <button type="button" class="icon-btn" data-act="stage-del" aria-label="단계 삭제">${ic('x', 16)}</button></div>`;
  }
  const defaultStages = () => ((T.data && T.data.default_stages) || (PJ.data && PJ.data.default_stages) || ['기획', '디자인', '개발', 'QA', '출시']).map((n) => ({ id: '', name: n }));

  A.acts['project-edit'] = (el) => {
    const id = el.dataset.id ? Number(el.dataset.id) : null;
    const p = id ? projectChoices().find((x) => x.id === id) : null;
    const teams = A.data.teams;
    const stages = p ? p.stages : defaultStages();
    const myTeam = p ? p.team_id : me().team_id;
    const chosen = new Set(p ? p.members : A.data.members.filter((m) => m.id === me().id || (me().team_id && m.team_id === me().team_id && m.role !== 'ceo')).map((m) => m.id));
    const people = [...A.data.members].sort((a, b) => (b.team_id === myTeam) - (a.team_id === myTeam));
    const sw = (name, label, sub, on) => `<div class="switch-row"><div><b>${label}</b><small>${sub}</small></div><label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i></label></div>`;
    A.sheet.show(
      p ? '프로젝트 설정' : '새 프로젝트',
      `<form data-form="project-save" id="projForm">
        ${p ? `<input type="hidden" name="id" value="${p.id}">` : ''}
        <div class="field"><label>프로젝트 이름</label><input name="name" required maxlength="100" value="${esc(p ? p.name : '')}"></div>
        <div class="field-row">
          <div class="field"><label>짧은 이름 (태그)</label><input name="short_name" maxlength="20" value="${esc(p ? p.short : '')}" placeholder="예: 홈페이지"></div>
          <div class="field"><label>마감일</label><input type="date" name="due" value="${p && p.due ? p.due : ''}"></div>
        </div>
        ${A.isCeo() ? `<div class="field"><label>담당 팀</label><select name="team_id"><option value="">팀 없음</option>${teams.map((t) => `<option value="${t.id}" ${t.id === myTeam ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>` : ''}

        <div class="field">
          <span class="lbl">단계 <small class="muted" style="font-weight:500">순서대로 진행돼요 · 최대 ${MAX_STAGES}개</small></span>
          <div id="stageList">${stages.map(stageRow).join('')}</div>
          <div class="row" style="gap:6px;margin-top:6px">
            <button type="button" class="btn sm ghost" data-act="stage-add">${ic('plus', 16, 2.4)}단계 추가</button>
            <button type="button" class="btn sm ghost" data-act="stage-reset">기본 단계로</button>
          </div>
          ${p ? '<small>단계를 지우면 그 단계의 업무는 \'단계 없음\'으로 옮겨져요.</small>' : ''}
        </div>
        <div class="field"><label>현재 단계</label><select id="stageSel"></select></div>

        <div class="field"><span class="lbl">업무 규칙</span>
          ${sw('require_review', '완료할 때 승인 받기', '끄면 담당자가 검토 없이 혼자 완료해요', p ? p.require_review : true)}
          <div class="switch-row" style="display:block"><b>완료한 업무 수정</b>
            <div class="opt-group" role="radiogroup">${EDIT_DONE.map(
              ([label], i) => `<label class="opt"><input type="radio" name="edit_done" value="${i}" ${(p ? p.edit_done : 0) === i ? 'checked' : ''}><span>${label}</span></label>`
            ).join('')}</div>
            <small id="editDoneHint">${EDIT_DONE[p ? p.edit_done : 0][2]}</small>
          </div>
        </div>

        <div class="field">
          <span class="lbl">참여 인원 <small class="muted" style="font-weight:500" id="memCount"></small></span>
          <p class="t13 muted" style="margin-bottom:8px">참여 인원은 다른 팀이어도 이 프로젝트를 볼 수 있어요.</p>
          <div class="pick-list">${people
            .map(
              (m) => `<label class="pick">${A.avatar(m)}<span class="grow"><b class="t15">${esc(m.name)}</b><span class="t13 muted block">${esc(A.roleLabel(m))}</span></span>
            <input type="checkbox" name="member_ids[]" value="${m.id}" ${chosen.has(m.id) ? 'checked' : ''}><i class="pick-box">${ic('check', 14, 3)}</i></label>`
            )
            .join('')}</div>
        </div>
        ${p ? '<div class="switch-row" style="padding-top:0;border:0"><div><b>보관하기</b><small>끝난 프로젝트는 목록에서 숨겨요</small></div><label class="switch"><input type="checkbox" name="archive"><i></i></label></div>' : ''}
        <button class="btn" type="submit" style="margin-top:8px">${p ? '저장' : '만들기'}</button>
      </form>`
    );
    const f = A.$('#projForm');
    f.dataset.stage = p ? p.current_index : 0;
    syncStages(f);
    f.addEventListener('input', (e) => e.target.closest('.stage-row') && syncStages(f));
    f.addEventListener('change', (e) => {
      if (e.target.id === 'stageSel') f.dataset.stage = e.target.value;
      if (e.target.name === 'edit_done') A.$('#editDoneHint').textContent = EDIT_DONE[Number(e.target.value)][2];
      syncMembers(f);
    });
    syncMembers(f);
  };
  /** 단계 번호와 '현재 단계' 목록을 입력 내용에 맞춤 */
  function syncStages(f) {
    const rows = A.$$('.stage-row', f);
    rows.forEach((r, i) => (A.$('.stage-no', r).textContent = i + 1));
    const names = rows.map((r, i) => A.$('input', r).value.trim() || `단계 ${i + 1}`);
    const cur = Math.min(Number(f.dataset.stage) || 0, names.length - 1);
    f.dataset.stage = cur;
    A.$('#stageSel').innerHTML = names.map((n, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${i + 1}. ${esc(n)}</option>`).join('');
  }
  function syncMembers(f) {
    A.$('#memCount').textContent = `${A.$$('input[name="member_ids[]"]:checked', f).length}명 선택`;
  }
  A.acts['stage-add'] = () => {
    const list = A.$('#stageList');
    if (A.$$('.stage-row', list).length >= MAX_STAGES) return A.toast(`단계는 ${MAX_STAGES}개까지 만들 수 있어요`);
    list.insertAdjacentHTML('beforeend', stageRow({ id: '', name: '' }));
    syncStages(A.$('#projForm'));
    A.$('.stage-row:last-child input', list).focus();
  };
  A.acts['stage-del'] = (el) => {
    const list = A.$('#stageList');
    if (A.$$('.stage-row', list).length <= 1) return A.toast('단계는 1개 이상이어야 해요');
    const f = A.$('#projForm');
    const idx = A.$$('.stage-row', list).indexOf(el.closest('.stage-row'));
    if (idx < Number(f.dataset.stage)) f.dataset.stage = Number(f.dataset.stage) - 1;
    el.closest('.stage-row').remove();
    syncStages(f);
  };
  A.acts['stage-up'] = (el) => {
    const row = el.closest('.stage-row');
    const prev = row.previousElementSibling;
    if (!prev) return;
    const f = A.$('#projForm');
    const rows = A.$$('.stage-row', f);
    const i = rows.indexOf(row);
    const cur = Number(f.dataset.stage);
    // 현재 단계로 고른 단계가 함께 움직이도록
    if (cur === i) f.dataset.stage = i - 1;
    else if (cur === i - 1) f.dataset.stage = i;
    row.parentNode.insertBefore(row, prev);
    syncStages(f);
  };
  // 저장을 눌러야 반영되므로 바로 바꾸고 안내만
  A.acts['stage-reset'] = () => {
    const f = A.$('#projForm');
    A.$('#stageList').innerHTML = defaultStages().map(stageRow).join('');
    f.dataset.stage = 0;
    syncStages(f);
    A.toast('기본 단계로 바꿨어요. 저장해야 반영돼요');
  };
  A.forms['project-save'] = async (f, d) => {
    const stages = A.$$('.stage-row', f).map((r) => ({ id: r.dataset.id || '', name: A.$('input', r).value.trim() })).filter((s) => s.name);
    if (!stages.length) throw new Error('단계를 1개 이상 입력해 주세요.');
    const body = {
      id: d.id,
      name: d.name,
      short_name: d.short_name,
      due: d.due,
      team_id: d.team_id,
      archive: d.archive,
      require_review: !!d.require_review,
      edit_done: Number(d.edit_done) || 0,
      stages,
      current: Number(f.dataset.stage) || 0,
      member_ids: [].concat(d['member_ids[]'] || []).map(Number),
    };
    const r = await A.post('project.save', body);
    if (!d.id) {
      A.sheet.close();
      A.toast('프로젝트를 만들었어요');
      A.go('ws/project/' + r.id);
      return;
    }
    done('프로젝트를 저장했어요');
  };

  // ==================================================================
  // 회사 마감
  // ==================================================================
  A.acts['deadline-new'] = () => {
    A.sheet.show(
      '회사 마감 추가',
      `<form data-form="deadline-new">
        <div class="field"><label>내용</label><input name="title" required maxlength="200" placeholder="예: 연말정산 서류 제출" autofocus></div>
        <div class="field"><label>마감일</label><input type="date" name="due" value="${A.iso(A.addDays(A.today(), 7))}" required></div>
        <div class="field"><label>설명 (선택)</label><input name="description" maxlength="255" placeholder="예: 홈택스 간소화 자료 PDF"></div>
        <p class="hint">등록하면 전 직원에게 알림이 가요.</p>
        <button class="btn" type="submit">등록하기</button>
      </form>`
    );
  };
  A.forms['deadline-new'] = async (f, d) => {
    await A.post('deadline.save', d);
    done('회사 마감을 등록했어요');
  };
  A.acts['deadline-del'] = async (el) => {
    if (!(await A.ask({ title: '마감 삭제', body: '이 마감을 지울까요?', ok: '삭제', danger: true }))) return;
    await A.post('deadline.delete', { id: Number(el.dataset.id) });
    done('지웠어요');
  };
})();
