/* 홈: 출근 QR(데모) · 오늘 할 일 · 공지 · 이번 주 일정 */
(() => {
  'use strict';
  const { esc, ic } = A;
  let home = null;
  let selDay = null;

  A.views.home = async (main, r, alive) => {
    const d = await A.api('home');
    if (!alive()) return;
    home = d;
    A.setBadges(d.badges);
    if (selDay === null || selDay < 0 || selDay > 6) selDay = new Date().getDay();
    draw(main);
  };

  function qrCard() {
    const a = home.att;
    if (a && ['leave', 'half_am', 'half_pm'].includes(a.kind) && !a.in) {
      return `<div class="qr-card done"><div class="qr-ic">${ic('moon', 26, 2)}</div><div class="qr-txt"><b>오늘은 ${a.kind === 'leave' ? '연차' : '반차'}예요</b><span>푹 쉬세요!</span></div></div>`;
    }
    const st = a && a.out ? 'done' : a && a.in ? 'working' : '';
    const title = a && a.out ? '오늘 근무 끝!' : a && a.in ? '퇴근 QR' : '출근 QR';
    const sub = a && a.out ? `${a.in} 출근 · ${a.out} 퇴근` : a && a.in ? `${a.in} 출근 · 근무 중` : `${A.md(A.today())} · 아직 출근 전이에요`;
    return `<button class="qr-card ${st}" ${a && a.out ? '' : 'data-act="qr"'}>
      <div class="qr-ic">${ic(a && a.out ? 'check' : 'qr', 28, 2)}</div>
      <div class="qr-txt"><b>${title}</b><span>${sub}</span></div>${a && a.out ? '' : ic('chevR', 22, 2.2)}</button>`;
  }

  function draw(main) {
    const start = A.date(home.week_start);
    const days = [...Array(7)].map((_, i) => A.addDays(start, i));
    const todayIso = A.iso(A.today());
    const sel = days[selDay];
    const selIso = A.iso(sel);
    const evs = home.events.filter((e) => e.date === selIso);
    const hasEv = new Set(home.events.map((e) => e.date));
    const pending = A.badges.pending || 0;

    main.innerHTML = `
      ${qrCard()}
      ${pending ? `<button class="card today-task" data-go="admin/members"><span class="doc-ic c-warn">${ic('user', 20, 2)}</span><span class="grow"><b class="t15 block">가입 승인을 기다리는 사람이 ${pending}명 있어요</b><span class="t13 muted">눌러서 승인하기</span></span>${ic('chevR', 18)}</button>` : ''}
      <button class="card today-task" data-go="ws/task">
        <span class="doc-ic c-primary">${ic('checkSq', 20, 2)}</span>
        <span class="grow"><b class="t15 block">오늘 할 일 ${home.today_tasks}건</b>
          <span class="t13 muted ellipsis block">${
            home.first_task
              ? `${home.late_tasks ? `<span style="color:var(--danger)">지연 ${home.late_tasks}건</span> · ` : ''}${esc(home.first_task)}${home.open_tasks > 1 ? ` 외 ${home.open_tasks - 1}건` : ''}`
              : '남은 업무가 없어요'
          }</span></span>
        ${ic('chevR', 18)}
      </button>

      <section class="card">
        <div class="card-h"><h3>공지</h3><button class="more" data-go="ws/notice">전체 ${ic('chevR', 14, 2)}</button></div>
        ${
          home.notices.length
            ? home.notices
                .map(
                  (n) => `<button class="list-item" data-go="ws/notice/${n.id}">
              <span class="tag ${n.must ? 'danger' : 'primary'}">${n.must ? '필독' : esc(n.category)}</span>
              <span class="grow t15 ellipsis" style="${n.read && !n.need_confirm ? 'font-weight:500;color:var(--ink-2)' : ''}">${esc(n.title)}</span>
              ${n.need_confirm ? '<span class="st late">확인 필요</span>' : `<span class="t13 muted">${A.ago(n.ts)}</span>`}
            </button>`
                )
                .join('')
            : '<div class="empty">아직 공지가 없어요</div>'
        }
      </section>

      <section class="card">
        <div class="card-h"><h3>일정</h3><button class="more" data-act="event-new">${ic('plus', 14, 2.4)} 일정 추가</button></div>
        <div class="week">
          ${days
            .map(
              (d, i) =>
                `<button class="${i === selDay ? 'on' : ''} ${hasEv.has(A.iso(d)) ? 'has' : ''} ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}" data-act="day" data-i="${i}">${A.DOW[i]}<b>${d.getDate()}</b></button>`
            )
            .join('')}
        </div>
        <div class="day-label">${A.md(sel)}${selIso === todayIso ? ' · 오늘' : ''}</div>
        ${
          evs.length
            ? evs
                .map(
                  (e) => `<button class="ev" style="width:100%;text-align:left" data-act="event" data-id="${e.id}">
              <div class="ev-time">${e.time}</div><div class="ev-bar ${esc(e.color)}"></div>
              <div class="ev-body"><b>${esc(e.title)}</b><span>${esc(e.place || '')}${e.place ? ' · ' : ''}${e.team ? esc(e.team) : '전사'}</span></div></button>`
                )
                .join('')
            : '<div class="empty">일정이 없어요</div>'
        }
      </section>`;
  }

  A.acts.day = (el) => {
    selDay = Number(el.dataset.i);
    draw(A.$('#view'));
  };

  // ---------- 출근 QR (데모) ----------
  function qrSvg() {
    const N = 25;
    let r = '';
    const inF = (x, y) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inF(x, y) && Math.random() < 0.47) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    const fin = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
    return `<svg viewBox="0 0 ${N} ${N}" width="196" height="196" shape-rendering="crispEdges" fill="#191f28">${r}${fin(0, 0)}${fin(N - 7, 0)}${fin(0, N - 7)}</svg>`;
  }
  let qrTimer = null;
  A.acts.qr = () => {
    const out = !!(home.att && home.att.in);
    const b = A.sheet.show(
      out ? '퇴근 QR' : '출근 QR',
      `<div class="qr-box">
        <span class="demo-tag">데모 화면이에요 · 실제 QR 인식은 아직 없어요</span>
        <div class="qr-frame" id="qrImg">${qrSvg()}</div>
        <p class="qr-timer"><b id="qrSec">30</b>초 후 새 QR로 바뀌어요</p>
      </div>
      <button class="btn" data-act="qr-check" data-action="${out ? 'out' : 'in'}">${ic('check', 20, 2.4)}${out ? '퇴근' : '출근'} 기록하기</button>`,
      { onClose: () => clearInterval(qrTimer) }
    );
    let s = 30;
    clearInterval(qrTimer);
    qrTimer = setInterval(() => {
      s--;
      if (s <= 0) {
        s = 30;
        const img = A.$('#qrImg', b);
        if (img) img.innerHTML = qrSvg();
      }
      const el = A.$('#qrSec', b);
      if (el) el.textContent = s;
    }, 1000);
  };
  A.acts['qr-check'] = async (el) => {
    el.disabled = true;
    try {
      const r = await A.post('att.check', { action: el.dataset.action });
      A.sheet.close();
      A.toast(el.dataset.action === 'in' ? `${r.time} 출근했어요${r.late ? ' (지각)' : ''}` : `${r.time} 퇴근했어요. 수고하셨어요!`);
      A.refresh();
    } catch (e) {
      el.disabled = false;
      A.err(e);
    }
  };

  // ---------- 일정 ----------
  A.acts.event = (el) => {
    const e = home.events.find((x) => x.id === Number(el.dataset.id));
    if (!e) return;
    A.sheet.show(
      '일정',
      `<h3 style="font-size:19px;font-weight:800;margin-bottom:12px">${esc(e.title)}</h3>
      <div class="kv"><span>날짜</span><b>${A.md(e.date)} ${e.time}</b></div>
      <div class="kv"><span>장소</span><b>${esc(e.place || '-')}</b></div>
      <div class="kv"><span>범위</span><b>${e.team ? esc(e.team) : '전사'}</b></div>
      ${e.can_delete ? `<div style="margin-top:18px"><button class="btn danger" data-act="event-del" data-id="${e.id}">${ic('trash', 18)}일정 삭제</button></div>` : ''}`
    );
  };
  A.acts['event-del'] = async (el) => {
    if (!(await A.ask({ title: '일정 삭제', body: '이 일정을 지울까요?', ok: '삭제', danger: true }))) return;
    await A.post('event.delete', { id: Number(el.dataset.id) });
    A.toast('일정을 지웠어요');
    A.refresh();
  };
  A.acts['event-new'] = () => {
    const days = A.addDays(A.date(home.week_start), selDay);
    const canCompany = A.data.me.can_manage;
    const hasTeam = !!A.data.me.team_id;
    A.sheet.show(
      '일정 추가',
      `<form data-form="event-new">
        <div class="field"><label>제목</label><input name="title" required maxlength="200" placeholder="예: 주간 회의" autofocus></div>
        <div class="field-row">
          <div class="field"><label>날짜</label><input type="date" name="date" value="${A.iso(days)}" required></div>
          <div class="field"><label>시간</label><input type="time" name="time" value="10:00" required></div>
        </div>
        <div class="field"><label>장소 (선택)</label><input name="place" maxlength="100" placeholder="예: 회의실 A"></div>
        <div class="field"><label>범위</label><select name="scope">
          ${hasTeam ? `<option value="team">우리 팀 (${esc(A.data.me.team)})</option>` : ''}
          ${canCompany ? '<option value="company">전사</option>' : ''}
        </select></div>
        <div class="field"><label>색</label><select name="color">
          <option value="primary">파랑</option><option value="ok">초록</option><option value="warn">주황</option><option value="danger">빨강</option><option value="leave">보라</option>
        </select></div>
        <button class="btn" type="submit" ${!hasTeam && !canCompany ? 'disabled' : ''}>추가하기</button>
        ${!hasTeam && !canCompany ? '<p class="hint warn" style="margin-top:10px">소속 팀이 없어서 일정을 추가할 수 없어요.</p>' : ''}
      </form>`
    );
  };
  A.forms['event-new'] = async (f, d) => {
    await A.post('event.save', d);
    A.sheet.close();
    A.toast('일정을 추가했어요');
    A.refresh();
  };
})();
