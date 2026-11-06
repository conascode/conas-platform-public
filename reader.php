<?php
/*
 * 사원증 리더기 (대표 · 관리자)
 *  - USB/블루투스 바코드 리더기: 리더기가 키보드처럼 숫자를 입력하고 Enter → 바로 확인
 *  - 휴대폰 카메라: 브라우저의 바코드 인식(BarcodeDetector)을 지원하면 카메라로 찍기 (안드로이드 크롬 등)
 *  - 바코드 아래 16자리 숫자를 직접 입력해도 됨
 *  - 확인은 서버(api/app.php?a=idcard.verify)가 하고, 결과는 in_idcard_scans 에 기록
 */
require __DIR__ . '/inc/bootstrap.php';
require __DIR__ . '/inc/org.php';

$u = require_member();
$me = org_member($u['id']);
$allowed = $me && can_manage_company($me);
$v = rawurlencode(APP_VERSION);
?>
<!doctype html>
<html lang="ko" data-base="<?= e(BASE_PATH) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>사원증 리더기 · <?= e(APP_SHORT_NAME) ?></title>
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<meta name="theme-color" content="#0e0b22">
<link rel="icon" href="<?= e(url('assets/icons/icon-192.png')) ?>" type="image/png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
:root { --bg: #0e0b22; --card: #19163a; --line: rgba(255,255,255,.12); --sub: rgba(255,255,255,.62); --ok: #39f59a; --warn: #ffb547; --no: #ff6b76; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body { font-family: "Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; background: var(--bg); color: #fff; -webkit-font-smoothing: antialiased; }
button, input { font: inherit; color: inherit; }
.wrap { max-width: 720px; margin: 0 auto; min-height: 100%; display: flex; flex-direction: column; gap: 14px; padding: max(16px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom)); }
header { display: flex; align-items: center; gap: 10px; }
header img { width: 30px; height: 30px; }
header b { font-size: 19px; font-weight: 800; }
header span { margin-left: auto; font-size: 13px; color: var(--sub); }
.panel { position: relative; flex: 1; min-height: 330px; border-radius: 22px; background: var(--card); border: 2px solid var(--line); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; transition: border-color .2s, background .2s; overflow: hidden; }
.panel.ok { border-color: var(--ok); background: #10302a; }
.panel.warn { border-color: var(--warn); background: #3a2a12; }
.panel.no { border-color: var(--no); background: #3a1620; }
.big { font-size: 30px; font-weight: 800; margin-top: 14px; }
.msg { font-size: 17px; color: var(--sub); margin-top: 8px; line-height: 1.5; }
.ok .msg { color: var(--ok); } .warn .msg { color: var(--warn); } .no .msg { color: var(--no); }
.photo { width: 120px; aspect-ratio: 3 / 4; border-radius: 12px; overflow: hidden; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; font-size: 46px; font-weight: 800; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 99px; font-size: 18px; font-weight: 800; margin-bottom: 16px; }
.ok .badge { background: var(--ok); color: #0e0b22; } .warn .badge { background: var(--warn); color: #0e0b22; } .no .badge { background: var(--no); color: #fff; }
.meta { margin-top: 6px; font-size: 16px; color: var(--sub); }
.meta b { color: #fff; font-weight: 700; }
.idle-ic { width: 92px; height: 92px; opacity: .9; }
.row { display: flex; gap: 8px; }
.row input { flex: 1; min-width: 0; height: 52px; border-radius: 14px; border: 1px solid var(--line); background: var(--card); padding: 0 16px; font-size: 18px; letter-spacing: .06em; font-variant-numeric: tabular-nums; outline: none; }
.row input:focus { border-color: var(--ok); }
.btn { height: 52px; padding: 0 18px; border-radius: 14px; border: 0; background: #fff; color: #0e0b22; font-weight: 800; cursor: pointer; white-space: nowrap; }
.btn.ghost { background: var(--card); color: #fff; border: 1px solid var(--line); }
.hint { font-size: 13px; color: var(--sub); line-height: 1.6; }
video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cam-frame { position: absolute; left: 10%; right: 10%; top: 38%; height: 24%; border: 3px solid var(--ok); border-radius: 14px; box-shadow: 0 0 0 999px rgba(0,0,0,.35); pointer-events: none; }
.cam-tip { position: absolute; left: 0; right: 0; bottom: 16px; font-size: 15px; font-weight: 700; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
.recent { background: var(--card); border-radius: 18px; padding: 6px 16px; }
.recent h3 { font-size: 14px; color: var(--sub); padding: 10px 0 4px; font-weight: 700; }
.recent li { list-style: none; display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); font-size: 15px; }
.recent li:first-of-type { border-top: 0; }
.recent time { margin-left: auto; color: var(--sub); font-size: 13px; font-variant-numeric: tabular-nums; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.dot.ok { background: var(--ok); } .dot.expired { background: var(--warn); } .dot.invalid, .dot.inactive { background: var(--no); }
.deny { margin: auto; text-align: center; line-height: 1.7; color: var(--sub); }
.deny a { color: #fff; }
</style>
</head>
<body>
<div class="wrap">
  <header><img src="<?= e(url('assets/conas-mark.svg')) ?>" alt=""><b>사원증 리더기</b><span><?= e($u['name']) ?></span></header>
<?php if (!$allowed): ?>
  <p class="deny">사원증 리더기는 대표나 관리자만 쓸 수 있어요.<br><a href="<?= e(url('')) ?>">앱으로 돌아가기</a></p>
<?php else: ?>
  <section class="panel" id="panel"></section>
  <form class="row" id="form" autocomplete="off">
    <input id="code" inputmode="numeric" maxlength="24" placeholder="바코드 · 16자리 번호" autofocus>
    <button class="btn" type="submit">확인</button>
    <button class="btn ghost" type="button" id="camBtn">카메라</button>
  </form>
  <p class="hint">USB · 블루투스 바코드 리더기는 이 화면을 열어 두고 바로 찍으면 돼요. 휴대폰은 <b>카메라</b>를 눌러 사원증 바코드를 비춰 주세요. 코드는 30초마다 바뀌어서, 캡처한 화면은 금방 '만료'로 나와요.</p>
  <section class="recent"><h3>최근 확인</h3><ul id="recent"></ul></section>
<?php endif; ?>
</div>
<?php if ($allowed): ?>
<script>
(() => {
  'use strict';
  const BASE = document.documentElement.dataset.base;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (ts) => { const d = new Date(ts * 1000); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const meta = $('meta[name="csrf-token"]');
  const panel = $('#panel');
  const input = $('#code');
  const MARK = BASE + '/assets/conas-mark.svg';
  const RESULT = {
    ok: ['ok', '✓ 확인됨', '정상 발급된 사원증이에요'],
    expired: ['warn', '! 만료된 코드', '예전 바코드예요. 캡처한 화면일 수 있어요.\n앱에서 사원증을 다시 열어 달라고 해 주세요.'],
    inactive: ['no', '✕ 이용 중지', '이용이 중지된 계정이에요'],
    invalid: ['no', '✕ 확인 불가', 'CONAS 사원증 바코드가 아니에요'],
  };
  const LABEL = { ok: '확인됨', expired: '만료', inactive: '이용 중지', invalid: '확인 불가' };
  let resetTimer = null;
  let busy = false;

  function idle() {
    panel.className = 'panel';
    panel.innerHTML = `<img class="idle-ic" src="${MARK}" alt=""><p class="big">사원증을 찍어 주세요</p><p class="msg">바코드를 리더기나 카메라에 비춰 주세요</p>`;
  }
  function show(r) {
    const [cls, badge, msg] = RESULT[r.result] || RESULT.invalid;
    const p = r.person;
    panel.className = 'panel ' + cls;
    panel.innerHTML = `<span class="badge">${badge}</span>
      ${p ? `<div class="photo">${p.av ? `<img src="${esc(p.av)}" alt="">` : esc([...(p.name || '?')][0])}</div><p class="big">${esc(p.name)}</p>
        <p class="meta">${esc(p.team)} · ${esc(p.position)}</p><p class="meta">사번 <b>${esc(p.employee_no || '미등록')}</b></p>` : ''}
      <p class="msg">${esc(msg).replace(/\n/g, '<br>')}</p><p class="meta">${hms(r.ts)}</p>`;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(idle, 7000);
  }
  function drawRecent(list) {
    $('#recent').innerHTML = (list || []).map((x) => `<li><i class="dot ${esc(x.result)}"></i><b>${esc(x.name || '알 수 없음')}</b><span>${LABEL[x.result] || x.result}</span><time>${hms(x.ts)}</time></li>`).join('') || '<li style="color:var(--sub)">아직 기록이 없어요</li>';
  }

  // 소리 (확인: 높은 소리 한 번 / 그 밖: 낮은 소리 두 번)
  let ac = null;
  function beep(ok) {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime;
      (ok ? [0] : [0, 0.18]).forEach((d) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.frequency.value = ok ? 1320 : 330;
        g.gain.setValueAtTime(0.25, t + d);
        g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.15);
        o.connect(g).connect(ac.destination);
        o.start(t + d);
        o.stop(t + d + 0.16);
      });
    } catch (e) { /* 소리 없이 */ }
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]);
  }

  async function api(action, body, retried) {
    const res = await fetch(`${BASE}/api/app.php?a=${action}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': meta.content } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const d = await res.json().catch(() => null);
    if (d && d.csrf) meta.content = d.csrf;
    if (res.status === 419 && !retried) return api(action, body, true);
    if (res.status === 401) { location.href = `${BASE}/login.php?next=${encodeURIComponent(location.pathname)}`; throw new Error('로그인이 필요해요'); }
    if (!res.ok || !d) throw new Error((d && d.error) || '확인하지 못했어요. 인터넷 연결을 확인해 주세요.');
    return d;
  }

  async function verify(raw) {
    const code = String(raw).replace(/\D/g, '');
    if (!code || busy) return;
    busy = true;
    try {
      const r = await api('idcard.verify', { code });
      show(r);
      beep(r.result === 'ok');
      drawRecent(r.recent);
    } catch (e) {
      panel.className = 'panel no';
      panel.innerHTML = `<span class="badge">✕ 오류</span><p class="msg">${esc(e.message)}</p>`;
      beep(false);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(idle, 5000);
    } finally {
      busy = false;
    }
  }

  // 리더기 · 직접 입력: Enter 또는 16자리가 되면 확인
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();
    verify(input.value);
    input.value = '';
  });
  input.addEventListener('input', () => {
    const d = input.value.replace(/\D/g, '');
    if (d.length === 16 && d.startsWith('88')) {
      verify(d);
      input.value = '';
    }
  });
  // 리더기가 바로 입력할 수 있게 입력칸에 계속 커서를 둠 (카메라를 쓰는 동안은 제외)
  let camOn = false;
  document.addEventListener('click', (e) => { if (!camOn && !e.target.closest('button, input, a')) input.focus(); });

  // 카메라 (BarcodeDetector 지원 브라우저)
  let stream = null;
  let lastCode = '';
  let lastAt = 0;
  async function startCam() {
    if (!('BarcodeDetector' in window)) {
      alert('이 브라우저는 카메라로 바코드를 읽을 수 없어요.\n안드로이드 크롬을 쓰거나, USB · 블루투스 바코드 리더기를 연결해 주세요.');
      return;
    }
    let formats = [];
    try { formats = await BarcodeDetector.getSupportedFormats(); } catch (e) { /* 모름 */ }
    if (formats.length && !formats.includes('code_128')) {
      alert('이 기기는 Code128 바코드를 카메라로 읽을 수 없어요. 바코드 리더기를 써 주세요.');
      return;
    }
    const det = new BarcodeDetector({ formats: ['code_128'] });
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      alert('카메라를 쓸 수 없어요. 브라우저에서 카메라 권한을 허용해 주세요.');
      return;
    }
    camOn = true;
    $('#camBtn').textContent = '카메라 끄기';
    clearTimeout(resetTimer);
    panel.className = 'panel';
    panel.innerHTML = '<video playsinline muted></video><div class="cam-frame"></div><p class="cam-tip">사원증 바코드를 초록 칸에 맞춰 주세요</p>';
    const video = panel.querySelector('video');
    video.srcObject = stream;
    await video.play().catch(() => {});
    const loop = async () => {
      if (!camOn) return;
      try {
        const found = await det.detect(video);
        const hit = found.find((b) => /^88\d{14}$/.test(b.rawValue));
        if (hit && !(hit.rawValue === lastCode && Date.now() - lastAt < 4000)) {
          lastCode = hit.rawValue;
          lastAt = Date.now();
          stopCam();
          await verify(hit.rawValue);
          return;
        }
      } catch (e) { /* 다음 화면에서 다시 */ }
      setTimeout(loop, 250);
    };
    loop();
  }
  function stopCam() {
    camOn = false;
    $('#camBtn').textContent = '카메라';
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (panel.querySelector('video')) idle();
    input.focus();
  }
  $('#camBtn').addEventListener('click', () => (camOn ? stopCam() : startCam()));

  idle();
  api('idcard.scans').then((d) => drawRecent(d.recent)).catch(() => drawRecent([]));
})();
</script>
<?php endif; ?>
</body>
</html>
