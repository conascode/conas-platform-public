/* 프로필 사진: 동그라미 안에 보일 부분을 고르고(이동/확대) 512x512로 잘라 저장 */
(() => {
  'use strict';
  const IN = window.IN;
  const OUT = 512; // 저장 크기
  const RING = 0.84; // 화면에서 동그라미 지름 비율

  /** 자르기 화면을 열고, 완료하면 Blob, 취소하면 null */
  function cropImage(file) {
    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.className = 'cropper';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', '프로필 사진 자르기');
      root.innerHTML =
        '<div class="cropper-head">' +
        '<button type="button" class="cropper-text" data-c="cancel">취소</button>' +
        '<b>프로필 사진</b>' +
        '<button type="button" class="cropper-text strong" data-c="done">완료</button>' +
        '</div>' +
        '<div class="cropper-body">' +
        '<div class="cropper-stage"><img class="cropper-img" alt="" draggable="false">' +
        '<div class="cropper-mask" aria-hidden="true"></div><div class="cropper-ring" aria-hidden="true"></div></div>' +
        '<div class="cropper-tools">' +
        '<span class="z-ic sm" aria-hidden="true"></span>' +
        '<input type="range" min="1" max="4" step="0.01" value="1" aria-label="확대">' +
        '<span class="z-ic lg" aria-hidden="true"></span>' +
        '</div>' +
        '<p class="cropper-hint">사진을 끌어서 옮기고, 두 손가락이나 아래 막대로 확대해서 동그라미 안에 맞춰주세요.</p>' +
        '</div>';
      const stage = root.querySelector('.cropper-stage');
      const img = root.querySelector('.cropper-img');
      const range = root.querySelector('input[type="range"]');
      const doneBtn = root.querySelector('[data-c="done"]');

      const src = URL.createObjectURL(file);
      let w = 0, h = 0, S = 0, D = 0, base = 1;
      let z = 1, x = 0, y = 0;
      const pointers = new Map();
      let g = null;
      let finished = false;

      function measure() {
        const oldS = S;
        S = stage.clientWidth;
        D = S * RING;
        base = D / Math.min(w, h);
        if (oldS) {
          x *= S / oldS;
          y *= S / oldS;
        }
        clamp();
        draw();
      }
      function clamp() {
        const sc = base * z;
        const mx = Math.max(0, (w * sc - D) / 2);
        const my = Math.max(0, (h * sc - D) / 2);
        x = Math.max(-mx, Math.min(mx, x));
        y = Math.max(-my, Math.min(my, y));
      }
      function draw() {
        const sc = base * z;
        img.style.width = w * sc + 'px';
        img.style.height = h * sc + 'px';
        img.style.transform = `translate3d(${S / 2 - (w * sc) / 2 + x}px, ${S / 2 - (h * sc) / 2 + y}px, 0)`;
        range.value = String(z);
      }
      /** 화면 중심 기준 (px, py) 지점이 그대로 있도록 확대 */
      function zoomTo(nz, px, py) {
        nz = Math.max(1, Math.min(4, nz));
        x = px - ((px - x) * nz) / z;
        y = py - ((py - y) * nz) / z;
        z = nz;
        clamp();
        draw();
      }
      const rel = (cx, cy) => {
        const r = stage.getBoundingClientRect();
        return [cx - r.left - r.width / 2, cy - r.top - r.height / 2];
      };

      function onDown(e) {
        stage.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
          g = { mode: 'pan', sx: e.clientX, sy: e.clientY, x0: x, y0: y };
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const [mx, my] = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
          g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: z, x0: x, y0: y, mx0: mx, my0: my };
        }
      }
      function onMove(e) {
        if (!pointers.has(e.pointerId) || !g) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (g.mode === 'pinch' && pointers.size >= 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const [mx, my] = rel((a.x + b.x) / 2, (a.y + b.y) / 2);
          const nz = Math.max(1, Math.min(4, (g.z0 * d) / g.d0));
          x = mx - ((g.mx0 - g.x0) * nz) / g.z0;
          y = my - ((g.my0 - g.y0) * nz) / g.z0;
          z = nz;
        } else if (g.mode === 'pan') {
          x = g.x0 + (e.clientX - g.sx);
          y = g.y0 + (e.clientY - g.sy);
        }
        clamp();
        draw();
      }
      function onUp(e) {
        pointers.delete(e.pointerId);
        if (pointers.size === 1) {
          const p = [...pointers.values()][0];
          g = { mode: 'pan', sx: p.x, sy: p.y, x0: x, y0: y };
        } else if (pointers.size === 0) {
          g = null;
        }
      }
      function onWheel(e) {
        e.preventDefault();
        const [px, py] = rel(e.clientX, e.clientY);
        zoomTo(z * Math.exp(-e.deltaY * 0.002), px, py);
      }
      function onKey(e) {
        if (e.key === 'Escape') finish(null);
      }

      function exportBlob() {
        return new Promise((res) => {
          const sc = base * z;
          const ix = S / 2 - (w * sc) / 2 + x;
          const iy = S / 2 - (h * sc) / 2 + y;
          const off = (S - D) / 2;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = OUT;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, OUT, OUT);
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, (off - ix) / sc, (off - iy) / sc, D / sc, D / sc, 0, 0, OUT, OUT);
          canvas.toBlob((b) => res(b), 'image/jpeg', 0.9);
        });
      }

      function teardown() {
        window.removeEventListener('resize', measure);
        document.removeEventListener('keydown', onKey);
        document.documentElement.classList.remove('viewer-open');
        root.classList.remove('open');
        setTimeout(() => root.remove(), 200);
        URL.revokeObjectURL(src);
      }
      /** fromBack: 휴대폰 뒤로가기로 닫힌 경우 */
      function finish(result, fromBack) {
        if (finished) return;
        finished = true;
        if (!fromBack) IN.popOverlay();
        teardown();
        resolve(result);
      }

      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-c]');
        if (!b) return;
        if (b.dataset.c === 'cancel') finish(null);
        else if (b.dataset.c === 'done') {
          doneBtn.disabled = true;
          const blob = await exportBlob();
          finish(blob);
        }
      });
      range.addEventListener('input', () => zoomTo(Number(range.value), 0, 0));
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);
      stage.addEventListener('wheel', onWheel, { passive: false });

      img.onload = () => {
        w = img.naturalWidth;
        h = img.naturalHeight;
        document.body.appendChild(root);
        document.documentElement.classList.add('viewer-open');
        requestAnimationFrame(() => {
          root.classList.add('open');
          measure();
        });
        window.addEventListener('resize', measure);
        document.addEventListener('keydown', onKey);
        IN.pushOverlay(() => finish(null, true));
        doneBtn.focus({ preventScroll: true });
      };
      img.onerror = () => {
        URL.revokeObjectURL(src);
        IN.toast('이 사진은 열 수 없어요. JPG나 PNG 사진을 골라주세요.');
        resolve(null);
      };
      img.src = src;
      root.cropperCancel = () => {
        IN.dropOverlay();
        finish(null, true);
      };
      current = root;
    });
  }

  let current = null;

  IN.onPage(() => {
    const box = document.querySelector('[data-avatar-box]');
    if (!box) return;
    const input = box.querySelector('[data-avatar-input]');
    const preview = box.querySelector('[data-avatar-preview]');
    const removeBtn = box.querySelector('[data-avatar-remove]');
    const initial = box.dataset.initial || '?';
    let busy = false;

    function setPreview(url) {
      const span = document.createElement('span');
      span.className = 'avatar avatar-xl' + (url ? ' has-img' : '');
      span.setAttribute('aria-hidden', 'true');
      if (url) {
        const im = document.createElement('img');
        im.src = url;
        im.alt = '';
        span.appendChild(im);
      } else {
        span.textContent = initial;
      }
      preview.replaceChildren(span);
      removeBtn.hidden = !url;
    }

    async function onPick(e) {
      if (!e.target.closest('[data-avatar-pick]') || busy) return;
      input.click();
    }
    async function onFile() {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      const blob = await cropImage(file);
      if (!blob) return;
      busy = true;
      box.classList.add('saving');
      try {
        const fd = new FormData();
        fd.append('file', blob, 'avatar.jpg');
        const d = await IN.api('avatar.php', { method: 'POST', form: fd });
        setPreview(d.url);
        IN.toast('프로필 사진을 바꿨어요.');
      } catch (err) {
        IN.toast(err.message);
      }
      box.classList.remove('saving');
      busy = false;
    }
    async function onRemove() {
      if (busy || !confirm('프로필 사진을 지울까요?')) return;
      busy = true;
      try {
        const fd = new FormData();
        fd.append('action', 'delete');
        await IN.api('avatar.php', { method: 'POST', form: fd });
        setPreview(null);
        IN.toast('프로필 사진을 지웠어요.');
      } catch (err) {
        IN.toast(err.message);
      }
      busy = false;
    }

    box.addEventListener('click', onPick);
    input.addEventListener('change', onFile);
    removeBtn.addEventListener('click', onRemove);
    return () => {
      if (current && current.isConnected && current.cropperCancel) current.cropperCancel();
    };
  });
})();
