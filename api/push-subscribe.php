<?php
/*
 * 푸시 알림 구독
 *  GET                          → { key: 공개키 }
 *  POST { endpoint, keys:{p256dh, auth} }       → 구독 저장
 *  POST { action:'unsubscribe', endpoint }      → 구독 삭제
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/push.php';

$u = api_member();

if (!is_post()) {
    $v = push_vapid();
    if (!$v) {
        json_out(['error' => '서버가 푸시 알림을 지원하지 않아요.'], 501);
    }
    json_out(['key' => $v['public']]);
}

check_csrf();
$in = json_input();
$endpoint = is_string($in['endpoint'] ?? null) ? trim($in['endpoint']) : '';
if ($endpoint === '' || strlen($endpoint) > 2000 || !str_starts_with($endpoint, 'https://')) {
    json_out(['error' => '잘못된 구독 정보예요.'], 400);
}
$hash = hash('sha256', $endpoint);

if (($in['action'] ?? '') === 'unsubscribe') {
    q('DELETE FROM in_push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [$hash, $u['id']]);
    json_out(['ok' => true]);
}

$p256dh = is_string($in['keys']['p256dh'] ?? null) ? substr($in['keys']['p256dh'], 0, 255) : '';
$auth = is_string($in['keys']['auth'] ?? null) ? substr($in['keys']['auth'], 0, 255) : '';
if ($p256dh === '' || $auth === '') {
    json_out(['error' => '잘못된 구독 정보예요.'], 400);
}

// 같은 기기를 다른 계정이 쓰다가 바뀐 경우 현재 계정으로 옮김
q(
    'INSERT INTO in_push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)',
    [$u['id'], $endpoint, $hash, $p256dh, $auth]
);
json_out(['ok' => true]);
