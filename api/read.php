<?php
// 읽음 처리 (JSON) { c, last_id }
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$in = json_input();
$c = int_in($in, 'c');
$last = int_in($in, 'last_id');

if (!chat_conversation($c, $u['id'])) {
    json_out(['error' => '채팅방을 찾을 수 없어요.'], 404);
}

$max = (int)q('SELECT COALESCE(MAX(id), 0) FROM in_messages WHERE conversation_id = ?', [$c])->fetchColumn();
$last = min($last, $max);
q(
    'UPDATE in_conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ? AND last_read_message_id < ?',
    [$last, $c, $u['id'], $last]
);

json_out(['ok' => true, 'unread' => chat_unread_total($u['id'])]);
