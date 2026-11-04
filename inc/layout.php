<?php
defined('IN_APP') or exit;

function icon(string $name): string
{
    $paths = [
        'home'   => '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
        'boards' => '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        'chat'   => '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>',
        'user'   => '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
        'admin'  => '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
        'back'   => '<path d="M15 5l-7 7 7 7"/>',
        'plus'   => '<path d="M12 5v14M5 12h14"/>',
        'pen'    => '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
        'clip'   => '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10 17.5a2 2 0 0 1-3-3L14.5 7"/>',
        'send'   => '<path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/>',
        'more'   => '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
        'search' => '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        'file'   => '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
        'pin'    => '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v8"/>',
        'x'      => '<path d="M6 6l12 12M18 6 6 18"/>',
        'bell'   => '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
        'heart'  => '<path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z"/>',
        'thumb'  => '<path d="M7 10.5V20H4.5A1.5 1.5 0 0 1 3 18.5V12a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M7 10.5 10.6 4a2 2 0 0 1 3.7 1.4l-.8 3.6h5.2a2 2 0 0 1 2 2.4l-1.3 6.8A2 2 0 0 1 17.4 20H7"/>',
        'bubble' => '<path d="M12 4c4.7 0 8.5 3.1 8.5 7s-3.8 7-8.5 7c-1 0-2-.1-2.9-.4L5 19.5l1.1-3.4C4.5 14.8 3.5 13 3.5 11c0-3.9 3.8-7 8.5-7z"/>',
        'kebab'  => '<circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/>',
        'camera' => '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    ];
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' . ($paths[$name] ?? '') . '</svg>';
}

/**
 * 옵션
 *  back      => 뒤로가기 주소 (있으면 상단에 뒤로 버튼)
 *  tab       => 하단 탭 중 활성 탭 (home|boards|chat|me|admin)
 *  body      => body 클래스
 *  right     => 상단 오른쪽 HTML
 *  tabbar    => false 면 하단 탭 숨김
 *  poll      => 'lite'(기본: 배지 갱신) | 'none'
 *  scripts   => 추가 JS 파일 목록 (assets 기준)
 */
function page_header(string $title, array $opt = []): void
{
    $u = current_user();
    $member = $u && $u['status'] === 'active';
    $GLOBALS['__page_opt'] = $opt + ['tab' => '', 'tabbar' => $member, 'poll' => $member ? 'lite' : 'none', 'scripts' => []];
    $o = $GLOBALS['__page_opt'];
    $docTitle = $title === APP_NAME ? APP_NAME : $title . ' · ' . APP_NAME;
    ?>
<!doctype html>
<html lang="ko" data-base="<?= e(BASE_PATH) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<title><?= e($docTitle) ?></title>
<script>
  // 새 앱에서 고른 화면 모드 따르기 (기본: 밝은 화면)
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
<link rel="stylesheet" href="<?= e(asset('app.css')) ?>">
<script src="<?= e(asset('app.js')) ?>" defer></script>
<?php foreach ($o['scripts'] as $s): ?>
<script src="<?= e(asset($s)) ?>" defer></script>
<?php endforeach; ?>
</head>
<body class="<?= e(trim(($o['body'] ?? '') . ($o['tabbar'] ? ' has-tabbar' : ''))) ?>" data-poll="<?= e($o['poll']) ?>">
<header class="topbar">
  <div class="topbar-in">
    <?php if (!empty($o['back'])): ?>
      <a class="icon-btn" href="<?= e($o['back']) ?>" aria-label="뒤로">
        <?= icon('back') ?>
      </a>
    <?php endif; ?>
    <?php if (!empty($o['brand'])): ?>
      <h1 class="topbar-title topbar-brand">
        <img src="<?= e(url('assets/icons/icon-192.png')) ?>" alt="" width="28" height="28">
        <span><?= e($title) ?></span>
      </h1>
    <?php else: ?>
      <h1 class="topbar-title"><?= e($title) ?></h1>
    <?php endif; ?>
    <div class="topbar-right"><?= $o['right'] ?? '' ?></div>
  </div>
</header>
<?php if ($o['tabbar']) render_tabbar($o['tab'], $u); ?>
<main class="main">
<?php foreach (take_flashes() as [$type, $msg]): ?>
  <div class="flash flash-<?= e($type) ?>" role="status"><?= e($msg) ?></div>
<?php endforeach; ?>
<?php
}

function page_footer(): void
{
    ?>
</main>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
</body>
</html>
<?php
}

function render_tabbar(string $active, array $u): void
{
    $tabs = [
        'home'   => ['홈', ''],
        'boards' => ['게시판', 'boards.php'],
        'chat'   => ['채팅', 'chat.php'],
        'me'     => ['내 정보', 'me.php'],
    ];
    if ($u['is_admin']) {
        $tabs['admin'] = ['관리', 'admin/'];
    }
    echo '<nav class="tabbar" aria-label="주 메뉴"><div class="tabbar-brand"><img src="' . e(url('assets/icons/icon-192.png')) . '" alt="" width="32" height="32"><span>' . e(APP_NAME) . '</span></div>';
    foreach ($tabs as $key => [$label, $href]) {
        $iconName = $key === 'me' ? 'user' : $key;
        $badge = '';
        if ($key === 'chat') {
            $badge = '<span class="badge" data-badge="chat" hidden></span>';
        } elseif ($key === 'admin') {
            $pc = pending_count();
            $badge = '<span class="badge" data-badge="pending"' . ($pc ? '' : ' hidden') . '>' . ($pc ?: '') . '</span>';
        }
        printf(
            '<a class="tab%s" href="%s"%s>%s%s<span class="tab-label">%s</span>%s</a>',
            $active === $key ? ' active' : '',
            e(url($href)),
            $active === $key ? ' aria-current="page"' : '',
            $active === $key ? '<span class="tab-pill" aria-hidden="true"></span>' : '',
            icon($iconName),
            e($label),
            $badge
        );
    }
    echo '</nav>';
}
