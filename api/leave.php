<?php
// 그룹 채팅방 나가기 (JSON) { c }
define('IS_API', true);
require __DIR__ . '/../inc/bootstrap.php';
require __DIR__ . '/../inc/chat.php';

if (!is_post()) {
    json_out(['error' => 'POST만 가능해요.'], 405);
}
$u = api_member();
check_csrf();

$c = int_in(json_input(), 'c');
$conv = chat_conversation($c, $u['id']);
if (!$conv) {
    json_out(['error' => '채팅방을 찾을 수 없어요.'], 404);
}
if ($conv['type'] !== 'group') {
    json_out(['error' => '1:1 채팅은 나갈 수 없어요.'], 400);
}

q('DELETE FROM in_conversation_members WHERE conversation_id = ? AND user_id = ?', [$c, $u['id']]);
json_out(['ok' => true]);
