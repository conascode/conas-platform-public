<?php
/*
 * 폴링: 화면이 켜져 있는 동안 몇 초마다 호출
 *  since  : 마지막으로 받은 메시지 id (있으면 그 이후 새 메시지를 돌려줌)
 *  c      : 지금 보고 있는 채팅방 id (있으면 읽음 정보를 돌려줌)
 *  active : 1이면 채팅 화면을 보고 있음 (이때는 푸시 알림을 보내지 않음)
 */
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

$u = api_member();
$active = !empty($_GET['active']);

q(
    'UPDATE in_members SET last_seen_at = NOW()' . ($active ? ', chat_active_at = NOW()' : '') . ' WHERE user_id = ?',
    [$u['id']]
);

$out = [
    'unread' => chat_unread_total($u['id']),
    'csrf' => csrf_token(),
];

if (isset($_GET['since'])) {
    $since = (int)$_GET['since'];
    if ($since > 0) {
        $out['messages'] = chat_fetch_messages(
            'm.id > ? AND m.conversation_id IN (SELECT conversation_id FROM in_conversation_members WHERE user_id = ?)',
            [$since, $u['id']],
            'ASC',
            200
        );
    } else {
        $out['messages'] = [];
        $out['max_id'] = (int)q('SELECT COALESCE(MAX(id), 0) FROM in_messages')->fetchColumn();
    }
}

$c = (int)($_GET['c'] ?? 0);
if ($c > 0 && chat_conversation($c, $u['id'])) {
    $reads = [];
    foreach (q('SELECT user_id, last_read_message_id FROM in_conversation_members WHERE conversation_id = ?', [$c]) as $r) {
        $reads[(int)$r['user_id']] = (int)$r['last_read_message_id'];
    }
    $out['reads'] = (object)$reads;
}

if ($u['is_admin']) {
    $out['pending'] = pending_count();
}

json_out($out);
