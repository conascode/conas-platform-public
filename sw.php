<?php
define('IN_APP', true);
require __DIR__ . '/inc/config.php';

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-cache');
header('Service-Worker-Allowed: ' . BASE_PATH . '/');

$v = rawurlencode(APP_VERSION);
?>
/* 서비스 워커 (버전 <?= APP_VERSION ?>) */
'use strict';

const BASE = <?= json_encode(BASE_PATH) ?>;
const CACHE = 'in-' + <?= json_encode(APP_VERSION) ?>;
const APP_NAME = <?= json_encode(APP_NAME, JSON_UNESCAPED_UNICODE) ?>;
const PRECACHE = [
  BASE + '/offline.html',
  BASE + '/assets/app.css?v=<?= $v ?>',
  BASE + '/assets/app.js?v=<?= $v ?>',
  BASE + '/assets/spa.css?v=<?= $v ?>',
  BASE + '/assets/spa-core.js?v=<?= $v ?>',
  BASE + '/assets/spa-home.js?v=<?= $v ?>',
  BASE + '/assets/spa-task.js?v=<?= $v ?>',
  BASE + '/assets/spa-ws.js?v=<?= $v ?>',
  BASE + '/assets/spa-cm.js?v=<?= $v ?>',
  BASE + '/assets/spa-more.js?v=<?= $v ?>',
  BASE + '/assets/icons/icon-192.png',
  BASE + '/assets/icons/badge-72.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('in-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE + '/')) return;

  // API와 파일 다운로드는 항상 서버에서 (캐시하지 않음)
  if (url.pathname.startsWith(BASE + '/api/') || url.pathname.endsWith('/download.php')) return;

  // 페이지: 네트워크 우선, 끊기면 오프라인 안내
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(BASE + '/offline.html')));
    return;
  }

  // CSS/JS/아이콘: 캐시를 먼저 보여주고 뒤에서 갱신
  if (url.pathname.startsWith(BASE + '/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// 푸시: 내용 없는 알림 신호를 받으면 서버에서 최신 메시지를 가져와 표시
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = null;
    try {
      const res = await fetch(BASE + '/api/push-latest.php', { credentials: 'include', cache: 'no-store' });
      if (res.ok) data = await res.json();
    } catch (e) { /* 네트워크 오류 */ }

    if (data && typeof data.unread === 'number' && self.navigator.setAppBadge) {
      try {
        data.unread > 0 ? await self.navigator.setAppBadge(data.unread) : await self.navigator.clearAppBadge();
      } catch (e) { /* ignore */ }
    }

    const msg = data && data.message;
    const title = msg ? msg.title : APP_NAME;
    const options = {
      body: msg ? msg.body : '새 메시지가 있어요.',
      icon: BASE + '/assets/icons/icon-192.png',
      badge: BASE + '/assets/icons/badge-72.png',
      tag: msg ? 'conv-' + msg.c : 'in-message',
      renotify: true,
      data: { url: msg ? msg.url : BASE + '/#/dm' },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || BASE + '/#/dm', self.location.origin).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url === target && 'focus' in c) return c.focus();
    }
    for (const c of list) {
      if (new URL(c.url).pathname.startsWith(BASE + '/') && 'navigate' in c) {
        await c.focus();
        return c.navigate(target);
      }
    }
    return self.clients.openWindow(target);
  })());
});
