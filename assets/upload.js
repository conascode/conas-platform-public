/* 글쓰기 화면 첨부파일 (사진은 미리보기) */
(() => {
  'use strict';
  const IN = window.IN;

  function fmtBytes(b) {
    if (b >= 1048576) return (b / 1048576).toFixed(1) + 'MB';
    if (b >= 1024) return Math.round(b / 1024) + 'KB';
    return b + 'B';
  }

  IN.onPage(() => {
    const box = document.querySelector('[data-uploader]');
    if (!box) return;
    const input = box.querySelector('[data-uploader-input]');
    const list = box.querySelector('[data-uploader-list]');
    const addTile = list.querySelector('.upload-add');
    const form = box.closest('form');
    const maxFiles = Number(box.dataset.maxFiles) || 5;
    const maxBytes = Number(box.dataset.maxBytes) || 0;
    const blobs = [];
    let busy = 0;

    const count = () => list.querySelectorAll('.upload-tile:not(.removed):not(.failed)').length;

    function makeTile(file) {
      const li = document.createElement('li');
      li.className = 'upload-tile uploading';
      if (/^image\/(jpeg|png|gif|webp)$/.test(file.type)) {
        const img = document.createElement('img');
        const u = URL.createObjectURL(file);
        blobs.push(u);
        img.src = u;
        img.alt = '';
        li.appendChild(img);
      } else {
        const f = document.createElement('span');
        f.className = 'tile-file';
        const n = document.createElement('span');
        n.className = 'tile-name';
        n.textContent = file.name;
        f.appendChild(n);
        li.appendChild(f);
      }
      const bar = document.createElement('span');
      bar.className = 'progress';
      const fill = document.createElement('span');
      bar.appendChild(fill);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'tile-x';
      rm.setAttribute('data-remove', '');
      rm.setAttribute('aria-label', file.name + ' 빼기');
      rm.textContent = '✕';
      li.append(bar, rm);
      list.insertBefore(li, addTile);
      return { li, fill };
    }

    function onChange() {
      for (const file of Array.from(input.files || [])) {
        if (count() >= maxFiles) {
          IN.toast(`첨부파일은 ${maxFiles}개까지 올릴 수 있어요.`);
          break;
        }
        if (maxBytes && file.size > maxBytes) {
          IN.toast(`${file.name}: ${fmtBytes(maxBytes)}보다 큰 파일은 올릴 수 없어요.`);
          continue;
        }
        const t = makeTile(file);
        busy++;
        IN.upload(file, (pct) => (t.fill.style.width = pct + '%'))
          .then((f) => {
            t.li.classList.remove('uploading');
            t.li.classList.add('done');
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'attachment_ids[]';
            hidden.value = f.id;
            t.li.appendChild(hidden);
          })
          .catch((e) => {
            t.li.classList.remove('uploading');
            t.li.classList.add('failed');
            t.li.title = e.message;
            IN.toast(e.message);
          })
          .finally(() => busy--);
      }
      input.value = '';
    }

    function onClick(e) {
      const rm = e.target.closest('[data-remove]');
      if (!rm) return;
      const li = rm.closest('li');
      const box = li.querySelector('input[type="checkbox"]');
      if (box) {
        // 기존 파일: 저장할 때 삭제되도록 표시만 (다시 누르면 취소)
        box.checked = !box.checked;
        li.classList.toggle('removed', box.checked);
      } else {
        li.remove();
      }
    }

    function onSubmit(e) {
      if (busy > 0) {
        e.preventDefault();
        IN.toast('파일을 올리는 중이에요. 끝나면 다시 눌러주세요.');
      }
    }

    input.addEventListener('change', onChange);
    list.addEventListener('click', onClick);
    form.addEventListener('submit', onSubmit);
    return () => blobs.forEach((u) => URL.revokeObjectURL(u));
  });
})();
