<?php
/*
 * CONAS 사내 2.0 — 한 페이지 앱의 틀
 * 화면은 assets/spa-*.js 가 그리고, 데이터는 api/app.php 에서 가져옴
 */
require __DIR__ . '/inc/bootstrap.php';

$u = require_member();
$v = rawurlencode(APP_VERSION);
$scripts = ['spa-core.js', 'spa-home.js', 'spa-task.js', 'spa-ws.js', 'spa-cm.js', 'spa-more.js'];
?>
<!doctype html>
<html lang="ko" data-base="<?= e(BASE_PATH) ?>" data-version="<?= e(APP_VERSION) ?>" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title><?= e(APP_NAME) ?></title>
<script>
  // 저장된 화면 모드를 먼저 적용 (깜빡임 방지). 기본은 밝은 화면
  try { if (localStorage.getItem('in_theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) {}
</script>
<meta name="theme-color" content="#ffffff">
<meta name="csrf-token" content="<?= e(csrf_token()) ?>">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="<?= e(APP_SHORT_NAME) ?>">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="<?= e(url('manifest.php')) ?>">
<link rel="icon" href="<?= e(url('assets/icons/icon-192.png')) ?>" type="image/png">
<link rel="apple-touch-icon" href="<?= e(url('assets/icons/apple-touch-icon.png')) ?>">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="<?= e(url('assets/spa.css')) ?>?v=<?= $v ?>">
<?php foreach ($scripts as $s): ?>
<script src="<?= e(url('assets/' . $s)) ?>?v=<?= $v ?>" defer></script>
<?php endforeach; ?>
</head>
<body>
<div class="app" id="app">
  <header class="top" id="top"></header>
  <main id="view"><div class="loading"><div class="spinner"></div></div></main>
  <div id="fab"></div>
  <nav class="nav" id="nav" aria-label="주 메뉴"></nav>
</div>
<noscript><p style="padding:24px">이 앱을 쓰려면 브라우저에서 자바스크립트를 켜 주세요.</p></noscript>
</body>
</html>
